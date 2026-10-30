"""Refresh corresponding source and notices, then create the sharing archive."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tomllib
import zipfile

repo = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--package", type=Path, required=True)
parser.add_argument("--cargo-registry", type=Path, required=True)
parser.add_argument("--archive", type=Path)
parser.add_argument("--reuse-archive", type=Path)
parser.add_argument("--instructions", type=Path)
args = parser.parse_args()
kit = args.package.resolve()
if sys.platform == "win32" and not str(kit).startswith("\\\\?\\"):
    kit = Path("\\\\?\\" + str(kit))
payload = kit / "payload/files"
manifest_path = kit / "payload/manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
files = {item["path"]: item for item in manifest["files"]}


def record(relative, group="core"):
    path = payload / relative
    with path.open("rb") as stream: digest = hashlib.file_digest(stream, "sha256").hexdigest()
    files[relative] = {"path": relative, "group": group, "size": path.stat().st_size, "sha256": digest}


shutil.copy2(repo / "workers/tts_worker.py", payload / "workers/tts_worker.py")
record("workers/tts_worker.py")
shutil.copy2(repo / "installer/scripts/install.py", kit / "bootstrap/install.py")
# truststore: setup checks download certificates with Windows (see install.py ssl_context).
shutil.rmtree(kit / "bootstrap/vendor", ignore_errors=True)
shutil.copytree(repo / "installer/scripts/vendor", kit / "bootstrap/vendor", ignore=shutil.ignore_patterns("__pycache__"))
shutil.copy2(args.instructions or repo / "installer/FRIEND-BETA.txt", kit / "START HERE.txt")
notices = ["ORIGAMI THIRD-PARTY NOTICES\n\nOrigami Reader: Copyright (c) 2026 Sov3ryn. App use: Origami-Reader-App-License.txt. Source code: PolyForm Strict 1.0.0 (source-available; no redistribution). Dependency and model licenses remain separate.\nPython package notices are also retained in python/Lib/site-packages/*.dist-info and, for the light reader, python-light/Lib/site-packages/*.dist-info.\nEach model folder under models/ carries its own license and notice files.\nImage runtime notices accompany its binaries.\n"]


def append_notices(directory, label):
    candidates = [p for p in directory.iterdir() if p.is_file() and p.name.upper().startswith(("LICENSE", "LICENCE", "COPYING", "NOTICE"))]
    for candidate in candidates:
        notices.append("\n\n" + "=" * 72 + "\n" + label + " / " + candidate.name + "\n" + "=" * 72 + "\n" + candidate.read_text(encoding="utf-8", errors="replace"))
    if not candidates:
        # No license file shipped: name the declared license and where its text is.
        license, home = "", ""
        if (directory / "package.json").is_file():
            meta = json.loads((directory / "package.json").read_text(encoding="utf-8", errors="replace"))
            license = meta.get("license") if isinstance(meta.get("license"), str) else ""
            home = meta.get("repository", {}).get("url", "") if isinstance(meta.get("repository"), dict) else meta.get("repository", "") or ""
        elif (directory / "Cargo.toml").is_file():
            meta = tomllib.loads((directory / "Cargo.toml").read_text(encoding="utf-8", errors="replace")).get("package", {})
            license, home = str(meta.get("license", "")), str(meta.get("repository", ""))
        if license:
            notices.append("\n\n" + "=" * 72 + "\n" + label + "\n" + "=" * 72 + "\nLicense: " + license + " (no license file in the package; full text at " + (home or "the package's repository") + ")\n")


lock = json.loads((repo / "package-lock.json").read_text(encoding="utf-8"))
for name, package in lock.get("packages", {}).items():
    if name and (repo / name).is_dir(): append_notices(repo / name, name.replace("node_modules/", "") + " " + package.get("version", ""))
crates = set()
for lockfile in (repo / "src-tauri/Cargo.lock", repo / "installer/src-tauri/Cargo.lock"):
    for package in tomllib.loads(lockfile.read_text(encoding="utf-8"))["package"]:
        if package.get("source", "").startswith("registry+"):
            crates.add((package["name"], package["version"]))
found = 0
for name, version in sorted(crates):
    # Accepts CARGO_HOME/registry or CARGO_HOME/registry/src (crates live in src/<index>/).
    candidates = list(args.cargo_registry.glob("*/" + name + "-" + version)) or list(args.cargo_registry.glob("src/*/" + name + "-" + version))
    if candidates:
        found += 1
        append_notices(candidates[0], name + " " + version)
if found < len(crates) // 2:
    raise SystemExit(f"Only {found} of {len(crates)} Rust crates found under {args.cargo_registry}; their notices would be missing.")
(payload / "licenses/THIRD-PARTY-NOTICES.txt").write_text("".join(notices), encoding="utf-8")
record("licenses/THIRD-PARTY-NOTICES.txt")
tracked = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=repo).decode().split("\0")
sources = {repo / name for name in tracked if name}
sources.update((repo / "installer").rglob("*"))
with zipfile.ZipFile(payload / "source/Origami-Source.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
    for source in sorted(sources):
        parts = source.relative_to(repo).parts
        if source.is_file() and not any(p in {".local", "target", "node_modules", "dist", ".git", "gen", "__pycache__"} for p in parts):
            archive.write(source, "Origami/" + source.relative_to(repo).as_posix())
record("source/Origami-Source.zip")
manifest["files"] = list(files.values())
manifest["totalBytes"] = sum(f["size"] for f in files.values())
manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Sealed {len(files)} files. Creating the ZIP64 archive.", flush=True)
archive_path = args.archive or kit.with_suffix(".zip")
if archive_path.exists(): raise SystemExit("Sharing archive already exists; choose a new release name.")
old = zipfile.ZipFile(args.reuse_archive) if args.reuse_archive else None
old_files = {}
old_offsets = {}
if old:
    previous = json.loads(old.read(kit.name + "/payload/manifest.json"))
    old_files = {f["path"]: f for f in previous["files"]}
    entries = sorted(old.infolist(), key=lambda entry: entry.header_offset)
    for index, entry in enumerate(entries):
        end = entries[index + 1].header_offset if index + 1 < len(entries) else old.start_dir
        old_offsets[entry.filename] = (entry.header_offset, end)
last = 0
done = 0
with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as archive:
    for source in sorted(kit.rglob("*")):
        if source.is_file():
            relative = source.relative_to(kit).as_posix()
            name = kit.name + "/" + relative
            payload_name = relative.removeprefix("payload/files/")
            unchanged = (old and relative.startswith("payload/files/") and
                         payload_name in files and payload_name in old_files and
                         files[payload_name]["sha256"] == old_files[payload_name]["sha256"] and
                         source.stat().st_size == old_files[payload_name]["size"] and name in old_offsets)
            if unchanged:
                # Reuse unchanged compressed payload records, preserving their CRC and
                # local ZIP64 headers. ZipFile regenerates all central-directory offsets.
                entry = copy.copy(old.getinfo(name))
                start, end = old_offsets[name]
                entry.header_offset = archive.fp.tell()
                archive._writecheck(entry)
                archive._didModify = True
                old.fp.seek(start)
                remaining = end - start
                while remaining:
                    block = old.fp.read(min(8 * 1024**2, remaining))
                    if not block: raise ValueError("Previous archive ended unexpectedly")
                    archive.fp.write(block)
                    remaining -= len(block)
                archive.filelist.append(entry)
                archive.NameToInfo[name] = entry
                archive.start_dir = archive.fp.tell()
            else:
                archive.write(source, name)
            done += source.stat().st_size
            if done - last > 1024**3:
                print(f"Archived {done / 1024**3:.1f} GiB of source files", flush=True)
                last = done
if old: old.close()
with archive_path.open("rb") as stream: digest = hashlib.file_digest(stream, "sha256").hexdigest()
archive_path.with_suffix(".zip.sha256").write_text(digest + "  " + archive_path.name + "\n", encoding="ascii")
print(json.dumps({"archive": str(archive_path), "bytes": archive_path.stat().st_size, "sha256": digest}), flush=True)
