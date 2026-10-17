"""Builds tiny author portraits for the offline author pack.

Reads the Commons file names that scripts/build-author-pack.py saved, keeps
only freely licensed images (public domain, CC0, CC BY, CC BY-SA), fetches
Wikimedia's 120 px thumbnails, crops each to an 80 px square WebP and packs
them into a few shard files so the app ships a handful of files instead of
tens of thousands. Credits for every image are written beside them.

  python scripts/build-author-portraits.py [--work DIR]

Downloads are cached, so an interrupted run resumes where it stopped.
"""

import argparse
import hashlib
import html
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "OrigamiReader-author-pack/0.1 (offline e-reader data build)"
SIZE = 80
SHARDS = 32
# Licenses that allow bundling in the app with a credit line. Non-commercial,
# no-derivatives, GFDL-only and fair-use images are left out.
FREE = re.compile(r"^(public domain|pd\b|pd-|cc0|cc[- ]by(-sa)?[- ][0-9.]+|cc[- ]by(-sa)?$)", re.I)
NOT_FREE = re.compile(r"\b(nc|nd|non-?commercial|no ?deriv|fair use|gfdl)\b", re.I)


# Pause between thumbnail requests. It grows when Wikimedia asks us to slow
# down (HTTP 429) and eases back slowly while requests succeed.
pace = {"delay": 1.0}


def fetch(url: str, data: bytes | None = None) -> bytes:
    for attempt in range(6):
        request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 404:
                raise
            if error.code == 429 or error.code >= 500:
                if error.code == 429:
                    pace["delay"] = min(5.0, pace["delay"] * 1.6)
                wait = int(error.headers.get("Retry-After") or 20 * (attempt + 1))
                print(f"  HTTP {error.code}, waiting {wait}s", flush=True)
                time.sleep(wait)
                continue
            raise
        except (TimeoutError, urllib.error.URLError):
            time.sleep(10 * (attempt + 1))
    raise TimeoutError(url)


def plain(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    return re.sub(r"\s+", " ", text).strip()[:160]


def square(data: bytes) -> bytes:
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image).convert("RGB")
    w, h = image.size
    # Portraits usually have the face in the upper middle: a square of about
    # three quarters of the short side, near the top of tall images.
    side = round(min(w, h) * (0.72 if h > w else 0.82))
    left = (w - side) // 2
    top = round(h * 0.03) if h > w else round((h - side) * 0.3)
    image = image.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, "WEBP", quality=58, method=6)
    return out.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, default=ROOT.parent / "work" / "author-pack")
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "author-pack")
    # Pack the thumbnails already downloaded, without fetching more (for
    # example while Wikimedia is asking for a pause).
    parser.add_argument("--pack-only", action="store_true")
    args = parser.parse_args()
    images: dict[str, str] = json.loads((args.work / "images.json").read_text(encoding="utf-8"))
    info_dir = args.work / "commons-info"
    thumb_dir = args.work / "portraits"
    info_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    print(f"License check for {len(images)} images", flush=True)
    titles = sorted(set(images.values()))
    info: dict[str, dict] = {}
    for start in range(0, len(titles), 50):
        batch = titles[start : start + 50]
        key = hashlib.sha1("\n".join(batch).encode()).hexdigest()
        path = info_dir / f"{key}.json"
        if not path.exists():
            body = urllib.parse.urlencode({
                "action": "query",
                "titles": "|".join("File:" + t for t in batch),
                "prop": "imageinfo",
                "iiprop": "url|extmetadata",
                "iiurlwidth": "120",
                "iiextmetadatafilter": "LicenseShortName|Artist|Credit",
                "format": "json",
                "formatversion": "2",
            }).encode()
            path.write_bytes(fetch(API, body))
            time.sleep(0.3)
        data = json.loads(path.read_text(encoding="utf-8"))
        normalized = {n["to"]: n["from"] for n in data["query"].get("normalized", [])}
        for page in data["query"].get("pages", []):
            if not page.get("imageinfo"):
                continue
            title = normalized.get(page["title"], page["title"]).removeprefix("File:")
            ii = page["imageinfo"][0]
            # Pages without metadata send an empty list instead of an object.
            meta = ii.get("extmetadata") or {}
            if not isinstance(meta, dict):
                meta = {}
            info[title] = {
                "thumb": re.sub(r"\?.*$", "", ii.get("thumburl", "")),
                "license": plain((meta.get("LicenseShortName") or {}).get("value", "")),
                "artist": plain((meta.get("Artist") or {}).get("value", "")),
            }
        if start % 2500 == 0:
            print(f"  {start}/{len(titles)}", flush=True)

    def allowed(entry: dict) -> bool:
        license_ = entry["license"]
        return bool(entry["thumb"] and FREE.search(license_) and not NOT_FREE.search(license_))

    chosen = {a: t for a, t in images.items() if t in info and allowed(info[t])}
    print(f"  freely licensed: {len(chosen)} of {len(images)}", flush=True)

    print("Downloading thumbnails", flush=True)
    done = 0
    for a, title in sorted(chosen.items(), key=lambda x: int(x[0])):
        if args.pack_only:
            break
        path = thumb_dir / f"{a}.webp"
        if not path.exists():
            try:
                path.write_bytes(square(fetch(info[title]["thumb"])))
            except Exception as error:  # broken or unreadable files are skipped
                print(f"  skipped Q{a}: {error}", flush=True)
                continue
            pace["delay"] = max(1.0, pace["delay"] * 0.995)
            time.sleep(pace["delay"])
        done += 1
        if done % 1000 == 0:
            print(f"  {done}/{len(chosen)}", flush=True)

    print("Packing", flush=True)
    index: dict[str, list] = {}
    credits: dict[str, list[str]] = {}
    shards = [bytearray() for _ in range(SHARDS)]
    for a, title in chosen.items():
        path = thumb_dir / f"{a}.webp"
        if not path.exists():
            continue
        data = path.read_bytes()
        shard = int(a) % SHARDS
        index[a] = [shard, len(shards[shard]), len(data)]
        shards[shard] += data
        entry = info[title]
        credits[a] = [title, entry["artist"], entry["license"]]
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("portraits-*.bin"):
        old.unlink()
    for number, data in enumerate(shards):
        (out / f"portraits-{number}.bin").write_bytes(bytes(data))
    (out / "portraits.json").write_text(
        json.dumps({"size": SIZE, "index": index, "credits": credits}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    total = sum(len(d) for d in shards)
    print(f"Done: {len(index)} portraits, {total / 1e6:.1f} MB in {SHARDS} files", flush=True)


if __name__ == "__main__":
    main()
