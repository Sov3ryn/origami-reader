// Studio, phase 4: recordings to text with NVIDIA Parakeet TDT 0.6B v3
// (CC-BY-4.0), run on the processor through the app's ONNX Runtime. Ported
// from the phase 0 experiment (docs/STUDIO-PHASE0.md, section 5): native
// 128-band front end, greedy TDT decoding with word times every 80 ms, and
// 30-second windows cut at the quietest point. Audio is decoded as a stream,
// so a 10-hour recording never sits in memory whole.
use realfft::RealFftPlanner;
use std::path::Path;

pub type Result<T> = std::result::Result<T, String>;

pub const RATE: usize = 16_000;
pub const FRAME_S: f64 = 0.08;

// --- Front end ---------------------------------------------------------------------------------
const MELS: usize = 128;
const N_FFT: usize = 512;
const WIN: usize = 400;
const HOP: usize = 160;

fn hz_to_mel(f: f64) -> f64 {
    let (f_sp, min_log_hz) = (200.0 / 3.0, 1000.0);
    let logstep = 6.4f64.ln() / 27.0;
    if f >= min_log_hz { min_log_hz / f_sp + (f / min_log_hz).ln() / logstep } else { f / f_sp }
}
fn mel_to_hz(m: f64) -> f64 {
    let (f_sp, min_log_hz) = (200.0 / 3.0, 1000.0);
    let min_log_mel = min_log_hz / f_sp;
    let logstep = 6.4f64.ln() / 27.0;
    if m >= min_log_mel { min_log_hz * (logstep * (m - min_log_mel)).exp() } else { f_sp * m }
}
/// Slaney mel filters, as librosa.filters.mel(sr=16000, n_fft=512, n_mels=128).
fn filters() -> Vec<Vec<f32>> {
    let bins = N_FFT / 2 + 1;
    let rate = RATE as f64;
    let fft: Vec<f64> = (0..bins).map(|i| i as f64 * (rate / 2.0) / (bins - 1) as f64).collect();
    let (lo, hi) = (hz_to_mel(0.0), hz_to_mel(rate / 2.0));
    let pts: Vec<f64> = (0..MELS + 2).map(|i| mel_to_hz(lo + (hi - lo) * i as f64 / (MELS + 1) as f64)).collect();
    (0..MELS)
        .map(|m| {
            let enorm = 2.0 / (pts[m + 2] - pts[m]);
            fft.iter()
                .map(|&f| {
                    let lower = (f - pts[m]) / (pts[m + 1] - pts[m]);
                    let upper = (pts[m + 2] - f) / (pts[m + 2] - pts[m + 1]);
                    (lower.min(upper).max(0.0) * enorm) as f32
                })
                .collect()
        })
        .collect()
}

struct Frontend {
    filters: Vec<(usize, Vec<f32>)>,
    window: Vec<f32>,
    fft: std::sync::Arc<dyn realfft::RealToComplex<f32>>,
}

impl Frontend {
    fn new() -> Self {
        let filters = filters()
            .into_iter()
            .map(|f| {
                let a = f.iter().position(|&w| w > 0.0).unwrap_or(0);
                let b = f.iter().rposition(|&w| w > 0.0).map(|b| b + 1).unwrap_or(a);
                (a, f[a..b].to_vec())
            })
            .collect();
        let mut window = vec![0f32; N_FFT];
        let off = (N_FFT - WIN) / 2;
        for i in 0..WIN {
            window[off + i] = (0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / (WIN - 1) as f64).cos()) as f32;
        }
        Frontend { filters, window, fft: RealFftPlanner::<f32>::new().plan_fft_forward(N_FFT) }
    }

    /// [128 x T] log-mel features normalised per band, T, and the valid frames.
    fn features(&self, samples: &[f32]) -> (Vec<f32>, usize, usize) {
        let n = samples.len();
        let pad = N_FFT / 2;
        let mut x = vec![0f32; n + 2 * pad];
        for i in 0..n {
            let prev = if i == 0 { 0.0 } else { samples[i - 1] };
            x[pad + i] = samples[i] - 0.97 * prev;
        }
        let t = 1 + n / HOP;
        let valid = n / HOP;
        let mut out = vec![0f32; MELS * t];
        let mut frame = self.fft.make_input_vec();
        let mut spec = self.fft.make_output_vec();
        let mut power = vec![0f32; N_FFT / 2 + 1];
        for f in 0..valid {
            let at = f * HOP;
            for k in 0..N_FFT {
                frame[k] = x[at + k] * self.window[k];
            }
            let _ = self.fft.process(&mut frame, &mut spec);
            for (p, c) in power.iter_mut().zip(&spec) {
                *p = c.re * c.re + c.im * c.im;
            }
            for (m, (a, w)) in self.filters.iter().enumerate() {
                let e: f32 = w.iter().zip(&power[*a..]).map(|(w, p)| w * p).sum();
                out[m * t + f] = (e + 2f32.powi(-24)).ln();
            }
        }
        for m in 0..MELS {
            let row = &mut out[m * t..m * t + t];
            let v = &row[..valid];
            let mean = v.iter().map(|&a| a as f64).sum::<f64>() / valid.max(1) as f64;
            let var = v.iter().map(|&a| (a as f64 - mean).powi(2)).sum::<f64>() / (valid.max(2) - 1) as f64;
            let std = var.sqrt() + 1e-5;
            for (i, r) in row.iter_mut().enumerate() {
                *r = if i < valid { ((*r as f64 - mean) / std) as f32 } else { 0.0 };
            }
        }
        (out, t, valid)
    }
}

