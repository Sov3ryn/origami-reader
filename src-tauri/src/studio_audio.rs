// Studio audiobook export: joins the chosen takes of each chapter with the
// same pauses as the review player, masters them to audiobook-store levels,
// adds the AudioSeal watermark, and writes a chaptered M4B (AAC) or one MP3
// per chapter with Windows' own encoders. Tags carry the AI disclosure.
// Ported from the phase 0 experiments (docs/STUDIO-PHASE0.md, sections 7, 8).
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};

pub type Result<T> = std::result::Result<T, String>;

pub const MASTER_RATE: u32 = 44_100;
pub const DIGITAL_SOURCE_TYPE: &str = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";
pub const AI_DISCLOSURE: &str = "Narrated by AI-generated digital voices";
pub const ENCODER: &str = "Origami Studio";

// --- Decoding and resampling ------------------------------------------------------------

/// A take as mono samples: FLAC (claxon) or 16-bit WAV (hound).
pub fn decode(path: &Path) -> Result<(Vec<f32>, u32)> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext == "flac" {
        let mut r = claxon::FlacReader::open(path).map_err(|e| e.to_string())?;
        let info = r.streaminfo();
        let scale = 1.0 / (1i64 << (info.bits_per_sample - 1)) as f32;
        let ch = info.channels as usize;
        let mut out = Vec::with_capacity(info.samples.unwrap_or(0) as usize);
        for (i, s) in r.samples().enumerate() {
            let s = s.map_err(|e| e.to_string())?;
            if i % ch == 0 {
                out.push(s as f32 * scale);
            }
        }
        return Ok((out, info.sample_rate));
    }
    let mut r = hound::WavReader::open(path).map_err(|e| e.to_string())?;
    let spec = r.spec();
    let ch = spec.channels as usize;
    let out: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => r.samples::<f32>().step_by(ch).filter_map(|s| s.ok()).collect(),
        hound::SampleFormat::Int => {
            let scale = 1.0 / (1i64 << (spec.bits_per_sample - 1)) as f32;
            r.samples::<i32>().step_by(ch).filter_map(|s| s.ok()).map(|s| s as f32 * scale).collect()
        }
    };
    Ok((out, spec.sample_rate))
}

/// Fixed-ratio FFT resampling of a mono signal (rubato).
pub fn resample(x: &[f32], from: u32, to: u32) -> Result<Vec<f32>> {
    use rubato::audioadapter_buffers::direct::InterleavedSlice;
    use rubato::{Fft, FixedSync, Resampler};
    if from == to || x.is_empty() {
        return Ok(x.to_vec());
    }
    let mut r = Fft::<f32>::new(from as usize, to as usize, 1024, 1, FixedSync::Input).map_err(|e| e.to_string())?;
    let input = InterleavedSlice::new(x, 1, x.len()).map_err(|e| e.to_string())?;
    let out = r.process_all(&input, x.len(), None).map_err(|e| e.to_string())?;
    let expected = ((x.len() as f64) * to as f64 / from as f64).round() as usize;
    let mut v = out.take_data();
    v.truncate(expected);
    v.resize(expected, 0.0);
    Ok(v)
}

// --- Levels and mastering -----------------------------------------------------------------

pub fn db(v: f64) -> f64 {
    if v <= 0.0 {
        f64::NEG_INFINITY
    } else {
        20.0 * v.log10()
    }
}
pub fn rms_db(x: &[f32]) -> f64 {
    let s: f64 = x.iter().map(|v| (*v as f64) * (*v as f64)).sum();
    db((s / x.len().max(1) as f64).sqrt())
}
pub fn peak_db(x: &[f32]) -> f64 {
    db(x.iter().fold(0.0f32, |m, v| m.max(v.abs())) as f64)
}

