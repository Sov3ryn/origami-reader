"""Offline intelligibility and acoustic screening, not a listening verdict."""
import argparse
import re
import time
from pathlib import Path
from common import setup, read, write, sha, offline
from gates import words, edit_distance, failures as gate_failures

class Screening:
    def __init__(self, config):
        import onnxruntime as ort
        from faster_whisper import WhisperModel
        self.asr = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4, download_root=config["asr_cache"], local_files_only=True)
        options = ort.SessionOptions(); options.intra_op_num_threads = 2; options.inter_op_num_threads = 1
        self.mos = ort.InferenceSession(str(Path(config["dnsmos"])/"sig_bak_ovr.onnx"), sess_options=options, providers=["CPUExecutionProvider"])

    def check(self, path, text):
        import numpy as np
        import soundfile as sf
        import soxr
        import librosa
        raw, sr = sf.read(path, dtype="float32")
        if raw.ndim == 2: raw = raw.mean(axis=1)
        if not len(raw) or not np.isfinite(raw).all(): return {"pass":False, "failures":["nonfinite_or_empty"],"warnings":[],"wer":1.0,"dnsmos_overall":0.0,"duration":0.0,"recognized":""}
        y = soxr.resample(raw, sr, 16000)
        segments, _ = self.asr.transcribe(y, language="en", beam_size=5, vad_filter=False, condition_on_previous_text=False, word_timestamps=True)
        segments = list(segments); recognized = " ".join(s.text.strip() for s in segments)
        expected, actual = words(text), words(recognized)
        wer = edit_distance(expected, actual) / max(1, len(expected))
        frame = 320; count = len(y)//frame
        rms = np.sqrt(np.mean(y[:count*frame].reshape(count,frame)**2, axis=1)) if count else np.array([0.])
        active = np.where(rms > max(.002, float(rms.max())*.06))[0]
        lead = float(active[0]*.02) if len(active) else len(y)/16000
        tail = max(0.,len(y)/16000-(active[-1]+1)*.02) if len(active) else len(y)/16000
        inside = rms[active[0]:active[-1]+1] if len(active) else rms
        longest = run = 0
        for value in inside:
            run = run + 1 if value < max(.002,float(rms.max())*.025) else 0
            longest = max(longest, run)
        length = 144160
        padded = np.tile(y, max(1, int(np.ceil(length/max(1,len(y)))))) if len(y)<length else y
        starts = list(range(0,len(padded)-length+1,48000)) or [0]
        mos = []
        # Microsoft's DNSMOS P.835 inference and non-personalized polynomial
        # calibration. Attribution and model hashes are retained with the run.
        for start in starts:
            sig,bak,ovr = self.mos.run(None,{self.mos.get_inputs()[0].name:padded[start:start+length][None].astype("float32")})[0][0]
            mos.append([float(np.polyval([-.08397278,1.22083953,.0052439],sig)),float(np.polyval([-.13166888,1.60915514,-.39604546],bak)),float(np.polyval([-.06766283,1.11546468,.04602535],ovr))])
        f0 = librosa.yin(y, fmin=60, fmax=450, sr=16000, frame_length=1024, hop_length=320)
        env = librosa.feature.rms(y=y, frame_length=1024, hop_length=320)[0]
        pitch = f0[(env>max(.008,float(env.max())*.15)) & (f0>65) & (f0<440)]
        clipped = float(np.mean(abs(raw)>=.999))
        duration = len(raw)/sr
        rate = len(expected)*60/max(.1,duration-lead-tail)
        failures=gate_failures(expected,actual,wer,clipped,float(raw.mean()),rate,longest*.02); warnings=[]
        if lead>1.2 or tail>2: warnings.append("excess_edge_silence")
        end_peak=float(np.max(abs(raw[-max(1,int(sr*.02)):])));
        if end_peak>.03: warnings.append("possible_abrupt_ending")
        averages=np.mean(mos,axis=0).tolist()
        if averages[2]<3.0: warnings.append("low_predicted_quality")
        timings=[{"word":w.word.strip(),"start":round(w.start,3),"end":round(w.end,3),"probability":round(w.probability,3)} for s in segments for w in (s.words or [])]
        return {"pass":not failures,"failures":failures,"warnings":warnings,"recognized":recognized,"wer":round(wer,5),"duration":round(duration,3),"words_per_minute":round(rate,1),
            "peak_dbfs":round(float(20*np.log10(max(1e-8,np.max(abs(raw))))),2),"rms_dbfs":round(float(10*np.log10(max(1e-16,np.mean(raw**2)))),2),
            "clip_fraction":clipped,"leading_silence":round(lead,3),"trailing_silence":round(tail,3),"longest_internal_silence":round(longest*.02,3),"last_20ms_peak":end_peak,
            "pitch_median_hz":round(float(np.median(pitch)),1) if len(pitch) else None,"pitch_iqr_hz":round(float(np.percentile(pitch,75)-np.percentile(pitch,25)),1) if len(pitch) else None,
            "dnsmos_signal":round(averages[0],3),"dnsmos_background":round(averages[1],3),"dnsmos_overall":round(averages[2],3),"word_timings":timings,
            "limitations":"ASR, pitch and predicted MOS are imperfect proxies. No gender, age, accent or artistic-quality verdict is inferred."}

def main():
    p=argparse.ArgumentParser();p.add_argument("config");p.add_argument("folder");p.add_argument("--expected",type=int,default=0);p.add_argument("--timeout",type=int,default=2400);args=p.parse_args()
    config,plan,root=setup(args.config);offline(); report=root/(args.folder+"-qc.json")
    environment=root/'qc-environment.json'
    if not environment.exists():
        import importlib.metadata
        versions={name:importlib.metadata.version(name) for name in ['faster-whisper','ctranslate2','onnxruntime','librosa','numpy','soxr']}
        cache=Path(config['asr_cache'])/'models--Systran--faster-whisper-small.en'
        files={str(p.relative_to(cache)):sha(p) for p in (cache/'snapshots').rglob('*') if p.is_file()}
        write(environment,{'versions':versions,'asr_files':files,'dnsmos_sha256':sha(Path(config['dnsmos'])/'sig_bak_ovr.onnx')})
    rows=read(report) if report.exists() else {}
    available=[p.with_suffix('.wav') for p in (root/args.folder).glob('*.json') if p.with_suffix('.wav').exists() and 'text' in read(p)]
    if (not args.expected or len(available)>=args.expected) and all(rows.get(p.name,{}).get('sha256')==sha(p) and rows[p.name].get('qc_version')==2 for p in available):
        write(report,rows);print(args.folder,'QC cache verified',len(available),'clips',flush=True);return
    checker=Screening(config); started=time.monotonic()
    while True:
        for meta_path in sorted((root/args.folder).glob("*.json")):
            meta=read(meta_path); path=meta_path.with_suffix(".wav")
            if not path.exists() or "text" not in meta: continue
            digest=sha(path)
            if rows.get(path.name,{}).get("sha256")==digest and rows[path.name].get('qc_version')==2: continue
            result=checker.check(path,meta["text"]);result["sha256"]=digest;result["qc_version"]=2
            rows[path.name]=result;write(report,rows)
            print(args.folder,path.name,"PASS" if result["pass"] else "FAIL",result["wer"],result["dnsmos_overall"],flush=True)
        if not args.expected or len(rows)>=args.expected: break
        if time.monotonic()-started>args.timeout: raise TimeoutError(f"Only {len(rows)} of {args.expected} clips arrived")
        time.sleep(3)

if __name__=="__main__": main()

