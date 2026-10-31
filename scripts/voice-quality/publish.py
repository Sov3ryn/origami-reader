"""Build gain-matched listening copies and an explicitly unapproved review pack."""
import argparse
import html
import json
from pathlib import Path
import shutil
import statistics
from datetime import datetime
from common import setup,read,write,sha
from selection import cosine

def main():
    p=argparse.ArgumentParser();p.add_argument('config');args=p.parse_args();config,plan,root=setup(args.config)
    run_day=datetime.fromtimestamp((root/'run.json').stat().st_mtime).date();run_tag=run_day.strftime('%Y%m%d')
    import soundfile as sf
    import numpy as np
    selected=read(root/'selection.json');vectors=read(root/'embeddings.json');checks={}
    if config.get('identity_encoder_source'):vectors=read(root/'identity-embeddings.json')
    for folder in ['references','probes','readers','baseline','defaults']:
        file=root/(folder+'-qc.json');checks[folder]=read(file) if file.exists() else {}
    listening=root/'listening';listening.mkdir(exist_ok=True);gains={}
    def copy_audio(folder,name):
        source=root/folder/(name+'.wav')
        if not source.exists():return None
        wave,rate=sf.read(source,dtype='float32');rms=float(np.sqrt(np.mean(wave**2)));peak=float(np.max(abs(wave)))
        gain=min(10**(-21/20)/max(rms,1e-8),.9/max(peak,1e-8),2.)
        dest=listening/(folder+'-'+name+'.wav');sf.write(dest,wave*gain,rate,subtype='PCM_16')
        gains[dest.name]={'source_sha256':sha(source),'gain':round(gain,6),'method':'RMS target -21 dBFS, peak <= -0.92 dBFS, maximum gain 2. No dynamic compression.'}
        return 'listening/'+dest.name
    def player(folder,stem,label):
        path=copy_audio(folder,stem)
        if not path:return '<p>Sample unavailable.</p>'
        c=checks[folder].get(stem+'.wav',{});status='Pass' if c.get('pass') else 'Needs review'
        stats=f'{status} | word error {c.get("wer",0)*100:.1f}% | predicted speech quality {c.get("dnsmos_overall","?")}/5'
        return f'<div class="sample"><b>{html.escape(label)}</b><audio controls preload="none" src="{path}"></audio><small>{stats}</small></div>'
    cards=[];summary=[];pack=root/'Review-only voice pack'/'CreatedVoices';pack.mkdir(parents=True,exist_ok=True)
    baseline=read(root/'baseline-plan.json') if (root/'baseline-plan.json').exists() else []
    baseline_names={b['new_voice']:b['profile']['name'] for b in baseline}
    for voice in selected:
        stem=voice['selected'];ident=voice['id'];reference=vectors['references/'+stem+'.wav']['vector']
        reader_checks=[];similarities=[];files=[]
        for model in ['1.7b','0.6b']:
            for test in plan['tests']:
                name=f'{stem}-{model}-{test}.wav';c=checks['readers'].get(name,{});reader_checks.append(c)
                key='readers/'+name
                if key in vectors:
                    own=cosine(reference,vectors[key]['vector'])
                    neighbors=[(cosine(vectors['references/'+other['selected']+'.wav']['vector'],vectors[key]['vector']),other['id']) for other in selected if other['id']!=ident]
                    nearest=max(neighbors)
                    similarities.append({'model':model,'test':test,'cosine':round(own,4),'nearest_other':nearest[1],'nearest_other_cosine':round(nearest[0],4),'identity_warning':nearest[0]>own+.05})
                files.append(name)
        passed=len(reader_checks)==8 and all(c.get('pass') for c in reader_checks)
        defaults=[checks['defaults'].get(f'{stem}-{model}-probe.wav',{}) for model in ['1.7b','0.6b']]
        default_pass=all(c.get('pass') for c in defaults)
        row={**voice,'technical_pass':passed,'app_default_pass':default_pass,'reader_tests':files,'identity_similarity':similarities,'human_approval':False}
        summary.append(row)
        # This is a review pack, never copied into an application-managed directory.
        profile_id='designed-vd-review-en-'+run_tag+'-'+ident
        shutil.copy2(root/'references'/(stem+'.wav'),pack/(profile_id+'.wav'))
        write(pack/(profile_id+'.json'),{'name':voice['name']+' (Review)','description':voice['role'],'engine':'qwen','reference':profile_id+'.wav',
            'reference_text':plan['reference_text'],'language':'English','languages':['English'],'gender':voice['gender'].lower(),'accent':voice['accent'],
            'styles':[voice['role']],'origin':'qwen-voice-design','designPrompt':voice['prompt'],'pack':'en','notes':'Synthetic candidate. Pending human listening review. Not a shipping approval.'})
        body=player('probes',stem+'-1.7b-probe','New voice, fresh passage, Qwen 1.7B')
        body+=player('baseline',ident+'-previous-1.7b-probe','Previous: '+baseline_names.get(ident,'previous selected voice'))
        body+='<details><summary>Reference, alternate and eight reader tests</summary>'+player('references',stem,'Synthetic reference')
        for alt in voice['alternates']:body+=player('probes',alt+'-1.7b-probe','Alternate take '+alt)
        for model in ['1.7b','0.6b']:
            for test in plan['tests']:body+=player('readers',f'{stem}-{model}-{test}',f'Qwen {model}: {test}')
            body+=player('defaults',f'{stem}-{model}-probe',f'Qwen {model}: app default sampling')
        body+='</details>'
        min_identity=min((s['cosine'] for s in similarities),default=0)
        identity_flags=sum(s['identity_warning'] for s in similarities)
        if identity_flags:body+=f'<p>Identity comparison flagged {identity_flags} passages for a careful listening check.</p>'
        body+=f'<small>App default sampling checks: {"both passed" if default_pass else "pending or need attention"}.</small>'
        body+=f'<small>Nearest other reference: {html.escape(voice["nearest"]["voice"])} ({voice["nearest"]["cosine"]:.3f}). Lowest reference/reader similarity: {min_identity:.3f}. Similarity is an advisory metric, not a listening verdict.</small>'
        cards.append(f'<article data-voice="{ident}"><div class="eyebrow">{html.escape(voice["gender"])} / {html.escape(voice["role"])}</div><h2>{html.escape(voice["name"])}</h2><p>{html.escape(voice["accent"])}</p><span class="badge">{"8/8 technical checks passed" if passed else "Technical checks need attention"} · Listening review pending</span>{body}<label>Your decision <select class="decision"><option value="pending">Not reviewed</option><option value="keep">Keep selected take</option><option value="alternate">Prefer alternate</option><option value="redo">Redo voice</option></select></label><label>Notes <textarea placeholder="Age, identity, expressiveness, fatigue, pronunciation..."></textarea></label></article>')
    write(root/'listening-gains.json',gains);write(root/'review-manifest.json',summary)
    reel=[];cues=[];position=0.;reel_rate=None
    for voice in selected:
        path=listening/('probes-'+voice['selected']+'-1.7b-probe.wav')
        if not path.exists():continue
        wave,rate=sf.read(path,dtype='float32')
        if reel_rate is not None and rate!=reel_rate:raise ValueError('Audition reel sample rates differ')
        reel_rate=rate;cues.append({'voice':voice['name'],'start':round(position,3),'duration':len(wave)/rate})
        reel.extend([wave,np.zeros(rate,dtype='float32')]);position+=len(wave)/rate+1
    if reel:sf.write(root/'Ten English voices - audition reel.wav',np.concatenate(reel[:-1]),reel_rate,subtype='PCM_16')
    write(root/'audition-reel-cues.json',cues)
    metrics={}
    for folder,rows in checks.items():
        metrics[folder]={'count':len(rows),'passing':sum(bool(v['pass']) for v in rows.values()),'mean_wer':round(statistics.mean(v['wer'] for v in rows.values()),5) if rows else None,'mean_predicted_mos':round(statistics.mean(v['dnsmos_overall'] for v in rows.values()),3) if rows else None}
    pairs=[]
    for voice in selected:
        new=checks['probes'].get(voice['selected']+'-1.7b-probe.wav');old=checks['baseline'].get(voice['id']+'-previous-1.7b-probe.wav')
        if new and old:pairs.append({'voice':voice['id'],'new_wer':new['wer'],'old_wer':old['wer'],'new_predicted_quality':new['dnsmos_overall'],'old_predicted_quality':old['dnsmos_overall'],'new_pass':new['pass'],'old_pass':old['pass']})
    metrics['matched_comparison']={'pairs':pairs,'warning':'One probe per old voice; selected new voices benefited from best-of-four casting and probe screening. Not a blinded trial or proof of perceptual superiority.'}
    identity_comparison={}
    for cohort in ['new','previous']:
        pairs=[]
        for index,a in enumerate(selected):
            for b in selected[index+1:]:
                ka='probes/'+a['selected']+'-1.7b-probe.wav' if cohort=='new' else 'baseline/'+a['id']+'-previous-1.7b-probe.wav'
                kb='probes/'+b['selected']+'-1.7b-probe.wav' if cohort=='new' else 'baseline/'+b['id']+'-previous-1.7b-probe.wav'
                if ka in vectors and kb in vectors:pairs.append({'a':a['id'],'b':b['id'],'same_gender_role':a['gender']==b['gender'],'cosine':round(cosine(vectors[ka]['vector'],vectors[kb]['vector']),4)})
        same=[p['cosine'] for p in pairs if p['same_gender_role']]
        identity_comparison[cohort]={'same_gender_role_mean_cosine':round(statistics.mean(same),4) if same else None,'highest_pair_cosine':max((p['cosine'] for p in pairs),default=None),'pairs':sorted(pairs,key=lambda p:p['cosine'],reverse=True)}
    metrics['identity_comparison']={'encoder':selected[0].get('identity_encoder'),'cohorts':identity_comparison,'warning':'Relative separability in this encoder, not proof that listeners perceive distinct characters.'}
    write(root/'summary.json',metrics)
    (root/'Review-only voice pack'/'README.txt').write_text('Review candidates only. Not installed and not approved for shipping. See ../review-manifest.json and listening gallery. The CreatedVoices format matches Origami Qwen reference profiles. Keep existing voices until human review.\n',encoding='utf-8')
    html_page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Origami English voice auditions</title><style>
    :root{color-scheme:dark;font:16px/1.6 system-ui;color:#eee9f2;background:#17151d}body{max-width:1250px;margin:auto;padding:42px 24px}h1{font:42px Georgia;margin:8px 0}h2{font:32px Georgia;margin:7px 0}p{color:#c5bece}.intro{max-width:900px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(410px,1fr));gap:24px}article{background:#24202d;border:1px solid #494052;border-radius:18px;padding:26px}.eyebrow{color:#c8a9ea;font-size:13px;text-transform:uppercase;letter-spacing:1px}.badge{display:block;color:#d5c5e7;font-size:13px;margin:15px 0}audio{width:100%;display:block;margin:10px 0}.sample{padding:16px 0;border-bottom:1px solid #413948}small{display:block;color:#b0a6bb;font-size:12px}details{margin:16px 0}summary{cursor:pointer;color:#d5b6f3}label{display:block;margin-top:15px}select,textarea,button{box-sizing:border-box;font:inherit;color:inherit;border:1px solid #675975;border-radius:8px;background:#322a3d;padding:10px}textarea,select{width:100%}textarea{height:80px}button{cursor:pointer;background:#71528d;margin:18px 0}a{color:#dbc0fb}.bar{position:sticky;top:0;background:#17151df2;padding:8px;z-index:2}code{color:#d2badf}@media(max-width:500px){.grid{display:block}article{margin-bottom:20px}}
    </style><header><div class="eyebrow">Origami / local English casting / 30 October 2026</div><h1>Ten voices. Put them to the test.</h1><div class="intro"><p>Five male and five female roles, generated locally with Qwen VoiceDesign and tested through Origami's actual 1.7B and 0.6B readers. These are review candidates. Your existing voices are unchanged.</p><p>The first two players on each card use the same new passage for a fair comparison. Listening copies receive bounded volume matching only. Expand a card for the untouched-performance reference, alternate and four unfamiliar passages on each reader.</p><p>Automatic checks screen intelligibility, clipping, pauses and estimated speech quality. They cannot certify convincing age, gender presentation, accent, acting or listening comfort. A higher predicted score does not necessarily mean a better narrator.</p><details><summary>Read the comparison passage</summary><p>PROBE_TEXT</p></details></div></header><div class="bar"><button id="export">Save my decisions</button> <span id="progress"></span></div><main class="grid">CARDS</main><footer><p><a href="summary.json">Technical summary</a> · <a href="review-manifest.json">Candidate manifest</a> · <a href="Report.html">Method and results</a></p><p>Synthetic original voices. No ElevenLabs voices or services used. No files were installed into Origami.</p></footer><script>
    const key='origami-english-quality-20261030';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{};
    const cards=[...document.querySelectorAll('article')];function collect(){return Object.fromEntries(cards.map(c=>[c.dataset.voice,{decision:c.querySelector('select').value,notes:c.querySelector('textarea').value}]))};function store(){try{localStorage.setItem(key,JSON.stringify(collect()))}catch{}document.querySelector('#progress').textContent=cards.filter(c=>c.querySelector('select').value!=='pending').length+' / 10 reviewed'};
    for(const c of cards){const s=saved[c.dataset.voice];if(s){c.querySelector('select').value=s.decision;c.querySelector('textarea').value=s.notes||''}c.addEventListener('input',store)}store();
    document.addEventListener('play',e=>{if(e.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()})},true);
    document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify({run:'20261030',decisions:collect()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='origami-english-quality-decisions.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
    </script></html>'''.replace('CARDS',''.join(cards)).replace('PROBE_TEXT',html.escape(plan['probe']))
    selection_hash=sha(root/'selection.json')
    html_page=html_page.replace("origami-english-quality-20261030",'origami-english-quality-'+selection_hash[:16])
    html_page=html_page.replace("run:'20261030',decisions:collect()",f"run:'20261030',selectionHash:'{selection_hash}',decisions:collect()")
    html_page=html_page.replace("decision:c.querySelector('select').value,notes:","selectedTake:c.dataset.take,alternateTake:c.dataset.alternate||null,decision:c.querySelector('select').value,notes:")
    for voice in selected:
        html_page=html_page.replace(f'data-voice="{voice["id"]}"',f'data-voice="{voice["id"]}" data-take="{voice["selected"]}" data-alternate="{voice["alternates"][0] if voice["alternates"] else ""}"')
    html_page=html_page.replace('20261030',run_tag).replace('30 October 2026',run_day.strftime('%d %B %Y'))
    reel_html='<section><h2>Quick audition</h2><p>All ten new voices, using the same passage on Qwen 1.7B.</p><audio id="reel" controls preload="none" src="Ten English voices - audition reel.wav"></audio><p>'+ ' · '.join(f'<a href="#" onclick="const a=document.getElementById(\'reel\');a.currentTime={c["start"]};a.play();return false">{html.escape(c["voice"])}</a>' for c in cues)+'</p></section>'
    html_page=html_page.replace('</header>','</header>'+reel_html)
    (root/'Listen to ten English voices.html').write_text(html_page,encoding='utf-8')
    report=f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Origami voice quality report</title><style>body{{max-width:900px;margin:50px auto;font:17px/1.7 system-ui;padding:20px}}pre{{white-space:pre-wrap}}td,th{{padding:8px;border:1px solid #ccc}}table{{border-collapse:collapse}}</style><h1>English casting: methods and results</h1><p>All generation and evaluation ran locally. Forty new synthetic references, ten roles, best-of-four sampling. This is reference casting and conditioning, not fine-tuning model weights.</p><pre>{html.escape(json.dumps(metrics,indent=2))}</pre><h2>Selection and quality gates</h2><p>Reference clips must pass Whisper small.en transcription (word error rate at most 4.5%, exact first and last two normalized words), clipping fraction at most 0.01%, DC offset at most 0.02, pacing from 75 to 245 words per minute and internal silence at most 2.4 seconds. Metrics use original audio before volume matching. A word error can also be a recognizer error; examine the saved transcript and word timestamps.</p><p>DNSMOS P.835 estimates speech signal, background and overall quality. Overall score is a weak ranking input, not a shipping gate. This predictor does not measure audiobook acting. An independent, locally cached Chatterbox voice encoder compares identities. Qwen conditioning embeddings are retained for the audit, but their near-one raw similarities were not useful as an absolute distinctiveness test. Pitch summaries are advisory and never used to infer gender or age.</p><p>All passing reference candidates per role are tested on a fresh probe through the actual Origami worker. The selected candidate reads four holdout passages using both Qwen Base sizes. Technical failures receive at most two retries, preserved in failed-attempts. Previously approved voices read the identical probe with identical reader settings. This is a small comparison, not a statistical proof of improvement.</p><p>The four holdouts use temperature 0.8. A separate probe on both models checks the app default temperature, 0.9 in this run. The independent voice encoder is from <a href="https://github.com/resemble-ai/chatterbox">Resemble AI Chatterbox</a>, with its MIT notice and source hashes retained. It generates no speech here.</p><h2>Limits and listening review</h2><p>Reference prompts request age, texture, gender presentation, accent and delivery; automated tools do not verify those attributes. Listen for distinct character, believable age, unnatural breaths, word endings, emotional range and fatigue. These tests cover approximately a minute of narration per model and voice, not whole-book endurance. Stochastic generation can fail on other texts. Review-only profiles must not replace shipping voices automatically.</p><p>Original waveforms, seeds, prompts, model identifiers, worker hashes, failed attempts, transcription and gain records accompany this run. Reader protocol does not expose seeds. Reproducibility is best effort, not bit-exact across devices. Runtime paths and model files remain outside the repository.</p><h2>Sources and attribution</h2><p>Qwen Team, <a href="https://github.com/QwenLM/Qwen3-TTS">Qwen3-TTS</a>, supports Voice Design followed by Base voice cloning. Microsoft, <a href="https://github.com/microsoft/DNS-Challenge/tree/master/DNSMOS">DNSMOS</a>, P.835 model with official non-personalized polynomial calibration. DNS Challenge materials are <a href="https://github.com/microsoft/DNS-Challenge/blob/master/LICENSE">CC BY 4.0</a>. The local evaluation samples 9.01-second windows every three seconds instead of the reference one-second hop. Model source URLs, hashes and license are retained locally. This tool is used for development and is not bundled into the reader.</p></html>'''
    table='<table><tr><th>Stage</th><th>Checked</th><th>Passing latest takes</th><th>Retries used</th></tr>'
    for stage in ['references','probes','readers','baseline','defaults']:
        retries=sum(max(0,read(p).get('attempt',1)-1) for p in (root/stage).glob('*.json'))
        table+=f'<tr><td>{stage}</td><td>{metrics[stage]["count"]}</td><td>{metrics[stage]["passing"]}</td><td>{retries}</td></tr>'
    table+='</table>'
    comparison=metrics['matched_comparison']['pairs']
    if comparison:
        new_score=statistics.mean(p['new_predicted_quality'] for p in comparison);old_score=statistics.mean(p['old_predicted_quality'] for p in comparison)
        new_identity=identity_comparison['new']['same_gender_role_mean_cosine'];old_identity=identity_comparison['previous']['same_gender_role_mean_cosine']
        table+=f'<p>Matched-probe predicted speech quality: <b>{new_score:.3f} new, {old_score:.3f} previous</b>. These scores are essentially tied and do not establish a perceptual improvement. Mean speaker similarity within the male and female groups: <b>{new_identity} new, {old_identity} previous</b>. Lower similarity means greater separation in this encoder, not a percentage improvement in human-perceived distinctiveness.</p>'
    rejected=metrics['references']['count']-metrics['references']['passing']
    table+=f'<p>The new set was selected from multiple candidates; this was not a blind trial. The final passing counts include retries. {rejected} reference takes were rejected. Some reported word differences are recognizer formatting, including recognized versus recognised.</p><p><a href="summary.json">Full machine-readable results</a> · <a href="Listen to ten English voices.html">Listen and record decisions</a></p>'
    table+='<table><tr><th>Voice</th><th>Role</th><th>Selected reference</th></tr>'+''.join(f'<tr><td>{v["name"]}</td><td>{v["role"]}</td><td>{v["selected"]}</td></tr>' for v in selected)+'</table>'
    report=report.replace('<pre>'+html.escape(json.dumps(metrics,indent=2))+'</pre>',table)
    (root/'Report.html').write_text(report,encoding='utf-8');print({k:v for k,v in metrics.items() if k in checks},flush=True)

if __name__=='__main__':main()