/// RMS of the quietest 500 ms window: (any window, non-silent window, its start).
pub fn noise_floor(x: &[f32], sr: u32) -> (f64, f64, usize) {
    let w = (sr as usize) / 2;
    let hop = (sr as usize) / 20;
    if x.len() < w {
        let v = rms_db(x);
        return (v, v, 0);
    }
    let mut pre = vec![0.0f64; x.len() + 1];
    for (i, v) in x.iter().enumerate() {
        pre[i + 1] = pre[i] + (*v as f64) * (*v as f64);
    }
    let (mut min_any, mut min_nz, mut at, mut i) = (f64::INFINITY, f64::INFINITY, 0usize, 0usize);
    while i + w <= x.len() {
        let e = (pre[i + w] - pre[i]) / w as f64;
        min_any = min_any.min(e);
        if e > 1e-14 && e < min_nz {
            min_nz = e;
            at = i;
        }
        i += hop;
    }
    (db(min_any.sqrt()), db(min_nz.sqrt()), at)
}

/// Audiobook-store values (ACX): RMS -23 to -18 dB, peak at most -3 dB, floor at most -60 dB.
pub fn levels(x: &[f32], sr: u32) -> Value {
    let (rms, peak, (floor, _, _)) = (rms_db(x), peak_db(x), noise_floor(x, sr));
    let r = |v: f64| if v.is_finite() { json!((v * 10.0).round() / 10.0) } else { json!(-120.0) };
    let pass = (-23.0..=-18.0).contains(&rms) && peak <= -3.0 && floor <= -60.0;
    json!({ "rms": r(rms), "peak": r(peak), "floor": r(floor), "seconds": (x.len() as f64 / sr as f64).round(), "pass": pass })
}

fn sliding_min(g: &[f32], half: usize) -> Vec<f32> {
    let n = g.len();
    let mut out = vec![1.0f32; n];
    let mut dq: VecDeque<usize> = VecDeque::new();
    let mut next = 0usize;
    for i in 0..n {
        let hi = (i + half).min(n - 1);
        while next <= hi {
            while dq.back().is_some_and(|&b| g[b] >= g[next]) {
                dq.pop_back();
            }
            dq.push_back(next);
            next += 1;
        }
        let lo = i.saturating_sub(half);
        while dq.front().is_some_and(|&f| f < lo) {
            dq.pop_front();
        }
        out[i] = g[*dq.front().unwrap()];
    }
    out
}

fn box_average(m: &[f32], half: usize) -> Vec<f32> {
    let n = m.len();
    let mut pre = vec![0.0f64; n + 1];
    for i in 0..n {
        pre[i + 1] = pre[i] + m[i] as f64;
    }
    (0..n)
        .map(|i| {
            let lo = i.saturating_sub(half);
            let hi = (i + half + 1).min(n);
            ((pre[hi] - pre[lo]) / (hi - lo) as f64) as f32
        })
        .collect()
}

/// Look-ahead peak limiter (offline): the gain reaches its target before each
/// peak and recovers with an exponential release.
pub fn limit(x: &mut [f32], sr: u32, ceiling_db: f64) {
    if x.is_empty() {
        return;
    }
    let ceiling = 10f64.powf(ceiling_db / 20.0) as f32;
    let l = ((0.005) * sr as f64).round().max(2.0) as usize;
    let g: Vec<f32> = x.iter().map(|v| if v.abs() > ceiling { ceiling / v.abs() } else { 1.0 }).collect();
    let avg = box_average(&sliding_min(&g, l), l / 2);
    let coef = (-1.0 / (0.08 * sr as f64)).exp() as f32;
    let mut env = 1.0f32;
    for i in 0..x.len() {
        let t = avg[i];
        env = if t < env { t } else { t + (env - t) * coef };
        x[i] *= env;
        if x[i].abs() > ceiling {
            x[i] = ceiling * x[i].signum();
        }
    }
}

/// One-pole DC blocker (about 20 Hz).
fn dc_block(x: &mut [f32], sr: u32) {
    let r = (1.0 - (2.0 * std::f64::consts::PI * 20.0 / sr as f64)) as f32;
    let (mut px, mut py) = (0.0f32, 0.0f32);
    for v in x.iter_mut() {
        let y = *v - px + r * py;
        px = *v;
        py = y;
        *v = y;
    }
}

struct Lcg(u64);
impl Lcg {
    fn next_f32(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((self.0 >> 40) as f32 / (1u64 << 24) as f32) - 0.5
    }
}

