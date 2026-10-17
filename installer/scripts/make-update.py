"""Builds an Origami update: one zip per changed component, and the signed
update list the app checks (see docs/UPDATES.md).

    python installer/scripts/make-update.py --version 0.1.0-beta.4 \
        --base-url https://updates.example/origami --key C:/keys/origami-update.key \
        --output C:/updates/0.1.0-beta.4 app workers

Components: app (the program, runtime/ and licenses/), workers, voices,
python. Only what is named is packed, so a fix to the reading app is a
download of a few megabytes instead of a new kit.
"""
import argparse
import datetime
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RELEASE = REPO / "src-tauri/target/release"


def sources(component, voices_dir):
    """(file on disk, path inside the install folder) for each component."""
    if component == "app":
        exe = RELEASE / ("origami-reader.exe" if sys.platform == "win32" else "origami-reader")
        yield exe, exe.name
        for folder in ("runtime", "licenses"):
            root = RELEASE / folder
            if root.is_dir():
                for f in sorted(root.rglob("*")):
                    if f.is_file():
                        yield f, f"{folder}/{f.relative_to(root).as_posix()}"
    elif component == "workers":
        root = REPO / "workers"
        for f in sorted(root.rglob("*")):
            if f.is_file() and "__pycache__" not in f.parts and f.suffix != ".pyc":
                yield f, f"workers/{f.relative_to(root).as_posix()}"
    elif component == "voices":
        if not voices_dir or not voices_dir.is_dir():
            raise SystemExit("voices needs --voices-dir (only voices made in Origami's voice designer).")
        for f in sorted(voices_dir.rglob("*")):
            if f.is_file():
                yield f, f"voices/{f.relative_to(voices_dir).as_posix()}"
    else:
        raise SystemExit(f"Unknown or unsupported component: {component}")


def sign_tool(args):
    subprocess.check_call(["cargo", "run", "--quiet", "--example", "origami-sign", "--", *args], cwd=REPO / "src-tauri")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--base-url", required=True, help="Where the zips and manifest.json will be hosted (https).")
    parser.add_argument("--key", type=Path, required=True, help="Secret key from origami-sign keygen. Never commit it.")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--platform", default="windows-x64" if sys.platform == "win32" else "linux-x64")
    parser.add_argument("--notes", default="", help="Short release notes shown in Settings.")
    parser.add_argument("--voices-dir", type=Path)
    parser.add_argument("--content-key", type=Path,
                        help="Content key from origami-sign content-keygen: encrypts each file so only builds with that key can open it.")
    parser.add_argument("components", nargs="+", choices=["app", "workers", "voices"])
    args = parser.parse_args()
    if not args.base_url.startswith(("https://", "http://127.0.0.1")):
        raise SystemExit("--base-url must be https (or http://127.0.0.1 for a local test).")
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    base = args.base_url.rstrip("/")
    listed = []
    for component in args.components:
        target = out / f"{component}-{args.version}-{args.platform}.zip"
        count = 0
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for source, inside in sources(component, args.voices_dir):
                archive.write(source, inside)
                count += 1
        if args.content_key:
            sealed = target.with_suffix(".origami")
            sign_tool(["encrypt", str(args.content_key), str(target), str(sealed)])
            target.unlink()
            target = sealed
        digest = hashlib.file_digest(target.open("rb"), "sha256").hexdigest()
        listed.append({
            "id": component,
            "version": args.version,
            "platform": args.platform if component == "app" else "any",
            "url": f"{base}/{target.name}",
            "size": target.stat().st_size,
            "sha256": digest,
            "restart": component == "app",
            **({"encrypted": True} if args.content_key else {}),
        })
        print(f"{component}: {count} files, {target.stat().st_size / 1024**2:.1f} MiB")
    manifest = {
        "format": 1,
        "version": args.version,
        "released": datetime.date.today().isoformat(),
        "notes": args.notes,
        "components": listed,
    }
    path = out / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    sign_tool(["sign", str(args.key), str(path)])
    print(f"Upload everything in {out} to {base}/")


if __name__ == "__main__":
    main()
