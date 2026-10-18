"""Origami's isolated local worker. One bounded passage per protocol request."""
import base64
import io
import json
import os
from pathlib import Path
import sys
import subprocess
import wave

PROTOCOL = sys.stdout


def cuda_usable(torch):
    """True when PyTorch has code for this NVIDIA card. The CUDA 12.8 build
    covers compute capability 7.0 and newer; on an older card with a recent
    driver is_available() is still true, but every kernel would fail."""
    if not torch.cuda.is_available():
        return False
    try:
        major, minor = torch.cuda.get_device_capability(0)
        built = [a.split("_")[1] for a in torch.cuda.get_arch_list() if a.startswith("sm_")]
        return any(len(b) >= 2 and int(b[:-1]) == major and int(b[-1]) <= minor for b in built)
    except (RuntimeError, ValueError, AssertionError):
        return False


def isolate():
    """Protocol output only on the original stdout; libraries print to stderr."""
    global PROTOCOL
    PROTOCOL = sys.stdout
    sys.stdout = sys.stderr
    # Native GPU libraries (ROCm, CUDA) print to file descriptor 1 directly, so
    # move the protocol to a private copy and point descriptor 1 at stderr.
    try:
        sys.__stdout__.flush()
        PROTOCOL = os.fdopen(os.dup(1), "w", encoding="utf-8", newline="\n")
        os.dup2(2, 1)
    except (OSError, AttributeError, ValueError):
        pass
    sys.dont_write_bytecode = True
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                      HF_HUB_DISABLE_TELEMETRY="1", GRADIO_ANALYTICS_ENABLED="False")
    # Some audio dependencies probe helper executables during import (including
    # SoX through os.popen). Keep every child of this background worker windowless.
    if os.name == "nt":
        class WindowlessProcess(subprocess.Popen):
            def __init__(self, *args, **kwargs):
                kwargs["creationflags"] = kwargs.get("creationflags", 0) | subprocess.CREATE_NO_WINDOW
                super().__init__(*args, **kwargs)
        subprocess.Popen = WindowlessProcess


def send(payload):
    PROTOCOL.write(json.dumps(payload) + "\n")
    PROTOCOL.flush()


def _hangul(c):
    return "\uac00" <= c <= "\ud7a3" or "\u1100" <= c <= "\u11ff" or "\u3130" <= c <= "\u318f"


def _kana(c):
    return "\u3040" <= c <= "\u30ff"


def _han(c):
    return "\u4e00" <= c <= "\u9fff" or "\u3400" <= c <= "\u4dbf"


# Autoregressive voice models decide for themselves when speech ends. Very short
# inputs such as a lone "1" can miss that decision and produce noise until the
# token limit. Bound every request by what its text could plausibly need.
# A Korean or Japanese syllable, or a Chinese character, takes far longer to say
# than a Latin letter, so those scripts get a larger allowance per character.
def speech_budget(text, frame_rate):
    syllables = sum(1 for c in text if _hangul(c) or _kana(c))
    han = sum(1 for c in text if _han(c))
    rest = len(text) - syllables - han
    seconds = 2.5 + rest / 6.0 + syllables / 3.0 + han / 2.6
    return min(700, int(seconds * frame_rate) + 8)


LATIN_LANGUAGES = {"English", "German", "French", "Portuguese", "Spanish", "Italian"}


# The language to pronounce a passage in. A voice keeps its own timbre in any
# language the model supports, so a Korean voice reads English text as English
# (including its numbers) instead of applying Korean reading rules.
def text_language(text, voice_language):
    hangul = kana = han = cyrillic = latin = 0
    for c in text:
        if _hangul(c):
            hangul += 1
        elif _kana(c):
            kana += 1
        elif _han(c):
            han += 1
        elif "\u0400" <= c <= "\u04ff":
            cyrillic += 1
        elif c.isalpha() and c.isascii() or "\u00c0" <= c <= "\u024f":
            latin += 1
    letters = hangul + kana + han + cyrillic + latin
    if not letters:
        return voice_language
    if hangul / letters > 0.3:
        return "Korean"
    if kana and (kana + han) / letters > 0.3:
        return "Japanese"
    if han / letters > 0.3:
        return "Japanese" if voice_language == "Japanese" else "Chinese"
    if cyrillic / letters > 0.3:
        return "Russian"
    if latin / letters > 0.5:
        return voice_language if voice_language in LATIN_LANGUAGES else "English"
    return voice_language


