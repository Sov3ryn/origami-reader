"""Brings an existing Windows kit folder up to date with the current app,
without rebuilding the large parts (Python, speech model, voices, images).

Replaces the program, its runtime folder (ONNX Runtime and the Visual C++
files, taken from the kit's own Python), the workers, the license texts and
components.json, then rewrites the manifest entries and the version. Run it
on a fresh copy (filter-language-package.py makes one), then
finish-windows.ps1 and seal-package.py as usual.

    python installer/scripts/refresh-windows.py --kit <folder>
"""
import argparse
import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("package_windows", Path(__file__).with_name("package-windows.py"))
package_windows = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package_windows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kit", type=Path, required=True)
    args = parser.parse_args()
    kit = args.kit.resolve()
    if sys.platform == "win32" and not str(kit).startswith("\\\\?\\"):
        kit = Path("\\\\?\\" + str(kit))
    payload = kit / "payload/files"
    manifest_path = kit / "payload/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = {f["path"]: f for f in manifest["files"]}

    def add(source, relative, group="core"):
        target = payload / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        # A new file, never written through: kit copies may share files
        # with an earlier kit by hard links.
        target.unlink(missing_ok=True)
        shutil.copy2(source, target)
        with target.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        changed = files.get(relative, {}).get("sha256") != digest
        files[relative] = {"path": relative, "group": group, "size": target.stat().st_size, "sha256": digest}
        if changed:
            print("updated", relative)

    add(REPO / "src-tauri/target/release/origami-reader.exe", "origami-reader.exe")
    # Workers: the repository's, as the full packager stages them.
    for source in sorted((REPO / "workers").rglob("*")):
        parts = source.relative_to(REPO / "workers").parts
        if source.is_file() and "__pycache__" not in parts and source.suffix != ".pyc":
            add(source, "workers/" + source.relative_to(REPO / "workers").as_posix())
    # Setup's downloader and catalog, for models added later from Settings
    # (workers/add_components.py).
    add(REPO / "installer/scripts/install.py", "workers/setup_install.py")
    add(REPO / "installer/downloads.json", "workers/setup_downloads.json")
    # The locked package lists, here so updates of the workers refresh them.
    for lock in sorted((REPO / "installer/locks").glob("*.txt")):
        add(lock, "workers/setup_locks/" + lock.name)
    # ONNX Runtime for Related notes, from the kit's own Python packages.
    for source, name in package_windows.runtime_files(payload / "python/Lib/site-packages"):
        add(source, "runtime/" + name)
    # The uninstaller changes too (beta 12 reads receipts as UTF-8).
    add(REPO / "installer/scripts/Uninstall Origami.ps1", "Uninstall Origami.ps1")
    add(REPO / "LICENSE", "licenses/Origami-Source-PolyForm-Strict-1.0.0.txt")
    add(REPO / "APP-LICENSE.md", "licenses/Origami-Reader-App-License.txt")
    # With translations/ (the app license and model notices in each language).
    for source in sorted((REPO / "docs/licenses").rglob("*")):
        if source.is_file():
            add(source, "licenses/" + source.relative_to(REPO / "docs/licenses").as_posix())
    excalidraw = REPO / "public/excalidraw-assets/fonts/LICENSES.txt"
    if excalidraw.is_file():
        add(excalidraw, "licenses/Excalidraw-fonts.txt")
    # What is installed, for component updates (src-tauri/src/update.rs).
    version = package_windows.VERSION
    components = {"app": version, "workers": version, "python": version}
    if any(f["group"].startswith("voices-") for f in files.values()):
        components["voices"] = version
    staged = kit / "components.json"
    staged.write_text(json.dumps(components, indent=2), encoding="utf-8")
    add(staged, "components.json")
    staged.unlink()
    shutil.copy2(REPO / "src-tauri/target/release/origami-setup.exe", kit / "origami-installer-ui.exe")
    manifest["version"] = version
    manifest["files"] = list(files.values())
    manifest["totalBytes"] = sum(f["size"] for f in files.values())
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Kit refreshed to {version}: {len(files)} files, {manifest['totalBytes'] / 1024**3:.2f} GiB")


if __name__ == "__main__":
    main()
