"""Generate synthetic reference candidates, preserving the unprocessed audio."""
import argparse
import random
import time
import importlib.metadata
from common import setup, write, sha, offline

def main():
    p = argparse.ArgumentParser(); p.add_argument("config"); p.add_argument("--limit", type=int); args = p.parse_args()
    config, plan, root = setup(args.config); offline()
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    try:
        version = importlib.metadata.version("qwen-tts")
    except importlib.metadata.PackageNotFoundError:
        version = "local-source-install"
    torch.set_num_threads(4); torch.backends.cuda.enable_cudnn_sdp(False)
    model = Qwen3TTSModel.from_pretrained(config["design_model"], device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa", local_files_only=True)
    folder = root / "references"; folder.mkdir(exist_ok=True)
    for index, voice in enumerate(plan["voices"][:args.limit]):
        for take in range(config["takes"]):
            stem = f'{voice["id"]}-{take+1:02}'
            audio_path = folder / (stem + ".wav"); meta_path = audio_path.with_suffix(".json")
            if meta_path.exists() and audio_path.exists():
                from common import read
                if read(meta_path)["sha256"] == sha(audio_path): continue
                raise ValueError("Candidate checksum changed: " + stem)
            seed = config["seed"] + index * 101 + take * 10007
            torch.manual_seed(seed); np.random.seed(seed); random.seed(seed)
            temp = [.7, .85, .95, .8][take % 4]
            started = time.monotonic()
            waves, rate = model.generate_voice_design(text=plan["reference_text"], language="English", instruct=voice["prompt"],
                temperature=temp, subtalker_temperature=.8, repetition_penalty=1.05, max_new_tokens=650, non_streaming_mode=True)
            audio = np.asarray(waves[0], dtype=np.float32).reshape(-1)
            if not np.isfinite(audio).all() or len(audio) < rate: raise ValueError("Invalid candidate: " + stem)
            # Float originals preserve real clipping/peak measurements. No denoising,
            # pitch shifting, dynamic compression or time stretching is applied.
            sf.write(audio_path, audio, rate, subtype="FLOAT")
            metadata = {"id":stem, "voice":voice["id"], "take":take+1, "seed":seed, "temperature":temp, "text":plan["reference_text"],
                "prompt":voice["prompt"], "rate":rate, "duration":len(audio)/rate, "seconds":round(time.monotonic()-started,2),
                "sha256":sha(audio_path), "model":"Qwen3-TTS-12Hz-1.7B-VoiceDesign", "qwen_tts_version":version, "approval":"unreviewed"}
            write(meta_path, metadata)
            print(stem, metadata["duration"], metadata["seconds"], flush=True)

if __name__ == "__main__": main()
