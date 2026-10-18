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
pub const ENCODER: &str = "Origami Reader";

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
    tag.set_comment(format!("{AI_DISCLOSURE}. Made with Origami Reader."));
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
    t.add_frame(Comment { lang: "eng".into(), description: "".into(), text: format!("{AI_DISCLOSURE}. Made with Origami Reader.") });
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
/// so no sample offsets move. The new file is written beside it and then takes its
/// place, so a failure never leaves half a file.
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
    let mut temp = path.as_os_str().to_owned();
    temp.push(".tmp");
    let temp = PathBuf::from(temp);
    if let Err(e) = std::fs::write(&temp, &data).and_then(|_| std::fs::rename(&temp, path)) {
        let _ = std::fs::remove_file(&temp);
        return Err(e.to_string());
    }
    Ok(())
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

    /// An open file being written with the encoders that ship with Windows: AAC-LC
    /// in MPEG-4 (.m4b) or MP3. Audio can be added chapter by chapter, so a whole
    /// book never has to sit in memory.
    pub struct Encoder {
        writer: IMFSinkWriter,
        idx: u32,
        rate: u32,
        done: u64,
        started: bool,
    }

    fn err(e: windows::core::Error) -> String {
        e.to_string()
    }

    impl Encoder {
        pub fn create(out: &Path, rate: u32, codec: Codec, kbps: u32) -> Result<Self, String> {
            if out.exists() {
                std::fs::remove_file(out).map_err(|e| e.to_string())?;
            }
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                MFStartup(MF_VERSION, MFSTARTUP_FULL).map_err(err)?;
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
                ot.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, rate).map_err(err)?;
                ot.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 1).map_err(err)?;
                ot.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, kbps * 1000 / 8).map_err(err)?;
                let idx = writer.AddStream(&ot).map_err(err)?;
                let it = MFCreateMediaType().map_err(err)?;
                it.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio).map_err(err)?;
                it.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, rate).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, 1).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, 2).map_err(err)?;
                it.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 2 * rate).map_err(err)?;
                it.SetUINT32(&MF_MT_ALL_SAMPLES_INDEPENDENT, 1).map_err(err)?;
                writer.SetInputMediaType(idx, &it, None).map_err(err)?;
                writer.BeginWriting().map_err(err)?;
                Ok(Self { writer, idx, rate, done: 0, started: true })
            }
        }

        pub fn write(&mut self, pcm: &[i16]) -> Result<(), String> {
            unsafe {
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
                    let t = (self.done as u128 * 10_000_000 / self.rate as u128) as i64;
                    let t_end = ((self.done + c.len() as u64) as u128 * 10_000_000 / self.rate as u128) as i64;
                    s.SetSampleTime(t).map_err(err)?;
                    s.SetSampleDuration(t_end - t).map_err(err)?;
                    self.writer.WriteSample(self.idx, &s).map_err(err)?;
                    self.done += c.len() as u64;
                }
            }
            Ok(())
        }

        /// Samples written so far.
        pub fn position(&self) -> u64 {
            self.done
        }

        pub fn finish(mut self) -> Result<(), String> {
            self.started = false;
            unsafe {
                let r = self.writer.Finalize().map_err(err);
                let _ = MFShutdown();
                r
            }
        }
    }

    impl Drop for Encoder {
        fn drop(&mut self) {
            if self.started {
                unsafe {
                    let _ = MFShutdown();
                }
            }
        }
    }

    /// A whole clip in one go.
    pub fn encode(pcm: &[i16], rate: u32, out: &Path, codec: Codec, kbps: u32) -> Result<(), String> {
        let mut e = Encoder::create(out, rate, codec, kbps)?;
        e.write(pcm)?;
        e.finish()
    }
}

// --- The export ---------------------------------------------------------------------------------

/// One take in a chapter: its file, the pause after it, and the line it reads.
pub struct TakeRef {
    pub path: PathBuf,
    pub gap: f64,
    pub unit: String,
    // Who reads it, for the per-speaker stems.
    pub speaker: String,
}

/// One chapter to export: its title and its takes in order.
pub struct ChapterPlan {
    pub title: String,
    pub takes: Vec<TakeRef>,
}

