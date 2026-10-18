"""Offline package installation. Only fresh, per-user destinations are accepted."""
import hashlib
import json
import shlex
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

cancelled = threading.Event()
paused = threading.Event()


def send(**event):
    print(json.dumps(event), flush=True)


def controls():
    for line in sys.stdin:
        try:
            action = json.loads(line).get("action")
            if action == "pause": paused.set()
            if action == "resume": paused.clear()
            if action == "cancel": cancelled.set()
        except (ValueError, TypeError):
            pass
    cancelled.set()


def checkpoint():
    while paused.is_set() and not cancelled.is_set():
        time.sleep(.1)
    if cancelled.is_set():
        raise RuntimeError("Installation cancelled. Your selections have been kept.")


def contained(root, relative):
    if not relative or Path(relative).is_absolute() or ".." in Path(relative).parts:
        raise ValueError("Invalid package path")
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Package path escapes its folder")
    return path


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def write_owned_json(path, value, owned):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as output:
        owned.append(path)
        json.dump(value, output, ensure_ascii=False, indent=2)


def windows_shortcut(target, destination):
    env = dict(os.environ, ORIGAMI_LINK=str(destination), ORIGAMI_EXE=str(target))
    code = "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:ORIGAMI_LINK); $s.TargetPath=$env:ORIGAMI_EXE; $s.WorkingDirectory=[IO.Path]::GetDirectoryName($env:ORIGAMI_EXE); $s.Save()"
    subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", code],
                   env=env, check=True, capture_output=True, **HIDDEN)


# AMD's PyTorch for Windows (ROCm), installed on request so speech can use a
# supported Radeon card. The packaged NVIDIA build stays the fallback.
ROCM_WINDOWS = "https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/"
ROCM_SDK = ["rocm_sdk_core-7.2.1-py3-none-win_amd64.whl",
            "rocm_sdk_libraries_custom-7.2.1-py3-none-win_amd64.whl",
            "rocm-7.2.1.tar.gz"]
# Longest file inside the AMD runtime, relative to the python folder. Windows
# refuses paths over 259 characters unless long paths are turned on.
ROCM_LONGEST = 180
ROCM_TORCH = ["torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl",
              "torchaudio-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl"]


def enable_amd_speech(base, dest, py):
    """Returns a warning when the AMD runtime could not be used, else None."""
    hidden = HIDDEN
    if len(str(dest / "python")) + 1 + ROCM_LONGEST > 259:
        return ("AMD graphics support needs a shorter install folder (for example C:\\Origami), "
                "so speech uses the processor. Run setup again with a shorter folder to use the card.")

    def pip(args, message):
        send(event="progress", percent=96, message=message)
        subprocess.run([str(py), "-m", "pip", "install", "--no-cache-dir", "--disable-pip-version-check",
                        "--no-warn-script-location", *args],
                       check=True, capture_output=True, timeout=3600, **hidden)
    try:
        pip([ROCM_WINDOWS + w for w in ROCM_SDK], "Downloading AMD graphics support for speech")
        pip(["--no-deps", "--force-reinstall", *[ROCM_WINDOWS + w for w in ROCM_TORCH]],
            "Installing AMD graphics support for speech")
        check = subprocess.run([str(py), "-c", "import torch, sys; sys.exit(0 if torch.version.hip and torch.cuda.is_available() else 1)"],
                               capture_output=True, timeout=600, **hidden)
        if check.returncode == 0:
            return None
        return ("AMD graphics support is installed, but this card could not be used yet. Update the AMD driver "
                "(26.2.2 or newer) and restart Origami; until then speech uses the processor.")
    except (OSError, subprocess.SubprocessError):
        # Put the packaged runtime back so speech keeps working.
        site = dest / "python/Lib/site-packages"
        packaged = base / "payload/files/python/Lib/site-packages"
        cpu_lock = base / "payload/files/setup/locks/speech-torch-cpu.txt"
        if not packaged.is_dir() and cpu_lock.is_file():
            # Online kit: put the processor build of PyTorch back.
            try:
                subprocess.run([str(py), "-m", "pip", "install", "--no-deps", "--require-hashes", "--force-reinstall",
                                "--disable-pip-version-check", "--no-warn-script-location", "-r", str(cpu_lock),
                                "--index-url", "https://download.pytorch.org/whl/cpu"],
                               check=True, capture_output=True, timeout=3600, **hidden)
            except (OSError, subprocess.SubprocessError):
                return "AMD graphics support and the processor speech packages could not be installed. Run setup again."
            return ("AMD graphics support could not be downloaded, so speech uses the processor. "
                    "Run setup again with an internet connection to retry.")
        for entry in list(site.iterdir()):
            if entry.name.split("-")[0] in ("torch", "torchaudio") and entry.name.endswith(".dist-info") or entry.name in ("torch", "torchaudio"):
                shutil.rmtree(entry, ignore_errors=True)
        for entry in packaged.iterdir():
            if entry.name in ("torch", "torchaudio") or (entry.name.split("-")[0] in ("torch", "torchaudio") and entry.name.endswith(".dist-info")):
                shutil.copytree(entry, site / entry.name, dirs_exist_ok=True)
        return ("AMD graphics support could not be downloaded, so speech uses the processor. "
                "Run setup again with an internet connection to retry.")


