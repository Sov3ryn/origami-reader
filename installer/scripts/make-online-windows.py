"""Makes the online Windows kit from a full kit folder: the same app and
setup, without the parts setup downloads (model weights, Python packages,
the picture runtime and the voice packs). Also writes one ZIP per voice
language, to publish where setup can download it.

    python installer/scripts/make-online-windows.py --from <full kit> --output <new kit>
        --voices-out <folder> --voices-base <URL of the folder the voice ZIPs are published in>
        [--voices-dir <CreatedVoices>]
Then refresh-windows.py, finish-windows.ps1 and seal-package.py as usual.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LANGUAGES = {"English": "en", "French": "fr", "Hindi": "hi", "Korean": "ko", "Spanish": "es"}
NAMES = {"en": "English voices", "fr": "French voices", "hi": "Hindi voices", "ko": "Korean voices", "es": "Spanish voices"}


def long(path):
    path = Path(path).resolve()
    return Path("\\\\?\\" + str(path)) if sys.platform == "win32" and not str(path).startswith("\\\\?\\") else path


def digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def voice_packs(voices_dir, out):
    """One ZIP per language: voices/<code>/*.wav and voice-catalog-<code>.json."""
    packs = {}
    for profile in sorted(Path(voices_dir).glob("designed-vd-*.json")):
        voice = json.loads(profile.read_text(encoding="utf-8"))
        audio = profile.with_suffix(".wav")
        # Only voices made with the voice designer ship.
        if voice.get("origin") != "qwen-voice-design" or not audio.is_file() or not voice.get("reference_text"):
            raise SystemExit(f"Not a complete designed voice: {profile.name}")
        code = LANGUAGES[voice["language"]]
        voice_id = "origami-" + profile.stem.removeprefix("designed-vd-").removeprefix("approved-")
        for key in ("origin", "designPrompt", "notes"):
            voice.pop(key, None)
        voice.update(reference=f"voices/{code}/{voice_id}.wav", pack=code)
        packs.setdefault(code, []).append((voice_id, voice, audio))
    out.mkdir(parents=True, exist_ok=True)
    built = {}
    for code, voices in packs.items():
        path = out / f"voices-{code}.zip"
        # Fixed dates and order: the same voices always give the same ZIP, so
        # published packs keep matching their fingerprints after a rebuild.
        def entry(name):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            return info
        with zipfile.ZipFile(path, "w") as archive:
            for voice_id, voice, audio in sorted(voices, key=lambda v: v[0]):
                archive.writestr(entry(voice["reference"]), audio.read_bytes())
            archive.writestr(entry(f"voice-catalog-{code}.json"),
                             json.dumps({v_id: v for v_id, v, _ in sorted(voices, key=lambda v: v[0])}, indent=2, ensure_ascii=False))
        built[code] = {"path": path, "size": path.stat().st_size, "sha256": digest(path), "count": len(voices)}
        print(f"  voices-{code}.zip: {len(voices)} voices, {path.stat().st_size / 1e6:.1f} MB")
    return built


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--voices-out", type=Path, required=True)
    parser.add_argument("--voices-base", required=True)
    parser.add_argument("--voices-dir", type=Path,
                        default=Path(os.environ.get("APPDATA", "")) / "app.origami.reader/CreatedVoices")
    args = parser.parse_args()
    source, kit = long(args.source), long(args.output)
    if kit.exists():
        raise SystemExit("Choose a fresh output folder.")
    manifest = json.loads((source / "payload/manifest.json").read_text(encoding="utf-8"))
    downloads = json.loads((REPO / "installer/downloads.json").read_text(encoding="utf-8"))
    downloaded = {f["path"] for g in downloads["groups"].values() for f in g.get("files", [])}

    def dropped(f):
        path = f["path"]
        return (f["group"] == "speech"
                or (path.startswith("python-light/Lib/site-packages/") and not path.endswith("origami-shared.pth"))
                or path.startswith(("image-runtime/", "voices/")) or path == "voice-catalog.json"
                or path == "models/sd-turbo/sd-turbo-f16.gguf" or path in downloaded
                or any(part.startswith(".") for part in path.split("/")))

    kept = [f for f in manifest["files"] if not dropped(f)]
    print(f"Keeping {len(kept)} of {len(manifest['files'])} files", flush=True)
    for top in source.iterdir():
        if top.name != "payload":
            (shutil.copytree if top.is_dir() else shutil.copy2)(top, kit / top.name)
    payload = kit / "payload/files"
    for f in kept:
        target = payload / f["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / "payload/files" / f["path"], target)
    for lock in sorted((REPO / "installer/locks").glob("*.txt")):
        target = payload / "setup/locks" / lock.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(lock, target)
        kept.append({"path": "setup/locks/" + lock.name, "group": "core", "size": target.stat().st_size, "sha256": digest(target)})

    print("Voice packs", flush=True)
    base = args.voices_base.rstrip("/")
    for code, pack in voice_packs(args.voices_dir, args.voices_out).items():
        downloads["groups"][f"voices-{code}"] = {
            "label": NAMES[code], "voices": pack["count"], "bytes": pack["size"],
            "archive": {"url": f"{base}/voices-{code}.zip", "sha256": pack["sha256"], "size": pack["size"], "path": "."}}

    manifest["files"] = kept
    manifest["downloads"] = downloads
    manifest["online"] = True
    manifest["voiceCount"] = sum(g.get("voices", 0) for g in downloads["groups"].values())
    manifest["totalBytes"] = sum(f["size"] for f in kept)
    (kit / "payload/manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    sizes = {name: g.get("bytes", 0) for name, g in downloads["groups"].items()}
    print(f"Online kit: {len(kept)} files, {manifest['totalBytes'] / 1e6:.0f} MB; downloads (GB): "
          + ", ".join(f"{k} {v / 1e9:.2f}" for k, v in sizes.items()))


if __name__ == "__main__":
    main()