/// Low-passed noise at a given RMS: room tone under near-silent speech.
fn noise_bed(n: usize, db_rms: f64, seed: u64) -> Vec<f32> {
    let mut rng = Lcg(seed);
    let std = ((1.0 / 12.0) * 0.15f64 * 0.15 / (1.0 - 0.85 * 0.85)).sqrt();
    let amp = (10f64.powf(db_rms / 20.0) / std) as f32;
    let mut lp = 0.0f32;
    (0..n)
        .map(|_| {
            lp = 0.85 * lp + 0.15 * rng.next_f32();
            lp * amp
        })
        .collect()
}

pub const TARGET_RMS_DB: f64 = -20.0;
pub const CEILING_DB: f64 = -3.5;

/// Masters one chapter: gain to the target RMS (with the head and tail counted),
/// peak limiting, a room-tone bed when the gaps are digital silence, and 1 s of
/// room tone at the start and 2 s at the end.
pub fn master(input: &[f32], sr: u32, seed: u64) -> Vec<f32> {
    let mut base = input.to_vec();
    if base.is_empty() {
        return base;
    }
    dc_block(&mut base, sr);
    let (n_head, n_tail) = (sr as usize, 2 * sr as usize);
    let dilution = 10.0 * (((base.len() + n_head + n_tail) as f64) / base.len() as f64).log10();
    let target = TARGET_RMS_DB + dilution;
    let mut gain_db = target - rms_db(&base);
    let mut y = Vec::new();
    for _ in 0..8 {
        let g = 10f64.powf(gain_db / 20.0) as f32;
        y = base.iter().map(|v| v * g).collect::<Vec<f32>>();
        limit(&mut y, sr, CEILING_DB);
        let err = target - rms_db(&y);
        if err.abs() < 0.03 {
            break;
        }
        gain_db += err;
    }
    let (_, floor_db, at) = noise_floor(&y, sr);
    let w = (sr as usize) / 2;
    let (head, tail);
    if !floor_db.is_finite() || floor_db < -78.0 {
        let bed = noise_bed(y.len(), -72.0, seed);
        for (v, b) in y.iter_mut().zip(bed.iter()) {
            *v += *b;
        }
        limit(&mut y, sr, CEILING_DB);
        head = noise_bed(n_head, -72.0, seed ^ 0x1111);
        tail = noise_bed(n_tail, -72.0, seed ^ 0x2222);
    } else {
        let seg = y[at..(at + w).min(y.len())].to_vec();
        let lp = |n: usize| {
            let mut out = Vec::with_capacity(n + seg.len());
            let mut fwd = true;
            while out.len() < n {
                if fwd {
                    out.extend_from_slice(&seg);
                } else {
                    out.extend(seg.iter().rev());
                }
                fwd = !fwd;
            }
            out.truncate(n);
            out
        };
        head = lp(n_head);
        tail = lp(n_tail);
    }
    let mut audio = Vec::with_capacity(head.len() + y.len() + tail.len());
    audio.extend_from_slice(&head);
    audio.extend_from_slice(&y);
    audio.extend_from_slice(&tail);
    audio
}

/// TPDF dither to 16-bit.
pub fn to_i16(x: &[f32], seed: u64) -> Vec<i16> {
    let mut rng = Lcg(seed);
    x.iter()
        .map(|v| {
            let d = rng.next_f32() + rng.next_f32();
            ((*v as f64 * 32767.0 + d as f64).round()).clamp(-32768.0, 32767.0) as i16
        })
        .collect()
}

// --- Watermark ------------------------------------------------------------------------------

/// AudioSeal (MIT code and weights) in its 5-second ONNX form: 16 bits of the
/// export id, computed on the 16 kHz band and added back to the master.
pub struct Watermark {
    session: ort::session::Session,
}

impl Watermark {
    pub fn open(dir: &Path, env: &ort::environment::Environment) -> Result<Self> {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
        let session = ort::session::Session::builder(env)
            .map_err(|e| e.to_string())?
            .with_intra_threads((threads / 2).clamp(1, 8))
            .map_err(|e| e.to_string())?
            .commit_from_file(dir.join("audioseal_generator_5s.onnx"))
            .map_err(|e| e.to_string())?;
        Ok(Self { session })
    }

