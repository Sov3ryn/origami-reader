"""Writes installer/downloads.json: what the online installer downloads for
each optional group, from the original publishers, pinned to exact revisions
with sizes and SHA-256 hashes.

    python installer/scripts/make-downloads.py
"""
import hashlib
import json
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PIP = {"url": "https://files.pythonhosted.org/packages/f3/6e/1736e5b4ae2b778ef2f81c47d797de9f891d4d8acb047a24ca37a60294dd/pip-26.2.1-py3-none-any.whl",
       "sha256": "71138adf1f4ca900cdb7d289c21b7494329f2332b6d85f0e1c42108c0384ed3e", "file": "pip-26.2.1-py3-none-any.whl"}
SD_RUNTIME = {"url": "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-959-d637cfb/sd-master-d637cfb-bin-win-vulkan-x64.zip",
              "sha256": "b28606d62b8b819bf9d91bd7224a04513aa33edac30f9487d5172af5a59785f2", "size": 30139117}
SD_TURBO_GGUF = {"sha256": "1e090f6aaee21d9392599bc0ae5056543c72aee917fa971b05e597a6109bafe6"}
# Same revisions the app downloads from (src-tauri/src/handwriting.rs, embed.rs).
TROCR = ("Xenova/trocr-base-handwritten", "e301d1c4c4d4ece88f164518eb7aee07062eaca2")
GRANITE = ("ibm-granite/granite-embedding-97m-multilingual-r2", "835ad14087e140460703cf0fae09f97d469d65c2")


def api(path):
    with urllib.request.urlopen("https://huggingface.co/api/" + path, timeout=60) as r:
        return json.load(r)


def revision(repo):
    return api(f"models/{repo}")["sha"]


def tree(repo, rev):
    out, todo = {}, [""]
    while todo:
        sub = todo.pop()
        for f in api(f"models/{repo}/tree/{rev}/{sub}".rstrip("/")):
            if f["type"] == "directory":
                todo.append(f["path"])
            else:
                out[f["path"]] = f
    return out


def entry(repo, rev, remote, local, info):
    url = f"https://huggingface.co/{repo}/resolve/{rev}/{remote}"
    sha = (info.get("lfs") or {}).get("oid")
    if not sha:
        with urllib.request.urlopen(url, timeout=120) as r:
            sha = hashlib.sha256(r.read()).hexdigest()
    return {"url": url, "path": local, "size": info["size"], "sha256": sha}


def model(repo, folder, only=None, rename=None, rev=None):
    rev = rev or revision(repo)
    files = tree(repo, rev)
    picked = []
    for remote, info in sorted(files.items()):
        if remote == ".gitattributes" or (only and remote not in only):
            continue
        local = (rename or {}).get(remote, f"{folder}/{remote}")
        picked.append(entry(repo, rev, remote, local, info))
    if only and len(picked) != len(only):
        raise SystemExit(f"{repo}: missing files")
    return picked


def main():
    groups = {}
    groups["core"] = {
        "label": "Handwriting and Related notes models",
        "files": model(*TROCR[:1], "models/handwriting/trocr-base", rev=TROCR[1],
                       only=["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_quantized.onnx", "tokenizer.json"],
                       rename={"onnx/encoder_model_quantized.onnx": "models/handwriting/trocr-base/encoder.onnx",
                               "onnx/decoder_model_quantized.onnx": "models/handwriting/trocr-base/decoder.onnx",
                               "tokenizer.json": "models/handwriting/trocr-base/tokenizer.json"})
        + model(*GRANITE[:1], "models/embeddings/standard", rev=GRANITE[1],
                only=["onnx/model_quint8_avx2.onnx", "tokenizer.json"],
                rename={"onnx/model_quint8_avx2.onnx": "models/embeddings/standard/model.onnx",
                        "tokenizer.json": "models/embeddings/standard/tokenizer.json"}),
    }
    groups["speech"] = {"label": "Speech packages", "pip": "speech.txt",
                        "torch": {"cuda": "speech-torch-cu128.txt", "cpu": "speech-torch-cpu.txt"},
                        "estimate": {"cuda": 4_300_000_000, "cpu": 1_300_000_000}}
    groups["speech-qwen"] = {"label": "Qwen3-TTS 0.6B",
                             "files": model("Qwen/Qwen3-TTS-12Hz-0.6B-Base", "models/Qwen3-TTS-12Hz-0.6B-Base")}
    groups["speech-light"] = {"label": "Light voices", "pip": "light.txt", "estimate": 330_000_000,
                              "files": model("KittenML/kitten-tts-mini-0.8", "models/kitten-tts-mini-0.8")
                              + model("KittenML/kitten-tts-micro-0.8", "models/kitten-tts-micro-0.8")
                              + model("hexgrad/Kokoro-82M", "models/Kokoro-82M",
                                      only=["README.md", "config.json", "kokoro-v1_0.pth", "voices/bf_emma.pt",
                                            "voices/bf_isabella.pt", "voices/bm_daniel.pt", "voices/bm_george.pt"])}
    groups["image-runtime"] = {"label": "Picture runtime (stable-diffusion.cpp)",
                               "archive": {**SD_RUNTIME, "path": "image-runtime"}}
    groups["images"] = {"label": "DreamShaper 8 LCM",
                        "files": model("Lykon/dreamshaper-8-lcm", "models", only=["DreamShaper8_LCM.safetensors"],
                                       rename={"DreamShaper8_LCM.safetensors": "models/dreamshaper-8-lcm.safetensors"})}
    turbo = model("stabilityai/sd-turbo", "models/sd-turbo", only=["sd_turbo.safetensors"],
                  rename={"sd_turbo.safetensors": "models/sd-turbo/sd_turbo.safetensors"})[0]
    groups["images-turbo"] = {"label": "SD-Turbo",
                              "convert": {**turbo, "output": "models/sd-turbo/sd-turbo-f16.gguf", **{"outputSha256": SD_TURBO_GGUF["sha256"]}}}
    for g in groups.values():
        g["bytes"] = sum(f["size"] for f in g.get("files", [])) + g.get("archive", {}).get("size", 0) + g.get("convert", {}).get("size", 0)
    out = {"schemaVersion": 1, "pip": PIP, "groups": groups}
    path = REPO / "installer/downloads.json"
    path.write_text(json.dumps(out, indent=1), encoding="utf-8")
    for name, g in groups.items():
        print(f"{name:14} {g['bytes'] / 1e9:6.2f} GB  {len(g.get('files', []))} files")


if __name__ == "__main__":
    main()
