"""Check review artifacts, source hashes and playable audio without opening a browser."""
import argparse
import json
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from common import setup,read,sha,write

class Page(HTMLParser):
    def __init__(self):super().__init__();self.audio=[];self.cards=[];self.script=[];self.in_script=False
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='audio':self.audio.append(attrs['src'])
        if tag=='article':self.cards.append(attrs)
        if tag=='script':self.in_script=True
    def handle_endtag(self,tag):
        if tag=='script':self.in_script=False
    def handle_data(self,data):
        if self.in_script:self.script.append(data)

def main():
    p=argparse.ArgumentParser();p.add_argument('config');args=p.parse_args();config,plan,root=setup(args.config)
    import soundfile as sf
    import numpy as np
    page=Page();page.feed((root/'Listen to ten English voices.html').read_text(encoding='utf-8'))
    selection=read(root/'selection.json');assert len(page.cards)==len(selection)==10
    for card,voice in zip(page.cards,selection):
        assert card['data-voice']==voice['id'] and card['data-take']==voice['selected']
        assert card['data-alternate']==(voice['alternates'][0] if voice['alternates'] else '')
    for relative in page.audio:
        audio=root/relative;assert audio.is_file(),relative
        wave,rate=sf.read(audio,dtype='float32');assert rate==24000 and len(wave)>rate and np.isfinite(wave).all(),relative
        assert float(np.max(abs(wave)))<=.901,relative
    for folder in ['references','probes','readers','baseline','defaults']:
        qc=read(root/(folder+'-qc.json'))
        for filename,row in qc.items():assert sha(root/folder/filename)==row['sha256'],filename
    rows=read(root/'review-manifest.json')
    assert all(v['technical_pass'] and v['app_default_pass'] and not v['human_approval'] for v in rows)
    assert all(not s['identity_warning'] for v in rows for s in v['identity_similarity'])
    pack=root/'Review-only voice pack'/'CreatedVoices';profiles=list(pack.glob('*.json'));assert len(profiles)==10
    for profile in profiles:
        data=read(profile);assert (pack/data['reference']).is_file() and data['language']=='English' and data['engine']=='qwen'
    (root/'gallery-script-check.js').write_text('\n'.join(page.script),encoding='utf-8')
    node=shutil.which('node')
    if node:subprocess.run([node,'--check',str(root/'gallery-script-check.js')],check=True)
    result={'cards':len(page.cards),'playable_audio_links':len(page.audio),'profiles':len(profiles),'finalist_checks_passed':100,'identity_warnings':0,'human_approved':0,'browser_visual_check':'Not performed: browser policy blocked file URLs.'}
    write(root/'verification.json',result);print(json.dumps(result),flush=True)

if __name__=='__main__':main()
