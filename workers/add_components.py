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
import sys
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIGHT = ("kitten-mini", "kitten-micro", "kokoro")
IMAGES = ("dreamshaper-8-lcm", "sd-turbo")
MODELS = ("qwen3-tts-0.6b", *LIGHT, *IMAGES)


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


def nvidia():
    windows = Path(os.environ.get("SystemRoot", "C:/Windows"))
    return bool(shutil.which("nvidia-smi")) or (windows / "System32/nvidia-smi.exe").is_file()


def main():
    dest, worker_path, cover_path, model = Path(sys.argv[1]).resolve(), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
    accepted = "--accept-terms" in sys.argv[5:]
    s = load_setup()
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
    device = "cuda" if model == "qwen3-tts-0.6b" and nvidia() else "cpu"
    steps, weight, device = s.online_plan(downloads, groups, {"speechDevice": device})
    extra = downloads["groups"]["images-turbo"]["bytes"] if "images-turbo" in groups else 0
    if shutil.disk_usage(dest).free < weight + extra + 512 * 1024**2:
        raise ValueError("There is not enough free space for this model.")
    progress = s.Progress(weight)
    s.run_online(dest, dest, py, steps, device, progress, downloads)
    s.send(event="progress", percent=96, message="Applying")

    if model == "qwen3-tts-0.6b" or model in LIGHT:
        worker = read_json(worker_path)
        worker.setdefault("python", str(py))
        worker.setdefault("device", "auto")
        models = worker.setdefault("models", {})
        voices = worker.setdefault("voices", {})
        if model == "qwen3-tts-0.6b":
            models[model] = {"engine": "qwen", "path": str(dest / "models/Qwen3-TTS-12Hz-0.6B-Base"), "name": "Qwen3-TTS 0.6B",
                             "description": "Natural voices, custom voices and several languages. Best with a graphics card.",
                             "tier": "standard"}
        else:
            light_python = dest / ("python-light/Scripts/python.exe" if sys.platform == "win32" else "python-light/bin/python3")
            for key, folder, name, description in (
                ("kitten-mini", "kitten-tts-mini-0.8", "Kitten Mini", "Light and quick. Built-in English voices on any computer."),
                ("kitten-micro", "kitten-tts-micro-0.8", "Kitten Micro", "The lightest reader, for older or smaller computers."),
                ("kokoro", "Kokoro-82M", "Kokoro", "Clear British narrators. Runs on the processor."),
            ):
                models[key] = {"engine": "kokoro" if key == "kokoro" else "kitten", "path": str(dest / "models" / folder),
                               "python": str(light_python), "name": name, "description": description, "tier": "light"}
            for vid, voice in s.light_voices().items():
                voices.setdefault(vid, voice)
        for key in (model, *LIGHT):
            models.get(key, {}).pop("disabled", None)
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

    # The receipt lists every file, so uninstalling removes the downloads too.
    receipt_path = dest / "installation.json"
    receipt = read_json(receipt_path)
    if receipt:
        root = s.long_path(dest)
        receipt["files"] = sorted(p.relative_to(root).as_posix() for p in root.rglob("*")
                                  if p.is_file() and p.relative_to(root).as_posix() != "installation.json")
        if model in IMAGES:
            receipt["imageModelTermsAccepted"] = True
        (dest / "installation.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.rmtree(s.long_path(s.CACHE), ignore_errors=True)
    s.send(event="complete", percent=100)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"event": "error", "message": str(error)}), flush=True)
        sys.exit(1)
