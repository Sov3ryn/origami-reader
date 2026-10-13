"""Origami's isolated local worker. One bounded passage per protocol request."""
import base64
import io
import json
import os
from pathlib import Path
import sys
import wave

PROTOCOL = sys.stdout
sys.stdout = sys.stderr
os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                  HF_HUB_DISABLE_TELEMETRY="1", GRADIO_ANALYTICS_ENABLED="False")


def send(payload):
    PROTOCOL.write(json.dumps(payload) + "\n")
    PROTOCOL.flush()


def main():
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    voice = config["voices"][sys.argv[2]]
    import numpy as np
    import torch
    from faster_qwen3_tts import FasterQwen3TTS
    torch.set_num_threads(1)
    device = config.get("device", "cuda")
    if device == "cuda" and not torch.cuda.is_available():
        send({"event": "error", "message": "The configured NVIDIA device is unavailable."})
        return
    model = FasterQwen3TTS.from_pretrained(
        config["model"], device=device, dtype=torch.bfloat16 if device == "cuda" else torch.float32,
        attn_implementation="sdpa", max_seq_len=2048, backend="torch", local_files_only=True)
    prompt = model.model.create_voice_clone_prompt(
        ref_audio=voice["reference"], ref_text=voice["reference_text"], x_vector_only_mode=False)
    if device == "cuda":
        model.warmup(prefill_len=100)
    for line in sys.stdin:
        request = json.loads(line)
        text = request.get("text", "")
        if request.get("version") != 1 or not 0 < len(text) <= 1200:
            send({"event": "error", "message": "Invalid speech request."})
            continue
        chunks = []
        rate = 24000
        with torch.inference_mode():
            for audio, rate, _ in model.generate_voice_clone_streaming(
                text=text, language=voice.get("language", "English"),
                voice_clone_prompt=prompt, ref_text=voice["reference_text"],
                max_new_tokens=700, chunk_size=8, xvec_only=False,
                non_streaming_mode=False, append_silence=False, temperature=.9,
                top_k=50, top_p=1.0, do_sample=True, repetition_penalty=1.05):
                chunks.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        audio = np.concatenate(chunks) if chunks else np.empty(0)
        if not audio.size or not np.isfinite(audio).all():
            send({"event": "error", "message": "The model returned invalid audio."})
            continue
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        send({"event": "audio", "audio": base64.b64encode(buffer.getvalue()).decode("ascii"),
              "rate": rate, "duration": len(audio) / rate})


if __name__ == "__main__":
    try:
        main()
    except Exception:
        send({"event": "error", "message": "Local speech failed. Check the model, environment and voice reference."})
        raise
