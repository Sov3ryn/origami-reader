"""Explicit technical release gates, separate from subjective voice selection."""
import re

def number_words(value):
    """Normalize ordinary ASR numerals without ignoring numerical mistakes."""
    ones=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
    tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
    if value<20:return ones[value]
    if value<100:return tens[value//10]+(' '+ones[value%10] if value%10 else '')
    if value<1000:return ones[value//100]+' hundred'+(' '+number_words(value%100) if value%100 else '')
    if value<10000:return ones[value//1000]+' thousand'+(' '+number_words(value%1000) if value%1000 else '')
    return str(value)

def words(text):
    text=text.lower().replace("’", "'")
    text=re.sub(r'\b(\d{1,2}):(\d{2})\b',lambda m:number_words(int(m[1]))+' '+number_words(int(m[2])),text)
    text=re.sub(r'\b\d{1,4}\b',lambda m:number_words(int(m[0])),text)
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", text)

def edit_distance(a,b):
    row=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        nxt=[i]
        for j,y in enumerate(b,1):nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]

def failures(expected,actual,wer,clipped,dc,pace,pause):
    result=[]
    if wer>.045:result.append('word_errors')
    if actual[:2]!=expected[:2]:result.append('opening_words')
    if actual[-2:]!=expected[-2:]:result.append('ending_words')
    if clipped>.0001:result.append('clipping')
    if abs(dc)>.02:result.append('dc_offset')
    if not 75<=pace<=245:result.append('implausible_pacing')
    if pause>2.4:result.append('long_internal_silence')
    return result
