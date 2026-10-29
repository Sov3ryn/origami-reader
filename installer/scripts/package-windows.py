"""Assemble a private offline kit from explicitly selected local assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile

REPO = Path(__file__).resolve().parents[2]


VERSION = "0.1.0-beta.18"


def runtime_files(site_packages):
    """ONNX Runtime from the speech packages, its notices, and the Visual C++
    runtime files it needs (redistributable app-locally)."""
    ort = Path(site_packages) / "onnxruntime"
    files = [(ort / "capi" / name, name) for name in ("onnxruntime.dll", "onnxruntime_providers_shared.dll")]
    files += [(ort / "LICENSE", "ONNX-Runtime-LICENSE.txt"), (ort / "ThirdPartyNotices.txt", "ONNX-Runtime-ThirdPartyNotices.txt")]
    system = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32"
    files += [(system / name, name) for name in ("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "msvcp140_1.dll")]
    missing = [str(source) for source, _ in files if not source.is_file()]
    if missing:
        raise SystemExit("ONNX Runtime files are missing: " + ", ".join(missing))
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--python-base", type=Path, required=True)
    parser.add_argument("--site-packages", type=Path, required=True)
    parser.add_argument("--archive", action="store_true")
    parser.add_argument("--languages", nargs="+", choices=["en", "fr", "hi", "ko", "es"], default=["en", "fr", "hi", "ko", "es"])
    parser.add_argument("--voices-dir", type=Path,
                        default=Path(os.environ.get("APPDATA", "")) / "app.origami.reader/CreatedVoices",
                        help="Voices made in Origami's voice designer; the only voices a kit includes.")
    args = parser.parse_args()
    kit = args.output.resolve()
    if sys.platform == "win32" and not str(kit).startswith("\\\\?\\"):
        kit = Path("\\\\?\\" + str(kit))
    if kit.exists(): raise SystemExit("Choose a fresh output folder.")
    kit.mkdir(parents=True)
    payload = kit / "payload/files"
    payload.mkdir(parents=True)
    files = []

    def add(source, relative, group):
        source = Path(source)
        target = payload / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        with source.open("rb") as reader, target.open("wb") as writer:
            while chunk := reader.read(4 * 1024 * 1024):
                digest.update(chunk)
                writer.write(chunk)
        shutil.copymode(source, target)
        files.append({"path": str(relative).replace("\\", "/"), "group": group,
                      "size": target.stat().st_size, "sha256": digest.hexdigest()})

    def tree(source, relative, group, exclude=()):
        # Read through the long-path form on Windows. Without it, files deeper
        # than 260 characters are silently skipped (this once dropped 286
        # PyTorch files and broke speech in a kit).
        source = Path(source).resolve()
        if sys.platform == "win32" and not str(source).startswith("\\\\?\\"):
            source = Path("\\\\?\\" + str(source))
        for source_file in sorted(source.rglob("*")):
            parts = source_file.relative_to(source).parts
            if source_file.is_file() and not any(p in {"__pycache__", ".cache", ".git", *exclude} for p in parts) and source_file.suffix != ".pyc":
                add(source_file, Path(relative) / source_file.relative_to(source), group)

    print("Staging application and standalone Python", flush=True)
    add(REPO / "src-tauri/target/release/origami-reader.exe", "origami-reader.exe", "core")
    tree(REPO / "workers", "workers", "core")
    # Setup's downloader and catalog, for models added later from Settings.
    add(REPO / "installer/scripts/install.py", "workers/setup_install.py", "core")
    add(REPO / "installer/downloads.json", "workers/setup_downloads.json", "core")
    # The locked package lists, here so updates of the workers refresh them.
    for lock in sorted((REPO / "installer/locks").glob("*.txt")):
        add(lock, "workers/setup_locks/" + lock.name, "core")
    # ONNX Runtime for Work Mode's Connections models, loaded by the app only
    # when needed (see src-tauri/src/embed.rs). The Visual C++ runtime files go
    # beside it (app-local deployment), so it works where they are not installed.
    for source, name in runtime_files(args.site_packages):
        add(source, Path("runtime") / name, "core")
    for source in args.python_base.iterdir():
        if source.is_file() and source.suffix in {".exe", ".dll", ".txt"}:
            add(source, Path("python") / source.name, "core")
    tree(args.python_base / "Lib", "python/Lib", "core", ("site-packages", "test", "tests", "idlelib", "ensurepip"))
    tree(args.python_base / "DLLs", "python/DLLs", "core")
    add(REPO / "installer/scripts/Uninstall Origami.ps1", "Uninstall Origami.ps1", "core")
    add(REPO / "LICENSE", "licenses/Origami-Source-PolyForm-Strict-1.0.0.txt", "core")
    add(REPO / "APP-LICENSE.md", "licenses/Origami-Reader-App-License.txt", "core")
    tree(REPO / "docs/licenses", "licenses", "core")
    print("Staging speech dependencies", flush=True)
    tree(args.site_packages, "python/Lib/site-packages", "speech", ("include", "tests", "test"))
    config = json.loads((REPO / ".local/worker.json").read_text(encoding="utf-8-sig"))
    tree(Path(config["model"]), "models/Qwen3-TTS-12Hz-0.6B-Base", "speech")
    # Only voices made with the voice designer ship. Recorded references from
    # other services never enter a kit.
    catalog = {}
    language_codes = {"English": "en", "French": "fr", "Hindi": "hi", "Korean": "ko", "Spanish": "es"}
    for profile_file in sorted(args.voices_dir.glob("designed-vd-*.json")):
        voice = json.loads(profile_file.read_text(encoding="utf-8"))
        audio = profile_file.with_suffix(".wav")
        if voice.get("origin") != "qwen-voice-design" or not audio.is_file() or not voice.get("reference_text"):
            raise SystemExit(f"Not a complete designed voice: {profile_file.name}")
        code = language_codes[voice["language"]]
        if code not in args.languages:
            continue
        voice_id = "origami-" + profile_file.stem.removeprefix("designed-vd-").removeprefix("approved-")
        relative = f"voices/{code}/{voice_id}.wav"
        add(audio, relative, "voices-" + code)
        # Bundled voices are built in, not the tester's own created voices.
        voice.pop("origin", None)
        voice.pop("designPrompt", None)
        voice.pop("notes", None)
        voice.update(reference=relative, pack=code)
        catalog[voice_id] = voice
    temp_catalog = kit / "voice-catalog.json"
    temp_catalog.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
    add(temp_catalog, "voice-catalog.json", "core")
    temp_catalog.unlink()
    print(f"Staged {len(catalog)} voices. Staging the shared image model", flush=True)
    cover = json.loads((REPO / ".local/cover-engine.json").read_text(encoding="utf-8-sig"))
    tree(Path(cover["executable"]).parent, "image-runtime", "images")
    add(cover["portrait"]["model"], "models/dreamshaper-8-lcm.safetensors", "images")
    image_hash = next(f["sha256"] for f in files if f["path"].endswith("dreamshaper-8-lcm.safetensors"))
    if image_hash.upper() != "A4F3E1526C5DC4FCBE342F5C410D83AE202C7A415FCEFCBB92E0F93FCD0A87C3":
        raise ValueError("Image model does not match the reviewed release")
    add(REPO / "docs/licenses/DreamShaper-OpenRAIL-M.txt", "models/CreativeML-OpenRAIL-M.txt", "images")
    notice = kit / "MODEL-NOTICE.txt"
    notice.write_text("DreamShaper 8 LCM by Lykon. Unmodified checkpoint, Civitai version 252914.\nhttps://huggingface.co/Lykon/dreamshaper-8-lcm\nhttps://civitai.com/models/4384?modelVersionId=252914\nSHA-256: " + image_hash + "\nWeights retain CreativeML OpenRAIL-M. This is a free private beta bundle.\n", encoding="utf-8")
    add(notice, "models/MODEL-NOTICE.txt", "images")
    notice.unlink()
    # Preserve the model license and upstream attribution with the weights.
    for name, url in {
        "Qwen-Apache-2.0.txt": "https://raw.githubusercontent.com/QwenLM/Qwen3-TTS/main/LICENSE",
        "Qwen-MODEL-CARD.md": "https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/raw/main/README.md",
    }.items():
        downloaded = kit / name
        urllib.request.urlretrieve(url, downloaded)
        add(downloaded, "models/Qwen3-TTS-12Hz-0.6B-Base/" + name, "speech")
        downloaded.unlink()
    print("Including corresponding application source", flush=True)
    source_zip = kit / "Origami-Source.zip"
    tracked = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=REPO).decode().split("\0")
    sources = {REPO / name for name in tracked if name}
    sources.update((REPO / "installer").rglob("*"))
    with zipfile.ZipFile(source_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
        for source in sorted(sources):
            parts = source.relative_to(REPO).parts
            if source.is_file() and not any(p in {".local", "target", "node_modules", "dist", ".git", "gen", "__pycache__"} for p in parts):
                archive.write(source, "Origami/" + source.relative_to(REPO).as_posix())
    add(source_zip, "source/Origami-Source.zip", "core")
    source_zip.unlink()
    # Installed component versions, read by the app's updater (src-tauri/src/update.rs)
    # so later updates replace only what changed instead of the whole kit.
    components = kit / "components.json"
    components.write_text(json.dumps({"app": VERSION, "workers": VERSION, "python": VERSION,
                                      **({"voices": VERSION} if catalog else {})}, indent=2), encoding="utf-8")
    add(components, "components.json", "core")
    components.unlink()
    shutil.copy2(REPO / "src-tauri/target/release/origami-setup.exe", kit / "origami-installer-ui.exe")
    (kit / "bootstrap").mkdir()
    shutil.copy2(REPO / "installer/scripts/install.py", kit / "bootstrap/install.py")
    shutil.copytree(REPO / "installer/scripts/vendor", kit / "bootstrap/vendor", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy2(REPO / "installer/FRIEND-BETA.txt", kit / "START HERE.txt")
    manifest = {"schemaVersion": 1, "version": VERSION, "platform": "windows", "architecture": "x86_64",
                "executable": "origami-reader.exe", "voiceCount": len(catalog), "totalBytes": sum(f["size"] for f in files), "files": files}
    (kit / "payload/manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Package complete: {len(files)} files, {manifest['totalBytes'] / 1024**3:.2f} GiB", flush=True)
    if args.archive:
        archive_path = kit.with_suffix(".zip")
        print("Creating ZIP64 sharing archive", flush=True)
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as archive:
            for source in sorted(kit.rglob("*")):
                if source.is_file(): archive.write(source, kit.name + "/" + source.relative_to(kit).as_posix())
        digest = hashlib.file_digest(archive_path.open("rb"), "sha256").hexdigest()
        archive_path.with_suffix(".zip.sha256").write_text(digest + "  " + archive_path.name + "\n", encoding="ascii")
        print(f"Sharing archive: {archive_path} ({archive_path.stat().st_size / 1024**3:.2f} GiB)", flush=True)


if __name__ == "__main__": main()
