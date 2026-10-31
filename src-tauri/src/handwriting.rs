// Reading handwriting with a model that runs in Origami, on every system:
// Microsoft's TrOCR base handwritten (MIT), from a pinned ONNX export, checked
// against its published SHA-256 like the Related models. It reads one line at
// a time, so ink is first split into lines, each drawn into an image the way
// the model was trained (dark ink on white, squeezed to 384 x 384).
// The model learned English handwriting; other languages read best with the
// recogniser built into Windows (src/ink.rs).
use crate::ink::{Line, Stroke};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

type Result<T> = std::result::Result<T, String>;

pub const ID: &str = "origami-trocr";
pub const NAME: &str = "TrOCR base handwritten (Microsoft, MIT)";
const REPO: &str = "Xenova/trocr-base-handwritten";
const REVISION: &str = "e301d1c4c4d4ece88f164518eb7aee07062eaca2";
const FILES: [(&str, &str, u64, &str); 3] = [
    ("onnx/encoder_model_quantized.onnx", "encoder.onnx", 88_082_928, "8689f7a6122816789922e2e4f1063646ab69396ad0d1144437bba95dcbab5c86"),
    ("onnx/decoder_model_quantized.onnx", "decoder.onnx", 248_853_923, "83ead15ae5a4a2875d58a86116254e5a1e93daf2cc47387ae8faca39d72795a5"),
    ("tokenizer.json", "tokenizer.json", 2_108_614, "2f1a555a1ee93656b4e6f67aa75d492a843c225e5ef754bae24c36bd85851cd7"),
];
const SIZE: usize = 384;
const START: i64 = 2; // decoder_start_token_id
const END: i64 = 2; // eos_token_id
const MAX_TOKENS: usize = 64;

fn folder(app: &AppHandle) -> Result<PathBuf> {
    Ok(crate::data_root(app)?.join("Models").join("handwriting").join("trocr-base"))
}
fn installed(dir: &Path) -> bool {
    std::fs::read_to_string(dir.join("verified.txt"))
        .map(|v| FILES.iter().all(|f| v.contains(f.3)))
        .unwrap_or(false)
}
// A read-only copy shipped with the app (an offline kit), used when none
// was downloaded. Removing the model never touches it.
fn bundled() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.join("models").join("handwriting").join("trocr-base");
    installed(&dir).then_some(dir)
}
fn source(app: &AppHandle) -> Result<PathBuf> {
    let own = folder(app)?;
    Ok(if installed(&own) { own } else { bundled().unwrap_or(own) })
}

struct Model {
    encoder: ort::session::Session,
    decoder: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
}

#[derive(Default)]
pub struct Reader {
    model: Mutex<Option<Model>>,
    downloading: AtomicBool,
    cancel: AtomicBool,
}