def prepared_text(text):
    text = " ".join(text.split())
    # A bare word or number with no closing punctuation is the riskiest input.
    if len(text.split()) < 3 and text[-1:].isalnum():
        text += "."
    return text


def overran(audio_seconds, max_tokens, frame_rate):
    return audio_seconds >= max_tokens / frame_rate - 0.4


def model_path(config, model_id):
    """A named model from "models", the configured default, or the legacy "model"."""
    models = config.get("models") or {}
    chosen = models.get(model_id) or models.get(config.get("defaultModel", "")) or {}
    return chosen.get("path") or config["model"]


def read_config(path):
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    created = os.environ.get("ORIGAMI_CREATED_VOICES")
    if created:
        root = Path(created)
        for source in root.glob("designed-vd-*.json"):
            try:
                profile = json.loads(source.read_text(encoding="utf-8"))
                reference = root / (source.stem + ".wav")
                if reference.is_file():
                    profile["reference"] = str(reference)
                    config.setdefault("voices", {}).setdefault(source.stem, profile)
            except (OSError, ValueError):
                continue
    return config


def main():
    config_file = Path(sys.argv[1])
    config = read_config(config_file)
    first_voice = sys.argv[2]
    cancellation = Path(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else None
    model_id = sys.argv[4] if len(sys.argv) > 4 else ""
    selected = config.get("models", {}).get(model_id, {})
    if selected.get("engine") in ("kitten", "kokoro"):
        # Kitten and Kokoro run in light_tts.py, a separate GPL-3 program the
        # app starts directly. This worker never loads their libraries.
        send({"event": "error", "message": "This reader runs in the light reader worker."})
        return
    import numpy as np
    # Only read by ROCm builds of torch: the older BLAS library was part of
    # the AMD setup that spoke in testing. NVIDIA and CPU ignore it.
    os.environ.setdefault("TORCH_BLAS_PREFER_HIPBLASLT", "0")
    import torch
    from transformers import StoppingCriteria, StoppingCriteriaList
    def cancelled(request):
        if cancellation is None or "generation" not in request:
            return False
        try:
            return cancellation.read_text().strip() != str(request["generation"])
        except OSError:
            return True

    class Interrupted(StoppingCriteria):
        def __init__(self, request):
            self.request = request
        def __call__(self, input_ids, scores, **kwargs):
            return cancelled(self.request)
    device = config.get("device", "cuda")
    mps = getattr(torch.backends, "mps", None)
    mps_available = bool(mps and mps.is_available())
    if device == "auto":
        # NVIDIA on Windows and Linux, Apple silicon GPU on macOS, else CPU.
        device = "cuda" if cuda_usable(torch) else "mps" if mps_available else "cpu"
    if device == "cuda" and torch.cuda.is_available() and not cuda_usable(torch):
        # An NVIDIA card older than this PyTorch supports: use the processor.
        device = "cpu"
    torch.set_num_threads(1 if device in ("cuda", "mps") else max(1, min(8, (os.cpu_count() or 2) // 2)))
    if device == "cuda" and not torch.cuda.is_available():
        send({"event": "error", "message": "The configured NVIDIA device is unavailable."})
        return
    if device == "mps" and not mps_available:
        send({"event": "error", "message": "The Apple GPU (Metal) is unavailable."})
        return
    path = model_path(config, model_id)
    # The fast streaming path uses CUDA graphs, which only NVIDIA runs
    # reliably. AMD cards (ROCm builds of torch also report "cuda") use the
    # standard model on the graphics card.
    fast = device == "cuda" and not getattr(torch.version, "hip", None)
    if fast:
        from faster_qwen3_tts import FasterQwen3TTS
        model = FasterQwen3TTS.from_pretrained(
            path, device=device,
            dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
            attn_implementation="sdpa", max_seq_len=2048, backend="torch", local_files_only=True)
        prompt_model = model.model
    else:
        from qwen_tts import Qwen3TTSModel
        # Metal supports float16 well; bfloat16 support varies by macOS version.
        # AMD (ROCm): float16 with fused attention crashed an RX 9060 XT with
        # a hardware exception; bfloat16 with plain attention speaks.
        amd = device == "cuda" and getattr(torch.version, "hip", None)
        model = Qwen3TTSModel.from_pretrained(
            path, device_map=device,
            dtype=torch.bfloat16 if amd else torch.float16 if device in ("mps", "cuda") else torch.float32,
            attn_implementation="eager" if amd else "sdpa", local_files_only=True)
        prompt_model = model

    # One loaded model serves every voice. A voice only needs its reference
    # prompt, which is small and quick to prepare, so switching voices or
    # books never reloads the model. Recently used prompts stay cached.
    prompts = {}

    def voice_entry(voice_id):
        nonlocal config
        if voice_id not in config.get("voices", {}):
            # Voices installed after this worker started.
            config = read_config(config_file)
        return config["voices"][voice_id]

    def voice_prompt(voice_id):
        if voice_id in prompts:
            prompts[voice_id] = prompts.pop(voice_id)
            return prompts[voice_id]
        voice = voice_entry(voice_id)
        prompt = prompt_model.create_voice_clone_prompt(
            ref_audio=voice["reference"], ref_text=voice["reference_text"], x_vector_only_mode=False)
        entry = (voice, prompt, voice.get("engine_language", voice.get("language", "English")))
        prompts[voice_id] = entry
        while len(prompts) > 8:
            prompts.pop(next(iter(prompts)))
        return entry

    voice_prompt(first_voice)
    if fast:
        model.warmup(prefill_len=100)
    # Qwen3-TTS 12Hz models emit 12.5 codec frames per second of audio.
    frame_rate = float(config.get("frame_rate", 12.5))
    temperature = float(config.get("temperature", 0.9))
    retry_temperature = float(config.get("retry_temperature", 0.6))

    def generate(request, text, temp, max_tokens):
        voice, prompt, voice_language = voice_prompt(request.get("voice") or first_voice)
        language = text_language(text, voice_language)
        chunks = []
        rate = 24000
        with torch.inference_mode():
            if fast:
                stream = model.generate_voice_clone_streaming(
                    text=text, language=language,
                    voice_clone_prompt=prompt, ref_text=voice["reference_text"],
                    max_new_tokens=max_tokens, chunk_size=8, xvec_only=False,
                    non_streaming_mode=False, append_silence=False, temperature=temp,
                    top_k=50, top_p=1.0, do_sample=True, repetition_penalty=1.05)
                try:
                    produced = 0
                    for audio, rate, _ in stream:
                        if cancelled(request):
                            break
                        chunk = np.asarray(audio, dtype=np.float32).reshape(-1)
                        chunks.append(chunk)
                        produced += chunk.size
                        if produced >= int(max_tokens / frame_rate * rate):
                            break
                finally:
                    stream.close()
            else:
                waves, rate = model.generate_voice_clone(
                    text=text, language=language,
                    voice_clone_prompt=prompt, max_new_tokens=max_tokens,
                    non_streaming_mode=False, temperature=temp,
                    top_k=50, top_p=1.0, do_sample=True, repetition_penalty=1.05,
                    stopping_criteria=StoppingCriteriaList([Interrupted(request)]))
                chunks = [np.asarray(waves[0], dtype=np.float32).reshape(-1)]
        audio = np.concatenate(chunks) if chunks else np.empty(0, dtype=np.float32)
        return audio[:int(max_tokens / frame_rate * rate)], rate

    batched = None

    def write_wav(path, audio, rate):
        tmp = path.with_suffix(".tmp")
        with wave.open(str(tmp), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        os.replace(tmp, path)

    def write_take(out_dir, name, audio, rate):
        """A Studio take: FLAC when soundfile is installed (half the size of
        WAV, lossless), else WAV. Written to a temporary name, then renamed."""
        try:
            import soundfile
        except ImportError:
            soundfile = None
        if soundfile is None:
            path = out_dir / f"{name}.wav"
            write_wav(path, audio, rate)
            return path
        path = out_dir / f"{name}.flac"
        tmp = out_dir / f"{name}.tmp.flac"
        soundfile.write(str(tmp), np.clip(audio, -1, 1), rate, subtype="PCM_16", format="FLAC")
        os.replace(tmp, path)
        return path

    def take_checks(audio, rate):
        """Measurements for Studio's automatic checks: peak and RMS in dBFS,
        and the silence before and after the speech in seconds."""
        a = np.abs(np.asarray(audio, dtype=np.float32))
        if not a.size:
            return {"peak": -120.0, "rms": -120.0, "lead": 0.0, "trail": 0.0}
        peak = float(a.max())
        rms = float(np.sqrt(np.mean(np.square(a, dtype=np.float64))))
        loud = np.flatnonzero(a > max(0.02, peak * 0.05))
        lead = float(loud[0] / rate) if loud.size else len(a) / rate
        trail = float((len(a) - 1 - loud[-1]) / rate) if loud.size else 0.0
        db = lambda v: round(20 * float(np.log10(max(v, 1e-6))), 1)
        return {"peak": db(peak), "rms": db(rms), "lead": round(lead, 2), "trail": round(trail, 2)}

    def render_batch(request):
        nonlocal batched
        items = request["items"]
        out_dir = Path(request["out_dir"])
        out_dir.mkdir(parents=True, exist_ok=True)
        voice, prompt, voice_language = voice_prompt(request.get("voice") or first_voice)
        try:
            temp = min(1.2, max(0.3, float(request.get("temperature", temperature))))
        except (TypeError, ValueError):
            temp = temperature
        texts = [prepared_text(i["text"]) for i in items]
        budgets = [speech_budget(t, frame_rate) for t in texts]
        language = text_language(" ".join(texts), voice_language)
        results = []
        torch.manual_seed(int(items[0].get("seed", 0)))
        if fast:
            if batched is None:
                sys.path.insert(0, str(Path(__file__).parent))
                from qwen_batch import BatchedFastQwen
                batched = BatchedFastQwen(model)
            with torch.inference_mode():
                codes, ended, ref_codes, _ = batched.generate(texts, language, prompt, voice["reference_text"], budgets, temperature=temp)
                audio, rate = batched.decode_audio(codes, ref_codes)
            outputs = [(a if a is not None else np.zeros(int(rate * 0.3), dtype=np.float32), e) for a, e in zip(audio, ended)]
        else:
            outputs = []
            for t, b in zip(texts, budgets):
                a, rate = generate(request, t, temp, b)
                outputs.append((a, bool(a.size) and not overran(a.size / rate, b, frame_rate)))
        for item, (a, ended) in zip(items, outputs):
            a = np.asarray(a, dtype=np.float32).reshape(-1)
            path = write_take(out_dir, item["take"], a, rate)
            results.append({"id": item["id"], "take": item["take"], "file": path.name, "duration": len(a) / rate,
                            "ended": bool(ended), "rate": rate, "checks": take_checks(a, rate)})
        return {"event": "rendered", "items": results, "batched": bool(fast)}

    for line in sys.stdin:
        request = json.loads(line)
        if cancelled(request):
            send({"event": "cancelled"})
            continue
        if request.get("version") == 1 and request.get("action") == "prepare":
            try:
                voice_prompt(request.get("voice") or first_voice)
            except (KeyError, OSError, ValueError):
                send({"event": "error", "message": "This voice's reference recording could not be loaded."})
                continue
            send({"event": "ready", "voice": request.get("voice") or first_voice})
            continue
        if request.get("version") == 1 and request.get("action") == "render":
            # Studio: several lines of one voice, written to files as takes.
            try:
                send(render_batch(request))
            except (KeyError, OSError, ValueError) as e:
                send({"event": "error", "message": f"Rendering failed: {e}"})
            continue
        text = request.get("text", "")
        if request.get("version") != 1 or not 0 < len(text) <= 1200:
            send({"event": "error", "message": "Invalid speech request."})
            continue
        try:
            voice_prompt(request.get("voice") or first_voice)
        except (KeyError, OSError, ValueError):
            send({"event": "error", "message": "This voice's reference recording could not be loaded."})
            continue
        text = prepared_text(text)
        max_tokens = speech_budget(text, frame_rate)
        # Voice variation from Settings, otherwise the configured default.
        try:
            temp = min(1.2, max(0.3, float(request.get("temperature", temperature))))
        except (TypeError, ValueError):
            temp = temperature
        audio, rate = generate(request, text, temp, max_tokens)
        unvoiced = False
        if not cancelled(request) and (
                not audio.size or overran(audio.size / rate, max_tokens, frame_rate)):
            # One calmer attempt usually recovers. If it overruns again, return
            # brief silence so playback continues and the passage can be marked.
            audio, rate = generate(request, text, min(temp, retry_temperature), max_tokens)
            if not audio.size or overran(audio.size / rate, max_tokens, frame_rate):
                audio = np.zeros(int(rate * 0.3), dtype=np.float32)
                unvoiced = True
        if cancelled(request):
            send({"event": "cancelled"})
            continue
        if not audio.size or not np.isfinite(audio).all():
            send({"event": "error", "message": "The model returned invalid audio."})
            continue
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        result = {"event": "audio", "audio": base64.b64encode(buffer.getvalue()).decode("ascii"),
                  "rate": rate, "duration": len(audio) / rate}
        if unvoiced:
            result["unvoiced"] = True
        send(result)


if __name__ == "__main__":
    isolate()
    try:
        main()
    except Exception:
        send({"event": "error", "message": "Local speech failed. Check the model, environment and voice reference."})
        raise