# Built-in voices of the light readers (Kitten and Kokoro). They need no
# reference recordings; the preset names the voice inside the model.
KITTEN_VOICES = [("bella", "expr-voice-2-f", "Bella", "female"), ("jasper", "expr-voice-2-m", "Jasper", "male"),
                 ("luna", "expr-voice-3-f", "Luna", "female"), ("bruno", "expr-voice-3-m", "Bruno", "male"),
                 ("rosie", "expr-voice-4-f", "Rosie", "female"), ("hugo", "expr-voice-4-m", "Hugo", "male"),
                 ("kiki", "expr-voice-5-f", "Kiki", "female"), ("leo", "expr-voice-5-m", "Leo", "male")]
KOKORO_VOICES = [("bf_emma", "Emma", "female"), ("bf_isabella", "Isabella", "female"),
                 ("bm_daniel", "Daniel", "male"), ("bm_george", "George", "male")]


def light_voices():
    voices = {}
    for key, preset, name, gender in KITTEN_VOICES:
        voices["kitten-" + key] = {"name": name + " \u00b7 Kitten", "description": "Built-in voice, quick on any computer",
                                   "engine": "kitten", "preset": preset, "gender": gender, "language": "English",
                                   "languages": ["English"], "accent": "American", "styles": ["Narration"], "available": True}
    for preset, name, gender in KOKORO_VOICES:
        voices["kokoro-" + preset] = {"name": name + " \u00b7 Kokoro", "description": "Built-in British narrator",
                                      "engine": "kokoro", "preset": preset, "gender": gender, "language": "English",
                                      "languages": ["English"], "accent": "British", "styles": ["Narration"], "available": True}
    return voices


# --- Online kits: optional parts downloaded from their original publishers ----------
# A kit whose manifest has "downloads" ships without model weights, Python
# packages or the picture runtime; each selected part is fetched, checked
# against its SHA-256 and put in place. Finished downloads wait in this cache,
# so a second attempt after a lost connection does not start over.
CACHE = Path(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()) / "Origami Setup Downloads"
# Child programs get an empty input, never this script's stdin: controls()
# keeps a read pending on that pipe, and on Windows a child Python that
# inherits it can block at startup until the read ends (setup froze at
# "Installing speech packages" with pip loaded and idle).
HIDDEN = {"stdin": subprocess.DEVNULL, **({"creationflags": 0x08000000} if sys.platform == "win32" else {})}


class Progress:
    """Overall progress, safe to update from several download threads. The
    file label carries the amount and the speed, so a slow download is
    visibly moving rather than looking stuck."""
    def __init__(self, total):
        self.total, self.done, self.last = max(total, 1), 0, 0.0
        self.lock = threading.Lock()
        self.samples = []

    def speed(self):
        if len(self.samples) < 2:
            return 0.0
        (t0, d0), (t1, d1) = self.samples[0], self.samples[-1]
        return (d1 - d0) / max(t1 - t0, 1e-3)

    def add(self, amount, message, file="", downloading=False):
        with self.lock:
            self.done += amount
            now = time.monotonic()
            self.samples.append((now, self.done))
            while len(self.samples) > 2 and now - self.samples[0][0] > 6:
                self.samples.pop(0)
            # A new step always shows at once; within a step, a few times a second.
            if now - self.last > .25 or message != getattr(self, "message", None):
                self.message = message
                label = file
                if downloading and self.speed() > 0:
                    label += f" \u00b7 {self.speed() / 1e6:.1f} MB/s"
                send(event="progress", percent=min(self.done / self.total * 94, 94), bytesDone=int(self.done),
                     bytesTotal=self.total, message=message, file=label)
                self.last = now


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        while chunk := stream.read(4 * 1024 * 1024):
            checkpoint()
            digest.update(chunk)
    return digest.hexdigest()


SEGMENT = 16 * 1024 * 1024   # large files download in pieces of this size,
CONNECTIONS = 4              # this many at a time,
STALL = 20                   # and a piece with no data for this long restarts.


class NoRanges(Exception):
    pass


def fetch(item, progress, message):
    """Downloads one file into the cache and returns the verified cached file.
    Large files come in pieces over several connections; finished pieces are
    kept, so a new attempt continues where the last one stopped."""
    import json as _json
    CACHE.mkdir(parents=True, exist_ok=True)
    final = CACHE / item["sha256"]
    name = item.get("path", item["url"]).rsplit("/", 1)[-1]
    size = item["size"]
    if final.is_file() and final.stat().st_size == size:
        progress.add(size, message, name)
        return final
    part = CACHE / (item["sha256"] + ".part")
    if size >= 2 * SEGMENT:
        try:
            fetch_pieces(item, part, progress, message, name)
        except NoRanges:
            part.unlink(missing_ok=True)
            (CACHE / (item["sha256"] + ".pieces")).unlink(missing_ok=True)
            fetch_stream(item, part, progress, message, name)
    else:
        fetch_stream(item, part, progress, message, name)
    if part.stat().st_size != size or sha256_of(part) != item["sha256"]:
        part.unlink(missing_ok=True)
        (CACHE / (item["sha256"] + ".pieces")).unlink(missing_ok=True)
        raise ValueError(f"The download of {name} did not match its published fingerprint. Run setup again.")
    part.replace(final)
    (CACHE / (item["sha256"] + ".pieces")).unlink(missing_ok=True)
    return final


