"""Record local model and source fingerprints without adding them to Git."""
import argparse
import importlib.metadata
import importlib.util
from pathlib import Path
import platform
import shutil
from common import setup,read,write,sha

def main():
    p=argparse.ArgumentParser();p.add_argument('config');args=p.parse_args();config,plan,root=setup(args.config)
    worker=read(config['worker_config']);models={'design':config['design_model']}
    for name in ['qwen3-tts-1.7b','qwen3-tts-0.6b']:models[name]=worker['models'][name]['path']
    rows=[]
    for name,directory in models.items():
        for path in sorted(Path(directory).rglob('*')):
            if path.is_file() and '.cache' not in path.parts and path.suffix in ['.safetensors','.json']:
                rows.append({'model':name,'file':str(path.relative_to(directory)),'bytes':path.stat().st_size,'sha256':sha(path)})
    versions={}
    previous=root/'provenance.json'
    if previous.exists() and read(previous)['model_files']!=rows:
        raise ValueError('Model files changed. Use a new output directory for a new evaluation.')
    for package in ['torch','transformers','soundfile','librosa','qwen-tts','faster-qwen3-tts']:
        try:versions[package]=importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:versions[package]='not packaged in this environment'
    scripts={p.name:sha(p) for p in Path(__file__).parent.glob('*.py')}
    library_sources={}
    for module in ['qwen_tts','faster_qwen3_tts']:
        spec=importlib.util.find_spec(module)
        if spec and spec.origin:
            folder=Path(spec.origin).parent
            library_sources[module]={str(p.relative_to(folder)):sha(p) for p in folder.rglob('*.py')}
    write(root/'provenance.json',{'platform':platform.platform(),'python':platform.python_version(),'versions':versions,'model_files':rows,'scripts':scripts,'worker_sha256':sha(config['worker']),
        'library_sources':library_sources,
        'generation':'Local synthetic Qwen VoiceDesign references. No external voice cloning or uploaded audio.',
        'qc':'Whisper small.en CPU int8, DNSMOS P.835 ONNX CPU, Qwen 0.6B speaker embeddings. Human approval remains pending.'})
    dest=root/'QC model attribution';dest.mkdir(exist_ok=True)
    for name in ['LICENSE.txt','sources.json']:shutil.copy2(Path(config['dnsmos'])/name,dest/name)
    if config.get('identity_encoder_source'):
        source=Path(config['identity_encoder_source']);license_path=source.parents[3]/'LICENSE'
        shutil.copy2(license_path,dest/'Chatterbox MIT license.txt')
        write(dest/'identity-encoder.json',{'source':'https://github.com/resemble-ai/chatterbox','checkpoint_sha256':sha(config['identity_encoder_weights']),
            'source_files':{p.name:sha(p) for p in source.glob('*.py')},'use':'CPU identity comparison only. No Chatterbox speech generation. Audio resampled with soxr before the encoder.'})
    print('Provenance recorded',len(rows),'model files',flush=True)

if __name__=='__main__':main()