impl Reader {
    pub fn status(&self, app: &AppHandle) -> Result<Value> {
        Ok(json!({
            "id": ID,
            "name": NAME,
            "installed": installed(&source(app)?),
            "bundled": bundled().is_some(),
            "bytes": FILES.iter().map(|f| f.2).sum::<u64>(),
            "downloading": self.downloading.load(Ordering::SeqCst),
            "runtime": crate::embed::runtime_available(app),
        }))
    }
    pub fn is_installed(&self, app: &AppHandle) -> bool {
        source(app).map(|d| installed(&d)).unwrap_or(false)
    }
    pub fn cancel_download(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
    pub fn download(&self, app: &AppHandle) -> Result<()> {
        if self.downloading.swap(true, Ordering::SeqCst) {
            return Err("The handwriting model is already downloading.".into());
        }
        self.cancel.store(false, Ordering::SeqCst);
        let result = self.fetch(app);
        self.downloading.store(false, Ordering::SeqCst);
        let _ = app.emit("handwriting-download", json!({"done": true, "ok": result.is_ok()}));
        result
    }
    fn fetch(&self, app: &AppHandle) -> Result<()> {
        let dir = folder(app)?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(dir.join("verified.txt"));
        let total: u64 = FILES.iter().map(|f| f.2).sum();
        let mut done = 0u64;
        let mut verified = String::new();
        for (remote, local, size, sha) in FILES {
            let part = dir.join(format!("{local}.part"));
            let url = format!("https://huggingface.co/{REPO}/resolve/{REVISION}/{remote}");
            let got = crate::verified_download::fetch(&url, &part, size, sha, &self.cancel, &mut |got| {
                let _ = app.emit("handwriting-download", json!({"received": done + got, "total": total}));
            })?;
            std::fs::rename(&part, dir.join(local)).map_err(|e| e.to_string())?;
            done += got;
            verified.push_str(&format!("{sha} {local}\n"));
        }
        std::fs::write(
            dir.join("LICENSE.txt"),
            "TrOCR base handwritten by Microsoft, MIT License.\nhttps://huggingface.co/microsoft/trocr-base-handwritten\nONNX export: https://huggingface.co/Xenova/trocr-base-handwritten\n",
        )
        .map_err(|e| e.to_string())?;
        std::fs::write(dir.join("verified.txt"), verified).map_err(|e| e.to_string())
    }
    pub fn remove(&self, app: &AppHandle) -> Result<()> {
        // Never wait for the model here (this runs on the window's thread).
        match self.model.try_lock() {
            Ok(mut m) => *m = None,
            Err(std::sync::TryLockError::WouldBlock) => return Err("This model is in use. Try again when it finishes.".into()),
            Err(std::sync::TryLockError::Poisoned(_)) => {}
        }
        let dir = folder(app)?;
        if dir.exists() {
            let base = crate::data_root(app)?.join("Models").join("handwriting").canonicalize().map_err(|e| e.to_string())?;
            let real = dir.canonicalize().map_err(|e| e.to_string())?;
            if real.parent() != Some(base.as_path()) {
                return Err("Model is outside managed storage.".into());
            }
            std::fs::remove_dir_all(real).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn recognize(&self, app: &AppHandle, strokes: &[Stroke]) -> Result<Vec<Line>> {
        let mut guard = self.model.lock().map_err(|_| "Busy")?;
        if guard.is_none() {
            let dir = source(app)?;
            if !installed(&dir) {
                return Err("Download the handwriting model in Settings, Work mode, Handwriting.".into());
            }
            *guard = Some(Model::open(&dir, crate::embed::runtime_env(app)?)?);
        }
        let model = guard.as_mut().ok_or("Model not loaded")?;
        let mut out = vec![];
        for line in group_lines(strokes) {
            let picked: Vec<&Stroke> = line.iter().map(|&i| &strokes[i]).collect();
            let Some((pixels, top, left)) = render_line(&picked) else { continue };
            for (i, word) in model.read_words(pixels)?.into_iter().enumerate() {
                let mut candidates = vec![word.text];
                candidates.extend(word.alts);
                out.push(Line { candidates, top, left: left + i as f32 * 1e-3, unsure: word.unsure });
            }
        }
        Ok(out)
    }
}

impl Reader {
    /// A photo or scan of handwriting (greyscale, one byte per pixel, dark
    /// ink): lines are found, then each is read like ink.
    pub fn read_image(&self, app: &AppHandle, width: usize, height: usize, gray: &[u8]) -> Result<Vec<Line>> {
        if width * height != gray.len() || width < 16 || height < 16 {
            return Err("This image could not be read.".into());
        }
        let ink = ink_mask(gray, width, height);
        let mut guard = self.model.lock().map_err(|_| "Busy")?;
        if guard.is_none() {
            let dir = source(app)?;
            if !installed(&dir) {
                return Err("Download the handwriting model in Settings, Work mode, Handwriting.".into());
            }
            *guard = Some(Model::open(&dir, crate::embed::runtime_env(app)?)?);
        }
        let model = guard.as_mut().ok_or("Model not loaded")?;
        let mut out = vec![];
        for (top, bottom, left, right) in find_lines(&ink, width, height) {
            let pixels = frame_crop(gray, width, (top, bottom, left, right));
            for (i, word) in model.read_words(pixels)?.into_iter().enumerate() {
                let mut candidates = vec![word.text];
                candidates.extend(word.alts);
                out.push(Line { candidates, top: top as f32, left: left as f32 + i as f32 * 1e-3, unsure: word.unsure });
            }
        }
        Ok(out)
    }
}

impl Model {
    fn open(dir: &Path, env: &ort::environment::Environment) -> Result<Self> {
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
        let session = |file: &str| -> Result<ort::session::Session> {
            ort::session::Session::builder(env)
                .map_err(|e| e.to_string())?
                .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)
                .map_err(|e| e.to_string())?
                .with_intra_threads((threads / 2).clamp(1, 4))
                .map_err(|e| e.to_string())?
                .commit_from_file(dir.join(file))
                .map_err(|e| e.to_string())
        };
        Ok(Model {
            encoder: session("encoder.onnx")?,
            decoder: session("decoder.onnx")?,
            tokenizer: tokenizers::Tokenizer::from_file(dir.join("tokenizer.json")).map_err(|e| e.to_string())?,
        })
    }
    /// One line image (SIZE x SIZE, values 0 to 1, 1 = paper) to words, each
    /// with alternatives where the model hesitated.
    fn read_words(&mut self, pixels: Vec<f32>) -> Result<Vec<Word>> {
        let hidden = self.encode(pixels)?;
        let (ids, steps) = self.decode(&hidden, &[])?;
        let mut words = self.words(&ids, &steps);
        // Read again from the two least certain steps with the second choice,
        // and offer the words that come out differently.
        let mut doubtful: Vec<(usize, f32)> = steps.iter().enumerate().filter(|(_, s)| s.best < 0.7).map(|(i, s)| (i, s.best)).collect();
        doubtful.sort_by(|a, b| a.1.total_cmp(&b.1));
        for (step, _) in doubtful.into_iter().take(2) {
            let mut forced: Vec<i64> = ids[1..1 + step].to_vec();
            forced.push(steps[step].second);
            let (alt_ids, alt_steps) = self.decode(&hidden, &forced)?;
            let alt = self.words(&alt_ids, &alt_steps);
            if alt.len() != words.len() {
                continue;
            }
            for (w, a) in words.iter_mut().zip(alt) {
                let differs = a.text.to_lowercase() != w.text.to_lowercase();
                if differs && !a.text.is_empty() && !w.alts.contains(&a.text) && w.alts.len() < 3 {
                    w.alts.push(a.text);
                }
            }
        }
        Ok(words)
    }
    #[cfg(test)]
    fn read(&mut self, pixels: Vec<f32>) -> Result<String> {
        Ok(self.read_words(pixels)?.into_iter().map(|w| w.text).collect::<Vec<_>>().join(" "))
    }
    fn encode(&mut self, pixels: Vec<f32>) -> Result<(Vec<usize>, Vec<f32>)> {
        let mut input = Vec::with_capacity(3 * SIZE * SIZE);
        for _ in 0..3 {
            input.extend(pixels.iter().map(|v| v * 2.0 - 1.0)); // mean 0.5, std 0.5
        }
        let image = ort::value::Tensor::from_array(([1usize, 3, SIZE, SIZE], input)).map_err(|e| e.to_string())?;
        let encoder_input = self.encoder.inputs()[0].name().to_string();
        let encoded = self.encoder.run(ort::inputs![encoder_input.as_str() => image]).map_err(|e| e.to_string())?;
        let (dims, hidden) = encoded[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        Ok((dims.iter().map(|&d| d as usize).collect(), hidden.to_vec()))
    }
    /// Greedy decoding after an optional forced start. Returns the tokens
    /// (with the start token) and, per step, how sure the model was.
    fn decode(&mut self, hidden: &(Vec<usize>, Vec<f32>), forced: &[i64]) -> Result<(Vec<i64>, Vec<Step>)> {
        let names: Vec<String> = self.decoder.inputs().iter().map(|i| i.name().to_string()).collect();
        let ids_name = names.iter().find(|n| n.contains("input_ids")).cloned().ok_or("Unexpected model")?;
        let hidden_name = names.iter().find(|n| n.contains("encoder_hidden_states")).cloned().ok_or("Unexpected model")?;
        let mut ids: Vec<i64> = vec![START];
        ids.extend_from_slice(forced);
        let mut steps: Vec<Step> = forced.iter().map(|_| Step { best: 1.0, second: END }).collect();
        while ids.len() <= MAX_TOKENS {
            let tokens = ort::value::Tensor::from_array(([1usize, ids.len()], ids.clone())).map_err(|e| e.to_string())?;
            let states = ort::value::Tensor::from_array((hidden.0.clone(), hidden.1.clone())).map_err(|e| e.to_string())?;
            let out = self
                .decoder
                .run(ort::inputs![ids_name.as_str() => tokens, hidden_name.as_str() => states])
                .map_err(|e| e.to_string())?;
            let (shape, logits) = out[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
            let vocab = *shape.last().ok_or("Bad output")? as usize;
            let row = &logits[(ids.len() - 1) * vocab..ids.len() * vocab];
            let (best, second) = top_two(row);
            if best.0 as i64 == END {
                break;
            }
            let next = best.0 as i64;
            // The same token over and over means the model is stuck.
            if ids.len() > 4 && ids[ids.len() - 4..].iter().all(|&x| x == next) {
                break;
            }
            ids.push(next);
            steps.push(Step { best: best.1, second: second.0 as i64 });
        }
        Ok((ids, steps))
    }
    /// Tokens to words (a token starting with "Ġ" starts a word), each with
    /// the lowest certainty of its tokens. Punctuation joins the word before.
    fn words(&self, ids: &[i64], steps: &[Step]) -> Vec<Word> {
        let mut groups: Vec<(Vec<u32>, f32)> = vec![];
        for (i, &id) in ids.iter().enumerate().skip(1) {
            let piece = self.tokenizer.id_to_token(id as u32).unwrap_or_default();
            let sure = steps.get(i - 1).map(|s| s.best).unwrap_or(1.0);
            if piece.starts_with('Ġ') || groups.is_empty() {
                groups.push((vec![id as u32], sure));
            } else if let Some(last) = groups.last_mut() {
                last.0.push(id as u32);
                last.1 = last.1.min(sure);
            }
        }
        let mut words: Vec<Word> = vec![];
        for (tokens, sure) in groups {
            let text = self.tokenizer.decode(&tokens, true).unwrap_or_default().trim().to_string();
            if text.is_empty() {
                continue;
            }
            if text.chars().all(|c| c.is_ascii_punctuation()) {
                if let Some(prev) = words.last_mut() {
                    prev.text.push_str(&text);
                    continue;
                }
            }
            words.push(Word { text, alts: vec![], unsure: sure < 0.5 });
        }
        words
    }
}

#[derive(Clone, Copy)]
struct Step {
    best: f32,
    second: i64,
}
#[derive(Debug)]
struct Word {
    text: String,
    alts: Vec<String>,
    unsure: bool,
}
// The two likeliest tokens and their probabilities.
fn top_two(row: &[f32]) -> ((usize, f32), (usize, f32)) {
    let max = row.iter().copied().fold(f32::MIN, f32::max);
    let sum: f32 = row.iter().map(|v| (v - max).exp()).sum();
    let (mut a, mut b) = ((0usize, f32::MIN), (0usize, f32::MIN));
    for (i, &v) in row.iter().enumerate() {
        if v > a.1 {
            b = a;
            a = (i, v);
        } else if v > b.1 {
            b = (i, v);
        }
    }
    ((a.0, (a.1 - max).exp() / sum), (b.0, (b.1 - max).exp() / sum))
}

// --- Photos ------------------------------------------------------------------------------
/// Ink pixels of a photo: darker than the paper around them (a local mean,
/// so shadows and uneven light do not count as ink).
pub fn ink_mask(gray: &[u8], w: usize, h: usize) -> Vec<bool> {
    let mut sum = vec![0u64; (w + 1) * (h + 1)];
    for y in 0..h {
        let mut row = 0u64;
        for x in 0..w {
            row += gray[y * w + x] as u64;
            sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
        }
    }
    let r = (w.max(h) / 40).clamp(8, 60);
    let mut ink = vec![false; w * h];
    for y in 0..h {
        let (y0, y1) = (y.saturating_sub(r), (y + r + 1).min(h));
        for x in 0..w {
            let (x0, x1) = (x.saturating_sub(r), (x + r + 1).min(w));
            let area = ((y1 - y0) * (x1 - x0)) as u64;
            let total = sum[y1 * (w + 1) + x1] + sum[y0 * (w + 1) + x0] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0];
            let mean = (total / area) as i32;
            let v = gray[y * w + x] as i32;
            ink[y * w + x] = v < mean - 18 && v < 200;
        }
    }
    ink
}

/// Lines of writing: bands of rows with ink, joined across small gaps,
/// each with its left and right ink edges. Top to bottom.
pub fn find_lines(ink: &[bool], w: usize, h: usize) -> Vec<(usize, usize, usize, usize)> {
    let counts: Vec<usize> = (0..h).map(|y| ink[y * w..(y + 1) * w].iter().filter(|&&v| v).count()).collect();
    let smooth: Vec<f32> = (0..h).map(|y| (y.saturating_sub(2)..(y + 3).min(h)).map(|i| counts[i] as f32).sum::<f32>() / 5.0).collect();
    let peak = smooth.iter().copied().fold(0.0f32, f32::max);
    let on = (peak * 0.08).max(2.0);
    let mut bands: Vec<(usize, usize)> = vec![];
    let mut start = None;
    for (y, &v) in smooth.iter().enumerate() {
        match (start, v > on) {
            (None, true) => start = Some(y),
            (Some(s), false) => {
                bands.push((s, y));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        bands.push((s, h));
    }
    if bands.is_empty() {
        return vec![];
    }
    // Join bands closer than a third of a typical line (descenders, dots).
    let mut heights: Vec<usize> = bands.iter().map(|b| b.1 - b.0).collect();
    heights.sort();
    let typical = heights[heights.len() / 2].max(6);
    let mut joined: Vec<(usize, usize)> = vec![];
    for b in bands {
        match joined.last_mut() {
            Some(last) if b.0 - last.1 < typical / 3 => last.1 = b.1,
            _ => joined.push(b),
        }
    }
    joined
        .into_iter()
        .filter(|b| b.1 - b.0 >= (typical / 3).max(6))
        .filter_map(|(top, bottom)| {
            let pad = (bottom - top) / 4;
            let (top, bottom) = (top.saturating_sub(pad), (bottom + pad).min(h));
            let cols: Vec<usize> = (0..w).filter(|&x| (top..bottom).any(|y| ink[y * w + x])).collect();
            let (left, right) = (*cols.first()?, *cols.last()? + 1);
            (right - left >= 8).then_some((top, bottom, left, right))
        })
        .collect()
}

/// A line cut from a photo, contrast stretched, padded to at least four
/// times wider than tall (as for ink) and squeezed to the model's size.
fn frame_crop(gray: &[u8], w: usize, (top, bottom, left, right): (usize, usize, usize, usize)) -> Vec<f32> {
    let (cw, ch) = (right - left, bottom - top);
    let mut values: Vec<u8> = (top..bottom).flat_map(|y| gray[y * w + left..y * w + right].iter().copied()).collect();
    values.sort_unstable();
    let dark = values[values.len() / 50] as f32;
    let light = values[values.len() * 9 / 10] as f32;
    let span = (light - dark).max(20.0);
    let pad = ch / 6 + 2;
    let fw = (cw + pad * 2).max((ch + pad * 2) * 4);
    let fh = ch + pad * 2;
    let mut canvas = vec![1.0f32; fw * fh];
    for y in 0..ch {
        for x in 0..cw {
            let v = gray[(top + y) * w + left + x] as f32;
            canvas[(y + pad) * fw + x + pad] = ((v - dark) / span).clamp(0.0, 1.0);
        }
    }
    resize(&canvas, fw, fh, SIZE, SIZE)
}

// --- Lines -------------------------------------------------------------------------------
fn bounds(s: &Stroke) -> Option<(f32, f32, f32, f32)> {
    let mut b = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for [x, y, _] in &s.p {
        b = (b.0.min(*x), b.1.min(*y), b.2.max(*x), b.3.max(*y));
    }
    (b.0 <= b.2).then_some(b)
}

/// Strokes grouped into lines of writing, top to bottom. A stroke joins a
/// line when it shares most of the line's height (dots and accents too).
pub fn group_lines(strokes: &[Stroke]) -> Vec<Vec<usize>> {
    let mut items: Vec<(usize, (f32, f32, f32, f32))> = strokes.iter().enumerate().filter_map(|(i, s)| bounds(s).map(|b| (i, b))).collect();
    // Typical letter height, to judge small marks and gaps.
    let mut heights: Vec<f32> = items.iter().map(|(_, b)| b.3 - b.1).filter(|h| *h > 1.0).collect();
    heights.sort_by(f32::total_cmp);
    let typical = heights.get(heights.len() / 2).copied().unwrap_or(20.0).max(4.0);
    items.sort_by(|a, b| ((a.1 .1 + a.1 .3) / 2.0).total_cmp(&((b.1 .1 + b.1 .3) / 2.0)));
    let mut lines: Vec<(f32, f32, Vec<usize>)> = vec![];
    for (i, b) in items {
        let centre = (b.1 + b.3) / 2.0;
        let found = lines.iter_mut().find(|(top, bottom, _)| {
            let overlap = (b.3.min(*bottom) - b.1.max(*top)).max(0.0);
            let smaller = (b.3 - b.1).min(*bottom - *top).max(1.0);
            overlap >= smaller * 0.5 || (centre >= *top - typical * 0.6 && centre <= *bottom + typical * 0.6 && b.3 - b.1 < typical * 0.6)
        });
        match found {
            Some(line) => {
                line.0 = line.0.min(b.1);
                line.1 = line.1.max(b.3);
                line.2.push(i);
            }
            None => lines.push((b.1, b.3, vec![i])),
        }
    }
    lines.sort_by(|a, b| a.0.total_cmp(&b.0));
    lines.into_iter().map(|l| l.2).collect()
}

/// Draws a line of strokes as dark ink on white at a natural size, then
/// squeezes it to SIZE x SIZE as the model expects. Returns the pixels and
/// where the line sits (top, left) for reading order.
pub fn render_line(strokes: &[&Stroke]) -> Option<(Vec<f32>, f32, f32)> {
    let mut b = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for s in strokes {
        if let Some(x) = bounds(s) {
            b = (b.0.min(x.0), b.1.min(x.1), b.2.max(x.2), b.3.max(x.3));
        }
    }
    if b.0 > b.2 {
        return None;
    }
    let (w, h) = ((b.2 - b.0).max(1.0), (b.3 - b.1).max(1.0));
    // Writing about 96 px tall, with margins, at most 2400 px wide.
    let mut scale = 96.0 / h;
    if w * scale > 2200.0 {
        scale = 2200.0 / w;
    }
    let pad = 17.0;
    // At least four times wider than tall, writing at the left: short words
    // squeezed to fill the square read badly, wide blank space invites the
    // model to invent words (measured on handwriting fonts, see the tests).
    let ch = (h * scale + pad * 2.0).ceil() as usize;
    let cw = ((w * scale + pad * 2.0).ceil() as usize).max(ch * 4);
    let mut canvas = vec![1.0f32; cw * ch];
    let radius = (2.6f32).max(h * scale / ink_ratio());
    for s in strokes {
        let pts: Vec<(f32, f32)> = s.p.iter().map(|[x, y, _]| ((x - b.0) * scale + pad, (y - b.1) * scale + pad)).collect();
        if pts.len() == 1 {
            disc(&mut canvas, cw, ch, pts[0], pts[0], radius);
        }
        for pair in pts.windows(2) {
            disc(&mut canvas, cw, ch, pair[0], pair[1], radius);
        }
    }
    Some((resize(&canvas, cw, ch, SIZE, SIZE), b.1, b.0))
}

// Pen width as a share of the line's height. Measured on 48 lines of pen
// strokes made from four handwriting fonts: 1/26 read 37 exactly, 1/18 31,
// 1/34 30 (trocr_reads_stroke_samples).
fn ink_ratio() -> f32 {
    #[cfg(test)]
    if let Some(v) = std::env::var("ORIGAMI_TEST_INK_RATIO").ok().and_then(|v| v.parse().ok()) {
        return v;
    }
    26.0
}

// A thick segment with soft edges.
fn disc(canvas: &mut [f32], w: usize, h: usize, a: (f32, f32), b: (f32, f32), r: f32) {
    let (x0, x1) = ((a.0.min(b.0) - r - 1.0).max(0.0) as usize, ((a.0.max(b.0) + r + 1.0) as usize).min(w - 1));
    let (y0, y1) = ((a.1.min(b.1) - r - 1.0).max(0.0) as usize, ((a.1.max(b.1) + r + 1.0) as usize).min(h - 1));
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len = dx * dx + dy * dy;
    for y in y0..=y1 {
        for x in x0..=x1 {
            let (px, py) = (x as f32 + 0.5, y as f32 + 0.5);
            let t = if len > 0.0 { (((px - a.0) * dx + (py - a.1) * dy) / len).clamp(0.0, 1.0) } else { 0.0 };
            let d = ((px - a.0 - t * dx).powi(2) + (py - a.1 - t * dy).powi(2)).sqrt();
            let ink = (r + 0.5 - d).clamp(0.0, 1.0);
            let v = &mut canvas[y * w + x];
            *v = v.min(1.0 - ink);
        }
    }
}

// Area-averaging resize (good for shrinking a long line).
fn resize(src: &[f32], sw: usize, sh: usize, dw: usize, dh: usize) -> Vec<f32> {
    let mut out = vec![1.0f32; dw * dh];
    let (fx, fy) = (sw as f32 / dw as f32, sh as f32 / dh as f32);
    for y in 0..dh {
        let (sy0, sy1) = (y as f32 * fy, (y as f32 + 1.0) * fy);
        for x in 0..dw {
            let (sx0, sx1) = (x as f32 * fx, (x as f32 + 1.0) * fx);
            let mut sum = 0.0;
            let mut area = 0.0;
            let mut yy = sy0.floor() as usize;
            while (yy as f32) < sy1 && yy < sh {
                let wy = (sy1.min(yy as f32 + 1.0) - sy0.max(yy as f32)).max(0.0);
                let mut xx = sx0.floor() as usize;
                while (xx as f32) < sx1 && xx < sw {
                    let wx = (sx1.min(xx as f32 + 1.0) - sx0.max(xx as f32)).max(0.0);
                    sum += src[yy * sw + xx] * wx * wy;
                    area += wx * wy;
                    xx += 1;
                }
                yy += 1;
            }
            out[y * dw + x] = if area > 0.0 { sum / area } else { 1.0 };
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(a: (f32, f32), b: (f32, f32)) -> Stroke {
        Stroke { p: (0..=10).map(|i| i as f32 / 10.0).map(|t| [a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t, 0.5]).collect() }
    }

    #[test]
    fn strokes_are_grouped_into_lines_with_their_dots() {
        let strokes = vec![
            line((10.0, 10.0), (10.0, 50.0)),  // line 1
            line((40.0, 20.0), (40.0, 50.0)),  // line 1
            line((40.0, 12.0), (40.5, 13.0)),  // the dot of an i, line 1
            line((10.0, 110.0), (10.0, 150.0)), // line 2
            line((60.0, 115.0), (90.0, 150.0)), // line 2
        ];
        let lines = group_lines(&strokes);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].len(), 3);
        assert_eq!(lines[1].len(), 2);
    }

    #[test]
    fn lines_are_found_in_a_photo_despite_uneven_light() {
        // Three lines of "writing" (dark blocks) on paper that gets darker to the right.
        let (w, h) = (400usize, 300usize);
        let mut gray: Vec<u8> = (0..w * h).map(|i| (235 - (i % w) / 8) as u8).collect();
        for (top, bottom) in [(40, 70), (130, 160), (220, 250)] {
            for y in top..bottom {
                for x in (30..360).filter(|x| x % 12 < 6) {
                    gray[y * w + x] = 40;
                }
            }
        }
        let ink = ink_mask(&gray, w, h);
        let lines = find_lines(&ink, w, h);
        assert_eq!(lines.len(), 3, "{lines:?}");
        assert!(lines[0].0 < 40 && lines[0].1 > 70);
        assert!(lines[1].2 <= 36 && lines[1].3 >= 354, "{:?}", lines[1]);
        let framed = frame_crop(&gray, w, lines[0]);
        assert_eq!(framed.len(), SIZE * SIZE);
    }

    #[test]
    fn a_line_is_drawn_dark_on_white_at_the_model_size() {
        let s = [line((0.0, 0.0), (300.0, 0.0)), line((0.0, 0.0), (0.0, 60.0))];
        let (pixels, top, left) = render_line(&s.iter().collect::<Vec<_>>()).unwrap();
        assert_eq!(pixels.len(), SIZE * SIZE);
        assert_eq!((top, left), (0.0, 0.0));
        let dark = pixels.iter().filter(|v| **v < 0.5).count();
        assert!(dark > 500 && dark < SIZE * SIZE / 3, "{dark}");
        assert!(pixels[0] > 0.99);
    }

    // An image file (PGM, any size) read the same way, to check the model alone.
    #[test]
    #[ignore]
    fn trocr_reads_an_image() {
        let dir = PathBuf::from(std::env::var("ORIGAMI_TEST_TROCR_DIR").unwrap());
        let env = ort::init_from(std::env::var("ORT_DYLIB_PATH").unwrap()).unwrap().build().unwrap();
        let mut m = Model::open(&dir, &env).unwrap();
        let bytes = std::fs::read(std::env::var("ORIGAMI_TEST_TROCR_IMAGE").unwrap()).unwrap();
        let header: Vec<&[u8]> = bytes.splitn(5, |b| b.is_ascii_whitespace()).collect();
        let (w, h) = (std::str::from_utf8(header[1]).unwrap().parse::<usize>().unwrap(), std::str::from_utf8(header[2]).unwrap().parse::<usize>().unwrap());
        let data = &bytes[bytes.len() - w * h..];
        let src: Vec<f32> = data.iter().map(|&b| b as f32 / 255.0).collect();
        let text = m.read(resize(&src, w, h, SIZE, SIZE)).unwrap();
        println!("image read: {text:?}");
    }

    // A photo of a page (PGM): lines found, then read, as the app does.
    #[test]
    #[ignore]
    fn trocr_reads_a_page_photo() {
        let dir = PathBuf::from(std::env::var("ORIGAMI_TEST_TROCR_DIR").unwrap());
        let env = ort::init_from(std::env::var("ORT_DYLIB_PATH").unwrap()).unwrap().build().unwrap();
        let mut m = Model::open(&dir, &env).unwrap();
        let bytes = std::fs::read(std::env::var("ORIGAMI_TEST_PHOTO").unwrap()).unwrap();
        let header: Vec<&[u8]> = bytes.splitn(5, |b| b.is_ascii_whitespace()).collect();
        let (w, h) = (std::str::from_utf8(header[1]).unwrap().parse::<usize>().unwrap(), std::str::from_utf8(header[2]).unwrap().parse::<usize>().unwrap());
        let gray = &bytes[bytes.len() - w * h..];
        let lines = find_lines(&ink_mask(gray, w, h), w, h);
        println!("PHOTO {} lines", lines.len());
        for l in lines {
            let words = m.read_words(frame_crop(gray, w, l)).unwrap();
            println!("PHOTO {:?} {}", l, words.iter().map(|w| format!("{}{}", w.text, if w.unsure { "?" } else { "" })).collect::<Vec<_>>().join(" "));
        }
    }

    // Every PGM in a folder, for comparing ways of framing a line.
    #[test]
    #[ignore]
    fn trocr_reads_a_folder() {
        let dir = PathBuf::from(std::env::var("ORIGAMI_TEST_TROCR_DIR").unwrap());
        let env = ort::init_from(std::env::var("ORT_DYLIB_PATH").unwrap()).unwrap().build().unwrap();
        let mut m = Model::open(&dir, &env).unwrap();
        let mut files: Vec<_> = std::fs::read_dir(std::env::var("ORIGAMI_TEST_TROCR_SAMPLES").unwrap()).unwrap().flatten().map(|e| e.path()).filter(|p| p.extension().map(|e| e == "pgm").unwrap_or(false)).collect();
        files.sort();
        for f in files {
            let bytes = std::fs::read(&f).unwrap();
            let header: Vec<&[u8]> = bytes.splitn(5, |b| b.is_ascii_whitespace()).collect();
            let (w, h) = (std::str::from_utf8(header[1]).unwrap().parse::<usize>().unwrap(), std::str::from_utf8(header[2]).unwrap().parse::<usize>().unwrap());
            let src: Vec<f32> = bytes[bytes.len() - w * h..].iter().map(|&b| b as f32 / 255.0).collect();
            let text = m.read(resize(&src, w, h, SIZE, SIZE)).unwrap();
            println!("SAMPLE {}	{}", f.file_name().unwrap().to_string_lossy(), text);
        }
    }

    // Strokes from a JSON file ({"key": {"text", "strokes": [{"p": [[x,y,p]]}]}}),
    // read line by line as the app does, with a score.
    #[test]
    #[ignore]
    fn trocr_reads_stroke_samples() {
        let dir = PathBuf::from(std::env::var("ORIGAMI_TEST_TROCR_DIR").unwrap());
        let env = ort::init_from(std::env::var("ORT_DYLIB_PATH").unwrap()).unwrap().build().unwrap();
        let mut m = Model::open(&dir, &env).unwrap();
        let samples: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(std::env::var("ORIGAMI_TEST_STROKES").unwrap()).unwrap()).unwrap();
        let norm = |s: &str| s.to_lowercase().chars().filter(|c| c.is_alphanumeric() || *c == ' ').collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
        let mut right = 0;
        let mut alts_right = 0;
        for (key, v) in samples.as_object().unwrap() {
            let strokes: Vec<Stroke> = v["strokes"].as_array().unwrap().iter().map(|s| Stroke { p: serde_json::from_value(s["p"].clone()).unwrap() }).collect();
            let mut words = vec![];
            for line in group_lines(&strokes) {
                let picked: Vec<&Stroke> = line.iter().map(|&i| &strokes[i]).collect();
                let (pixels, _, _) = render_line(&picked).unwrap();
                words.extend(m.read_words(pixels).unwrap());
            }
            let got = words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
            // A word counts as found when it is the reading or an alternative.
            let expected: Vec<String> = norm(v["text"].as_str().unwrap()).split(' ').map(String::from).collect();
            let offered = words.len() == expected.len()
                && words.iter().zip(&expected).all(|(w, e)| norm(&w.text) == *e || w.alts.iter().any(|a| norm(a) == *e));
            alts_right += offered as usize;
            let detail: Vec<String> = words.iter().map(|w| format!("{}{}{}", w.text, if w.unsure { "?" } else { "" }, if w.alts.is_empty() { String::new() } else { format!("[{}]", w.alts.join("|")) })).collect();
            println!("DETAIL {key} {}", detail.join(" "));
            let ok = norm(&got) == norm(v["text"].as_str().unwrap());
            right += ok as usize;
            println!("STROKES {key} {} -> {got}", if ok { "OK" } else { "  " });
        }
        println!("SCORE {right}/{} (with alternatives {alts_right})", samples.as_object().unwrap().len());
    }

    // Needs the model files and ONNX Runtime:
    //   ORIGAMI_TEST_TROCR_DIR=<folder with encoder.onnx, decoder.onnx, tokenizer.json>
    //   ORT_DYLIB_PATH=<onnxruntime.dll> cargo test handwriting -- --ignored --nocapture
    #[test]
    #[ignore]
    fn trocr_reads_simple_block_letters() {
        let dir = PathBuf::from(std::env::var("ORIGAMI_TEST_TROCR_DIR").unwrap());
        let env = ort::init_from(std::env::var("ORT_DYLIB_PATH").unwrap()).unwrap().build().unwrap();
        let mut m = Model::open(&dir, &env).unwrap();
        // "HI" in block capitals.
        let strokes = [
            line((0.0, 0.0), (0.0, 60.0)),
            line((30.0, 0.0), (30.0, 60.0)),
            line((0.0, 30.0), (30.0, 30.0)),
            line((60.0, 0.0), (60.0, 60.0)),
        ];
        let (pixels, _, _) = render_line(&strokes.iter().collect::<Vec<_>>()).unwrap();
        if let Ok(path) = std::env::var("ORIGAMI_TEST_TROCR_PGM") {
            let mut pgm = format!("P5 {SIZE} {SIZE} 255
").into_bytes();
            pgm.extend(pixels.iter().map(|v| (v * 255.0) as u8));
            std::fs::write(path, pgm).unwrap();
        }
        let text = m.read(pixels).unwrap();
        println!("read: {text:?}");
        assert!(!text.is_empty());
    }
}
