"""Makes the online Windows kit from a full kit folder: the same app and
setup, without the parts setup downloads (model weights, Python packages,
the picture runtime and the voice packs). Also writes one ZIP per voice
language, to publish where setup can download it, a few seconds of each voice
for setup's voice picker (voice-previews/ in the kit), and, with --store-out,
the app's voice library (one WAV per voice and voice-store.json).

    python installer/scripts/make-online-windows.py --from <full kit> --output <new kit>
        --voices-out <folder> --voices-base <URL of the folder the voice ZIPs are published in>
        [--voices-dir <CreatedVoices>] [--store-out <folder>]
Then refresh-windows.py, finish-windows.ps1 and seal-package.py as usual.
"""
import argparse
import array
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import unicodedata
import wave
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


def slug(name):
    """A name as an ID part: "Anais Laurent" becomes "anais-laurent"."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


def read_wav(path):
    """Mono samples in [-1, 1] and the sample rate, from 16-bit or float WAV."""
    data, fmt, body, at = path.read_bytes(), None, b"", 12
    while at + 8 <= len(data):
        kind, size = struct.unpack("<4sI", data[at:at + 8])
        if kind == b"fmt ":
            fmt = struct.unpack("<HHIIHH", data[at + 8:at + 24])
        elif kind == b"data":
            body = data[at + 8:at + 8 + size]
            break
        at += 8 + size + (size & 1)
    tag, channels, rate, _, _, bits = fmt
    if tag == 3 and bits == 32:
        samples = list(array.array("f", body[:len(body) // 4 * 4]))
    elif tag == 1 and bits == 16:
        samples = [v / 32768 for v in array.array("h", body[:len(body) // 2 * 2])]
    else:
        raise SystemExit(f"Unsupported WAV format in {path.name}")
    return samples[::channels], rate


def preview_clip(audio, target):
    """The first few seconds of a voice, cut at its quietest moment between
    3.5 and 6.5 seconds (usually the pause after a sentence), with a short fade."""
    samples, rate = read_wav(audio)
    window = rate // 20
    start, end = int(3.5 * rate), min(len(samples) - window, int(6.5 * rate))
    cut = len(samples)
    if end > start:
        quiet = min(range(start, end, window // 2), key=lambda i: sum(x * x for x in samples[i:i + window]))
        cut = quiet + window // 2
    clip = samples[:cut]
    fade = min(len(clip), rate // 15)
    for i in range(fade):
        clip[len(clip) - fade + i] *= 1 - i / fade
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(array.array("h", (int(max(-1.0, min(1.0, x)) * 32767) for x in clip)).tobytes())


def voice_packs(voices_dir, out):
    """One ZIP per language: voices/<code>/*.wav and voice-catalog-<code>.json."""
    packs = {}
    for profile in sorted(Path(voices_dir).glob("designed-vd-*.json")):
        voice = json.loads(profile.read_text(encoding="utf-8"))
        audio = profile.with_suffix(".wav")
        # Included profiles retain their synthetic references without a personal badge.
        if voice.get("origin") not in ("qwen-voice-design", "origami-included") or not audio.is_file() or not voice.get("reference_text"):
            raise SystemExit(f"Not a complete designed voice: {profile.name}")
        code = LANGUAGES[voice["language"]]
        voice_id = "origami-" + profile.stem.removeprefix("designed-vd-").removeprefix("approved-")
        # The voices made for release 20 reuse file numbers of earlier, different
        # voices; a name-based ID keeps them from being taken for those.
        if voice.get("origin") == "origami-included":
            voice_id = f"origami-{code}-{slug(voice['name'])}"
        for key in ("origin", "designPrompt", "notes"):
            voice.pop(key, None)
        voice.update(reference=f"voices/{code}/{voice_id}.wav", pack=code)
        packs.setdefault(code, []).append((voice_id, voice, audio))
    out.mkdir(parents=True, exist_ok=True)
    built = {}
    for code, voices in packs.items():
        ids = [v[0] for v in voices]
        if len(ids) != len(set(ids)):
            raise SystemExit(f"Two {code} voices share an ID: {sorted(i for i in ids if ids.count(i) > 1)}")
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
        built[code] = {"path": path, "size": path.stat().st_size, "sha256": digest(path), "count": len(voices),
                       "voices": sorted(voices, key=lambda v: v[0])}
        print(f"  voices-{code}.zip: {len(voices)} voices, {path.stat().st_size / 1e6:.1f} MB")
    return built


def voice_store(packs, out):
    """The app's voice library: one WAV per voice and voice-store.json, to
    publish together in one release (src-tauri/src/voice_store.rs)."""
    out.mkdir(parents=True, exist_ok=True)
    voices = {}
    for pack in packs.values():
        for voice_id, voice, audio in pack["voices"]:
            target = out / f"{voice_id}.wav"
            shutil.copy2(audio, target)
            entry = {k: v for k, v in voice.items() if k != "reference"}
            entry.update(file=target.name, sha256=digest(target), size=target.stat().st_size)
            voices[voice_id] = entry
    (out / "voice-store.json").write_text(json.dumps({"format": 1, "voices": voices}, indent=2, ensure_ascii=False),
                                          encoding="utf-8")
    print(f"  voice library: {len(voices)} voices in {out}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--voices-out", type=Path, required=True)
    parser.add_argument("--voices-base", required=True)
    parser.add_argument("--voices-dir", type=Path,
                        default=Path(os.environ.get("APPDATA", "")) / "app.origami.reader/CreatedVoices")
    parser.add_argument("--store-out", type=Path)
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
    packs = voice_packs(args.voices_dir, args.voices_out)
    for code, pack in packs.items():
        # Setup lists each voice with a few seconds of it, so people choose
        # the ones they want (installer/src/App.tsx, voice_preview).
        listed = []
        for voice_id, voice, audio in pack["voices"]:
            preview = f"voice-previews/{code}/{voice_id}.wav"
            preview_clip(audio, kit / preview)
            listed.append({"id": voice_id, "name": voice.get("name", voice_id), "gender": voice.get("gender", ""),
                           "description": voice.get("description", ""), "accent": voice.get("accent", ""),
                           "preview": preview})
        downloads["groups"][f"voices-{code}"] = {
            "label": NAMES[code], "voices": pack["count"], "bytes": pack["size"], "voiceList": listed,
            "archive": {"url": f"{base}/voices-{code}.zip", "sha256": pack["sha256"], "size": pack["size"], "path": "."}}
    if args.store_out:
        voice_store(packs, args.store_out)

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
