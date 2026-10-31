"""Test references through the real Origami worker in an isolated configuration."""
import argparse
import base64
import json
import os
import queue
import subprocess
import threading
import time
from pathlib import Path
from common import setup, read, write, sha, offline

def main():
    parser=argparse.ArgumentParser();parser.add_argument('config');parser.add_argument('stage',choices=['probes','readers','baseline','defaults']);parser.add_argument('--model',choices=['1.7b','0.6b'],default='1.7b');parser.add_argument('--attempt',type=int,default=1);args=parser.parse_args()
    config,plan,root=setup(args.config);offline();folder=root/args.stage;folder.mkdir(exist_ok=True)
    worker=read(config['worker_config']);profiles={};jobs=[]
    temperature=float(worker.get('temperature',.9)) if args.stage=='defaults' else .8
    worker_digest=sha(config['worker'])
    if args.stage=='baseline':
        baseline=read(root/'baseline-plan.json')
        for row in baseline:
            profiles[row['id']]=row['profile']
            jobs.append((row['id'],'probe',plan['probe'],row['profile']['reference']))
    else:
        selection=read(root/('shortlist.json' if args.stage=='probes' else 'selection.json'))
        for voice in selection:
            stems=[voice['selected']]+(voice['alternates'] if args.stage=='probes' else [])
            for stem in stems:
                ref=root/'references'/(stem+'.wav')
                profiles[stem]={'name':voice['name'],'engine':'qwen','language':'English','languages':['English'],'gender':voice['gender'],'reference':str(ref),'reference_text':plan['reference_text']}
                for name,text in ({'probe':plan['probe']} if args.stage in ['probes','defaults'] else plan['tests']).items():jobs.append((stem,name,text,str(ref)))
    worker['voices']=profiles;worker['device']='cuda';worker['temperature']=temperature
    cfg=root/f'worker-{args.stage}.json';write(cfg,worker)
    pending=[];checks=read(root/(args.stage+'-qc.json')) if (root/(args.stage+'-qc.json')).exists() else {}
    for voice,name,text,ref in jobs:
        stem=f'{voice}-{args.model}-{name}';audio=folder/(stem+'.wav');meta=audio.with_suffix('.json')
        if args.attempt>1:
            if checks.get(audio.name,{}).get('pass'):continue
            # Keep failed attempts in the audit trail before replacing a retry.
            if meta.exists() and read(meta).get('attempt',1)>=args.attempt:continue
        elif meta.exists() and audio.exists():
            data=read(meta)
            if data['sha256']==sha(audio) and data['reference_sha256']==sha(ref) and data['text']==text and data['worker_sha256']==worker_digest and data['temperature']==temperature:continue
            raise ValueError('Changed reader inputs: '+stem)
        pending.append((voice,name,text,ref,audio,meta))
    if not pending:return
    log=(root/f'{args.stage}-{args.model}-attempt{args.attempt}.log').open('w',encoding='utf-8')
    env={**os.environ,'PYTHONUTF8':'1'};env.pop('ORIGAMI_CREATED_VOICES',None)
    process=subprocess.Popen([config['generation_python'],'-u',config['worker'],str(cfg),pending[0][0],'','qwen3-tts-'+args.model],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=log,text=True,encoding='utf-8',env=env,creationflags=0x08000000 if os.name=='nt' else 0)
    messages=queue.Queue()
    def receive():
        for line in process.stdout:messages.put(line)
        messages.put(None)
    threading.Thread(target=receive,daemon=True).start()
    try:
        for voice,name,text,ref,audio,meta in pending:
            start=time.monotonic();process.stdin.write(json.dumps({'version':1,'voice':voice,'text':text,'temperature':temperature})+'\n');process.stdin.flush()
            line=messages.get(timeout=300)
            if line is None:raise RuntimeError('Reader exited. See '+log.name)
            result=json.loads(line)
            if result.get('event')!='audio' or result.get('unvoiced'):raise RuntimeError(str(result))
            if args.attempt>1 and audio.exists():
                archive=root/'failed-attempts';archive.mkdir(exist_ok=True)
                old=read(meta);old['qc']=checks.get(audio.name);write(archive/(args.stage+'-'+audio.stem+f'-attempt{old.get("attempt",1)}.json'),old)
                audio.replace(archive/(args.stage+'-'+audio.stem+f'-attempt{old.get("attempt",1)}.wav'))
            audio.write_bytes(base64.b64decode(result['audio']))
            write(meta,{'stage':args.stage,'voice':voice,'test':name,'text':text,'model':'qwen3-tts-'+args.model,'attempt':args.attempt,'temperature':temperature,
                'reference_sha256':sha(ref),'sha256':sha(audio),'generation_seconds':round(time.monotonic()-start,2),'worker_sha256':worker_digest,
                'approval':'Pending human listening review','seed':'Worker protocol does not expose a seed; stochastic reader test'})
            print(args.stage,audio.name,round(time.monotonic()-start,1),flush=True)
    finally:
        if process.poll() is None:
            process.stdin.close()
            try:process.wait(timeout=15)
            except subprocess.TimeoutExpired:process.terminate();process.wait(timeout=15)
        log.close()

if __name__=='__main__':main()