/// Where each line sits in a finished chapter, in seconds (for the read-along ebook).
pub struct ChapterTiming {
    pub title: String,
    pub audio: PathBuf,
    pub seconds: f64,
    pub lines: Vec<(String, f64, f64)>,
}

pub struct AudioJob<'a> {
    pub chapters: Vec<ChapterPlan>,
    pub meta: Meta,
    pub cover: Option<Vec<u8>>,
    pub folder: PathBuf,
    pub m4b: bool,
    pub mp3: bool,
    // A folder for the read-along ebook's chapter audio (64 kbps MP3), or none.
    pub readalong: Option<PathBuf>,
    // A folder for one WAV per speaker and chapter (for a sound editor), or none.
    pub stems: Option<PathBuf>,
    // The AI disclosure and credit written into each stem's tags.
    pub comment: String,
    // A retail sample: the opening minutes of the story, for store pages.
    pub sample: bool,
    // A background sound under every chapter but the opening credits.
    pub bed: Option<Bed>,
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

/// A folder name that does not exist yet: "name", then "name (2)"...
pub fn free_dir(dir: &Path, stem: &str) -> PathBuf {
    let first = dir.join(stem);
    if !first.exists() {
        return first;
    }
    (2..).map(|n| dir.join(format!("{stem} ({n})"))).find(|p| !p.exists()).unwrap()
}

/// Where an export is written while it runs: a folder inside the chosen one, so the
/// finished files are moved there, not copied. Only what this export writes is in
/// it, and it is removed when the export ends, finished, failed or cancelled, so a
/// stopped export leaves nothing behind and never touches the reader's own files.
pub struct Staging {
    pub dir: PathBuf,
    target: PathBuf,
}

impl Staging {
    pub fn new(target: &Path, export_id: &str) -> Result<Self> {
        let dir = free_dir(target, &format!("Origami export in progress {export_id}"));
        std::fs::create_dir(&dir).map_err(|e| e.to_string())?;
        Ok(Staging { dir, target: target.to_path_buf() })
    }

    /// Moves the written files and folders into the chosen folder, under names that
    /// are free there, and returns where each one is now. Paths inside a moved folder
    /// follow it. If a move fails, the ones already made are undone.
    pub fn finish(&self, written: &[PathBuf]) -> Result<Vec<PathBuf>> {
        let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
        let mut out = Vec::new();
        for path in written {
            let Ok(rel) = path.strip_prefix(&self.dir) else {
                out.push(path.clone());
                continue;
            };
            let mut parts = rel.components();
            let Some(top) = parts.next() else { continue };
            let rest: PathBuf = parts.collect();
            let staged = self.dir.join(top);
            let placed = match moved.iter().find(|(s, _)| *s == staged) {
                Some((_, to)) => to.clone(),
                None => {
                    let name = top.as_os_str().to_string_lossy().into_owned();
                    let to = match (staged.is_dir(), Path::new(&name).file_stem(), Path::new(&name).extension()) {
                        (false, Some(stem), Some(ext)) => free_path(&self.target, &stem.to_string_lossy(), &ext.to_string_lossy()),
                        _ => free_dir(&self.target, &name),
                    };
                    if let Err(e) = std::fs::rename(&staged, &to) {
                        for (s, t) in moved.iter().rev() {
                            let _ = std::fs::rename(t, s);
                        }
                        return Err(format!("The export could not be moved into the folder: {e}"));
                    }
                    moved.push((staged, to.clone()));
                    to
                }
            };
            out.push(if rest.as_os_str().is_empty() { placed } else { placed.join(rest) });
        }
        Ok(out)
    }
}

