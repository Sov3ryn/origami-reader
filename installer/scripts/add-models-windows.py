"""Adds the optional model packs to a Windows kit folder, after
refresh-windows.py and before finish-windows.ps1 and seal-package.py.

Groups (chosen in setup; see install.py):
  speech-light   Kitten Mini, Kitten Micro and Kokoro, and the light reader's
                 own Python packages, layered over the shared ones
  images-turbo   SD-Turbo (GGUF for stable-diffusion.cpp)
  image-runtime  stable-diffusion.cpp, shared by DreamShaper and SD-Turbo
  speech-qwen    the Qwen 0.6B model (until now part of "speech")
  core           the handwriting model and the standard Related notes model,
                 shipped read-only beside the app

    python installer/scripts/add-models-windows.py --kit <folder>
        --kitten-mini <dir> --kitten-micro <dir> --kokoro <dir>
        --light-env <venv> --sd-turbo <gguf> --handwriting <dir> --embeddings <dir>
"""
import argparse
import csv
import hashlib
import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
APACHE = "models/Qwen3-TTS-12Hz-0.6B-Base/Qwen-Apache-2.0.txt"
STABILITY_NOTICE = ("This Stability AI Model is licensed under the Stability AI Community License, "
                    "Copyright © Stability AI Ltd. All Rights Reserved\n\n"
                    "Powered by Stability AI.\n\n"
                    "SD-Turbo by Stability AI: https://huggingface.co/stabilityai/sd-turbo\n"
                    "Modified by Origami: the original weights were converted to one GGUF file in 16-bit floating\n"
                    "point (sd-turbo-f16.gguf) so stable-diffusion.cpp can load them. They were not retrained.\n")


MIT_MICROSOFT = """TrOCR base handwritten, by Microsoft: https://huggingface.co/microsoft/trocr-base-handwritten
ONNX export used by Origami: https://huggingface.co/Xenova/trocr-base-handwritten (quantized encoder and decoder)

MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""


def long(path):
    path = Path(path).resolve()
    if sys.platform == "win32" and not str(path).startswith("\\\\?\\"):
        path = Path("\\\\?\\" + str(path))
    return path


def overlay_files(env, kit_site):
    """Files of every distribution in `env` that the kit's shared packages do
    not have at the same version (pip itself excluded)."""
    have = {p.name.lower() for p in kit_site.glob("*.dist-info")}
    files = set()
    for info in sorted(env.glob("*.dist-info")):
        if info.name.lower() in have or info.name.lower().startswith("pip-"):
            continue
        for row in csv.reader((info / "RECORD").read_text(encoding="utf-8").splitlines()):
            rel = Path(row[0]) if row else None
            if not rel or ".." in rel.parts or "__pycache__" in rel.parts or rel.suffix == ".pyc":
                continue
            if (env / rel).is_file():
                files.add(rel)
    return sorted(files)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kit", type=Path, required=True)
    for name in ("kitten-mini", "kitten-micro", "kokoro", "light-env", "sd-turbo", "handwriting", "embeddings"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    kit = long(args.kit)
    payload = kit / "payload/files"
    manifest_path = kit / "payload/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = {f["path"]: f for f in manifest["files"]}

    def add(source, relative, group):
        relative = Path(relative).as_posix()
        target = payload / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.unlink(missing_ok=True)
        shutil.copy2(long(source), target)
        with target.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        files[relative] = {"path": relative, "group": group, "size": target.stat().st_size, "sha256": digest}

    def text(relative, content, group):
        staged = kit / "staged.txt"
        staged.write_text(content, encoding="utf-8")
        add(staged, relative, group)
        staged.unlink()

    # Existing parts move to their own groups so setup can leave them out.
    for f in files.values():
        if f["path"].startswith("image-runtime/"):
            f["group"] = "image-runtime"
        elif f["path"].startswith("models/Qwen3-TTS-12Hz-0.6B-Base/"):
            f["group"] = "speech-qwen"

    print("Light readers", flush=True)
    for source, folder, upstream in ((args.kitten_mini, "kitten-tts-mini-0.8", "https://huggingface.co/KittenML/kitten-tts-mini-0.8"),
                                     (args.kitten_micro, "kitten-tts-micro-0.8", "https://huggingface.co/KittenML/kitten-tts-micro-0.8"),
                                     (args.kokoro, "Kokoro-82M", "https://huggingface.co/hexgrad/Kokoro-82M")):
        for item in sorted(long(source).rglob("*")):
            if item.is_file() and not item.name.startswith("."):
                add(item, f"models/{folder}/{item.relative_to(long(source)).as_posix()}", "speech-light")
        add(payload / APACHE, f"models/{folder}/LICENSE-Apache-2.0.txt", "speech-light")
        text(f"models/{folder}/MODEL-NOTICE.txt", f"{folder}: unmodified weights under the Apache License 2.0.\n{upstream}\n", "speech-light")

    env = long(args.light_env)
    site = env / "Lib/site-packages"
    kit_site = payload / "python/Lib/site-packages"
    overlay = overlay_files(site, kit_site)
    for rel in overlay:
        add(site / rel, Path("python-light/Lib/site-packages") / rel, "speech-light")
    # Shared packages (PyTorch, ONNX Runtime, NumPy...) come after the light
    # reader's own, so its versions win where they differ.
    text("python-light/Lib/site-packages/origami-shared.pth", "../../../python/Lib/site-packages\n", "speech-light")
    add(env / "Scripts/python.exe", "python-light/Scripts/python.exe", "speech-light")
    print(f"  {len(overlay)} package files", flush=True)

    print("SD-Turbo", flush=True)
    add(args.sd_turbo, "models/sd-turbo/sd-turbo-f16.gguf", "images-turbo")
    add(REPO / "docs/licenses/SD-Turbo-LICENSE.txt", "models/sd-turbo/LICENSE.txt", "images-turbo")
    text("models/sd-turbo/NOTICE.txt", STABILITY_NOTICE, "images-turbo")

    print("Handwriting and Related notes models", flush=True)
    for source, relative in ((args.handwriting, "models/handwriting/trocr-base"), (args.embeddings, "models/embeddings/standard")):
        source = long(source)
        if not (source / "verified.txt").is_file():
            raise SystemExit(f"Not a verified download: {source}")
        for item in sorted(source.iterdir()):
            if item.is_file():
                add(item, f"{relative}/{item.name}", "core")
    # Full license texts beside the weights (the downloads carry a short note).
    text("models/handwriting/trocr-base/LICENSE-MIT.txt", MIT_MICROSOFT, "core")
    add(payload / APACHE, "models/embeddings/standard/LICENSE-Apache-2.0.txt", "core")

    manifest["files"] = list(files.values())
    manifest["totalBytes"] = sum(f["size"] for f in files.values())
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    groups = {}
    for f in files.values():
        groups[f["group"]] = groups.get(f["group"], 0) + f["size"]
    for group, size in sorted(groups.items()):
        print(f"  {group:15} {size / 1024**3:6.2f} GiB")
    print(f"Kit: {len(files)} files, {manifest['totalBytes'] / 1024**3:.2f} GiB", flush=True)


if __name__ == "__main__":
    main()