def open_url(url, headers):
    import urllib.request
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Origami-Setup/1", **headers}),
                                  timeout=STALL)


def fetch_pieces(item, part, progress, message, name):
    import json as _json
    from concurrent.futures import ThreadPoolExecutor
    size = item["size"]
    record = CACHE / (item["sha256"] + ".pieces")
    pieces = [(i, i * SEGMENT, min(size, (i + 1) * SEGMENT) - 1) for i in range((size + SEGMENT - 1) // SEGMENT)]
    try:
        done = set(_json.loads(record.read_text())) if record.exists() and part.exists() else set()
    except ValueError:
        done = set()
    if not part.exists() or part.stat().st_size != size:
        with part.open("wb") as f:
            f.truncate(size)
        done = set()
    lock = threading.Lock()
    received = [sum(b - a + 1 for i, a, b in pieces if i in done)]
    progress.add(received[0], message, name)

    def label():
        return f"{name} \u00b7 {received[0] / 1e6:.0f} of {size / 1e6:.0f} MB"

    def get(piece):
        index, first, last = piece
        for attempt in range(8):
            checkpoint()
            got = 0
            try:
                with open_url(item["url"], {"Range": f"bytes={first}-{last}"}) as response:
                    if response.status != 206:
                        raise NoRanges()
                    with part.open("r+b") as writer:
                        writer.seek(first)
                        while chunk := response.read(256 * 1024):
                            checkpoint()
                            writer.write(chunk)
                            got += len(chunk)
                            with lock:
                                received[0] += len(chunk)
                            progress.add(len(chunk), message, label(), downloading=True)
                if got != last - first + 1:
                    raise OSError("short piece")
                with lock:
                    done.add(index)
                    record.write_text(_json.dumps(sorted(done)))
                return
            except NoRanges:
                raise
            except Exception as error:
                if cancelled.is_set():
                    raise
                # Take back what this attempt counted; the piece starts again.
                with lock:
                    received[0] -= got
                progress.add(-got, message, label())
                if attempt == 7:
                    raise RuntimeError(f"Could not download {name}. Check the internet connection and run setup "
                                       f"again; what was already downloaded is kept. ({error})")
                time.sleep(min(20, 2 ** attempt))

    missing = [p for p in pieces if p[0] not in done]
    pool = ThreadPoolExecutor(CONNECTIONS)
    try:
        for future in [pool.submit(get, p) for p in missing]:
            future.result()
    except BaseException:
        # Pieces not started are dropped; finished ones stay for next time.
        pool.shutdown(wait=True, cancel_futures=True)
        raise
    pool.shutdown()


def fetch_stream(item, part, progress, message, name):
    """One connection, resuming with a range request after an interruption."""
    import urllib.error
    size = item["size"]
    counted = 0
    for attempt in range(8):
        checkpoint()
        have = part.stat().st_size if part.exists() else 0
        if have > size:
            part.unlink()
            have = 0
        if have > counted:
            progress.add(have - counted, message, name)
            counted = have
        if have == size:
            return
        try:
            with open_url(item["url"], {"Range": f"bytes={have}-"} if have else {}) as response:
                if have and response.status != 206:
                    # The server sent the whole file again.
                    part.unlink()
                    progress.add(-counted, message, name)
                    counted = have = 0
                with part.open("ab") as writer:
                    while chunk := response.read(256 * 1024):
                        checkpoint()
                        writer.write(chunk)
                        counted += len(chunk)
                        progress.add(len(chunk), message, f"{name} \u00b7 {counted / 1e6:.0f} of {size / 1e6:.0f} MB",
                                     downloading=True)
            if part.stat().st_size == size:
                return
        except (OSError, urllib.error.URLError) as error:
            if cancelled.is_set():
                raise
            if attempt == 7:
                raise RuntimeError(f"Could not download {name}. Check the internet connection and run setup "
                                   f"again; what was already downloaded is kept. ({error})")
            time.sleep(min(20, 2 ** attempt))


def place(cached, target):
    """Puts a cached download in the installation (a hard link when possible)."""
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(cached, target)
    except OSError:
        shutil.copy2(cached, target)


def pip_install(py, args, progress, message, weight, count, waiting=None):
    """Runs pip with hash checking. The screen names the package being
    installed and a running time, so a long unpack (PyTorch is about 4.5 GB
    once unpacked) never looks frozen. Until pip says anything, `waiting`
    is shown instead: Windows security may scan a large new file for minutes
    before pip can open it."""
    command = [str(py), "-m", "pip", "install", "--no-deps", "--require-hashes", "--disable-pip-version-check",
               "--no-warn-script-location", "--progress-bar", "off", "--cache-dir", str(CACHE / "pip"), *args]
    # Unbuffered, so pip's lines arrive as they happen.
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                               encoding="utf-8", errors="replace", env={**os.environ, "PYTHONUNBUFFERED": "1"}, **HIDDEN)
    step, seen, output = weight / max(count, 1), 0, []
    current = {"name": "", "since": time.monotonic(), "message": waiting or message}
    started = time.monotonic()
    progress.add(0, current["message"], "")

    def heartbeat():
        while process.poll() is None:
            minutes, seconds = divmod(int(time.monotonic() - started), 60)
            label = (current["name"] + " · " if current["name"] else "") + f"{minutes}:{seconds:02d}"
            progress.add(0, current["message"], label)
            time.sleep(1)

    threading.Thread(target=heartbeat, daemon=True).start()
    try:
        for line in process.stdout:
            output.append(line)
            current["message"] = message
            if cancelled.is_set():
                raise RuntimeError("Installation cancelled. Your selections have been kept.")
            words = line.split()
            if line.startswith(("Collecting", "Processing")) and seen < count:
                seen += 1
                # "Processing C:\...\Origami Setup Downloads\wheels\torch-....whl (from -r ...)":
                # the path may hold spaces, so take everything before " (from".
                target = line.split(None, 1)[1].split(" (from")[0].strip() if len(words) > 1 else ""
                current["name"] = target.replace("\\", "/").split("/")[-1][:60]
                progress.add(step, message, current["name"])
            elif line.startswith("Installing collected packages"):
                current["name"] = "unpacking"
        if process.wait():
            raise RuntimeError(message + " failed. Check the internet connection and run setup again. "
                               + "".join(output[-6:])[-500:])
    finally:
        if process.poll() is None:
            process.kill()
    progress.add(max(0.0, weight - seen * step), message)


def lock_count(path):
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip() and not line.startswith("#"))


