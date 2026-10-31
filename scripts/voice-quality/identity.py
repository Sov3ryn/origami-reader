"""Independent, local CPU speaker embeddings from the cached Chatterbox encoder."""
import argparse
import importlib.util
import sys
from pathlib import Path
from common import setup,read,write,sha,offline

def main():
    p=argparse.ArgumentParser();p.add_argument('config');p.add_argument('folders',nargs='+');args=p.parse_args()
    config,plan,root=setup(args.config);offline()
    import torch
    import numpy as np
    import soundfile as sf
    import soxr
    from safetensors.torch import load_file
    folder=Path(config['identity_encoder_source']);checkpoint=Path(config['identity_encoder_weights'])
    # Load the local encoder package alone, without importing TTS pipelines.
    spec=importlib.util.spec_from_file_location('origami_identity_encoder',folder/'__init__.py',submodule_search_locations=[str(folder)])
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
    torch.set_num_threads(2);model=module.VoiceEncoder().eval();model.load_state_dict(load_file(checkpoint,device='cpu'))
    path=root/'identity-embeddings.json';rows=read(path) if path.exists() else {};model_hash=sha(checkpoint)
    for name in args.folders:
        for audio in sorted((root/name).glob('*.wav')):
            key=name+'/'+audio.name;digest=sha(audio)
            if rows.get(key,{}).get('sha256')==digest and rows[key].get('model_sha256')==model_hash:continue
            wave,rate=sf.read(audio,dtype='float32')
            wave=soxr.resample(wave,rate,model.hp.sample_rate)
            with torch.inference_mode():vector=np.asarray(model.embeds_from_wavs([wave],sample_rate=model.hp.sample_rate)[0]).reshape(-1)
            vector=vector/np.linalg.norm(vector)
            rows[key]={'sha256':digest,'model_sha256':model_hash,'vector':vector.tolist(),'encoder':'Chatterbox voice encoder, independent of Qwen generation'}
            write(path,rows);print('Independent identity',key,flush=True)

if __name__=='__main__':main()
