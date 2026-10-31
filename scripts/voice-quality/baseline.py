"""Prepare read-only comparisons with the previously selected English package."""
from pathlib import Path
import argparse
from common import setup,read,write

def main():
    p=argparse.ArgumentParser();p.add_argument('config');args=p.parse_args();config,plan,root=setup(args.config)
    folder=Path(config['baseline_pack']);mapping={'alistair':'m-02','agnes':'f-02','finn':'m-03','pippa':'f-03','jonah':'m-01','clara':'f-01','lucien':'m-04','celeste':'f-04','dorian':'m-05','vivienne':'f-05'}
    rows=[]
    for voice in plan['voices']:
        ident='designed-vd-approved-en-'+mapping[voice['id']];profile=read(folder/(ident+'.json'))
        profile['reference']=str((folder/profile['reference']).resolve())
        rows.append({'id':voice['id']+'-previous','new_voice':voice['id'],'profile':profile})
    write(root/'baseline-plan.json',rows)

if __name__=='__main__':main()
