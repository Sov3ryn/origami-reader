"""Shared, resumable file handling. Model paths stay in a local configuration."""
import hashlib
import json
import os
from pathlib import Path

def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))

def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".pending")
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    temp.replace(path)

def sha(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda:source.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()

def setup(config_path):
    config = read(config_path)
    plan = read(config["plan"])
    root = Path(config["output"])
    root.mkdir(parents=True, exist_ok=True)
    stamp = {"plan_sha256": sha(config["plan"]), "design_model": config["design_model"], "takes": config["takes"], "seed": config["seed"]}
    manifest = root / "run.json"
    if manifest.exists():
        if read(manifest) != stamp:
            raise ValueError("This output belongs to a different plan. Use a new output directory.")
    else:
        write(manifest, stamp)
    return config, plan, root

def offline():
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", HF_HUB_DISABLE_PROGRESS_BARS="1")
