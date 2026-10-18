"""One local image job; process exit releases the model and device memory."""
import os
os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", HF_HUB_DISABLE_IMPLICIT_TOKEN="1")
import argparse
import json
from pathlib import Path

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


def main():
    p=argparse.ArgumentParser()
    for key in ["config","model","prompt","negative","output","seed","width","height"]:p.add_argument("--"+key,required=True)
    a=p.parse_args()
    c=json.loads(Path(a.config).read_text(encoding="utf-8-sig"))["models"][a.model]
    import torch
    from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline, ZImagePipeline, UNet2DConditionModel, LCMScheduler, EulerDiscreteScheduler
    from safetensors.torch import load_file
    device=c.get("device","auto")
    if device=="auto":device="cuda" if cuda_usable(torch) else "mps" if torch.backends.mps.is_available() else "cpu"
    dtype=torch.float32 if device=="cpu" else torch.float16
    torch.set_num_threads(max(1,min(8,(os.cpu_count() or 2)//2)))
    base=c["model"];profile=c["profile"]
    if profile=="sd15-lcm":
        pipe=StableDiffusionPipeline.from_pretrained(base,torch_dtype=dtype,variant="fp16",local_files_only=True)
        pipe.load_lora_weights(c["adapter"],local_files_only=True)
        pipe.scheduler=LCMScheduler.from_config(pipe.scheduler.config)
        steps,guidance=6,1.0
    elif profile=="sdxl-lightning":
        unet=UNet2DConditionModel.from_config(base,subfolder="unet",local_files_only=True).to(dtype=dtype)
        unet.load_state_dict(load_file(c["unet"]))
        pipe=StableDiffusionXLPipeline.from_pretrained(base,unet=unet,torch_dtype=dtype,variant="fp16",local_files_only=True)
        pipe.scheduler=EulerDiscreteScheduler.from_config(pipe.scheduler.config,timestep_spacing="trailing")
        steps,guidance=4,0.0
    elif profile=="z-image-turbo":
        dtype=torch.bfloat16 if device=="cuda" and torch.cuda.is_bf16_supported() else dtype
        pipe=ZImagePipeline.from_pretrained(base,torch_dtype=dtype,local_files_only=True)
        steps,guidance=9,0.0
    else:raise ValueError("Unsupported image model")
    if device=="cuda" and profile=="z-image-turbo":pipe.enable_sequential_cpu_offload()
    elif device=="cuda" and profile=="sdxl-lightning":pipe.enable_model_cpu_offload()
    else:pipe.to(device)
    pipe.vae.enable_tiling()
    args=dict(prompt=a.prompt,width=int(a.width),height=int(a.height),num_inference_steps=steps,guidance_scale=guidance,generator=torch.Generator("cpu").manual_seed(int(a.seed)))
    # Distilled models at guidance <= 1 do not use classifier-free negatives.
    # The application always puts its content and text-free constraints first.
    result=pipe(**args)
    if getattr(result,"nsfw_content_detected",None) and any(result.nsfw_content_detected):raise ValueError("Artwork was withheld by the model's content check.")
    result.images[0].save(a.output)

if __name__=="__main__":main()