def online_plan(downloads, groups, options):
    """The downloads for the chosen groups and their weight in bytes."""
    device = "cuda" if options.get("speechDevice") == "cuda" else "cpu"
    steps, weight = [], 0
    order = ["core", "speech", "speech-qwen", "speech-light", "image-runtime", "images", "images-turbo"]
    order += sorted(name for name in downloads["groups"] if name.startswith("voices-"))
    for name in order:
        group = downloads["groups"].get(name)
        if not group or name not in groups:
            continue
        steps.append((name, group))
        weight += group.get("bytes", 0)
        estimate = group.get("estimate", 0)
        weight += estimate.get(device, 0) if isinstance(estimate, dict) else estimate
        weight += group.get("wheelBytes", {}).get(device, 0)
    if any(name in groups for name in ("speech", "speech-light")):
        weight += 3_000_000
    return steps, weight, device


def run_online(base, dest, py, steps, device, progress, downloads):
    locks = base / "payload/files/setup/locks"
    if not locks.is_dir():
        locks = dest / "setup/locks"
    names = {name for name, _ in steps}
    if names & {"speech", "speech-light"}:
        # pip itself, from PyPI, then the packages from the locked lists.
        # A wheel is a ZIP of the package: unpacked into site-packages, pip is
        # installed (pip will not install itself from its own wheel).
        import zipfile
        wheel = fetch_pip(downloads["pip"], progress)
        site = py.parent / "Lib/site-packages" if sys.platform == "win32" else next((py.parent.parent / "lib").glob("python3*/site-packages"))
        site.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(wheel) as bundle:
            for member in bundle.infolist():
                if not member.is_dir():
                    out = contained(site, member.filename)
                    out.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.open(member) as reader, out.open("wb") as writer:
                        shutil.copyfileobj(reader, writer)
    for name, group in steps:
        label = group.get("label", name)
        if name == "speech":
            torch = locks / group["torch"][device]
            estimate = group.get("estimate", {}).get(device, 0)
            if group.get("wheels"):
                # PyTorch is the largest download: fetched here, in pieces and
                # with visible progress, then installed by pip from disk
                # (still checked against the locked hashes).
                wheels = CACHE / "wheels"
                wheels.mkdir(parents=True, exist_ok=True)
                for wheel in group["wheels"][device]:
                    target = wheels / wheel["file"]
                    if not target.exists():
                        place(fetch({**wheel, "path": wheel["file"]}, progress, "Downloading PyTorch"), target)
                pip_install(py, ["-r", str(torch), "--no-index", "--find-links", str(wheels)], progress,
                            "Installing speech packages", 0, lock_count(torch), waiting="Checking PyTorch")
            else:
                index = "https://download.pytorch.org/whl/" + ("cu128" if device == "cuda" else "cpu")
                pip_install(py, ["-r", str(torch), "--index-url", index], progress, "Installing speech packages",
                            estimate * 0.6, lock_count(torch))
            pip_install(py, ["-r", str(locks / group["pip"])], progress, "Installing speech packages",
                        estimate, lock_count(locks / group["pip"]))
            continue
        for item in group.get("files", []):
            place(fetch(item, progress, "Downloading " + label), contained(dest, item["path"]))
        if name == "speech-light":
            light_python = dest / ("python-light/Scripts/python.exe" if sys.platform == "win32" else "python-light/bin/python3")
            write_light_venv(dest, py)
            pip_install(light_python, ["-r", str(locks / group["pip"])], progress, "Installing light voice packages",
                        group.get("estimate", 0), lock_count(locks / group["pip"]))
        if "archive" in group:
            import zipfile
            archive = group["archive"]
            cached = fetch(archive, progress, "Downloading " + label)
            target = contained(dest, archive["path"])
            with zipfile.ZipFile(cached) as bundle:
                for member in bundle.infolist():
                    if member.is_dir():
                        continue
                    out = contained(target, member.filename)
                    out.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.open(member) as reader, out.open("wb") as writer:
                        shutil.copyfileobj(reader, writer)
        if "convert" in group:
            # SD-Turbo is published as one large file; stable-diffusion.cpp
            # turns it into the 16-bit file Origami uses, then it is removed.
            item = group["convert"]
            cached = fetch(item, progress, "Downloading " + label)
            out = contained(dest, item["output"])
            out.parent.mkdir(parents=True, exist_ok=True)
            send(event="progress", percent=min(progress.done / progress.total * 94, 94), message="Preparing " + label)
            runtime = dest / ("image-runtime/sd-cli.exe" if sys.platform == "win32" else "image-runtime/sd-cli")
            subprocess.run([str(runtime), "-M", "convert", "-m", str(cached), "-o", str(out), "--type", "f16"],
                           check=True, capture_output=True, timeout=3600, cwd=runtime.parent, **HIDDEN)
            if sha256_of(out) != item["outputSha256"]:
                raise ValueError(f"{label} could not be prepared correctly. Run setup again.")
            cached.unlink(missing_ok=True)


