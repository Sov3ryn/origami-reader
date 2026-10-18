// Studio, phase 3: "Verify a file". Decodes an audio file (MP3, M4A/M4B, WAV,
// FLAC), looks for the AudioSeal watermark on the 16 kHz band with a search
// over the 20 ms grid (encoders shift audio by a few milliseconds), and reads
// the AI labels from its tags. The 16 bits found are matched against the
// exports this computer made. Rule from phase 0: detected when the share of
// watermarked frames is above 0.5 and the bit confidence above 0.2.
use serde_json::{json, Value};
use std::path::Path;

pub type Result<T> = std::result::Result<T, String>;

/// Any supported audio file as mono samples and its sample rate.
pub fn decode_any(path: &Path) -> Result<(Vec<f32>, u32)> {
    decode_range(path, 0.0, 1200.0)
}

/// Up to `seconds` of mono audio from `start` (seconds) on, seeking in compressed
/// files so a moment hours into an audiobook is read at once.
pub fn decode_range(path: &Path, start: f64, seconds: f64) -> Result<(Vec<f32>, u32)> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext == "flac" || ext == "wav" {
        let (x, rate) = crate::studio_audio::decode(path)?;
        let a = ((start.max(0.0) * rate as f64) as usize).min(x.len());
        let b = (a + (seconds * rate as f64) as usize).min(x.len());
        return Ok((x[a..b].to_vec(), rate));
    }
    use symphonia::core::codecs::audio::AudioDecoderOptions;
    use symphonia::core::errors::Error;
    use symphonia::core::formats::probe::Hint;
    use symphonia::core::formats::{FormatOptions, TrackType};
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    let file = Box::new(std::fs::File::open(path).map_err(|e| e.to_string())?);
    let mss = MediaSourceStream::new(file, Default::default());
    let mut hint = Hint::new();
    hint.with_extension(&ext);
    let mut format = symphonia::default::get_probe()
        .probe(&hint, mss, FormatOptions::default(), MetadataOptions::default())
        .map_err(|_| "This file is not an audio format Origami can read.".to_string())?;
    let (track_id, params) = {
        let track = format.default_track(TrackType::Audio).ok_or("This file has no audio.")?;
        let params = track.codec_params.as_ref().and_then(|p| p.audio()).ok_or("This file has no audio.")?.clone();
        (track.id, params)
    };
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(&params, &AudioDecoderOptions::default())
        .map_err(|_| "This audio codec is not supported.".to_string())?;
    if start > 0.0 {
        use symphonia::core::formats::{SeekMode, SeekTo};
        let time = symphonia::core::units::Time::try_from_secs_f64(start).ok_or("Invalid time.")?;
        format.seek(SeekMode::Accurate, SeekTo::Time { time, track_id: Some(track_id) }).map_err(|_| "This file cannot be read at that point.".to_string())?;
        decoder.reset();
    }
    let (mut out, mut rate, mut tmp) = (Vec::<f32>::new(), 0u32, Vec::<f32>::new());
    while let Some(packet) = format.next_packet().map_err(|e| e.to_string())? {
        if packet.track_id != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(buf) => {
                rate = buf.spec().rate();
                let ch = buf.spec().channels().count().max(1);
                tmp.resize(buf.samples_interleaved(), 0.0);
                buf.copy_to_slice_interleaved(&mut tmp);
                out.extend(tmp.chunks(ch).map(|f| f.iter().sum::<f32>() / ch as f32));
                if rate > 0 && out.len() as f64 >= rate as f64 * seconds {
                    out.truncate((rate as f64 * seconds) as usize);
                    break;
                }
            }
            Err(Error::DecodeError(_)) => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    if out.is_empty() {
        return Err("This file has no audio.".into());
    }
    Ok((out, rate))
}

pub struct Detector {
    session: ort::session::Session,
}

pub struct Found {
    pub probability: f64,
    pub confidence: f64,
    pub message: u16,
    pub offset: usize,
}

impl Detector {
    pub fn open(dir: &Path, env: &ort::environment::Environment) -> Result<Self> {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
        let session = ort::session::Session::builder(env)
            .map_err(|e| e.to_string())?
            .with_intra_threads((threads / 2).clamp(1, 8))
            .map_err(|e| e.to_string())?
            .commit_from_file(dir.join("audioseal_detector_5s.onnx"))
            .map_err(|e| e.to_string())?;
        Ok(Self { session })
    }

