"""Resume a complete local casting run. Does not install or approve voices."""
import argparse
import subprocess
import sys
from pathlib import Path
from common import setup,read,write

def main():
    p=argparse.ArgumentParser();p.add_argument('config');p.add_argument('--skip-design',action='store_true');args=p.parse_args()
    config,plan,root=setup(args.config);scripts=Path(__file__).resolve().parent
    def run(script,*extra,qc=False):
        command=[config['qc_python'] if qc else config['generation_python'],'-u',str(scripts/(script+'.py')),str(Path(args.config).resolve()),*extra]
        print('STAGE',script,*extra,flush=True);subprocess.run(command,check=True)
    def checked(stage,expected,model='1.7b'):
        # Independent CPU screening follows completed files while the GPU
        # generates later clips. Only one writer owns a given QC report.
        command=[config['qc_python'],'-u',str(scripts/'qc.py'),str(Path(args.config).resolve()),stage,'--expected',str(expected)]
        evaluator=subprocess.Popen(command)
        try:
            run('readers',stage,'--model',model)
            code=evaluator.wait(timeout=2400)
            if code:raise subprocess.CalledProcessError(code,command)
        finally:
            if evaluator.poll() is None:evaluator.terminate();evaluator.wait(timeout=15)
    run('provenance')
    if not args.skip_design:run('design')
    run('qc','references',qc=True)
    run('embeddings','references')
    run('selection')
    shortlist=read(root/'shortlist.json')
    checked('probes',sum(1+len(v['alternates']) for v in shortlist))
    run('readers','probes','--attempt','2')
    run('qc','probes',qc=True)
    run('embeddings','probes')
    run('selection','--final')
    for index,model in enumerate(['1.7b','0.6b'],1):
        checked('readers',len(plan['voices'])*len(plan['tests'])*index,model)
        for attempt in ['2','3']:
            run('readers','readers','--model',model,'--attempt',attempt)
            run('qc','readers',qc=True)
    if config.get('baseline_pack'):
        run('baseline');checked('baseline',len(plan['voices']))
    for index,model in enumerate(['1.7b','0.6b'],1):
        checked('defaults',len(plan['voices'])*index,model)
        run('readers','defaults','--model',model,'--attempt','2');run('qc','defaults',qc=True)
    run('embeddings','references','probes','readers','baseline','defaults')
    run('publish',qc=True)
    run('verify',qc=True)
    checks=read(root/'readers-qc.json')
    checks.update(read(root/'defaults-qc.json'))
    failures=[name for name,row in checks.items() if not row['pass']]
    print('COMPLETE: human listening review required. Technical failures:',failures,flush=True)
    if failures:sys.exit(2)

if __name__=='__main__':main()