def fetch_pip(pip, progress):
    """pip's wheel: its size is not in the catalog, so it is read from the response."""
    import urllib.request
    CACHE.mkdir(parents=True, exist_ok=True)
    final = CACHE / pip["sha256"]
    if not final.is_file():
        with urllib.request.urlopen(urllib.request.Request(pip["url"], headers={"User-Agent": "Origami-Setup/1"}), timeout=60) as r:
            data = r.read()
        if hashlib.sha256(data).hexdigest() != pip["sha256"]:
            raise ValueError("The pip download did not match its published fingerprint. Run setup again.")
        final.write_bytes(data)
    progress.add(final.stat().st_size, "Preparing package installation")
    return final


def long_path(path):
    return Path("\\\\?\\" + str(path)) if sys.platform == "win32" and not str(path).startswith("\\\\?\\") else path


def write_light_venv(dest, py):
    (dest / "python-light/pyvenv.cfg").write_text(
        "home = " + str(py.parent) + "\ninclude-system-site-packages = false\nversion = " +
        ".".join(map(str, sys.version_info[:3])) + "\n", encoding="utf-8")


CONFIG_FILES = ("worker.json", "cover-engine.json", "installation.json")


def earlier_install(config, platform):
    """The folder of an earlier Origami still installed for this account, or None."""
    try:
        root = Path(json.loads((config / "installation.json").read_text(encoding="utf-8-sig"))["root"])
    except (OSError, ValueError, KeyError, TypeError):
        return None
    exe = root / ("origami-reader.exe" if platform == "windows" else "origami-reader")
    receipt = root / "installation.json"
    return root if exe.is_file() and receipt.is_file() else None


def remove_earlier(root):
    """Removes an earlier program folder, after checking its own receipt names it."""
    receipt = json.loads((root / "installation.json").read_text(encoding="utf-8-sig"))
    if os.path.normcase(os.path.abspath(receipt.get("root", ""))) != os.path.normcase(os.path.abspath(root)):
        raise ValueError("The earlier installation's receipt does not match its folder, so it was left as it is. "
                         "Uninstall it from Windows Settings, Apps, then run setup again.")
    if root == Path(root.anchor) or root == Path.home():
        raise ValueError("The earlier installation is in an unexpected folder, so it was left as it is.")
    for link in receipt.get("shortcuts", []):
        if str(link).lower().endswith((".lnk", ".desktop")):
            Path(link).unlink(missing_ok=True)
    try:
        shutil.rmtree(long_path(root))
    except OSError as error:
        raise ValueError("The earlier version could not be removed. Close Origami Reader and run setup again. "
                         f"({error})")


def set_aside_configs(config):
    """Moves leftover settings files into a dated folder instead of deleting them."""
    found = [config / name for name in CONFIG_FILES if (config / name).exists()]
    if not found:
        return
    backup = config / ("previous-setup-" + time.strftime("%Y%m%d-%H%M%S"))
    backup.mkdir(parents=True, exist_ok=True)
    for path in found:
        shutil.move(str(path), str(backup / path.name))


