"""Assembles the Linux beta kit: source, English voices, models, installer.

The reader is built on the tester's Linux computer by install-linux.sh, so
the kit carries the source rather than Windows binaries. Voices, the speech
model and the image model are platform neutral and come from the Windows kit
staging folder.

  python installer/scripts/package-linux.py --assets <payload/files dir> --out <new folder> [--no-images]
"""

import argparse
import json
import os
import shutil
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Never shipped: dependencies, build output, private configuration and the
# locally generated Korean PDF fixture.
EXCLUDE_DIRS = {
    "node_modules", "dist", "target", ".local", "test-results", "playwright-report",
    "__pycache__", ".git", "gen",
}
EXCLUDE_FILES = {"korean-lake.pdf"}
EXCLUDE_SUFFIXES = {".log", ".pyc", ".wav", ".mp3", ".safetensors", ".lnk", ".tsbuildinfo"}


def copy_source(dest: Path) -> int:
    count = 0
    for folder, dirs, files in os.walk(ROOT):
        rel = Path(folder).relative_to(ROOT)
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".env")]
        for name in files:
            if name in EXCLUDE_FILES or Path(name).suffix in EXCLUDE_SUFFIXES or name.startswith(".env"):
                continue
            target = dest / rel / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(Path(folder) / name, target)
            count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--no-images", action="store_true")
    parser.add_argument("--archive", action="store_true", help="also write <out>.tar")
    args = parser.parse_args()
    out = args.out
    if out.exists():
        raise SystemExit("Choose a new output folder.")
    assets = args.assets

    print("Source")
    print("  files:", copy_source(out / "source"))

    print("English voices")
    catalog = json.loads((assets / "voice-catalog.json").read_text(encoding="utf-8"))
    english = {k: v for k, v in catalog.items() if v.get("pack") == "en"}
    (out / "payload/voices").mkdir(parents=True)
    for voice in english.values():
        src = assets / voice["reference"]
        dst = out / "payload" / voice["reference"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    (out / "payload/voice-catalog.json").write_text(
        json.dumps(english, ensure_ascii=False, indent=2), encoding="utf-8")
    print("  voices:", len(english))

    print("Models and licenses")
    shutil.copytree(assets / "models/Qwen3-TTS-12Hz-0.6B-Base", out / "payload/models/Qwen3-TTS-12Hz-0.6B-Base")
    for name in ("CreativeML-OpenRAIL-M.txt", "MODEL-NOTICE.txt"):
        if (assets / "models" / name).exists():
            shutil.copy2(assets / "models" / name, out / "payload/models" / name)
    if not args.no_images:
        shutil.copy2(assets / "models/dreamshaper-8-lcm.safetensors", out / "payload/models/")
    shutil.copytree(assets / "licenses", out / "payload/licenses")
    # Origami's own terms come from the repository, never an older kit.
    for old in (out / "payload/licenses").glob("Origami-*"):
        old.unlink()
    shutil.copy2(ROOT / "LICENSE", out / "payload/licenses/Origami-Source-PolyForm-Strict-1.0.0.txt")
    shutil.copy2(ROOT / "APP-LICENSE.md", out / "payload/licenses/Origami-Reader-App-License.txt")
    shutil.copy2(ROOT / "APP-LICENSE.md", out / "LICENSE.txt")

    print("Installer")
    linux = ROOT / "installer/linux"
    for name in ("install-linux.sh", "linux_setup.py", "START-HERE-LINUX.txt"):
        data = (linux / name).read_bytes().replace(b"\r\n", b"\n")
        (out / name).write_bytes(data)

    if args.archive:
        archive = out.with_suffix(".tar")
        print("Archive", archive)
        executable = {"install-linux.sh"}
        with tarfile.open(archive, "w", format=tarfile.PAX_FORMAT) as tar:
            def info(t: tarfile.TarInfo) -> tarfile.TarInfo:
                t.uid = t.gid = 1000
                t.uname = t.gname = ""
                base = Path(t.name).name
                t.mode = 0o755 if t.isdir() or base in executable or base.endswith(".sh") else 0o644
                return t
            tar.add(out, arcname=out.name, filter=info)
    print("Done:", out)


if __name__ == "__main__":
    main()