    /// The watermark signal for 16 kHz audio, in 4 s windows with 0.5 s of context each side.
    fn signal16(&mut self, x16: &[f32], message: u16) -> Result<Vec<f32>> {
        const WIN: usize = 80_000;
        const CORE: usize = 64_000;
        const CTX: usize = 8_000;
        let bits: Vec<i64> = (0..16).map(|i| ((message >> (15 - i)) & 1) as i64).collect();
        let names: Vec<String> = self.session.inputs().iter().map(|i| i.name().to_string()).collect();
        let mut padded = vec![0.0f32; CTX];
        padded.extend_from_slice(x16);
        padded.extend(std::iter::repeat_n(0.0, WIN));
        let mut out = vec![0.0f32; x16.len()];
        let mut s = 0;
        while s < x16.len() {
            let win = padded[s..s + WIN].to_vec();
            let audio = ort::value::Tensor::from_array(([1usize, 1, WIN], win)).map_err(|e| e.to_string())?;
            let msg = ort::value::Tensor::from_array(([1usize, 16], bits.clone())).map_err(|e| e.to_string())?;
            let result = self
                .session
                .run(ort::inputs![names[0].as_str() => audio, names[1].as_str() => msg])
                .map_err(|e| e.to_string())?;
            let (_, wm) = result[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            let e = (s + CORE).min(x16.len());
            out[s..e].copy_from_slice(&wm[CTX..CTX + (e - s)]);
            s += CORE;
        }
        Ok(out)
    }

    /// Adds the watermark to audio at any sample rate; content above 8 kHz is untouched.
    pub fn apply(&mut self, x: &mut [f32], sr: u32, message: u16) -> Result<()> {
        let x16 = resample(x, sr, 16_000)?;
        let wm16 = self.signal16(&x16, message)?;
        let wm = resample(&wm16, 16_000, sr)?;
        for (v, w) in x.iter_mut().zip(wm.iter()) {
            *v += *w;
        }
        Ok(())
    }
}

// --- Covers and tags --------------------------------------------------------------------------

/// A square 2400 px JPEG cover from the book's cover (a data URL or raw image bytes):
/// the cover centred on a background of its own average colour. None without a cover.
pub fn square_cover(bytes: &[u8]) -> Result<Vec<u8>> {
    use image::{imageops, GenericImageView, Rgb, RgbImage};
    let img = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    let size = 2400u32;
    let small = img.thumbnail(32, 32).to_rgb8();
    let n = (small.width() * small.height()).max(1) as u64;
    let sum = small.pixels().fold([0u64; 3], |a, p| [a[0] + p[0] as u64, a[1] + p[1] as u64, a[2] + p[2] as u64]);
    let bg = Rgb([(sum[0] / n) as u8, (sum[1] / n) as u8, (sum[2] / n) as u8]);
    let mut canvas = RgbImage::from_pixel(size, size, bg);
    let scale = (size as f32 / w.max(1) as f32).min(size as f32 / h.max(1) as f32);
    let (nw, nh) = (((w as f32) * scale) as u32, ((h as f32) * scale) as u32);
    let fitted = img.resize_exact(nw.max(1), nh.max(1), imageops::FilterType::Lanczos3).to_rgb8();
    imageops::overlay(&mut canvas, &fitted, ((size - nw) / 2) as i64, ((size - nh) / 2) as i64);
    let mut buf = Vec::new();
    let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 90);
    canvas.write_with_encoder(enc).map_err(|e| e.to_string())?;
    Ok(buf)
}

/// Any image as a JPEG (the ebook cover keeps its own shape).
pub fn jpeg(bytes: &[u8]) -> Result<Vec<u8>> {
    let img = image::load_from_memory(bytes).map_err(|e| e.to_string())?.to_rgb8();
    let mut buf = Vec::new();
    let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 90);
    img.write_with_encoder(enc).map_err(|e| e.to_string())?;
    Ok(buf)
}

pub struct Meta {
    pub title: String,
    pub author: String,
    pub narrator: String,
    pub year: String,
    pub export_id: String,
}

pub struct ChapterMark {
    pub title: String,
    pub start_ms: u64,
}

