# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (c) 2026 Sov3ryn
#
# Origami light reader: a separate program that reads passages aloud with the
# Kitten and Kokoro speech models. It is licensed under the GNU General Public
# License, version 3 or (at your option) any later version, because it uses
# phonemizer and espeak-ng, which are GPL-3. See LICENSE-GPL-3.0.txt and
# LIGHT-READER-SOURCE.txt beside this file.
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option)
# any later version. It is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
# FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
# more details.
#
# Origami Reader runs this program as its own process and exchanges one JSON
# message per line over standard input and output: a "prepare" or "text"
# request in, a "ready", "audio", "cancelled" or "error" event out. It shares
# no code with the rest of Origami.
#
# Usage: light_tts.py <worker.json> <voice id> <cancellation file> <model id>
"""Origami light reader (Kitten and Kokoro), one bounded passage per request."""
import base64
import io
import json
import os
import subprocess
import sys
from pathlib import Path

PROTOCOL = sys.stdout


def isolate():
    """Protocol output only on the original stdout; libraries print to stderr."""
    global PROTOCOL
    sys.stdout = sys.stderr
    try:
        sys.__stdout__.flush()
        PROTOCOL = os.fdopen(os.dup(1), "w", encoding="utf-8", newline="\n")
        os.dup2(2, 1)
    except (OSError, AttributeError, ValueError):
        PROTOCOL = sys.__stdout__
    sys.dont_write_bytecode = True
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                      HF_HUB_DISABLE_TELEMETRY="1")
    if os.name == "nt":
        class WindowlessProcess(subprocess.Popen):
            def __init__(self, *args, **kwargs):
                kwargs["creationflags"] = kwargs.get("creationflags", 0) | subprocess.CREATE_NO_WINDOW
                super().__init__(*args, **kwargs)
        subprocess.Popen = WindowlessProcess


def send(payload):
    PROTOCOL.write(json.dumps(payload) + "\n")
    PROTOCOL.flush()


def run(config, model_id, first_voice, cancellation):
    import numpy as np
    import soundfile as sf
    selected = config["models"][model_id]
    engine = selected["engine"]
    folder = Path(selected["path"])
    if engine == "kitten":
        import onnxruntime as ort
        from kittentts.onnx_model import KittenTTS_1_Onnx
        original = ort.InferenceSession

        def session(path, *args, **kwargs):
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            return original(path, sess_options=options, providers=["CPUExecutionProvider"])
        ort.InferenceSession = session
        c = json.loads((folder / "config.json").read_text())
        model = KittenTTS_1_Onnx(str(folder / c["model_file"]), str(folder / c["voices"]),
                                 c.get("speed_priors", {}), c.get("voice_aliases", {}))
    elif engine == "kokoro":
        import torch
        from kokoro import KModel, KPipeline
        torch.set_num_threads(2)
        km = KModel(repo_id="hexgrad/Kokoro-82M", config=str(folder / "config.json"),
                    model=str(folder / "kokoro-v1_0.pth")).to("cpu").eval()
        model = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M", model=km, device="cpu")
    else:
        raise ValueError("Unsupported lightweight reader")

    def cancelled(request):
        return (cancellation and "generation" in request
                and cancellation.read_text().strip() != str(request["generation"]))
    for line in sys.stdin:
        try:
            request = json.loads(line)
            voice = config["voices"][request.get("voice", first_voice)]
            if voice.get("engine", "qwen") != engine:
                raise ValueError("Choose a built-in voice for this reader.")
            if cancelled(request):
                send({"event": "cancelled"})
                continue
            if request.get("action") == "prepare":
                send({"event": "ready", "voice": request.get("voice") or first_voice})
                continue
            text = request.get("text", "").strip()
            if not text or len(text) > 1200:
                raise ValueError("Read a passage of 1 to 1,200 characters.")
            if engine == "kitten":
                audio = np.asarray(model.generate(text, voice=voice["preset"], speed=1), dtype=np.float32)
            else:
                tensor = torch.load(folder / "voices" / (voice["preset"] + ".pt"), weights_only=True)
                chunks = []
                for result in model(text, voice=tensor, speed=1):
                    if cancelled(request):
                        break
                    chunks.append(result.audio.detach().cpu().numpy())
                audio = np.concatenate(chunks) if chunks else np.array([], dtype=np.float32)
            if cancelled(request):
                send({"event": "cancelled"})
                continue
            if not len(audio) or not np.isfinite(audio).all():
                raise ValueError("The reader produced invalid audio.")
            output = io.BytesIO()
            sf.write(output, audio, 24000, format="WAV", subtype="PCM_16")
            send({"event": "audio", "audio": base64.b64encode(output.getvalue()).decode(),
                  "rate": 24000, "duration": len(audio) / 24000})
        except Exception as error:
            send({"event": "error", "message": str(error)[:250]})


def main():
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    first_voice = sys.argv[2]
    cancellation = Path(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else None
    model_id = sys.argv[4] if len(sys.argv) > 4 else ""
    run(config, model_id, first_voice, cancellation)


if __name__ == "__main__":
    isolate()
    try:
        main()
    except Exception:
        send({"event": "error", "message": "The light reader failed. Check the model and its files."})
        raise
