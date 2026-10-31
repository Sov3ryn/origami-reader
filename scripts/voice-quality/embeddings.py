"""Use Qwen's own speaker encoder to flag similar identities and clone drift."""
import argparse
import subprocess
from pathlib import Path
from common import setup, read, write, sha, offline

def main():
    parser=argparse.ArgumentParser();parser.add_argument('config');parser.add_argument('folders',nargs='+');args=parser.parse_args()
    config,plan,root=setup(args.config);offline()
    import numpy as np
    import torch
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel
    path=root/'embeddings.json';rows=read(path) if path.exists() else {}
    pending=[]
    for folder in args.folders:
        for audio in sorted((root/folder).glob('*.wav')):
            key=f'{folder}/{audio.name}';digest=sha(audio)
            if rows.get(key,{}).get('sha256')!=digest: pending.append((audio,key,digest))
    def independent():
        if config.get('identity_encoder_source'):
            subprocess.run([config['qc_python'],str(Path(__file__).with_name('identity.py')),args.config,*args.folders],check=True)
    if not pending:
        independent();return
    worker=read(config['worker_config']);model_path=worker['models']['qwen3-tts-0.6b']['path']
    torch.set_num_threads(4);torch.backends.cuda.enable_cudnn_sdp(False)
    model=Qwen3TTSModel.from_pretrained(model_path,device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa',local_files_only=True)
    for audio,key,digest in pending:
        wave,rate=sf.read(audio,dtype='float32')
        with torch.inference_mode():vector=model.model.extract_speaker_embedding(audio=wave,sr=rate).float().cpu().numpy().reshape(-1)
        rows[key]={'sha256':digest,'vector':(vector/np.linalg.norm(vector)).tolist()};write(path,rows)
        print('Embedded',key,flush=True)
    independent()

if __name__=='__main__':main()