pub fn tag_m4b(path: &Path, meta: &Meta, chapters: &[ChapterMark], cover: Option<&[u8]>) -> Result<()> {
    use mp4ameta::{Chapter, Data, Fourcc, FreeformIdent, Img, MediaType, WriteConfig};
    use std::time::Duration;
    let mut tag = mp4ameta::Tag::read_from_path(path).map_err(|e| e.to_string())?;
    tag.set_title(meta.title.clone());
    tag.set_artist(meta.author.clone());
    tag.set_album_artist(meta.author.clone());
    tag.set_album(meta.title.clone());
    if !meta.year.is_empty() {
        tag.set_year(meta.year.clone());
    }
    tag.set_genre("Audiobook");
    tag.set_encoder(ENCODER);
    tag.set_media_type(MediaType::AudioBook);
    tag.set_comment(format!("{AI_DISCLOSURE}. Made with Origami Studio."));
    tag.set_data(Fourcc(*b"\xa9nrt"), Data::Utf8(meta.narrator.clone()));
    if let Some(c) = cover {
        tag.set_artwork(Img::jpeg(c.to_vec()));
    }
    let ff = |name: &'static str| FreeformIdent::new_static("com.apple.iTunes", name);
    tag.set_data(ff("DIGITAL_SOURCE_TYPE"), Data::Utf8(DIGITAL_SOURCE_TYPE.into()));
    tag.set_data(ff("AI_DISCLOSURE"), Data::Utf8(AI_DISCLOSURE.into()));
    tag.set_data(ff("ORIGAMI_EXPORT_ID"), Data::Utf8(meta.export_id.clone()));
    tag.set_data(ff("NARRATOR"), Data::Utf8(meta.narrator.clone()));
    let chs: Vec<Chapter> = chapters.iter().map(|c| Chapter::new(Duration::from_millis(c.start_ms), c.title.clone())).collect();
    *tag.chapter_list_mut() = chs.clone();
    *tag.chapter_track_mut() = chs;
    tag.write_with_path(path, &WriteConfig::DEFAULT).map_err(|e| e.to_string())?;
    set_m4b_brand(path)?;
    chpl_to_v1(path)?;
    Ok(())
}

pub fn tag_mp3(path: &Path, meta: &Meta, title: &str, track: u32, total: u32, cover: Option<&[u8]>) -> Result<()> {
    use id3::frame::{Comment, ExtendedText, Picture, PictureType};
    use id3::{TagLike, Version};
    let mut t = id3::Tag::new();
    t.set_title(title);
    t.set_artist(meta.author.clone());
    t.set_album_artist(meta.author.clone());
    t.set_album(meta.title.clone());
    t.set_genre("Audiobook");
    if !meta.year.is_empty() {
        t.set_text("TYER", meta.year.clone());
    }
    t.set_text("TSSE", ENCODER);
    t.set_track(track);
    t.set_total_tracks(total);
    for (d, v) in [("NARRATOR", meta.narrator.as_str()), ("DIGITAL_SOURCE_TYPE", DIGITAL_SOURCE_TYPE), ("AI_DISCLOSURE", AI_DISCLOSURE), ("ORIGAMI_EXPORT_ID", meta.export_id.as_str())] {
        t.add_frame(ExtendedText { description: d.into(), value: v.into() });
    }
    t.add_frame(Comment { lang: "eng".into(), description: "".into(), text: format!("{AI_DISCLOSURE}. Made with Origami Studio.") });
    if let Some(c) = cover {
        t.add_frame(Picture { mime_type: "image/jpeg".into(), picture_type: PictureType::CoverFront, description: "Cover".into(), data: c.to_vec() });
    }
    t.write_to_path(path, Version::Id3v23).map_err(|e| e.to_string())
}