// --- Windows -------------------------------------------------------------------------------------
const FRAME: usize = RATE / 100;
const SMOOTH: usize = 30;

/// Cuts audio into windows of at most `max_s` seconds, each cut in the quietest 300 ms of
/// the last `search_s` seconds (a sentence pause in narrated audio). (start, end, silent).
pub fn split(samples: &[f32], max_s: f32, search_s: f32) -> Vec<(usize, usize, bool)> {
    let power: Vec<f32> = samples
        .chunks(FRAME)
        .map(|c| {
            let mean = c.iter().sum::<f32>() / c.len() as f32;
            c.iter().map(|v| (v - mean) * (v - mean)).sum::<f32>() / c.len() as f32
        })
        .collect();
    let n = power.len();
    let mut prefix = vec![0f64; n + 1];
    for i in 0..n {
        prefix[i + 1] = prefix[i] + power[i] as f64;
    }
    let smooth = |i: usize| -> f64 {
        let a = i.saturating_sub(SMOOTH / 2);
        let b = (i + SMOOTH / 2).min(n);
        (prefix[b] - prefix[a]) / (b - a).max(1) as f64
    };
    let mut sorted = power.clone();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let floor = sorted.get(n / 10).copied().unwrap_or(0.0).max(1e-10) as f64;
    let max_f = (max_s * 100.0) as usize;
    let search_f = ((search_s * 100.0) as usize).min(max_f / 2).max(1);
    let mut out = vec![];
    let mut start = 0usize;
    while start < n {
        let end = if n - start <= max_f {
            n
        } else {
            let (lo, hi) = (start + max_f - search_f, start + max_f);
            (lo..hi).map(|i| (smooth(i), i)).fold((f64::MAX, hi), |b, x| if x.0 < b.0 { x } else { b }).1
        };
        let peak = (start..end).map(smooth).fold(0f64, f64::max);
        out.push((start * FRAME, (end * FRAME).min(samples.len()), peak < floor * 100.0 || peak < 1e-6));
        start = end;
    }
    out
}

// --- The model -----------------------------------------------------------------------------------
const HIDDEN: usize = 1024;
const STATE_LAYERS: usize = 2;
const STATE_DIM: usize = 640;
const MAX_TOKENS_PER_STEP: usize = 10;

#[derive(Clone, Debug)]
pub struct Word {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub conf: f32,
}

struct Token {
    id: usize,
    frame: usize,
    dur: usize,
    prob: f32,
}

pub struct Parakeet {
    frontend: Frontend,
    enc: ort::session::Session,
    dec: ort::session::Session,
    vocab: Vec<String>,
    blank: usize,
}

/// The model files: Models/transcribe in the data folder (encoder.int8.onnx,
/// decoder_joint.int8.onnx, vocab.txt), or ORIGAMI_ASR_DIR for development.
pub fn model_dir(data: &Path) -> std::path::PathBuf {
    std::env::var_os("ORIGAMI_ASR_DIR").map(std::path::PathBuf::from).unwrap_or_else(|| data.join("Models").join("transcribe"))
}
pub fn installed(dir: &Path) -> bool {
    ["encoder.int8.onnx", "decoder_joint.int8.onnx", "vocab.txt"].iter().all(|f| dir.join(f).is_file())
}

