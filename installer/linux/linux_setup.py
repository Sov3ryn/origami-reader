"""Finishes an Origami Reader installation on Linux.

Called by install-linux.sh after the app is built and its files are copied.
Writes the speech and artwork configuration the app reads, the application
menu entry, and an uninstall script. Never touches the reading library.

  python3 linux_setup.py '<json options>'
"""

import json
import os
import shlex
import shutil
import sys
import time
from pathlib import Path


def backup(path: Path) -> None:
    if path.exists():
        path.replace(path.with_name(path.name + ".before-" + time.strftime("%Y%m%d-%H%M%S")))


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    backup(path)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    options = json.loads(sys.argv[1])
    prefix = Path(options["prefix"]).resolve()
    config = Path(options["configDir"]).resolve()
    home = Path.home()
    written: list[str] = []

    # Speech: every installed voice, with absolute reference paths.
    catalog = json.loads((prefix / "voice-catalog.json").read_text(encoding="utf-8"))
    voices = {}
    for voice_id, voice in catalog.items():
        voice = dict(voice)
        voice.pop("pack", None)
        reference = prefix / voice["reference"]
        if not reference.is_file():
            continue
        voice["reference"] = str(reference)
        voices[voice_id] = voice
    standard = prefix / "models/Qwen3-TTS-12Hz-0.6B-Base"
    models = {
        "qwen3-tts-0.6b": {
            "path": str(standard),
            "name": "Qwen3-TTS 0.6B",
            "description": "Balanced quality and speed.",
            "tier": "standard",
        }
    }
    worker = {
        "python": str(prefix / "python/bin/python3"),
        "model": str(standard),
        "models": models,
        "defaultModel": "qwen3-tts-0.6b",
        "device": "auto",
        "voices": voices,
    }
    write_json(config / "worker.json", worker)
    written.append(str(config / "worker.json"))

    # Artwork, when the image runtime was built.
    if options.get("imageExecutable"):
        model = str(prefix / "models/dreamshaper-8-lcm.safetensors")
        profile = {"profile": "dreamshaper-8-lcm", "model": model}
        write_json(config / "cover-engine.json", {
            "executable": options["imageExecutable"],
            "model": model,
            "backend": options.get("imageBackend", "cpu"),
            "cover": profile,
            "portrait": profile,
        })
        written.append(str(config / "cover-engine.json"))

    # Application menu entry (freedesktop.org).
    exe = prefix / "origami-reader"
    icon = prefix / "icon.png"
    entry = "\n".join([
        "[Desktop Entry]",
        "Type=Application",
        "Name=Origami Reader",
        "Comment=Offline reader and text-to-speech (private beta)",
        "Exec=" + shlex.quote(str(exe)),
        "Icon=" + str(icon),
        "Categories=Office;Viewer;Education;",
        "Terminal=false",
        "StartupWMClass=origami-reader",
        "",
    ])
    applications = Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")) / "applications"
    applications.mkdir(parents=True, exist_ok=True)
    desktop = applications / "origami-reader.desktop"
    desktop.write_text(entry, encoding="utf-8")
    desktop.chmod(0o755)
    written.append(str(desktop))

    # Uninstall: removes the program, its configuration and menu entry, and
    # keeps the reading library unless asked.
    library = Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")) / "app.origami.reader"
    script = prefix / "uninstall-origami.sh"
    script.write_text("\n".join([
        "#!/usr/bin/env bash",
        "# Removes Origami Reader. Your library is kept unless you add --remove-library.",
        "set -e",
        "rm -f " + " ".join(shlex.quote(p) for p in written),
        "rm -f " + shlex.quote(str(config / "installation.json")),
        "if [ \"$1\" = \"--remove-library\" ]; then rm -rf " + shlex.quote(str(library)) + "; echo 'Library removed.'; fi",
        "rm -rf " + shlex.quote(str(prefix)),
        "echo 'Origami Reader was removed.'",
        "",
    ]), encoding="utf-8")
    script.chmod(0o755)

    receipt = {
        "root": str(prefix),
        "version": options.get("version", ""),
        "configFiles": written,
        "installedAt": time.time(),
        "platform": "linux",
    }
    (prefix / "installation.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    write_json(config / "installation.json", {"root": str(prefix)})
    print(f"Configured {len(voices)} voices.")


if __name__ == "__main__":
    main()