/// The ftyp major brand "M4B " (what audiobook players expect), in place.
fn set_m4b_brand(path: &Path) -> Result<()> {
    use std::io::{Read, Seek, SeekFrom, Write};
    let mut f = std::fs::OpenOptions::new().read(true).write(true).open(path).map_err(|e| e.to_string())?;
    let mut head = [0u8; 12];
    f.read_exact(&mut head).map_err(|e| e.to_string())?;
    if &head[4..8] == b"ftyp" {
        f.seek(SeekFrom::Start(8)).map_err(|e| e.to_string())?;
        f.write_all(b"M4B ").map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// mp4ameta writes the Nero chapter list as version 0; most readers want version 1
/// (4 reserved bytes before the count). Rewritten only when moov is the last atom,
/// so no sample offsets move.
fn chpl_to_v1(path: &Path) -> Result<()> {
    let mut data = std::fs::read(path).map_err(|e| e.to_string())?;
    let be32 = |d: &[u8], p: usize| u32::from_be_bytes([d[p], d[p + 1], d[p + 2], d[p + 3]]) as usize;
    let mut pos = 0usize;
    let mut moov = None;
    while pos + 8 <= data.len() {
        let size = be32(&data, pos);
        if size < 8 {
            return Ok(());
        }
        if &data[pos + 4..pos + 8] == b"moov" {
            moov = Some((pos, size));
        }
        pos += size;
    }
    let Some((mpos, msize)) = moov else { return Ok(()) };
    if mpos + msize != data.len() {
        return Ok(());
    }
    let find = |d: &[u8], start: usize, end: usize, name: &[u8; 4]| -> Option<(usize, usize)> {
        let mut p = start;
        while p + 8 <= end {
            let s = u32::from_be_bytes([d[p], d[p + 1], d[p + 2], d[p + 3]]) as usize;
            if s < 8 {
                return None;
            }
            if &d[p + 4..p + 8] == name {
                return Some((p, s));
            }
            p += s;
        }
        None
    };
    let Some((upos, usz)) = find(&data, mpos + 8, mpos + msize, b"udta") else { return Ok(()) };
    let Some((cpos, csize)) = find(&data, upos + 8, upos + usz, b"chpl") else { return Ok(()) };
    if data[cpos + 8] != 0 {
        return Ok(());
    }
    let mut chpl = Vec::with_capacity(csize + 4);
    chpl.extend_from_slice(&((csize + 4) as u32).to_be_bytes());
    chpl.extend_from_slice(b"chpl");
    chpl.extend_from_slice(&[1, 0, 0, 0, 0, 0, 0, 0]);
    chpl.extend_from_slice(&data[cpos + 12..cpos + csize]);
    data.splice(cpos..cpos + csize, chpl);
    data[upos..upos + 4].copy_from_slice(&((usz + 4) as u32).to_be_bytes());
    data[mpos..mpos + 4].copy_from_slice(&((msize + 4) as u32).to_be_bytes());
    std::fs::write(path, &data).map_err(|e| e.to_string())
}

// --- Encoding (Windows Media Foundation) --------------------------------------------------------

#[cfg(windows)]
pub mod mf {
    use std::path::Path;
    use windows::core::HSTRING;
    use windows::Win32::Media::MediaFoundation::*;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    #[derive(Clone, Copy)]
    pub enum Codec {
        Aac,
        Mp3,
    }

    /// Encodes 16-bit mono PCM with the encoders that ship with Windows:
    /// AAC-LC in MPEG-4 (.m4b) or MP3.
    pub fn encode(pcm: &[i16], sr: u32, out: &Path, codec: Codec, kbps: u32) -> Result<(), String> {
        let err = |e: windows::core::Error| e.to_string();
        if out.exists() {
            std::fs::remove_file(out).map_err(|e| e.to_string())?;
        }
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            MFStartup(MF_VERSION, MFSTARTUP_FULL).map_err(err)?;
            let result = (|| -> Result<(), String> {
                let mut attrs: Option<IMFAttributes> = None;
                MFCreateAttributes(&mut attrs, 3).map_err(err)?;
                let attrs = attrs.ok_or("Media Foundation is unavailable.")?;
                let container = match codec {
                    Codec::Aac => MFTranscodeContainerType_MPEG4,
                    Codec::Mp3 => MFTranscodeContainerType_MP3,
                };
                attrs.SetGUID(&MF_TRANSCODE_CONTAINERTYPE, &container).map_err(err)?;
                attrs.SetUINT32(&MF_SINK_WRITER_DISABLE_THROTTLING, 1).map_err(err)?;
                let writer = MFCreateSinkWriterFromURL(&HSTRING::from(out.as_os_str()), None, &attrs).map_err(err)?;
                let ot = MFCreateMediaType().map_err(err)?;
                ot.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio).map_err(err)?;
                match codec {
                    Codec::Aac => {
                        ot.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC).map_err(err)?;
                        ot.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16).map_err(err)?;
                        ot.SetUINT32(&MF_MT_AAC_AUDIO_PROFILE_LEVEL_INDICATION, 0x29).map_err(err)?;
                        ot.SetUINT32(&MF_MT_AAC_PAYLOAD_TYPE, 0).map_err(err)?;
                    }
                    Codec::Mp3 => ot.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_MP3).map_err(err)?,
                }
                ot.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, sr).map_err(err)?;
                ot.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 1).map_err(err)?;
                ot.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, kbps * 1000 / 8).map_err(err)?;
                let idx = writer.AddStream(&ot).map_err(err)?;
                let it = MFCreateMediaType().map_err(err)?;
                it.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio).map_err(err)?;
                it.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, sr).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 1).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, 2).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 2 * sr).map_err(err)?;
                it.SetUINT32(&MF_MT_ALL_SAMPLES_INDEPENDENT, 1).map_err(err)?;
                writer.SetInputMediaType(idx, &it, None).map_err(err)?;
                writer.BeginWriting().map_err(err)?;
                let mut done: u64 = 0;
                for c in pcm.chunks(4096) {
                    let bytes = c.len() * 2;
                    let buf = MFCreateMemoryBuffer(bytes as u32).map_err(err)?;
                    let mut p: *mut u8 = std::ptr::null_mut();
                    buf.Lock(&mut p, None, None).map_err(err)?;
                    std::ptr::copy_nonoverlapping(c.as_ptr() as *const u8, p, bytes);
                    buf.Unlock().map_err(err)?;
                    buf.SetCurrentLength(bytes as u32).map_err(err)?;
                    let s = MFCreateSample().map_err(err)?;
                    s.AddBuffer(&buf).map_err(err)?;
                    let t = (done as u128 * 10_000_000 / sr as u128) as i64;
                    let t_end = ((done + c.len() as u64) as u128 * 10_000_000 / sr as u128) as i64;
                    s.SetSampleTime(t).map_err(err)?;
                    s.SetSampleDuration(t_end - t).map_err(err)?;
                    writer.WriteSample(idx, &s).map_err(err)?;
                    done += c.len() as u64;
                }
                writer.Finalize().map_err(err)
            })();
            let _ = MFShutdown();
            result
        }
    }
}