impl Parakeet {
    pub fn open(env: &ort::environment::Environment, dir: &Path) -> Result<Self> {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
        let session = |file: &str, n: usize| -> Result<ort::session::Session> {
            ort::session::Session::builder(env)
                .map_err(|e| e.to_string())?
                .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)
                .map_err(|e| e.to_string())?
                .with_intra_threads(n)
                .map_err(|e| e.to_string())?
                .with_inter_threads(1)
                .map_err(|e| e.to_string())?
                .commit_from_file(dir.join(file))
                .map_err(|e| e.to_string())
        };
        let text = std::fs::read_to_string(dir.join("vocab.txt")).map_err(|e| e.to_string())?;
        let mut vocab: Vec<(usize, String)> = Vec::new();
        for l in text.lines().filter(|l| !l.is_empty()) {
            let (tok, id) = l.rsplit_once(' ').ok_or("The vocabulary file is damaged.")?;
            vocab.push((id.parse::<usize>().map_err(|e| e.to_string())?, tok.to_string()));
        }
        vocab.sort_by_key(|v| v.0);
        let vocab: Vec<String> = vocab.into_iter().map(|v| v.1).collect();
        let blank = vocab.iter().position(|t| t == "<blk>").ok_or("The vocabulary file is damaged.")?;
        Ok(Parakeet {
            frontend: Frontend::new(),
            enc: session("encoder.int8.onnx", (threads / 2).clamp(1, 8))?,
            dec: session("decoder_joint.int8.onnx", 1)?,
            vocab,
            blank,
        })
    }

    fn encode(&mut self, samples: &[f32]) -> Result<(Vec<f32>, usize)> {
        let (feats, t, valid) = self.frontend.features(samples);
        let input = ort::value::Tensor::from_array(([1usize, MELS, t], feats)).map_err(|e| e.to_string())?;
        let len = ort::value::Tensor::from_array(([1usize], vec![valid as i64])).map_err(|e| e.to_string())?;
        let out = self.enc.run(ort::inputs!["audio_signal" => input, "length" => len]).map_err(|e| e.to_string())?;
        let (shape, enc) = out["outputs"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        let (_, lens) = out["encoded_lengths"].try_extract_tensor::<i64>().map_err(|e| e.to_string())?;
        let (d, tt) = (shape[1] as usize, shape[2] as usize);
        if d != HIDDEN {
            return Err("Unexpected transcription model.".into());
        }
        let n = (lens[0] as usize).min(tt);
        let mut frames = vec![0f32; n * d];
        for c in 0..d {
            let row = &enc[c * tt..c * tt + tt];
            for f in 0..n {
                frames[f * d + c] = row[f];
            }
        }
        Ok((frames, n))
    }

    fn decode(&mut self, frames: &[f32], n: usize) -> Result<Vec<Token>> {
        let state_len = STATE_LAYERS * STATE_DIM;
        let (mut s1, mut s2) = (vec![0f32; state_len], vec![0f32; state_len]);
        let mut last = self.blank as i32;
        let mut tokens = vec![];
        let (mut t, mut emitted) = (0usize, 0usize);
        let vocab_size = self.vocab.len();
        while t < n {
            let enc = ort::value::Tensor::from_array(([1usize, HIDDEN, 1], frames[t * HIDDEN..(t + 1) * HIDDEN].to_vec())).map_err(|e| e.to_string())?;
            let target = ort::value::Tensor::from_array(([1usize, 1], vec![last])).map_err(|e| e.to_string())?;
            let target_len = ort::value::Tensor::from_array(([1usize], vec![1i32])).map_err(|e| e.to_string())?;
            let st1 = ort::value::Tensor::from_array(([STATE_LAYERS, 1, STATE_DIM], s1.clone())).map_err(|e| e.to_string())?;
            let st2 = ort::value::Tensor::from_array(([STATE_LAYERS, 1, STATE_DIM], s2.clone())).map_err(|e| e.to_string())?;
            let out = self
                .dec
                .run(ort::inputs!["encoder_outputs" => enc, "targets" => target, "target_length" => target_len, "input_states_1" => st1, "input_states_2" => st2])
                .map_err(|e| e.to_string())?;
            let (_, logits) = out["outputs"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            let (tok_logits, dur_logits) = logits.split_at(vocab_size);
            let token = argmax(tok_logits);
            let dur = argmax(dur_logits);
            if token != self.blank {
                let (_, o1) = out["output_states_1"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
                let (_, o2) = out["output_states_2"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
                s1.copy_from_slice(o1);
                s2.copy_from_slice(o2);
                last = token as i32;
                tokens.push(Token { id: token, frame: t, dur, prob: softmax_at(tok_logits, token) });
                emitted += 1;
            }
            if dur > 0 {
                t += dur;
                emitted = 0;
            } else if token == self.blank || emitted == MAX_TOKENS_PER_STEP {
                t += 1;
                emitted = 0;
            }
        }
        Ok(tokens)
    }

    /// Words of one window of 16 kHz audio, with times in seconds from `offset`.
    pub fn words(&mut self, samples: &[f32], offset: f64) -> Result<Vec<Word>> {
        let (frames, n) = self.encode(samples)?;
        let tokens = self.decode(&frames, n)?;
        let mut words: Vec<(String, Option<f64>, f64, f32)> = vec![];
        let mut last_end = offset;
        for tok in &tokens {
            let piece = &self.vocab[tok.id];
            if piece.starts_with('<') && piece.ends_with('>') {
                continue;
            }
            let (new_word, body) = match piece.strip_prefix('\u{2581}') {
                Some(rest) => (true, rest),
                None => (false, piece.as_str()),
            };
            let punct = body.chars().all(|c| !c.is_alphanumeric());
            if new_word || words.is_empty() {
                words.push((String::new(), None, last_end, 1.0));
            }
            let w = words.last_mut().unwrap();
            w.0.push_str(body);
            w.3 = w.3.min(tok.prob);
            if !punct {
                let start = offset + tok.frame as f64 * FRAME_S;
                let end = offset + (tok.frame + tok.dur.max(1)) as f64 * FRAME_S;
                w.1.get_or_insert(start);
                w.2 = end;
                last_end = end;
            }
        }
        Ok(words.into_iter().filter(|w| !w.0.is_empty()).map(|(text, start, end, conf)| Word { text, start: start.unwrap_or(end), end, conf }).collect())
    }
}

fn argmax(v: &[f32]) -> usize {
    (1..v.len()).fold(0, |best, i| if v[i] > v[best] { i } else { best })
}
fn softmax_at(v: &[f32], i: usize) -> f32 {
    let m = v[argmax(v)];
    let sum: f32 = v.iter().map(|x| (x - m).exp()).sum();
    (v[i] - m).exp() / sum
}

// --- A whole file, as a stream ----------------------------------------------------------------------

/// Transcribes a recording: decodes it packet by packet, resamples each minute to
/// 16 kHz, and transcribes 30-second windows as soon as they are complete.
/// `progress` gets the share done (0 to 1); `cancelled` stops early.
pub fn transcribe_file(model: &mut Parakeet, path: &Path, progress: &dyn Fn(f64), cancelled: &dyn Fn() -> bool) -> Result<(Vec<Word>, f64)> {
    use symphonia::core::codecs::audio::AudioDecoderOptions;
    use symphonia::core::errors::Error;
    use symphonia::core::formats::probe::Hint;
    use symphonia::core::formats::{FormatOptions, TrackType};
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let file = Box::new(std::fs::File::open(path).map_err(|e| e.to_string())?);
    let mss = MediaSourceStream::new(file, Default::default());
    let mut hint = Hint::new();
    hint.with_extension(&ext);
    let mut format = symphonia::default::get_probe()
        .probe(&hint, mss, FormatOptions::default(), MetadataOptions::default())
        .map_err(|_| format!("{} is not an audio format Origami can read.", path.display()))?;
    let (track_id, params, total) = {
        let track = format.default_track(TrackType::Audio).ok_or("This file has no audio.")?;
        let params = track.codec_params.as_ref().and_then(|p| p.audio()).ok_or("This file has no audio.")?.clone();
        (track.id, params, track.num_frames)
    };
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(&params, &AudioDecoderOptions::default())
        .map_err(|_| "This audio codec is not supported.".to_string())?;
    let mut words = Vec::new();
    let mut native: Vec<f32> = Vec::new();
    let mut buf16: Vec<f32> = Vec::new();
    let mut offset16 = 0usize; // samples of 16 kHz audio already transcribed
    let mut rate = 0u32;
    let mut decoded: u64 = 0;
    let mut tmp: Vec<f32> = Vec::new();
    let flush = |native: &mut Vec<f32>, buf16: &mut Vec<f32>, rate: u32| -> Result<()> {
        if !native.is_empty() && rate > 0 {
            buf16.extend(crate::studio_audio::resample(native, rate, RATE as u32)?);
            native.clear();
        }
        Ok(())
    };
    let mut run = |buf16: &mut Vec<f32>, offset16: &mut usize, words: &mut Vec<Word>, last: bool| -> Result<()> {
        // Keep 10 s after the last full window so the next cut can find its pause.
        while buf16.len() >= RATE * 40 || (last && !buf16.is_empty()) {
            let windows = split(buf16, 30.0, 10.0);
            let take = if last { windows.len() } else { windows.len().saturating_sub(1).max(1).min(windows.len()) };
            let mut used = 0;
            for &(s, e, silent) in windows.iter().take(take) {
                if !silent && e > s + RATE / 4 {
                    words.extend(model.words(&buf16[s..e], (*offset16 + s) as f64 / RATE as f64)?);
                }
                used = e;
            }
            buf16.drain(..used);
            *offset16 += used;
            if last || used == 0 {
                break;
            }
        }
        Ok(())
    };
    loop {
        if cancelled() {
            return Err("cancelled".into());
        }
        let packet = match format.next_packet() {
            Ok(Some(p)) => p,
            Ok(None) => break,
            Err(Error::IoError(_)) => break,
            Err(e) => return Err(e.to_string()),
        };
        if packet.track_id != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(buf) => {
                rate = buf.spec().rate();
                let ch = buf.spec().channels().count().max(1);
                tmp.resize(buf.samples_interleaved(), 0.0);
                buf.copy_to_slice_interleaved(&mut tmp);
                native.extend(tmp.chunks(ch).map(|f| f.iter().sum::<f32>() / ch as f32));
                decoded += (tmp.len() / ch) as u64;
            }
            Err(Error::DecodeError(_)) => continue,
            Err(e) => return Err(e.to_string()),
        }
        if rate > 0 && native.len() >= rate as usize * 60 {
            flush(&mut native, &mut buf16, rate)?;
            run(&mut buf16, &mut offset16, &mut words, false)?;
            if let Some(t) = total.filter(|t| *t > 0) {
                progress((decoded as f64 / t as f64).min(0.99));
            }
        }
    }
    flush(&mut native, &mut buf16, rate)?;
    run(&mut buf16, &mut offset16, &mut words, true)?;
    progress(1.0);
    Ok((words, offset16 as f64 / RATE as f64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_have_librosa_shape() {
        let f = filters();
        assert_eq!((f.len(), f[0].len()), (128, 257));
        assert!(f.iter().all(|row| row.iter().any(|&w| w > 0.0)));
    }

    #[test]
    fn features_are_normalised() {
        let tone: Vec<f32> = (0..16000).map(|i| (i as f32 * 0.2).sin() * 0.3 + ((i * 7919) % 101) as f32 * 1e-4).collect();
        let (f, t, valid) = Frontend::new().features(&tone);
        assert_eq!((t, valid), (101, 100));
        let row = &f[20 * t..20 * t + valid];
        assert!((row.iter().sum::<f32>() / valid as f32).abs() < 1e-4);
    }

    #[test]
    fn cuts_land_in_the_pause() {
        let mut a: Vec<f32> = (0..70 * RATE).map(|i| (i as f32 * 0.05).sin() * 0.3).collect();
        for v in &mut a[25 * RATE..25 * RATE + RATE / 2] {
            *v = 0.0;
        }
        let w = split(&a, 30.0, 10.0);
        let cut = w[0].1 as f32 / RATE as f32;
        assert!(cut > 25.0 && cut < 25.5, "cut at {cut}");
        assert_eq!(w.last().unwrap().1, a.len());
    }
}
