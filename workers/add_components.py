"""Adds a model to an installed Origami, from Settings.

Setup installs only what a computer needs; the other models are downloaded
later with setup's own downloader (setup_install.py, a copy of
installer/scripts/install.py) and catalog (setup_downloads.json): every file
comes from its original publisher and is checked against its SHA-256.

Usage: python add_components.py <install folder> <worker.json> <cover-engine.json> <model> [--accept-terms]
Progress is written as JSON lines; {"action": "cancel"} on the input stops it.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIGHT = ("kitten-mini", "kitten-micro", "kokoro")
IMAGES = ("dreamshaper-8-lcm", "sd-turbo")
READERS = ("qwen3-tts-0.6b", "qwen3-tts-1.7b")
MODELS = (*READERS, "qwen-voice-design", *LIGHT, *IMAGES)


def load_setup():
    spec = importlib.util.spec_from_file_location("setup_install", HERE / "setup_install.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return {}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file():
        shutil.copy2(path, path.with_suffix(".json.bak"))
    pending = path.with_suffix(".json.pending")
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    pending.replace(path)


# The CUDA build of PyTorch setup installs (cu128) runs on compute capability
# 7.0 and newer, as in setup (installer/src-tauri/src/main.rs). Older cards,
# and drivers too old to report it, get the processor build.
CUDA_MIN_CAPABILITY = 7.0


def nvidia():
    windows = Path(os.environ.get("SystemRoot", "C:/Windows"))
    tool = shutil.which("nvidia-smi") or (windows / "System32/nvidia-smi.exe")
    if not Path(tool).is_file():
        return False
    try:
        result = subprocess.run([str(tool), "--query-gpu=compute_cap", "--format=csv,noheader"],
                                capture_output=True, text=True, timeout=30, stdin=subprocess.DEVNULL,
                                **({"creationflags": 0x08000000} if sys.platform == "win32" else {}))
    except (OSError, subprocess.SubprocessError):
        return False
    if result.returncode:
        return False
    for line in result.stdout.splitlines():
        try:
            if float(line.strip()) >= CUDA_MIN_CAPABILITY:
                return True
        except ValueError:
            pass
    return False


APACHE_SOURCES = ("models/embeddings/standard/LICENSE-Apache-2.0.txt",
                  "models/Qwen3-TTS-12Hz-0.6B-Base/Qwen-Apache-2.0.txt")
LIGHT_FOLDERS = (("kitten-tts-mini-0.8", "https://huggingface.co/KittenML/kitten-tts-mini-0.8"),
                 ("kitten-tts-micro-0.8", "https://huggingface.co/KittenML/kitten-tts-micro-0.8"),
                 ("Kokoro-82M", "https://huggingface.co/hexgrad/Kokoro-82M"))
# The same texts as in a kit (installer/scripts/add-models-windows.py and package-windows.py).
STABILITY_NOTICE = ("This Stability AI Model is licensed under the Stability AI Community License, "
                    "Copyright \u00a9 Stability AI Ltd. All Rights Reserved\n\n"
                    "Powered by Stability AI.\n\n"
                    "SD-Turbo by Stability AI: https://huggingface.co/stabilityai/sd-turbo\n"
                    "Modified by Origami: the original weights were converted to one GGUF file in 16-bit floating\n"
                    "point (sd-turbo-f16.gguf) so stable-diffusion.cpp can load them. They were not retrained.\n")
DREAMSHAPER_SHA256 = "A4F3E1526C5DC4FCBE342F5C410D83AE202C7A415FCEFCBB92E0F93FCD0A87C3"
DREAMSHAPER_NOTICE = ("DreamShaper 8 LCM by Lykon. Unmodified checkpoint, Civitai version 252914.\n"
                      "https://huggingface.co/Lykon/dreamshaper-8-lcm\n"
                      "https://civitai.com/models/4384?modelVersionId=252914\nSHA-256: " + DREAMSHAPER_SHA256 + "\n"
                      "Weights retain CreativeML OpenRAIL-M. This is a free private beta bundle.\n")


def add_notices(dest, model):
    """The license and notice files a kit carries beside these weights."""
    def copy(sources, target):
        target = dest / target
        if target.exists():
            return
        source = next((dest / s for s in sources if (dest / s).is_file()), None)
        if source:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)

    def text(target, content):
        target = dest / target
        if not target.exists() and target.parent.is_dir():
            target.write_text(content, encoding="utf-8")

    if model in LIGHT:
        for folder, upstream in LIGHT_FOLDERS:
            if (dest / "models" / folder).is_dir():
                copy(APACHE_SOURCES, f"models/{folder}/LICENSE-Apache-2.0.txt")
                text(f"models/{folder}/MODEL-NOTICE.txt", f"{folder}: unmodified weights under the Apache License 2.0.\n{upstream}\n")
    elif model in READERS or model == "qwen-voice-design":
        folder = {"qwen3-tts-0.6b": "Qwen3-TTS-12Hz-0.6B-Base", "qwen3-tts-1.7b": "Qwen3-TTS-12Hz-1.7B-Base",
                  "qwen-voice-design": "Qwen3-TTS-12Hz-1.7B-VoiceDesign"}[model]
        if (dest / "models" / folder).is_dir():
            copy(APACHE_SOURCES, f"models/{folder}/Qwen-Apache-2.0.txt")
    elif model == "sd-turbo":
        copy(("licenses/SD-Turbo-LICENSE.txt",), "models/sd-turbo/LICENSE.txt")
        text("models/sd-turbo/NOTICE.txt", STABILITY_NOTICE)
    elif model == "dreamshaper-8-lcm":
        copy(("licenses/DreamShaper-OpenRAIL-M.txt",), "models/CreativeML-OpenRAIL-M.txt")
        text("models/MODEL-NOTICE.txt", DREAMSHAPER_NOTICE)


def files_in(root):
    """Every file in the folder, as receipt paths (forward slashes)."""
    found = set()
    for folder, _, names in os.walk(root):
        inside = Path(folder).relative_to(root).as_posix()
        found.update(name if inside == "." else inside + "/" + name for name in names)
    return found


def main():
    dest, worker_path, cover_path, model = Path(sys.argv[1]).resolve(), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
    accepted = "--accept-terms" in sys.argv[5:]
    s = load_setup()
    # Settings words its messages for a download, not for setup.
    s.AGAIN = "try again"
    s.CANCELLED = "Download cancelled."
    threading.Thread(target=s.controls, daemon=True).start()
    if model not in MODELS:
        raise ValueError("This model cannot be downloaded from Origami yet.")
    if model in IMAGES and not accepted:
        raise ValueError("Accept the image model license before downloading that model.")
    downloads = json.loads((HERE / "setup_downloads.json").read_text(encoding="utf-8"))
    py = dest / ("python/python.exe" if sys.platform == "win32" else "python/bin/python3")
    if not py.is_file():
        raise ValueError("The Origami folder has no Python runtime. Run setup again to add models.")
    has_torch = (py.parent / "Lib/site-packages/torch").is_dir() or any((py.parent.parent / "lib").glob("python3*/site-packages/torch"))
    sd = dest / ("image-runtime/sd-cli.exe" if sys.platform == "win32" else "image-runtime/sd-cli")
    groups = set()
    if model == "qwen3-tts-0.6b":
        groups.add("speech-qwen")
    if model == "qwen3-tts-1.7b":
        groups.add("speech-qwen-large")
    if model == "qwen-voice-design":
        groups.add("voice-design")
    if model in LIGHT:
        groups.add("speech-light")
    if groups and not has_torch:
        groups.add("speech")
    if model == "dreamshaper-8-lcm":
        groups.add("images")
    if model == "sd-turbo":
        groups.add("images-turbo")
    if model in IMAGES and not sd.is_file():
        groups.add("image-runtime")
    # A graphics card for speech gets the CUDA packages, like setup.
    device = "cuda" if model not in LIGHT and nvidia() else "cpu"
    steps, weight, device = s.online_plan(downloads, groups, {"speechDevice": device})
    cache_bytes, folder_bytes, shared = s.space_plan(steps, device)
    s.check_space(dest, cache_bytes, folder_bytes, shared, "There is not enough free space for this model.")
    root = s.long_path(dest)
    before = files_in(root)
    progress = s.Progress(weight)
    s.run_online(dest, dest, py, steps, device, progress, downloads)
    add_notices(dest, model)
    s.send(event="progress", percent=96, message="Applying")

    if model == "qwen-voice-design":
        # The voice designer's configuration sits beside the speech one.
        designer_path = worker_path.with_name("voice-design.json")
        designer = read_json(designer_path)
        designer.setdefault("python", str(py))
        designer.setdefault("models", {})["qwen-voice-design"] = {
            "name": "Qwen VoiceDesign 1.7B", "model": str(dest / "models/Qwen3-TTS-12Hz-1.7B-VoiceDesign"),
            "python": str(py), "device": "auto"}
        write_json(designer_path, designer)
    elif model in READERS or model in LIGHT:
        worker = read_json(worker_path)
        worker.setdefault("python", str(py))
        worker.setdefault("device", "auto")
        models = worker.setdefault("models", {})
        voices = worker.setdefault("voices", {})
        if model == "qwen3-tts-0.6b":
            models[model] = {"engine": "qwen", "path": str(dest / "models/Qwen3-TTS-12Hz-0.6B-Base"), "name": "Qwen3-TTS 0.6B",
                             "description": "Natural voices, custom voices and several languages. Best with a graphics card.",
                             "tier": "standard"}
        elif model == "qwen3-tts-1.7b":
            models[model] = {"engine": "qwen", "path": str(dest / "models/Qwen3-TTS-12Hz-1.7B-Base"), "name": "Qwen3-TTS 1.7B",
                             "description": "Most natural. Needs a strong NVIDIA graphics card.", "tier": "high"}
        else:
            light_python = dest / ("python-light/Scripts/python.exe" if sys.platform == "win32" else "python-light/bin/python3")
            for key, folder, name, description in (
                ("kitten-mini", "kitten-tts-mini-0.8", "Kitten Mini", "Light and quick. Built-in English voices on any computer."),
                ("kitten-micro", "kitten-tts-micro-0.8", "Kitten Micro", "The lightest reader, for older or smaller computers."),
                ("kokoro", "Kokoro-82M", "Kokoro", "Clear British narrators. Runs on the processor."),
            ):
                # The light readers come together; one the reader turned off stays off.
                off = key != model and isinstance(models.get(key), dict) and models[key].get("disabled") is True
                models[key] = {"engine": "kokoro" if key == "kokoro" else "kitten", "path": str(dest / "models" / folder),
                               "python": str(light_python), "name": name, "description": description, "tier": "light",
                               **({"disabled": True} if off else {})}
            for vid, voice in s.light_voices().items():
                voices.setdefault(vid, voice)
        models.get(model, {}).pop("disabled", None)
        if worker.get("defaultModel") not in models:
            worker["defaultModel"] = model
            worker["model"] = models[model]["path"]
        write_json(worker_path, worker)
    else:
        cover = read_json(cover_path)
        cover.setdefault("executable", str(sd))
        cover.setdefault("backend", "vulkan0")
        models = cover.setdefault("models", {})
        if model == "dreamshaper-8-lcm":
            models[model] = {"name": "DreamShaper 8 LCM", "profile": model, "model": str(dest / "models/dreamshaper-8-lcm.safetensors")}
        else:
            models[model] = {"name": "SD-Turbo (Powered by Stability AI)", "profile": model,
                             "model": str(dest / "models/sd-turbo/sd-turbo-f16.gguf")}
        if cover.get("defaultModel") not in models:
            profile = {"profile": models[model]["profile"], "model": models[model]["model"]}
            cover.update({"defaultModel": model, "model": profile["model"], "cover": profile, "portrait": profile})
        write_json(cover_path, cover)

    # The receipt gains the files this download added, so uninstalling
    # removes them too. Files that were already there and not in the receipt
    # (saved there by the reader, say) are never added.
    receipt_path = dest / "installation.json"
    receipt = read_json(receipt_path)
    if receipt:
        added = files_in(root) - before - {"installation.json"}
        receipt["files"] = sorted(set(receipt.get("files", [])) | added)
        if model in IMAGES:
            receipt["imageModelTermsAccepted"] = True
        # ASCII only: Windows PowerShell 5.1 runs the uninstaller.
        pending = receipt_path.with_suffix(".json.pending")
        pending.write_text(json.dumps(receipt, ensure_ascii=True, indent=2), encoding="utf-8")
        pending.replace(receipt_path)
    shutil.rmtree(s.long_path(s.CACHE), ignore_errors=True)
    s.send(event="complete", percent=100)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"event": "error", "message": str(error)}), flush=True)
        sys.exit(1)