impl Drop for Staging {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// The spoken opening credit, in the book's language (English when there is no
/// wording for it). The same wording as the export dialog shows.
pub fn credit_line(title: &str, author: &str, language: &str) -> String {
    let author = if author.trim().is_empty() { "an unknown author" } else { author };
    match language.get(..2).unwrap_or("en").to_lowercase().as_str() {
        "fr" => format!("{title}, de {author}. Lu par des voix numériques. Réalisé avec Origami Reader."),
        "de" => format!("{title}, von {author}. Gelesen von digitalen Stimmen. Erstellt mit Origami Reader."),
        "es" => format!("{title}, de {author}. Narrado por voces digitales. Hecho con Origami Reader."),
        "it" => format!("{title}, di {author}. Letto da voci digitali. Realizzato con Origami Reader."),
        "pt" => format!("{title}, de {author}. Narrado por vozes digitais. Feito com Origami Reader."),
        _ => format!("{title}, by {author}. Narrated by digital voices. Made with Origami Reader."),
    }
}

/// The opening credits' chapter title, in the book's language.
pub fn credit_title(language: &str) -> String {
    match language.get(..2).unwrap_or("en").to_lowercase().as_str() {
        "fr" => "Générique",
        "de" => "Vorspann",
        "es" => "Créditos iniciales",
        "it" => "Titoli di testa",
        "pt" => "Créditos iniciais",
        _ => "Opening credits",
    }
    .into()
}

/// Masters one chapter: joins its takes with their pauses, masters, adds the watermark
/// and resamples to 44.1 kHz. Returns the audio and each line's start and end.
fn master_chapter(ch: &ChapterPlan, seed: u64, watermark: Option<&mut Watermark>, message: u16, bed: Option<(&Bed, usize)>) -> Result<(Vec<f32>, Vec<(String, f64, f64)>)> {
    let mut joined: Vec<f32> = Vec::new();
    let mut rate = 0u32;
    let mut spans = Vec::new();
    for t in &ch.takes {
        let (x, r) = decode(&t.path)?;
        if rate == 0 {
            rate = r;
        }
        let x = if r == rate { x } else { resample(&x, r, rate)? };
        let start = joined.len();
        joined.extend_from_slice(&x);
        spans.push((t.unit.clone(), start, joined.len()));
        joined.extend(std::iter::repeat_n(0.0, (t.gap * rate as f64) as usize));
    }
    if joined.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let mut m = master(&joined, rate, seed);
    if let Some(w) = watermark {
        w.apply(&mut m, rate, message)?;
    }
    let mut hi = resample(&m, rate, MASTER_RATE)?;
    if let Some((bed, offset)) = bed {
        let under = bed.track(hi.len(), offset, &hi);
        for (v, b) in hi.iter_mut().zip(under) {
            *v += b;
        }
    }
    limit(&mut hi, MASTER_RATE, CEILING_DB);
    // master() puts one second of room tone first.
    let head = 1.0;
    let lines = spans.into_iter().map(|(u, s, e)| (u, head + s as f64 / rate as f64, head + e as f64 / rate as f64)).collect();
    Ok((hi, lines))
}

// --- Background sound -----------------------------------------------------------------------

/// A background sound under the narration (rain, a fire, music): the reader's own file,
/// at 44.1 kHz, prepared to loop without a click, and its level when nobody speaks.
pub struct Bed {
    samples: Vec<f32>,
    gain: f32,
}

impl Bed {
    /// `level` is the bed's RMS in dBFS between lines; under speech it is 12 dB lower.
    pub fn new(x: &[f32], rate: u32, level: f64) -> Result<Self> {
        let x = if rate == MASTER_RATE { x.to_vec() } else { resample(x, rate, MASTER_RATE)? };
        let cf = (MASTER_RATE as usize / 2).min(x.len() / 4);
        if x.len() < MASTER_RATE as usize * 2 {
            return Err("The background sound is too short (two seconds at least).".into());
        }
        // The loop: the end fades into the start, so wrapping around is seamless.
        let mut samples = x[cf..].to_vec();
        let n = samples.len();
        for k in 0..cf {
            let t = k as f32 / cf as f32;
            samples[n - cf + k] = samples[n - cf + k] * (1.0 - t) + x[k] * t;
        }
        let rms = rms_db(&samples);
        let gain = if rms.is_finite() { 10f64.powf((level - rms) / 20.0) as f32 } else { 0.0 };
        Ok(Bed { samples, gain })
    }

