"""One offline VoiceDesign batch. Exiting releases all model memory."""
import json
import os
import sys
import subprocess
from pathlib import Path

os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                  HF_HUB_DISABLE_TELEMETRY="1", HF_HUB_DISABLE_IMPLICIT_TOKEN="1")

# Audio libraries may probe SoX during import. Keep their helper processes hidden.
if os.name == "nt":
    class WindowlessProcess(subprocess.Popen):
        def __init__(self, *args, **kwargs):
            kwargs["creationflags"] = kwargs.get("creationflags", 0) | subprocess.CREATE_NO_WINDOW
            super().__init__(*args, **kwargs)
    subprocess.Popen = WindowlessProcess


def main():
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    spec, engine = request["spec"], request["engine"]
    folder = Path(request["directory"])
    device = engine.get("device", "auto")
    if device == "auto":
        device = "cuda:0" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.bfloat16 if device.startswith("cuda") else torch.float16 if device == "mps" else torch.float32
    torch.set_num_threads(min(8, max(1, (os.cpu_count() or 2) // 2)))
    if device.startswith("cuda"):
        torch.backends.cuda.enable_cudnn_sdp(False)
    model = Qwen3TTSModel.from_pretrained(engine["model"], device_map=device,
                                        dtype=dtype, attn_implementation="sdpa")
    for index in range(spec["count"]):
        seed = (spec["seed"] + index) % 2147483647
        torch.manual_seed(seed)
        np.random.seed(seed)
        waves, rate = model.generate_voice_design(
            text=spec["text"], language=spec["language"], instruct=spec["prompt"],
            temperature=spec["temperature"], repetition_penalty=1.15, max_new_tokens=1000)
        audio = np.asarray(waves[0], dtype=np.float32).reshape(-1)
        duration = len(audio) / rate
        if not np.isfinite(audio).all() or not 2 <= duration <= 75 or np.max(abs(audio)) < .001:
            raise ValueError("The model returned an unusable take. Try a shorter, complete passage.")
        peak = float(np.max(abs(audio)))
        gain = min(1.4, .92 / peak, .1 / max(float(np.sqrt(np.mean(audio ** 2))), 1e-6))
        audio *= gain
        ident = request["job"] + "-" + str(index + 1)
        temporary = folder / (ident + ".partial.wav")
        sf.write(temporary, audio, rate, subtype="PCM_16")
        temporary.replace(folder / (ident + ".wav"))
        peaks = [round(float(np.max(abs(chunk))), 4) for chunk in np.array_split(audio, 64)]
        metadata = dict(id=ident, createdAt=request["createdAt"], spec=spec,
                        seed=seed, duration=duration, rate=rate, peaks=peaks,
                        take=index + 1, favorite=False, notes="", savedVoice=None)
        target = folder / (ident + ".json")
        pending = target.with_suffix(".pending")
        pending.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
        pending.replace(target)
        print(json.dumps({"completed": index + 1, "total": spec["count"]}), flush=True)


if __name__ == "__main__":
    main()