// --- The export ---------------------------------------------------------------------------------

/// One chapter to export: its title and its takes in order, each with the pause after it.
pub struct ChapterPlan {
    pub title: String,
    pub takes: Vec<(PathBuf, f64)>,
}

pub struct AudioJob<'a> {
    pub chapters: Vec<ChapterPlan>,
    pub meta: Meta,
    pub cover: Option<Vec<u8>>,
    pub folder: PathBuf,
    pub m4b: bool,
    pub mp3: bool,
    pub watermark: Option<Watermark>,
    pub message: u16,
    pub progress: &'a dyn Fn(String, f64),
    pub cancelled: &'a dyn Fn() -> bool,
}

/// A file name without characters Windows refuses, kept short.
pub fn safe_name(s: &str) -> String {
    let cleaned: String = s.chars().map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { ' ' } else { c }).collect();
    let trimmed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let short: String = trimmed.chars().take(80).collect();
    let short = short.trim_end_matches(['.', ' ']).to_string();
    if short.is_empty() { "Untitled".into() } else { short }
}

/// A path that does not exist yet: "name.ext", then "name (2).ext"... Never overwrites.
pub fn free_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.{ext}"));
    if !first.exists() {
        return first;
    }
    (2..).map(|n| dir.join(format!("{stem} ({n}).{ext}"))).find(|p| !p.exists()).unwrap()
}