    /// Share of watermarked samples and the 16 bit probabilities, over 5 s windows.
    fn score(&mut self, x16: &[f32]) -> Result<(f64, [f64; 16])> {
        const WIN: usize = 80_000;
        let name = self.session.inputs()[0].name().to_string();
        let (mut pos, mut tot, mut acc, mut wsum) = (0usize, 0usize, [0f64; 16], 0usize);
        for seg in x16.chunks(WIN) {
            if seg.len() < 8_000 {
                break;
            }
            let n = seg.len();
            let mut win = seg.to_vec();
            win.resize(WIN, 0.0);
            let input = ort::value::Tensor::from_array(([1usize, 1, WIN], win)).map_err(|e| e.to_string())?;
            let out = self.session.run(ort::inputs![name.as_str() => input]).map_err(|e| e.to_string())?;
            let (_, p) = out[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            let (_, b) = out[1].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            // p is [1, 2, WIN]: the second row is the watermark probability per sample.
            pos += p[WIN..WIN + n].iter().filter(|v| **v > 0.5).count();
            tot += n;
            for (a, v) in acc.iter_mut().zip(b.iter()) {
                *a += *v as f64 * n as f64;
            }
            wsum += n;
        }
        if tot == 0 {
            return Ok((0.0, [0.5; 16]));
        }
        let bits = acc.map(|a| a / wsum as f64);
        Ok((pos as f64 / tot as f64, bits))
    }

    /// Searches the 20 ms grid on the first minute, then reads the whole sample at the best offset.
    pub fn find(&mut self, x16: &[f32]) -> Result<Found> {
        let probe = &x16[..x16.len().min(16_000 * 60)];
        let mut best = (0.0f64, 0.0f64, 0usize);
        for offset in (0..320).step_by(8) {
            if offset >= probe.len() {
                break;
            }
            let (p, bits) = self.score(&probe[offset..])?;
            let conf = bits.iter().map(|b| (b - 0.5).abs() * 2.0).sum::<f64>() / 16.0;
            if (conf, p) > (best.1, best.0) {
                best = (p, conf, offset);
            }
        }
        let sample = &x16[best.2..x16.len().min(best.2 + 16_000 * 300)];
        let (p, bits) = self.score(sample)?;
        let confidence = bits.iter().map(|b| (b - 0.5).abs() * 2.0).sum::<f64>() / 16.0;
        let message = bits.iter().fold(0u16, |m, b| (m << 1) | u16::from(*b > 0.5));
        Ok(Found { probability: p, confidence, message, offset: best.2 })
    }
}

/// The AI labels in a file's tags (M4B/M4A through mp4ameta, MP3 through id3).
pub fn labels(path: &Path) -> Value {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mut out = serde_json::Map::new();
    if matches!(ext.as_str(), "m4b" | "m4a" | "mp4") {
        if let Ok(tag) = mp4ameta::Tag::read_from_path(path) {
            for name in ["ORIGAMI_EXPORT_ID", "AI_DISCLOSURE", "DIGITAL_SOURCE_TYPE", "NARRATOR"] {
                let id = mp4ameta::FreeformIdent::new_static("com.apple.iTunes", name);
                let value = tag.strings_of(&id).next().map(str::to_string);
                if let Some(v) = value {
                    out.insert(name.to_string(), json!(v));
                }
            }
            if let Some(e) = tag.encoder() {
                out.insert("encoder".into(), json!(e));
            }
        }
    } else if ext == "mp3" {
        if let Ok(tag) = id3::Tag::read_from_path(path) {
            for x in tag.extended_texts() {
                out.insert(x.description.clone(), json!(x.value));
            }
            if let Some(e) = id3::TagLike::get(&tag, "TSSE").and_then(|f| f.content().text()) {
                out.insert("encoder".into(), json!(e));
            }
        }
    } else if ext == "wav" {
        for (id, value) in wav_info(path) {
            match id.as_str() {
                "ICMT" => out.insert("AI_DISCLOSURE".into(), json!(value)),
                "ISFT" => out.insert("encoder".into(), json!(value)),
                _ => None,
            };
        }
    }
    Value::Object(out)
}

/// The text fields of a WAV file's LIST INFO chunk, found by walking the chunk headers.
fn wav_info(path: &Path) -> Vec<(String, String)> {
    use std::io::{Read, Seek, SeekFrom};
    let mut out = Vec::new();
    let Ok(mut f) = std::fs::File::open(path) else { return out };
    let mut head = [0u8; 12];
    if f.read_exact(&mut head).is_err() || &head[0..4] != b"RIFF" || &head[8..12] != b"WAVE" {
        return out;
    }
    let mut chunk = [0u8; 8];
    while f.read_exact(&mut chunk).is_ok() {
        let size = u32::from_le_bytes(chunk[4..8].try_into().unwrap()) as u64;
        if &chunk[0..4] == b"LIST" && size < 1 << 20 {
            let mut body = vec![0u8; size as usize];
            if f.read_exact(&mut body).is_err() || &body[0..4.min(body.len())] != b"INFO" {
                break;
            }
            let mut i = 4;
            while i + 8 <= body.len() {
                let id = String::from_utf8_lossy(&body[i..i + 4]).to_string();
                let n = u32::from_le_bytes(body[i + 4..i + 8].try_into().unwrap()) as usize;
                let end = (i + 8 + n).min(body.len());
                let text = String::from_utf8_lossy(&body[i + 8..end]).trim_end_matches('\0').to_string();
                out.push((id, text));
                i = end + (n % 2);
            }
            break;
        }
        if f.seek(SeekFrom::Current((size + size % 2) as i64)).is_err() {
            break;
        }
    }
    out
}
