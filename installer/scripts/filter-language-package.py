"""Copy an existing offline kit into a fresh kit containing selected voice packs."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys


def contained(root, relative):
    path = (root / relative).resolve()
    if Path(relative).is_absolute() or not path.is_relative_to(root.resolve()):
        raise ValueError("Package path escapes its folder")
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--languages", nargs="+", choices=["en", "fr", "es", "hi", "ko"], required=True)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if output.exists() or output.is_relative_to(source) or source.is_relative_to(output):
        raise SystemExit("Choose a fresh folder outside the source package.")
    if sys.platform == "win32":
        source = Path("\\\\?\\" + str(source))
        output = Path("\\\\?\\" + str(output))
    manifest = json.loads((source / "payload/manifest.json").read_text(encoding="utf-8"))
    files = [f for f in manifest["files"] if not f["group"].startswith("voices-") or f["group"][7:] in args.languages]
    catalog = json.loads((source / "payload/files/voice-catalog.json").read_text(encoding="utf-8"))
    catalog = {key: voice for key, voice in catalog.items() if voice["pack"] in args.languages}
    if not catalog:
        raise SystemExit("No voices match the selected languages.")
    output.mkdir(parents=True)
    for name in ("origami-installer-ui.exe", "Origami Reader Installer.exe", "Origami Setup.exe", "Start Origami Setup.exe", "START HERE.txt"):
        # Kits from different builds name their launchers differently.
        if (source / name).is_file():
            shutil.copy2(source / name, output / name)
    for name in ("bootstrap", "prerequisites"):
        shutil.copytree(source / name, output / name)
    payload = output / "payload/files"
    payload.mkdir(parents=True)
    for item in files:
        original = contained(source / "payload/files", item["path"])
        target = contained(payload, item["path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        if item["path"] == "voice-catalog.json":
            target.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
            with target.open("rb") as stream:
                item["sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
            item["size"] = target.stat().st_size
        else:
            shutil.copy2(original, target)
            with target.open("rb") as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if actual != item["sha256"] or target.stat().st_size != item["size"]:
                raise ValueError("Payload integrity mismatch: " + item["path"])
    manifest.update(files=files, voiceCount=len(catalog), languages=args.languages,
                    totalBytes=sum(f["size"] for f in files))
    (output / "payload/manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"folder": str(output), "voices": len(catalog), "bytes": manifest["totalBytes"]}), flush=True)


if __name__ == "__main__":
    main()