    /// `len` samples of the bed from `offset`, lowered wherever `speech` (a signal at
    /// 44.1 kHz of the same length) has voice, with a short look-ahead, and faded in
    /// and out over two seconds.
    pub fn track(&self, len: usize, offset: usize, speech: &[f32]) -> Vec<f32> {
        let rate = MASTER_RATE as usize;
        let frame = rate / 50;
        let frames = len.div_ceil(frame);
        let loud: Vec<bool> = (0..frames)
            .map(|f| {
                let a = (f * frame).min(speech.len());
                let b = ((f + 1) * frame).min(speech.len());
                b > a && rms_db(&speech[a..b]) > -42.0
            })
            .collect();
        // Duck 100 ms before a line starts; come back up slowly after it.
        let ducked = 10f32.powf(-12.0 / 20.0);
        let mut g = 1.0f32;
        let mut gains = Vec::with_capacity(frames);
        for f in 0..frames {
            let soon = (f..(f + 5).min(frames)).any(|k| loud[k]);
            let target = if soon { ducked } else { 1.0 };
            let k = if target < g { 0.35 } else { 0.04 };
            g += (target - g) * k;
            gains.push(g);
        }
        let fade = (2 * rate).min(len / 2).max(1);
        (0..len)
            .map(|i| {
                let edge = (i.min(len - 1 - i) as f32 / fade as f32).min(1.0);
                self.samples[(offset + i) % self.samples.len()] * self.gain * gains[i / frame] * edge
            })
            .collect()
    }
}

/// Adds a RIFF LIST INFO chunk (title, artist, comment, software, date) to a WAV file.
fn tag_wav(path: &Path, fields: &[(&[u8; 4], &str)]) -> Result<()> {
    use std::io::{Seek, SeekFrom, Write};
    let mut info = b"INFO".to_vec();
    for (id, value) in fields.iter().filter(|(_, v)| !v.is_empty()) {
        let mut data = value.as_bytes().to_vec();
        data.push(0);
        info.extend_from_slice(*id);
        info.extend_from_slice(&(data.len() as u32).to_le_bytes());
        info.extend_from_slice(&data);
        if data.len() % 2 == 1 {
            info.push(0);
        }
    }
    let mut f = std::fs::OpenOptions::new().read(true).write(true).open(path).map_err(|e| e.to_string())?;
    let end = f.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
    let mut chunk = b"LIST".to_vec();
    chunk.extend_from_slice(&(info.len() as u32).to_le_bytes());
    chunk.extend_from_slice(&info);
    f.write_all(&chunk).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(4)).map_err(|e| e.to_string())?;
    f.write_all(&((end + chunk.len() as u64 - 8) as u32).to_le_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

/// One chapter as one 32-bit float WAV per speaker, all the same length and lined up
/// with the mastered chapter (the same second of lead-in), for a sound editor. The
/// stems share one gain, so their balance is the mix's; nothing is limited or added,
/// apart from the watermark in each stem.
fn write_stems(ch: &ChapterPlan, number: u32, dir: &Path, watermark: Option<&mut Watermark>, message: u16, meta: &Meta, comment: &str, bed: Option<(&Bed, usize)>) -> Result<Vec<PathBuf>> {
    let mut joined: Vec<f32> = Vec::new();
    let mut rate = 0u32;
    let mut spans: Vec<(String, usize, usize)> = Vec::new();
    for t in &ch.takes {
        let (x, r) = decode(&t.path)?;
        if rate == 0 {
            rate = r;
        }
        let x = if r == rate { x } else { resample(&x, r, rate)? };
        let start = joined.len();
        joined.extend_from_slice(&x);
        spans.push((t.speaker.clone(), start, joined.len()));
        joined.extend(std::iter::repeat_n(0.0, (t.gap * rate as f64) as usize));
    }
    if joined.is_empty() {
        return Ok(Vec::new());
    }
    let (head, tail) = (rate as usize, 2 * rate as usize);
    let dilution = 10.0 * (((joined.len() + head + tail) as f64) / joined.len() as f64).log10();
    let mut gain_db = TARGET_RMS_DB + dilution - rms_db(&joined);
    gain_db = gain_db.min(-1.0 - peak_db(&joined));
    let g = 10f64.powf(gain_db / 20.0) as f32;
    let mut speakers: Vec<String> = Vec::new();
    for (s, _, _) in &spans {
        if !speakers.contains(s) {
            speakers.push(s.clone());
        }
    }
    let folder = dir.join(format!("{:02} {}", number, safe_name(&ch.title)));
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let mut watermark = watermark;
    let mut written = Vec::new();
    for speaker in &speakers {
        let mut stem = vec![0.0f32; head + joined.len() + tail];
        for (_, a, b) in spans.iter().filter(|(s, _, _)| s == speaker) {
            for i in *a..*b {
                stem[head + i] = joined[i] * g;
            }
        }
        if let Some(w) = watermark.as_deref_mut() {
            w.apply(&mut stem, rate, message)?;
        }
        let hi = resample(&stem, rate, MASTER_RATE)?;
        drop(stem);
        let path = free_path(&folder, &safe_name(speaker), "wav");
        let spec = hound::WavSpec { channels: 1, sample_rate: MASTER_RATE, bits_per_sample: 32, sample_format: hound::SampleFormat::Float };
        let mut out = hound::WavWriter::create(&path, spec).map_err(|e| e.to_string())?;
        for v in &hi {
            out.write_sample(*v).map_err(|e| e.to_string())?;
        }
        out.finalize().map_err(|e| e.to_string())?;
        let name = format!("{} - {} - {}", meta.title, ch.title, speaker);
        let note = format!("{comment} Export {}.", meta.export_id);
        tag_wav(&path, &[(b"INAM", &name), (b"IART", &meta.author), (b"ICMT", note.trim()), (b"ISFT", "Origami Reader"), (b"ICRD", &meta.year)])?;
        written.push(path);
    }
    // The background sound as its own stem, lowered where anyone speaks.
    if let Some((bed, offset)) = bed {
        let mut voice = vec![0.0f32; head + joined.len() + tail];
        for (_, a, b) in &spans {
            for i in *a..*b {
                voice[head + i] = joined[i] * g;
            }
        }
        let voice = resample(&voice, rate, MASTER_RATE)?;
        let mut under = bed.track(voice.len(), offset, &voice);
        drop(voice);
        if let Some(w) = watermark.as_deref_mut() {
            w.apply(&mut under, MASTER_RATE, message)?;
        }
        let path = free_path(&folder, "Background", "wav");
        let spec = hound::WavSpec { channels: 1, sample_rate: MASTER_RATE, bits_per_sample: 32, sample_format: hound::SampleFormat::Float };
        let mut out = hound::WavWriter::create(&path, spec).map_err(|e| e.to_string())?;
        for v in &under {
            out.write_sample(*v).map_err(|e| e.to_string())?;
        }
        out.finalize().map_err(|e| e.to_string())?;
        let name = format!("{} - {} - Background", meta.title, ch.title);
        let note = format!("{comment} Export {}.", meta.export_id);
        tag_wav(&path, &[(b"INAM", &name), (b"IART", &meta.author), (b"ICMT", note.trim()), (b"ISFT", "Origami Reader"), (b"ICRD", &meta.year)])?;
        written.push(path);
    }
    Ok(written)
}

/// The retail sample: the start of a mastered chapter, cut just after the last line that
/// ends within five minutes, closed with a short fade and a second of the chapter's own
/// room tone (its first second). None when the chapter has less than a minute of lines.
pub fn retail_sample(audio: &[f32], lines: &[(String, f64, f64)]) -> Option<Vec<f32>> {
    let end = lines.iter().map(|l| l.2).filter(|e| *e <= 295.0).fold(0.0, f64::max);
    if end < 60.0 {
        return None;
    }
    let rate = MASTER_RATE as f64;
    let n = (((end + 0.15) * rate) as usize).min(audio.len());
    let mut x = audio[..n].to_vec();
    let fade = ((0.12 * rate) as usize).min(n);
    for (k, v) in x[n - fade..].iter_mut().enumerate() {
        *v *= 1.0 - k as f32 / fade as f32;
    }
    let tone = (MASTER_RATE as usize).min(audio.len());
    x.extend(audio[..tone].iter().enumerate().map(|(k, v)| v * (k as f32 / 2000.0).min(1.0)));
    Some(x)
}

/// Masters every chapter, one at a time, and writes the chosen formats. Returns the
/// written files, a level report per chapter, and the timings for a read-along ebook.
pub fn export(job: AudioJob) -> Result<(Vec<PathBuf>, Vec<Value>, Vec<ChapterTiming>)> {
    let mut job = job;
    let total = job.chapters.len().max(1) as f64;
    let mut report = Vec::new();
    let mut timings = Vec::new();
    let mut files = Vec::new();
    std::fs::create_dir_all(&job.folder).map_err(|e| e.to_string())?;
    let stem = safe_name(&job.meta.title);
    #[cfg(not(windows))]
    {
        let _ = (&stem, total);
        return Err("Audiobook export needs Windows for now.".into());
    }
    #[cfg(windows)]
    {
        let m4b_path = job.m4b.then(|| free_path(&job.folder, &stem, "m4b"));
        let mut m4b = match &m4b_path {
            Some(p) => Some(mf::Encoder::create(p, MASTER_RATE, mf::Codec::Aac, 96)?),
            None => None,
        };
        let mp3_dir = job.folder.join(format!("{stem} (MP3)"));
        if job.mp3 {
            std::fs::create_dir_all(&mp3_dir).map_err(|e| e.to_string())?;
        }
        let mut marks = Vec::new();
        let n = job.chapters.iter().filter(|c| !c.takes.is_empty()).count() as u32;
        let mut track = 0u32;
        let mut stems_written = false;
        let mut sample_left = job.sample;
        // Where the background sound is: it carries on from one chapter to the next.
        let mut bed_at = 0usize;
        let chapters = std::mem::take(&mut job.chapters);
        for (i, ch) in chapters.iter().enumerate() {
            if (job.cancelled)() {
                return Err("cancelled".into());
            }
            if ch.takes.is_empty() {
                continue;
            }
            track += 1;
            if let Some(dir) = &job.stems {
                (job.progress)(format!("Writing the stems of {}", ch.title), i as f64 / total);
                let bed = job.bed.as_ref().filter(|_| !ch.takes.iter().any(|t| t.unit == "credit")).map(|b| (b, bed_at));
                write_stems(ch, track, dir, job.watermark.as_mut(), job.message, &job.meta, &job.comment, bed)?;
                stems_written = true;
            }
            if m4b.is_none() && !job.mp3 && job.readalong.is_none() && !sample_left {
                continue;
            }
            (job.progress)(format!("Mastering {}", ch.title), i as f64 / total);
            let bed = job.bed.as_ref().filter(|_| !ch.takes.iter().any(|t| t.unit == "credit")).map(|b| (b, bed_at));
            let (audio, lines) = master_chapter(ch, 0x5eed + i as u64, job.watermark.as_mut(), job.message, bed)?;
            if audio.is_empty() {
                continue;
            }
            if bed.is_some() {
                bed_at += audio.len();
            }
            let mut level = levels(&audio, MASTER_RATE);
            level["title"] = json!(ch.title);
            report.push(level);
            let pcm = to_i16(&audio, i as u64 + 7);
            if let Some(enc) = m4b.as_mut() {
                marks.push(ChapterMark { title: ch.title.clone(), start_ms: enc.position() * 1000 / MASTER_RATE as u64 });
                enc.write(&pcm)?;
            }
            if job.mp3 {
                let path = free_path(&mp3_dir, &format!("{:02} {}", track, safe_name(&ch.title)), "mp3");
                mf::encode(&pcm, MASTER_RATE, &path, mf::Codec::Mp3, 128)?;
                tag_mp3(&path, &job.meta, &ch.title, track, n, job.cover.as_deref())?;
                files.push(path);
            }
            // The sample comes from the first chapter of the story, never the credits.
            if sample_left && !lines.iter().any(|l| l.0 == "credit") {
                if let Some(x) = retail_sample(&audio, &lines) {
                    let path = free_path(&job.folder, &format!("{stem} (retail sample)"), "mp3");
                    mf::encode(&to_i16(&x, 99), MASTER_RATE, &path, mf::Codec::Mp3, 128)?;
                    tag_mp3(&path, &job.meta, &format!("{} (retail sample)", job.meta.title), 1, 1, job.cover.as_deref())?;
                    files.push(path);
                    sample_left = false;
                }
            }
            if let Some(dir) = &job.readalong {
                let path = dir.join(format!("{:03}.mp3", track));
                mf::encode(&pcm, MASTER_RATE, &path, mf::Codec::Mp3, 64)?;
                timings.push(ChapterTiming { title: ch.title.clone(), audio: path, seconds: audio.len() as f64 / MASTER_RATE as f64, lines });
            }
        }
        if report.is_empty() && !stems_written {
            return Err("No chapter has audio yet.".into());
        }
        if let (true, Some(dir)) = (stems_written, &job.stems) {
            files.push(dir.clone());
        }
        if let (Some(enc), Some(path)) = (m4b, m4b_path) {
            (job.progress)("Finishing the audiobook".into(), 0.97);
            enc.finish()?;
            tag_m4b(&path, &job.meta, &marks, job.cover.as_deref())?;
            files.insert(0, path);
        }
    }
    Ok((files, report, timings))
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
    fn an_export_is_staged_and_never_replaces_the_readers_files() {
        let dir = std::env::temp_dir().join(format!("origami-staging-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Book (MP3)")).unwrap();
        std::fs::write(dir.join("Book.m4b"), b"mine").unwrap();
        std::fs::write(dir.join("Book (MP3)").join("01 One.mp3"), b"mine").unwrap();
        // A finished export moves its files under free names.
        let staging = Staging::new(&dir, "OS-1").unwrap();
        std::fs::write(staging.dir.join("Book.m4b"), b"new").unwrap();
        std::fs::create_dir_all(staging.dir.join("Book (MP3)")).unwrap();
        std::fs::write(staging.dir.join("Book (MP3)").join("01 One.mp3"), b"new").unwrap();
        std::fs::write(staging.dir.join("credit-1.wav"), b"take").unwrap();
        let files = staging.finish(&[staging.dir.join("Book.m4b"), staging.dir.join("Book (MP3)").join("01 One.mp3")]).unwrap();
        let staged = staging.dir.clone();
        drop(staging);
        assert_eq!(files[0], dir.join("Book (2).m4b"));
        assert_eq!(files[1], dir.join("Book (MP3) (2)").join("01 One.mp3"));
        assert_eq!(std::fs::read(dir.join("Book.m4b")).unwrap(), b"mine");
        assert_eq!(std::fs::read(dir.join("Book (MP3)").join("01 One.mp3")).unwrap(), b"mine");
        assert!(!staged.exists());
        // A failed or cancelled one leaves nothing behind.
        let staging = Staging::new(&dir, "OS-2").unwrap();
        std::fs::write(staging.dir.join("Book.epub"), b"half").unwrap();
        let staged = staging.dir.clone();
        drop(staging);
        assert!(!staged.exists() && !dir.join("Book.epub").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_spoken_credit_names_origami_studio_in_every_language() {
        for lang in ["en", "fr-FR", "de", "es", "it", "pt-BR", "ja", ""] {
            assert!(credit_line("Emma", "", lang).contains("Origami Reader"));
        }
        assert_eq!(credit_line("Emma", "Jane Austen", "en"), "Emma, by Jane Austen. Narrated by digital voices. Made with Origami Reader.");
        assert_eq!(credit_title("fr"), "Générique");
    }

    #[test]
    fn stems_line_up_and_carry_tags() {
        let dir = std::env::temp_dir().join(format!("origami-stems-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let sr = 24_000u32;
        let take = |name: &str, f: f32, secs: f32| {
            let path = dir.join(name);
            let spec = hound::WavSpec { channels: 1, sample_rate: sr, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
            let mut w = hound::WavWriter::create(&path, spec).unwrap();
            for i in 0..(secs * sr as f32) as usize {
                w.write_sample(((i as f32 * f * 2.0 * std::f32::consts::PI / sr as f32).sin() * 8000.0) as i16).unwrap();
            }
            w.finalize().unwrap();
            path
        };
        let ch = ChapterPlan {
            title: "One: a start".into(),
            takes: vec![
                TakeRef { path: take("a.wav", 220.0, 1.0), gap: 0.5, unit: "a".into(), speaker: "Narrator".into() },
                TakeRef { path: take("b.wav", 440.0, 0.5), gap: 0.0, unit: "b".into(), speaker: "Mrs. Bennet".into() },
            ],
        };
        let meta = Meta { title: "Book".into(), author: "Author".into(), narrator: String::new(), year: "2026".into(), export_id: "OS-0001".into() };
        let out = write_stems(&ch, 1, &dir.join("stems"), None, 0, &meta, "AI-generated voices.", None).unwrap();
        assert_eq!(out.len(), 2);
        let lens: Vec<u32> = out.iter().map(|p| hound::WavReader::open(p).unwrap().duration()).collect();
        assert_eq!(lens[0], lens[1]);
        // One second of lead-in, the narrator's take, then the speaker after the pause.
        assert!((lens[0] as f64 / MASTER_RATE as f64 - 5.0).abs() < 0.01, "{lens:?}");
        let s: Vec<f32> = hound::WavReader::open(&out[1]).unwrap().samples::<f32>().map(|v| v.unwrap()).collect();
        let at = |t: f64| s[(t * MASTER_RATE as f64) as usize].abs();
        assert!(at(1.2) < 1e-3 && s[(2.5 * MASTER_RATE as f64) as usize..(2.9 * MASTER_RATE as f64) as usize].iter().any(|v| v.abs() > 0.05));
        let bytes = std::fs::read(&out[0]).unwrap();
        assert!(bytes.windows(14).any(|w| w == b"Origami Reader"));
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize, bytes.len() - 8);
        assert!(out[0].parent().unwrap().ends_with("01 One a start"));
        assert!(crate::studio_verify::labels(&out[0])["AI_DISCLOSURE"].as_str().unwrap().starts_with("AI-generated voices."));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_retail_sample_ends_after_a_whole_line() {
        let rate = MASTER_RATE as usize;
        let audio = vec![0.1f32; rate * 400];
        let lines: Vec<(String, f64, f64)> = (0..40).map(|i| (format!("u{i}"), 1.0 + i as f64 * 9.0, 9.0 + i as f64 * 9.0)).collect();
        let x = retail_sample(&audio, &lines).unwrap();
        // The last line ending by 295 s ends at 288 s; then 0.15 s and one second of room tone.
        assert!((x.len() as f64 / rate as f64 - (288.0 + 0.15 + 1.0)).abs() < 0.01);
        assert!(retail_sample(&audio, &lines[..5]).is_none());
    }

    #[test]
    fn the_background_sound_loops_and_ducks_under_speech() {
        let rate = MASTER_RATE as usize;
        let x: Vec<f32> = (0..rate * 3).map(|i| ((i as f32) * 0.37).sin() * 0.2).collect();
        let bed = Bed::new(&x, MASTER_RATE, -30.0).unwrap();
        // Ten seconds: speech from 4 s to 6 s.
        let mut speech = vec![0.0f32; rate * 10];
        for v in &mut speech[rate * 4..rate * 6] {
            *v = 0.2;
        }
        let t = bed.track(speech.len(), 0, &speech);
        let at = |a: f64, b: f64| rms_db(&t[(a * rate as f64) as usize..(b * rate as f64) as usize]);
        assert!((at(2.5, 3.5) + 30.0).abs() < 1.5, "{}", at(2.5, 3.5));
        assert!(at(4.8, 5.8) < at(2.5, 3.5) - 9.0);
        assert!(at(0.0, 0.05) < -45.0 && at(9.95, 10.0) < -45.0);
        // Looping past the end of the file is seamless: no sample jumps.
        let long = bed.track(rate * 8, rate * 2, &vec![0.0; rate * 8]);
        let jump = long.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0f32, f32::max);
        assert!(jump < 0.05, "{jump}");
    }

    #[test]
    fn resampling_keeps_length() {
        let x = vec![0.1f32; 24_000];
        assert_eq!(resample(&x, 24_000, 44_100).unwrap().len(), 44_100);
    }
}