/// Masters every chapter and writes the chosen formats. Returns the written files
/// and a level report per chapter.
pub fn export(job: AudioJob) -> Result<(Vec<PathBuf>, Vec<Value>)> {
    let mut job = job;
    let total = job.chapters.len().max(1) as f64;
    let mut mastered: Vec<(String, Vec<f32>)> = Vec::new();
    let mut report = Vec::new();
    for (i, ch) in job.chapters.iter().enumerate() {
        if (job.cancelled)() {
            return Err("cancelled".into());
        }
        (job.progress)(format!("Mastering {}", ch.title), i as f64 / total * 0.8);
        let mut joined: Vec<f32> = Vec::new();
        let mut rate = 0u32;
        for (path, gap) in &ch.takes {
            let (x, r) = decode(path)?;
            if rate == 0 {
                rate = r;
            }
            let x = if r == rate { x } else { resample(&x, r, rate)? };
            joined.extend_from_slice(&x);
            joined.extend(std::iter::repeat_n(0.0, (gap * rate as f64) as usize));
        }
        if joined.is_empty() {
            continue;
        }
        let mut m = master(&joined, rate, 0x5eed + i as u64);
        if let Some(w) = job.watermark.as_mut() {
            w.apply(&mut m, rate, job.message)?;
        }
        let mut hi = resample(&m, rate, MASTER_RATE)?;
        limit(&mut hi, MASTER_RATE, CEILING_DB);
        let mut level = levels(&hi, MASTER_RATE);
        level["title"] = json!(ch.title);
        report.push(level);
        mastered.push((ch.title.clone(), hi));
    }
    if mastered.is_empty() {
        return Err("No chapter has audio yet.".into());
    }
    std::fs::create_dir_all(&job.folder).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    let stem = safe_name(&job.meta.title);
    #[cfg(windows)]
    {
        if job.m4b {
            (job.progress)("Encoding the audiobook".into(), 0.82);
            let mut pcm: Vec<i16> = Vec::new();
            let mut marks = Vec::new();
            for (title, audio) in &mastered {
                let start = pcm.len() as u64 * 1000 / MASTER_RATE as u64;
                pcm.extend(to_i16(audio, pcm.len() as u64 + 7));
                marks.push(ChapterMark { title: title.clone(), start_ms: start });
            }
            let path = free_path(&job.folder, &stem, "m4b");
            mf::encode(&pcm, MASTER_RATE, &path, mf::Codec::Aac, 96)?;
            tag_m4b(&path, &job.meta, &marks, job.cover.as_deref())?;
            files.push(path);
        }
        if job.mp3 {
            let dir = job.folder.join(format!("{stem} (MP3)"));
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let n = mastered.len() as u32;
            for (i, (title, audio)) in mastered.iter().enumerate() {
                if (job.cancelled)() {
                    return Err("cancelled".into());
                }
                (job.progress)(format!("Encoding {title}"), 0.9 + 0.1 * i as f64 / n as f64);
                let path = free_path(&dir, &format!("{:02} {}", i + 1, safe_name(title)), "mp3");
                mf::encode(&to_i16(audio, i as u64 + 11), MASTER_RATE, &path, mf::Codec::Mp3, 128)?;
                tag_mp3(&path, &job.meta, title, i as u32 + 1, n, job.cover.as_deref())?;
                files.push(path);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (&stem, &mastered);
        if job.m4b || job.mp3 {
            return Err("Audiobook export needs Windows for now.".into());
        }
    }
    Ok((files, report))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mastering_reaches_store_levels() {
        let sr = 24_000;
        // Two seconds of a quiet 220 Hz tone with silent gaps.
        let mut x: Vec<f32> = (0..sr * 2).map(|i| (i as f32 * 220.0 * 2.0 * std::f32::consts::PI / sr as f32).sin() * 0.05).collect();
        x.extend(std::iter::repeat_n(0.0, sr / 2));
        x.extend((0..sr * 2).map(|i| (i as f32 * 330.0 * 2.0 * std::f32::consts::PI / sr as f32).sin() * 0.3));
        let m = master(&x, sr as u32, 1);
        let l = levels(&m, sr as u32);
        assert!(l["peak"].as_f64().unwrap() <= -3.0, "{l}");
        assert!((l["rms"].as_f64().unwrap() + 20.0).abs() < 1.0, "{l}");
        assert!(l["floor"].as_f64().unwrap() <= -60.0, "{l}");
    }

    #[test]
    fn names_are_safe_and_never_overwrite() {
        assert_eq!(safe_name("A: Tale / of <Two>?"), "A Tale of Two");
        assert_eq!(safe_name("..."), "Untitled");
        let dir = std::env::temp_dir().join(format!("origami-free-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Book.m4b"), b"x").unwrap();
        assert_eq!(free_path(&dir, "Book", "m4b").file_name().unwrap(), "Book (2).m4b");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resampling_keeps_length() {
        let x = vec![0.1f32; 24_000];
        assert_eq!(resample(&x, 24_000, 44_100).unwrap().len(), 44_100);
    }
}
