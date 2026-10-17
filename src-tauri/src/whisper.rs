// Voice note transcription with OpenAI's Whisper (MIT), from the pinned ONNX
// exports in onnx-community, run on the ONNX Runtime already used for
// Related notes and handwriting. Nothing leaves the computer.
//
// Audio arrives as 16 kHz mono samples (the page decodes and resamples the
// recording). It is cut into windows of up to 30 seconds at quiet moments,
// turned into an 80-band log-mel spectrogram the way Whisper expects
// (STFT 400/160 with a periodic Hann window, Slaney mel filters, log10,
// clamped to 8 below the peak, scaled), encoded once per window and decoded
// greedily.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

type Result<T> = std::result::Result<T, String>;

pub struct Spec {
    pub id: &'static str,
    pub name: &'static str,
    repo: &'static str,
    revision: &'static str,
    files: [(&'static str, &'static str, u64, &'static str); 3],
}
pub const MODELS: &[Spec] = &[
    Spec {
        id: "small",
        name: "Whisper small (OpenAI, MIT)",
        repo: "onnx-community/whisper-small",
        revision: "36050c46d777d46dc4b5f43f6d90574fc38f8732",
        files: [
            ("onnx/encoder_model_quantized.onnx", "encoder.onnx", 92326160, "a43a83f3c5361cd591cfa7c36f14b43cf7cb22f47a415cc14a8d557be800fa92"),
            ("onnx/decoder_model_quantized.onnx", "decoder.onnx", 155989346, "0486afa8eb464bf2210d07aca0cb3f5d91d3f2f01cbe47f9f1e6ff9122abaaf6"),
            ("tokenizer.json", "tokenizer.json", 2480466, "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566"),
        ],
    },
    Spec {
        id: "base",
        name: "Whisper base (OpenAI, MIT)",
        repo: "onnx-community/whisper-base",
        revision: "1846881b6b3a3024392c1eea3ad983695bc23925",
        files: [
            ("onnx/encoder_model_quantized.onnx", "encoder.onnx", 23201314, "5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46"),
            ("onnx/decoder_model_quantized.onnx", "decoder.onnx", 53310178, "c859636f4463dd5a9ea752546c6c7badeb48ab3e22b340cafef08a15552fcb2e"),
            ("tokenizer.json", "tokenizer.json", 2480466, "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566"),
        ],
    },
];
const RATE: usize = 16_000;
const WINDOW: usize = 30 * RATE;
const N_FFT: usize = 400;
const HOP: usize = 160;
const MELS: usize = 80;
const FRAMES: usize = 3000;
const MAX_TOKENS: usize = 220;
// Whisper's language codes, in its token order.
const LANGUAGES: &[&str] = &[
    "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl", "ca", "nl", "ar", "sv", "it", "id", "hi", "fi", "vi", "he",
    "uk", "el", "ms", "cs", "ro", "da", "hu", "ta", "no", "th", "ur", "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk", "te", "fa",
    "lv", "bn", "sr", "az", "sl", "kn", "et", "mk", "br", "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw", "gl", "mr", "pa",
    "si", "km", "sn", "yo", "so", "af", "oc", "ka", "be", "tg", "sd", "gu", "am", "yi", "lo", "uz", "fo", "ht", "ps", "tk", "nn",
    "mt", "sa", "lb", "my", "bo", "tl", "mg", "as", "tt", "haw", "ln", "ha", "ba", "jw", "su",
];

fn spec(id: &str) -> Result<&'static Spec> {
    MODELS.iter().find(|m| m.id == id).ok_or_else(|| "Unknown voice note model.".into())
}
fn folder(app: &AppHandle, s: &Spec) -> Result<PathBuf> {
    Ok(crate::data_root(app)?.join("Models").join("whisper").join(s.id))
}
fn installed(dir: &Path, s: &Spec) -> bool {
    std::fs::read_to_string(dir.join("verified.txt"))
        .map(|v| s.files.iter().all(|f| v.contains(f.3)))
        .unwrap_or(false)
}
// A read-only copy shipped with the app, used when none was downloaded.
fn bundled(s: &Spec) -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.join("models").join("whisper").join(s.id);
    installed(&dir, s).then_some(dir)
}
fn source(app: &AppHandle, s: &Spec) -> Result<PathBuf> {
    let own = folder(app, s)?;
    Ok(if installed(&own, s) { own } else { bundled(s).unwrap_or(own) })
}