def install(base, options):
    manifest = json.loads((base / "payload/manifest.json").read_text(encoding="utf-8"))
    platform = {"win32": "windows", "linux": "linux", "darwin": "macos"}[sys.platform]
    if manifest["platform"] != platform or options["platform"] != platform:
        raise ValueError("This package was built for a different operating system.")
    if options.get("scope") != "user":
        raise ValueError("This beta supports personal installations only.")
    light = bool(options.get("lightVoices"))
    turbo = bool(options.get("turboModel"))
    if (options.get("coverModel") or options.get("portraitModel") or turbo) and not options.get("modelTermsAccepted"):
        raise ValueError("Accept the image model license before installing that model.")
    dest = Path(os.path.expandvars(os.path.expanduser(options["installPath"].strip()))).resolve()
    config = Path(options["configDir"]).resolve()
    data = Path(options["dataDir"]).resolve()
    # An earlier beta: its program folder is replaced only when the reader
    # agrees; settings files left behind without a program are set aside.
    # The library (origami.sqlite3 in the data folder) is never touched.
    earlier = earlier_install(config, platform)
    if earlier and not options.get("replaceEarlier"):
        raise ValueError("EARLIER:" + str(earlier))
    # The folder of the version being replaced may be chosen again.
    replacing = bool(earlier) and os.path.normcase(str(dest)) == os.path.normcase(str(earlier.resolve()))
    if not dest.is_absolute() or dest == Path(dest.anchor) or dest == Path.home() or (dest.exists() and not replacing):
        raise ValueError("Choose a new, empty application folder. Existing installations are kept intact.")
    if dest.is_relative_to(base.resolve()) or base.resolve().is_relative_to(dest):
        raise ValueError("Choose a destination outside the extracted setup package.")
    if earlier:
        send(event="progress", percent=0, message="Removing the earlier version")
        remove_earlier(earlier)
    set_aside_configs(config)
    groups = {"core"}
    # "speech" holds the shared Python packages; Qwen and the light readers
    # each add their own models.
    if options.get("speech") or light:
        groups.add("speech")
    if options.get("speech"):
        groups.add("speech-qwen")
        groups.update("voices-" + lang for lang in options.get("languages", []))
    if light: groups.add("speech-light")
    if options.get("coverModel") or options.get("portraitModel"): groups.update({"images", "image-runtime"})
    if turbo: groups.update({"images-turbo", "image-runtime"})
    files = [f for f in manifest["files"] if f["group"] in groups]
    total = sum(f["size"] for f in files)
    parent = dest.parent
    parent.mkdir(parents=True, exist_ok=True)
    downloads = manifest.get("downloads")
    steps, download_bytes, device = online_plan(downloads, groups, options) if downloads else ([], 0, "cpu")
    # SD-Turbo's original file waits beside its converted copy for a moment.
    extra = downloads["groups"]["images-turbo"]["bytes"] if downloads and "images-turbo" in groups else 0
    if shutil.disk_usage(parent).free < total + download_bytes + extra + 512 * 1024**2:
        raise ValueError("There is not enough free space in the installation location.")
    progress = Progress(total + download_bytes)
    stage = Path(tempfile.mkdtemp(prefix=".origami-install-", dir=parent))
    owned_configs, links = [], []
    committed = False
    preferences_inserted = False
    done, last = 0, 0
    try:
        for item in files:
            checkpoint()
            source = contained(base / "payload/files", item["path"])
            target = contained(stage, item["path"])
            # Long-path forms, so a kit unpacked deep in a folder still reads.
            if sys.platform == "win32" and not str(source).startswith("\\\\?\\"):
                source = Path("\\\\?\\" + str(source))
            if sys.platform == "win32" and not str(target).startswith("\\\\?\\"):
                target = Path("\\\\?\\" + str(target))
            target.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            count = 0
            with source.open("rb") as reader, target.open("xb") as writer:
                while chunk := reader.read(1024 * 1024):
                    checkpoint()
                    writer.write(chunk)
                    digest.update(chunk)
                    count += len(chunk)
                    progress.add(len(chunk), "Installing Origami", Path(item["path"]).name)
            if count != item["size"] or digest.hexdigest() != item["sha256"]:
                raise ValueError("Package integrity check failed: " + item["path"])
            shutil.copymode(source, target)
        checkpoint()
        stage.rename(dest)
        committed = True
        py = dest / ("python/python.exe" if platform == "windows" else "python/bin/python3")
        if steps:
            run_online(base, dest, py, steps, device, progress, downloads)
        send(event="progress", percent=95, message="Applying your preferences")
        voices = {}
        models = {}
        if options.get("speech"):
            # One catalog for an offline kit; one per downloaded language pack online.
            catalog = {}
            for part in sorted(dest.glob("voice-catalog*.json")):
                catalog.update(json.loads(part.read_text(encoding="utf-8")))
            for voice_id, voice in catalog.items():
                if voice["pack"] in options.get("languages", []):
                    voice = dict(voice)
                    voice.pop("pack")
                    voice["reference"] = str(contained(dest, voice["reference"]))
                    voices[voice_id] = voice
            # Named model versions let the reader switch between, for example,
            # a fuller model and a lighter one for laptops. "model" keeps older
            # app builds working.
            standard = str(dest / "models/Qwen3-TTS-12Hz-0.6B-Base")
            models["qwen3-tts-0.6b"] = {"engine": "qwen", "path": standard, "name": "Qwen3-TTS 0.6B",
                                        "description": "Natural voices, custom voices and several languages. Best with a graphics card.",
                                        "tier": "standard"}
            larger = dest / "models/Qwen3-TTS-12Hz-1.7B-Base"
            if larger.is_dir():
                models["qwen3-tts-1.7b"] = {"engine": "qwen", "path": str(larger), "name": "Qwen3-TTS 1.7B",
                                            "description": "Most natural. Needs a strong NVIDIA graphics card.",
                                            "tier": "high"}
        if light:
            # The light readers run in their own small environment, layered
            # over the shared packages (see python-light/Lib/site-packages).
            light_python = dest / ("python-light/Scripts/python.exe" if platform == "windows" else "python-light/bin/python3")
            (dest / "python-light/pyvenv.cfg").write_text(
                "home = " + str(py.parent) + "\ninclude-system-site-packages = false\nversion = " +
                ".".join(map(str, sys.version_info[:3])) + "\n", encoding="utf-8")
            for key, folder, name, description in (
                ("kitten-mini", "kitten-tts-mini-0.8", "Kitten Mini", "Light and quick. Built-in English voices on any computer."),
                ("kitten-micro", "kitten-tts-micro-0.8", "Kitten Micro", "The lightest reader, for older or smaller computers."),
                ("kokoro", "Kokoro-82M", "Kokoro", "Clear British narrators. Runs on the processor."),
            ):
                models[key] = {"engine": "kokoro" if key == "kokoro" else "kitten", "path": str(dest / "models" / folder),
                               "python": str(light_python), "name": name, "description": description, "tier": "light"}
            voices.update(light_voices())
        if models:
            # Without a graphics card for speech, a light reader starts first.
            strong = options.get("speechDevice") in ("cuda", "rocm", "mps")
            # The light readers only speak English: with another language's
            # voices chosen, Qwen reads first even without a graphics card.
            other_language = any(code != "en" for code in options.get("languages", []))
            default = "qwen3-tts-0.6b" if "qwen3-tts-0.6b" in models and (strong or not light or other_language) else "kitten-mini" if light else next(iter(models))
            worker = {"python": str(py), "model": models[default]["path"], "models": models,
                      "defaultModel": default, "device": "auto", "voices": voices}
            path = config / "worker.json"
            write_owned_json(path, worker, owned_configs)
        if "image-runtime" in groups:
            exe = str(dest / ("image-runtime/sd-cli.exe" if platform == "windows" else "image-runtime/sd-cli"))
            image_models = {}
            if "images" in groups:
                image_models["dreamshaper-8-lcm"] = {"name": "DreamShaper 8 LCM", "profile": "dreamshaper-8-lcm",
                                                     "model": str(dest / "models/dreamshaper-8-lcm.safetensors")}
            if turbo:
                image_models["sd-turbo"] = {"name": "SD-Turbo (Powered by Stability AI)", "profile": "sd-turbo",
                                            "model": str(dest / "models/sd-turbo/sd-turbo-f16.gguf")}
            default = "dreamshaper-8-lcm" if "dreamshaper-8-lcm" in image_models else "sd-turbo"
            profile = {"profile": image_models[default]["profile"], "model": image_models[default]["model"]}
            path = config / "cover-engine.json"
            write_owned_json(path, {"executable": exe, "model": profile["model"], "backend": "vulkan0", "cover": profile,
                                    "portrait": profile, "models": image_models, "defaultModel": default}, owned_configs)
        appearance = options.get("appAppearance", {})
        if models and models[worker["defaultModel"]].get("engine") == "kitten":
            initial_voice = "kitten-bella"
        else:
            # The first voice speaks the interface language, or the first other language chosen.
            names = {"en": "English", "fr": "French", "ko": "Korean", "hi": "Hindi", "es": "Spanish"}
            chosen = options.get("languages", [])
            ui = str(options.get("uiLanguage", ""))[:2]
            code = ui if ui in chosen else next((c for c in chosen if c != "en"), "en")
            wanted = names.get(code, "English")
            matching = [vid for vid, v in voices.items() if v.get("language") == wanted or wanted in (v.get("languages") or [])]
            initial_voice = (matching[0] if matching and code != "en"
                             else "alistair-highland-scholar" if "alistair-highland-scholar" in voices
                             else matching[0] if matching else next(iter(voices), ""))
        preferences = {**appearance, "fontSize": 25 if options.get("textSize") == "large" else 21,
                       "autoGenerateCovers": bool(options.get("coverModel")),
                       "autoGenerateVoicePortraits": bool(options.get("portraitModel")),
                       **({"speechModel": worker["defaultModel"]} if models else {}),
                       "preloadAtStartup": True, "autoUpdate": bool(options.get("updates", True)), "voice": initial_voice,
                       "voiceLanguage": voices.get(initial_voice, {}).get("language", "English"),
                       "uiLanguage": str(options.get("uiLanguage", ""))[:16],
                       "starterLanguage": str(options.get("starterLanguage", ""))[:16]}
        data.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(data / "origami.sqlite3") as db:
            db.execute("CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, data TEXT NOT NULL)")
            cursor = db.execute("INSERT OR IGNORE INTO settings(id,data) VALUES('preferences',?)", (json.dumps(preferences),))
            preferences_inserted = cursor.rowcount == 1
        exe = dest / manifest["executable"]
        warnings = []
        if platform == "windows" and options.get("speech") and options.get("amdSpeech"):
            warning = enable_amd_speech(base, dest, py)
            if warning:
                warnings.append(warning)
        if platform == "windows":
            import winreg
            shortcut_dir = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs"
            shortcuts = []
            # Windows reserves pinning for the user; the Start menu entry is
            # the most an installer may add.
            if options.get("startMenu", True):
                shortcuts.append(shortcut_dir / "Origami Reader.lnk")
            if options.get("shortcuts"):
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as key:
                    desktop = Path(os.path.expandvars(winreg.QueryValueEx(key, "Desktop")[0]))
                shortcuts.append(desktop / "Origami Reader.lnk")
            if options.get("startOnLogin"):
                shortcuts.append(shortcut_dir / "Startup/Origami Reader.lnk")
            for link in shortcuts:
                if link.exists():
                    warnings.append("Existing shortcut kept: " + str(link))
                    continue
                link.parent.mkdir(parents=True, exist_ok=True)
                try:
                    windows_shortcut(exe, link)
                    links.append(str(link))
                except Exception:
                    warnings.append("Could not create shortcut: " + str(link))
        elif platform == "linux":
            # freedesktop.org entries: the applications menu, desktop and autostart.
            home = Path.home()
            icon = dest / "icon.png"
            entry = "\n".join([
                "[Desktop Entry]", "Type=Application", "Name=Origami Reader",
                "Comment=Offline reader and text-to-speech", "Exec=" + shlex.quote(str(exe)),
                "Icon=" + str(icon if icon.exists() else exe), "Categories=Office;Viewer;Education;",
                "Terminal=false", "StartupWMClass=origami-reader", ""])
            targets = []
            if options.get("startMenu", True):
                targets.append(Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")) / "applications/origami-reader.desktop")
            if options.get("shortcuts") and (home / "Desktop").is_dir():
                targets.append(home / "Desktop/origami-reader.desktop")
            if options.get("startOnLogin"):
                targets.append(Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")) / "autostart/origami-reader.desktop")
            for target in targets:
                if target.exists():
                    warnings.append("Existing shortcut kept: " + str(target))
                    continue
                try:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(entry, encoding="utf-8")
                    target.chmod(0o755)
                    links.append(str(target))
                except OSError:
                    warnings.append("Could not create shortcut: " + str(target))
        elif platform == "macos" and options.get("startMenu", True):
            # Adds the app to the Dock's persistent apps. The Dock restarts
            # briefly to show it; nothing already in the Dock is removed.
            app = dest if dest.suffix == ".app" else exe
            tile = ("<dict><key>tile-data</key><dict><key>file-data</key><dict>"
                    "<key>_CFURLString</key><string>" + app.as_uri() + "/</string>"
                    "<key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>")
            try:
                subprocess.run(["defaults", "write", "com.apple.dock", "persistent-apps", "-array-add", tile],
                               check=True, timeout=15, capture_output=True)
                subprocess.run(["killall", "Dock"], timeout=15, capture_output=True)
            except (OSError, subprocess.SubprocessError):
                warnings.append("Could not add Origami Reader to the Dock. Drag it there from Applications.")
        # Files written here (not copied from the kit) are removed on uninstall too.
        # Every file in the folder, including downloads and Python packages, so
        # uninstalling removes all of them.
        installed = sorted(p.relative_to(long_path(dest)).as_posix() for p in long_path(dest).rglob("*") if p.is_file())
        receipt = {"root": str(dest), "version": manifest["version"], "files": installed,
                   "configFiles": [str(p) for p in owned_configs], "shortcuts": links,
                   "imageModelTermsAccepted": bool(options.get("modelTermsAccepted")), "installedAt": time.time()}
        write_json(dest / "installation.json", receipt)
        path = config / "installation.json"
        write_owned_json(path, {"root": str(dest)}, owned_configs)
        if platform == "windows":
            try:
                with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall\OrigamiReaderBeta") as key:
                    for name, value in {"DisplayName": "Origami Reader", "DisplayVersion": manifest["version"], "Publisher": "Origami", "InstallLocation": str(dest), "DisplayIcon": str(exe), "UninstallString": 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + str(dest / "Uninstall Origami.ps1") + '"'}.items():
                        winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
                    winreg.SetValueEx(key, "EstimatedSize", 0, winreg.REG_DWORD, total // 1024)
            except OSError:
                warnings.append("Could not register Windows uninstall entry. Use Uninstall Origami.ps1 in the app folder.")
        if steps:
            # Downloads are in place (hard links keep the installed copies).
            shutil.rmtree(long_path(CACHE), ignore_errors=True)
        send(event="complete", percent=100, executable=str(exe), warnings=warnings)
    except BaseException:
        for path in owned_configs:
            path.unlink(missing_ok=True)
        for link in links: Path(link).unlink(missing_ok=True)
        if preferences_inserted:
            with sqlite3.connect(data / "origami.sqlite3") as db:
                db.execute("DELETE FROM settings WHERE id='preferences' AND data=?", (json.dumps(preferences),))
        # Both paths are created exclusively by this transaction, never existing folders.
        cleanup = dest if committed else stage
        if cleanup.parent == parent and cleanup.exists(): shutil.rmtree(cleanup)
        raise


if __name__ == "__main__":
    try:
        options = json.loads(sys.stdin.readline())
        threading.Thread(target=controls, daemon=True).start()
        install(Path(sys.argv[1]).resolve(), options)
    except Exception as error:
        send(event="error", message=str(error))
        sys.exit(1)
