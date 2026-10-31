"""Shortlist only technically passing references, then validate reader probes."""
import argparse
from common import setup, read, write

def cosine(a,b):return sum(x*y for x,y in zip(a,b))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('config');parser.add_argument('--final',action='store_true');args=parser.parse_args()
    config,plan,root=setup(args.config);checks=read(root/'references-qc.json');vectors=read(root/'embeddings.json')
    if config.get('identity_encoder_source'):vectors=read(root/'identity-embeddings.json')
    probes=read(root/'probes-qc.json') if args.final else {}
    options={};scores={}
    for voice in plan['voices']:
        choices=[]
        for index in range(config['takes']):
            stem=f'{voice["id"]}-{index+1:02}';c=checks.get(stem+'.wav',{})
            if not c.get('pass'):continue
            score=12*c['wer']+.1*len(c['warnings'])-.15*c['dnsmos_overall']
            if args.final:
                p=probes.get(stem+'-1.7b-probe.wav',{})
                if not p.get('pass'):continue
                score+=15*p['wer']+.1*len(p['warnings'])-.2*p['dnsmos_overall']
                probe_key='probes/'+stem+'-1.7b-probe.wav'
                if probe_key not in vectors:raise RuntimeError('Embed reader probes before final selection')
                identity=cosine(vectors['references/'+stem+'.wav']['vector'],vectors[probe_key]['vector'])
                score+=3*max(0,.75-identity)**2
            scores[stem]=score;choices.append(stem)
        if not choices:raise RuntimeError('No passing '+('reader probe' if args.final else 'reference')+' for '+voice['id'])
        options[voice['id']]=sorted(choices,key=lambda x:scores[x])
    picks={v:items[0] for v,items in options.items()}
    def vector(stem):
        key='probes/'+stem+'-1.7b-probe.wav' if args.final else 'references/'+stem+'.wav'
        return vectors[key]['vector']
    # Coordinate descent reduces dependence on which role happens to be first.
    def objective(proposed):
        values=list(proposed.values());score=sum(scores[x] for x in values)
        if not config.get('identity_encoder_source'):return score
        for i,a in enumerate(values):
            for b in values[i+1:]:
                similarity=cosine(vector(a),vector(b))
                score+=5*max(0,similarity-.72)**2
        return score
    for _ in range(6):
        before=dict(picks)
        for voice in options:picks[voice]=min(options[voice],key=lambda x:objective({**picks,voice:x}))
        if picks==before:break
    selected=[]
    for voice in plan['voices']:
        stem=picks[voice['id']];others=sorted((cosine(vectors['references/'+stem+'.wav']['vector'],vectors['references/'+b+'.wav']['vector']),v) for v,b in picks.items() if v!=voice['id'])
        alternatives=[x for x in options[voice['id']] if x!=stem]
        selected.append({**voice,'selected':stem,'alternates':alternatives[:1] if args.final else alternatives,
            'nearest':{'voice':others[-1][1],'cosine':round(others[-1][0],4)},'identity_encoder':'Chatterbox' if config.get('identity_encoder_source') else 'Qwen','approval':'Pending human listening review'})
    write(root/('selection.json' if args.final else 'shortlist.json'),selected)
    print([(v['id'],v['selected'],v['nearest']) for v in selected],flush=True)

if __name__=='__main__':main()