struct Model {
    id: &'static str,
    encoder: ort::session::Session,
    decoder: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
    sot: i64,
    eot: i64,
    transcribe: i64,
    no_timestamps: i64,
    languages: Vec<(String, i64)>,
}

#[derive(Default)]
pub struct Transcriber {
    model: Mutex<Option<Model>>,
    downloading: Mutex<Option<String>>,
    cancel: AtomicBool,
}

impl Transcriber {
    pub fn status(&self, app: &AppHandle) -> Result<Value> {
        let downloading = self.downloading.lock().map_err(|_| "Busy")?.clone();
        let rows: Vec<Value> = MODELS
            .iter()
            .map(|s| {
                json!({
                    "id": s.id,
                    "name": s.name,
                    "installed": source(app, s).map(|d| installed(&d, s)).unwrap_or(false),
                    "bundled": bundled(s).is_some(),
                    "bytes": s.files.iter().map(|f| f.2).sum::<u64>(),
                    "downloading": downloading.as_deref() == Some(s.id),
                })
            })
            .collect();
        Ok(json!({ "models": rows, "runtime": crate::embed::runtime_available(app) }))
    }
    pub fn cancel_download(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
    pub fn download(&self, app: &AppHandle, id: &str) -> Result<()> {
        let s = spec(id)?;
        {
            let mut d = self.downloading.lock().map_err(|_| "Busy")?;
            if d.is_some() {
                return Err("A voice note model is already downloading.".into());
            }
            *d = Some(s.id.into());
        }
        self.cancel.store(false, Ordering::SeqCst);
        let result = self.fetch(app, s);
        *self.downloading.lock().map_err(|_| "Busy")? = None;
        let _ = app.emit("whisper-download", json!({"id": s.id, "done": true, "ok": result.is_ok()}));
        result
    }
    fn fetch(&self, app: &AppHandle, s: &'static Spec) -> Result<()> {
        let dir = folder(app, s)?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(dir.join("verified.txt"));
        let total: u64 = s.files.iter().map(|f| f.2).sum();
        let mut done = 0u64;
        let mut verified = String::new();
        for (remote, local, size, sha) in s.files {
            let part = dir.join(format!("{local}.part"));
            let url = format!("https://huggingface.co/{}/resolve/{}/{remote}", s.repo, s.revision);
            let response = ureq::get(&url).call().map_err(|e| format!("Download failed: {e}"))?;
            let mut body = response.into_body().into_reader();
            let mut out = std::fs::File::create(&part).map_err(|e| e.to_string())?;
            let mut hash = Sha256::new();
            let mut buf = vec![0u8; 1 << 20];
            let mut got = 0u64;
            let mut last = std::time::Instant::now();
            loop {
                if self.cancel.load(Ordering::SeqCst) {
                    drop(out);
                    let _ = std::fs::remove_file(&part);
                    return Err("Download cancelled.".into());
                }
                let n = body.read(&mut buf).map_err(|e| format!("Download failed: {e}"))?;
                if n == 0 {
                    break;
                }
                out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                hash.update(&buf[..n]);
                got += n as u64;
                if got > size {
                    break;
                }
                if last.elapsed().as_millis() > 250 {
                    last = std::time::Instant::now();
                    let _ = app.emit("whisper-download", json!({"id": s.id, "received": done + got, "total": total}));
                }
            }
            out.flush().map_err(|e| e.to_string())?;
            drop(out);
            let digest: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
            if got != size || digest != sha {
                let _ = std::fs::remove_file(&part);
                return Err("The download did not match the published file. Try again.".into());
            }
            std::fs::rename(&part, dir.join(local)).map_err(|e| e.to_string())?;
            done += got;
            verified.push_str(&format!("{sha} {local}\n"));
        }
        std::fs::write(
            dir.join("LICENSE.txt"),
            "Whisper by OpenAI, MIT License.\nhttps://github.com/openai/whisper/blob/main/LICENSE\nONNX export: https://huggingface.co/onnx-community\n",
        )
        .map_err(|e| e.to_string())?;
        std::fs::write(dir.join("verified.txt"), verified).map_err(|e| e.to_string())
    }
    pub fn remove(&self, app: &AppHandle, id: &str) -> Result<()> {
        let s = spec(id)?;
        if let Ok(mut m) = self.model.lock() {
            if m.as_ref().map(|x| x.id) == Some(s.id) {
                *m = None;
            }
        }
        let dir = folder(app, s)?;
        if dir.exists() {
            let base = crate::data_root(app)?.join("Models").join("whisper").canonicalize().map_err(|e| e.to_string())?;
            let real = dir.canonicalize().map_err(|e| e.to_string())?;
            if real.parent() != Some(base.as_path()) {
                return Err("Model is outside managed storage.".into());
            }
            std::fs::remove_dir_all(real).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Text of a recording: 16 kHz mono samples, a model and a language code
    /// ("" detects it). Returns the text and the language used.
    pub fn transcribe(&self, app: &AppHandle, id: &str, samples: &[f32], language: &str) -> Result<Value> {
        let s = spec(id)?;
        let mut guard = self.model.lock().map_err(|_| "Busy")?;
        if guard.as_ref().map(|m| m.id) != Some(s.id) {
            *guard = None;
            let dir = source(app, s)?;
            if !installed(&dir, s) {
                return Err("Download a voice note model in Settings, Work mode, Voice notes.".into());
            }
            *guard = Some(Model::open(s.id, &dir, crate::embed::runtime_env(app)?)?);
        }
        let model = guard.as_mut().ok_or("Model not loaded")?;
        let windows = split(samples);
        let mut text = Vec::new();
        let mut used = language.to_string();
        for (i, (start, end)) in windows.iter().enumerate() {
            let _ = app.emit("transcribe-progress", json!({"done": i, "total": windows.len()}));
            let piece = &samples[*start..*end];
            if rms(piece) < 0.002 {
                continue; // silence
            }
            let hidden = model.encode(&log_mel(piece))?;
            if used.is_empty() {
                used = model.detect(&hidden)?;
            }
            let part = model.decode(&hidden, &used)?;
            if !part.is_empty() {
                text.push(part);
            }
        }
        let _ = app.emit("transcribe-progress", json!({"done": windows.len(), "total": windows.len()}));
        Ok(json!({ "text": text.join(" "), "language": used }))
    }
}

fn rms(x: &[f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
}

/// Windows of at most 30 seconds, cut at the quietest moment of the last
/// four seconds of each window so words are not split.
fn split(samples: &[f32]) -> Vec<(usize, usize)> {
    let mut out = vec![];
    let mut start = 0;
    while start < samples.len() {
        if samples.len() - start <= WINDOW {
            out.push((start, samples.len()));
            break;
        }
        let search = start + WINDOW - 4 * RATE;
        let step = RATE / 10;
        let mut best = (f32::MAX, start + WINDOW);
        let mut at = search;
        while at + step <= start + WINDOW {
            let e = rms(&samples[at..at + step]);
            if e < best.0 {
                best = (e, at + step / 2);
            }
            at += step;
        }
        out.push((start, best.1));
        start = best.1;
    }
    out
}

// --- Log-mel spectrogram --------------------------------------------------------------
fn hz_to_mel(f: f64) -> f64 {
    let (f_sp, min_log_hz) = (200.0 / 3.0, 1000.0);
    let min_log_mel = min_log_hz / f_sp;
    let logstep = 6.4f64.ln() / 27.0;
    if f >= min_log_hz { min_log_mel + (f / min_log_hz).ln() / logstep } else { f / f_sp }
}
fn mel_to_hz(m: f64) -> f64 {
    let (f_sp, min_log_hz) = (200.0 / 3.0, 1000.0);
    let min_log_mel = min_log_hz / f_sp;
    let logstep = 6.4f64.ln() / 27.0;
    if m >= min_log_mel { min_log_hz * (logstep * (m - min_log_mel)).exp() } else { f_sp * m }
}
/// librosa.filters.mel(sr=16000, n_fft=400, n_mels=80), Slaney scale and norm.
fn mel_filters() -> Vec<Vec<f32>> {
    let bins = N_FFT / 2 + 1;
    let fft: Vec<f64> = (0..bins).map(|i| i as f64 * (RATE as f64 / 2.0) / (bins - 1) as f64).collect();
    let (lo, hi) = (hz_to_mel(0.0), hz_to_mel(RATE as f64 / 2.0));
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
/// [80 x 3000] features for up to 30 seconds of audio (zero padded).
pub fn log_mel(samples: &[f32]) -> Vec<f32> {
    let mut audio = vec![0f32; WINDOW];
    let n = samples.len().min(WINDOW);
    audio[..n].copy_from_slice(&samples[..n]);
    // Reflect padding of N_FFT / 2 on both sides (torch.stft center=True).
    let pad = N_FFT / 2;
    let mut padded = Vec::with_capacity(WINDOW + 2 * pad);
    padded.extend((1..=pad).rev().map(|i| audio[i]));
    padded.extend_from_slice(&audio);
    padded.extend((1..=pad).map(|i| audio[WINDOW - 1 - i]));
    let window: Vec<f32> = (0..N_FFT).map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / N_FFT as f32).cos()).collect();
    let bins = N_FFT / 2 + 1;
    let (cos, sin): (Vec<f32>, Vec<f32>) = (0..bins * N_FFT)
        .map(|k| {
            let (b, t) = (k / N_FFT, k % N_FFT);
            let a = -2.0 * std::f64::consts::PI * (b * t) as f64 / N_FFT as f64;
            (a.cos() as f32, a.sin() as f32)
        })
        .unzip();
    let filters = mel_filters();
    let mut mel = vec![0f32; MELS * FRAMES];
    let mut frame = vec![0f32; N_FFT];
    let mut power = vec![0f32; bins];
    for f in 0..FRAMES {
        let at = f * HOP;
        for t in 0..N_FFT {
            frame[t] = padded[at + t] * window[t];
        }
        for b in 0..bins {
            let (c, s) = (&cos[b * N_FFT..(b + 1) * N_FFT], &sin[b * N_FFT..(b + 1) * N_FFT]);
            let (mut re, mut im) = (0f32, 0f32);
            for t in 0..N_FFT {
                re += frame[t] * c[t];
                im += frame[t] * s[t];
            }
            power[b] = re * re + im * im;
        }
        for (m, filter) in filters.iter().enumerate() {
            let v: f32 = filter.iter().zip(&power).map(|(w, p)| w * p).sum();
            mel[m * FRAMES + f] = v.max(1e-10).log10();
        }
    }
    let peak = mel.iter().cloned().fold(f32::MIN, f32::max);
    for v in mel.iter_mut() {
        *v = (v.max(peak - 8.0) + 4.0) / 4.0;
    }
    mel
}

impl Model {
    fn open(id: &'static str, dir: &Path, env: &ort::environment::Environment) -> Result<Self> {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
        let session = |file: &str| -> Result<ort::session::Session> {
            ort::session::Session::builder(env)
                .map_err(|e| e.to_string())?
                .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)
                .map_err(|e| e.to_string())?
                .with_intra_threads((threads / 2).clamp(1, 6))
                .map_err(|e| e.to_string())?
                .commit_from_file(dir.join(file))
                .map_err(|e| e.to_string())
        };
        let tokenizer = tokenizers::Tokenizer::from_file(dir.join("tokenizer.json")).map_err(|e| e.to_string())?;
        let id_of = |t: &str| tokenizer.token_to_id(t).map(|v| v as i64).ok_or_else(|| format!("Missing token {t}"));
        let languages = LANGUAGES
            .iter()
            .filter_map(|code| tokenizer.token_to_id(&format!("<|{code}|>")).map(|v| (code.to_string(), v as i64)))
            .collect();
        Ok(Model {
            id,
            sot: id_of("<|startoftranscript|>")?,
            eot: id_of("<|endoftext|>")?,
            transcribe: id_of("<|transcribe|>")?,
            no_timestamps: id_of("<|notimestamps|>")?,
            languages,
            encoder: session("encoder.onnx")?,
            decoder: session("decoder.onnx")?,
            tokenizer,
        })
    }
    fn encode(&mut self, mel: &[f32]) -> Result<(Vec<usize>, Vec<f32>)> {
        let input = ort::value::Tensor::from_array(([1usize, MELS, FRAMES], mel.to_vec())).map_err(|e| e.to_string())?;
        let name = self.encoder.inputs()[0].name().to_string();
        let out = self.encoder.run(ort::inputs![name.as_str() => input]).map_err(|e| e.to_string())?;
        let (dims, hidden) = out[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        Ok((dims.iter().map(|&d| d as usize).collect(), hidden.to_vec()))
    }
    fn logits(&mut self, hidden: &(Vec<usize>, Vec<f32>), ids: &[i64]) -> Result<Vec<f32>> {
        let names: Vec<String> = self.decoder.inputs().iter().map(|i| i.name().to_string()).collect();
        let ids_name = names.iter().find(|n| n.contains("input_ids")).cloned().ok_or("Unexpected model")?;
        let hidden_name = names.iter().find(|n| n.contains("encoder_hidden_states")).cloned().ok_or("Unexpected model")?;
        let tokens = ort::value::Tensor::from_array(([1usize, ids.len()], ids.to_vec())).map_err(|e| e.to_string())?;
        let states = ort::value::Tensor::from_array((hidden.0.clone(), hidden.1.clone())).map_err(|e| e.to_string())?;
        let out = self
            .decoder
            .run(ort::inputs![ids_name.as_str() => tokens, hidden_name.as_str() => states])
            .map_err(|e| e.to_string())?;
        let (shape, logits) = out[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        let vocab = *shape.last().ok_or("Bad output")? as usize;
        Ok(logits[(ids.len() - 1) * vocab..ids.len() * vocab].to_vec())
    }
    /// The most likely spoken language, from the first decoding step.
    fn detect(&mut self, hidden: &(Vec<usize>, Vec<f32>)) -> Result<String> {
        let row = self.logits(hidden, &[self.sot])?;
        Ok(self
            .languages
            .iter()
            .max_by(|a, b| row[a.1 as usize].total_cmp(&row[b.1 as usize]))
            .map(|l| l.0.clone())
            .unwrap_or_else(|| "en".into()))
    }
    fn decode(&mut self, hidden: &(Vec<usize>, Vec<f32>), language: &str) -> Result<String> {
        let lang = self.languages.iter().find(|l| l.0 == language).map(|l| l.1).ok_or("Unsupported language")?;
        let prompt = [self.sot, lang, self.transcribe, self.no_timestamps];
        let mut ids = prompt.to_vec();
        while ids.len() < prompt.len() + MAX_TOKENS {
            let mut row = self.logits(hidden, &ids)?;
            // Only text tokens and the end: everything after <|endoftext|>
            // is a special token; the end is not allowed as the first token.
            for (i, v) in row.iter_mut().enumerate() {
                if i as i64 > self.eot || (i as i64 == self.eot && ids.len() == prompt.len()) {
                    *v = f32::NEG_INFINITY;
                }
            }
            let next = row.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1)).map(|(i, _)| i as i64).ok_or("Bad output")?;
            if next == self.eot {
                break;
            }
            ids.push(next);
            // A stuck loop repeats the same few tokens: stop.
            let n = ids.len() - prompt.len();
            if n >= 24 && ids[ids.len() - 12..] == ids[ids.len() - 24..ids.len() - 12] {
                ids.truncate(ids.len() - 12);
                break;
            }
        }
        let text: Vec<u32> = ids[prompt.len()..].iter().map(|&t| t as u32).collect();
        Ok(self.tokenizer.decode(&text, true).map_err(|e| e.to_string())?.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mel_filters_match_librosa() {
        let f = mel_filters();
        assert_eq!((f.len(), f[0].len()), (80, 201));
        // Every filter has some weight and the triangles cover the range.
        assert!(f.iter().all(|row| row.iter().any(|&w| w > 0.0)));
        // Reference values from librosa.filters.mel(sr=16000, n_fft=400, n_mels=80).
        assert!((f[1][2] - 0.022871772).abs() < 1e-6, "{}", f[1][2]);
        let peak = f[40].iter().cloned().enumerate().max_by(|a, b| a.1.total_cmp(&b.1)).unwrap();
        assert_eq!(peak.0, 43);
        assert!((peak.1 - 0.014735566).abs() < 1e-6, "{}", peak.1);
    }

    #[test]
    fn silence_and_a_tone_give_whisper_shaped_features() {
        let tone: Vec<f32> = (0..RATE * 2).map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / RATE as f32).sin() * 0.5).collect();
        let mel = log_mel(&tone);
        assert_eq!(mel.len(), MELS * FRAMES);
        let peak = mel.iter().cloned().fold(f32::MIN, f32::max);
        let low = mel.iter().cloned().fold(f32::MAX, f32::min);
        assert!((peak - low - 2.0).abs() < 1e-3, "range {}", peak - low); // clamped to 8 log10 units / 4
        // The 440 Hz band is louder than the top band during the tone.
        let band = |m: usize| mel[m * FRAMES + 50];
        assert!(band(10) > band(79));
    }

    /// Real model on WAV files (16-bit mono): ORIGAMI_TEST_WHISPER_DIR (a
    /// folder with encoder.onnx, decoder.onnx and tokenizer.json),
    /// ORT_DYLIB_PATH and ORIGAMI_TEST_WHISPER_WAVS (paths separated by ;).
    #[test]
    #[ignore]
    fn whisper_transcribes_wav_files() {
        let dir = PathBuf::from(std::env::var("ORIGAMI_TEST_WHISPER_DIR").unwrap());
        let env = ort::init_from(std::env::var("ORT_DYLIB_PATH").unwrap()).unwrap().build().unwrap();
        let env: &'static ort::environment::Environment = Box::leak(Box::new(env));
        let mut m = Model::open("test", &dir, env).unwrap();
        for wav in std::env::var("ORIGAMI_TEST_WHISPER_WAVS").unwrap().split(';') {
            let bytes = std::fs::read(wav).unwrap();
            let rate = u32::from_le_bytes(bytes[24..28].try_into().unwrap()) as usize;
            let data = bytes.windows(4).position(|w| w == b"data").unwrap() + 8;
            let pcm: Vec<f32> = bytes[data..].chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0).collect();
            // Simple linear resampling to 16 kHz for the test.
            let n = pcm.len() * RATE / rate;
            let audio: Vec<f32> = (0..n).map(|i| {
                let x = i as f64 * rate as f64 / RATE as f64;
                let (j, f) = (x as usize, (x - x.floor()) as f32);
                pcm[j.min(pcm.len() - 1)] * (1.0 - f) + pcm[(j + 1).min(pcm.len() - 1)] * f
            }).collect();
            let start = std::time::Instant::now();
            let mut out = vec![];
            let mut lang = String::new();
            for (a, b) in split(&audio) {
                let hidden = m.encode(&log_mel(&audio[a..b])).unwrap();
                if lang.is_empty() { lang = m.detect(&hidden).unwrap(); }
                out.push(m.decode(&hidden, &lang).unwrap());
            }
            println!("WHISPER {wav} [{lang}] {:.1}s audio in {:.1}s: {}", audio.len() as f32 / RATE as f32, start.elapsed().as_secs_f32(), out.join(" "));
        }
    }

    #[test]
    fn long_audio_is_cut_into_windows_at_quiet_moments() {
        let mut audio = vec![0.3f32; 70 * RATE];
        for v in &mut audio[(28 * RATE)..(28 * RATE + RATE / 5)] {
            *v = 0.0;
        }
        let w = split(&audio);
        assert_eq!(w.first().unwrap().0, 0);
        assert_eq!(w.last().unwrap().1, audio.len());
        assert!(w.iter().all(|(a, b)| b - a <= WINDOW));
        assert!((w[0].1 as i64 - (28 * RATE + RATE / 10) as i64).abs() <= (RATE / 10) as i64, "cut at {}", w[0].1);
    }
}
