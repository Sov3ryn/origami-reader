// Work Mode's "Related" model: IBM Granite Embedding Multilingual R2
// (Apache-2.0), run in this process with ONNX Runtime on the processor, so it
// never competes with speech or artwork for the graphics card. Models are
// downloaded only when the reader asks, from a pinned Hugging Face revision,
// and every file is checked against its published SHA-256.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

type Result<T> = std::result::Result<T, String>;

/// Vectors are cut to this many numbers (the larger model is Matryoshka
/// trained), so both models share one index size.
pub const DIMS: usize = 384;
const MAX_TOKENS: usize = 512;
const PAD: u32 = 179_935;

struct File {
    remote: &'static str,
    local: &'static str,
    size: u64,
    sha256: &'static str,
}
pub struct Spec {
    pub id: &'static str,
    pub name: &'static str,
    repo: &'static str,
    revision: &'static str,
    // Quantised weights need AVX2; other processors get full precision.
    fast: File,
    full: File,
    tokenizer: File,
}
pub const MODELS: &[Spec] = &[
    Spec {
        id: "standard",
        name: "Granite Embedding 97M Multilingual R2",
        repo: "ibm-granite/granite-embedding-97m-multilingual-r2",
        revision: "835ad14087e140460703cf0fae09f97d469d65c2",
        fast: File {
            remote: "onnx/model_quint8_avx2.onnx",
            local: "model.onnx",
            size: 98_247_878,
            sha256: "a6022dd8220ea6f6595562a1328ee216f4a94faa55362f2f4747c80f1e78772e",
        },
        full: File {
            remote: "onnx/model.onnx",
            local: "model.onnx",
            size: 390_004_608,
            sha256: "68e592b160673d30250824c1116bc6ab33f70efb22b97c9e1d7ce1e69c1c9d70",
        },
        tokenizer: File {
            remote: "tokenizer.json",
            local: "tokenizer.json",
            size: 25_301_672,
            sha256: "4f2842d568e2724370aec203652a42ac783c7937f8347a1a2cc7506d71f1582f",
        },
    },
    Spec {
        id: "precise",
        name: "Granite Embedding 311M Multilingual R2",
        repo: "ibm-granite/granite-embedding-311m-multilingual-r2",
        revision: "44399559930365213510b1ee2eb15ded83374f0e",
        fast: File {
            remote: "onnx/model_quint8_avx2.onnx",
            local: "model.onnx",
            size: 313_421_909,
            sha256: "f1fdd44e7e1ac51f12ab7957c7bd092e064d596c288513bf9d326842f669edee",
        },
        full: File {
            remote: "onnx/model.onnx",
            local: "model.onnx",
            size: 1_247_170_481,
            sha256: "75f9f258bf5013f5fe8a4dad61dd0fd16ac0cbaa7a106e3d3f41c2d04a42d541",
        },
        tokenizer: File {
            remote: "tokenizer.json",
            local: "tokenizer.json",
            size: 33_384_821,
            sha256: "0087c868b33bad550a78a08d19798cfd7f713cde4f020803b8f51f405503e15f",
        },
    },
];

fn spec(id: &str) -> Result<&'static Spec> {
    MODELS.iter().find(|m| m.id == id).ok_or_else(|| "Unknown model.".into())
}
fn fast_cpu() -> bool {
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        std::is_x86_feature_detected!("avx2")
    }
    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
    {
        false
    }
}
fn files(s: &'static Spec) -> [&'static File; 2] {
    [if fast_cpu() { &s.fast } else { &s.full }, &s.tokenizer]
}
fn root(app: &AppHandle) -> Result<PathBuf> {
    Ok(crate::data_root(app)?.join("Models").join("embeddings"))
}
fn folder(app: &AppHandle, s: &Spec) -> Result<PathBuf> {
    Ok(root(app)?.join(s.id))
}
fn installed(dir: &Path, s: &'static Spec) -> bool {
    // A finished download leaves a marker naming the weights it verified.
    std::fs::read_to_string(dir.join("verified.txt"))
        .map(|v| files(s).iter().all(|f| v.contains(f.sha256)))
        .unwrap_or(false)
}
// A read-only copy shipped with the app (an offline kit), used when none
// was downloaded. Removing the model never touches it.
fn bundled(s: &'static Spec) -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.join("models").join("embeddings").join(s.id);
    installed(&dir, s).then_some(dir)
}
fn source(app: &AppHandle, s: &'static Spec) -> Result<PathBuf> {
    let own = folder(app, s)?;
    Ok(if installed(&own, s) { own } else { bundled(s).unwrap_or(own) })
}

/// ONNX Runtime, loaded once from the first place it is found: ORT_DYLIB_PATH,
/// the runtime folder beside the app, or the reader's Python packages. The
/// Visual C++ runtime files in that folder are loaded first, by full path, so
/// the library finds them even where they are not installed.
static RUNTIME: std::sync::OnceLock<std::result::Result<ort::environment::Environment, String>> =
    std::sync::OnceLock::new();
fn runtime_library(app: &AppHandle) -> Option<PathBuf> {
    let name = if cfg!(windows) {
        "onnxruntime.dll"
    } else if cfg!(target_os = "macos") {
        "libonnxruntime.dylib"
    } else {
        "libonnxruntime.so"
    };
    if let Some(p) = std::env::var_os("ORT_DYLIB_PATH").map(PathBuf::from).filter(|p| p.is_file()) {
        return Some(p);
    }
    let beside = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|d| d.join("runtime").join(name)));
    if let Some(p) = beside.filter(|p| p.is_file()) {
        return Some(p);
    }
    // Development and older kits: the onnxruntime package of the reader's Python.
    let config = crate::speech::config(app).ok()?;
    let python = config["python"].as_str().map(PathBuf::from)?;
    let base = python.parent()?;
    for dir in [base.join("Lib/site-packages/onnxruntime/capi"), base.join("../Lib/site-packages/onnxruntime/capi")] {
        if dir.join(name).is_file() {
            return Some(dir.join(name));
        }
    }
    let lib = base.parent()?.join("lib");
    std::fs::read_dir(lib).ok()?.flatten().find_map(|py| {
        let p = py.path().join("site-packages/onnxruntime/capi").join(name);
        p.is_file().then_some(p)
    })
}
pub(crate) fn runtime_available(app: &AppHandle) -> bool {
    runtime_library(app).is_some()
}
pub(crate) fn runtime_env(app: &AppHandle) -> Result<&'static ort::environment::Environment> {
    runtime(app)
}
fn runtime(app: &AppHandle) -> Result<&'static ort::environment::Environment> {
    RUNTIME
        .get_or_init(|| {
            let path = runtime_library(app).ok_or("The ONNX Runtime is missing from this installation.")?;
            if let Some(dir) = path.parent() {
                for dep in ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "msvcp140_1.dll"] {
                    let p = dir.join(dep);
                    if cfg!(windows) && p.is_file() {
                        // Kept loaded for the life of the app.
                        if let Ok(l) = unsafe { libloading::Library::new(&p) } {
                            std::mem::forget(l);
                        }
                    }
                }
            }
            ort::init_from(&path)
                .map_err(|e| e.to_string())?
                .with_name("origami-related")
                .with_telemetry(false)
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(|e| e.clone())
}

struct Loaded {
    id: &'static str,
    session: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
}
#[derive(Default)]
pub struct Embedder {
    loaded: Mutex<Option<Loaded>>,
    downloading: Mutex<Option<String>>,
    cancel: AtomicBool,
}

impl Embedder {
    pub fn status(&self, app: &AppHandle) -> Result<Value> {
        let downloading = self.downloading.lock().map_err(|_| "Busy")?.clone();
        let mut rows = vec![];
        for s in MODELS {
            let dir = source(app, s)?;
            rows.push(json!({
                "id": s.id,
                "name": s.name,
                "installed": installed(&dir, s),
                "bundled": bundled(s).is_some(),
                "bytes": files(s).iter().map(|f| f.size).sum::<u64>(),
                "downloading": downloading.as_deref() == Some(s.id),
            }));
        }
        Ok(json!({ "models": rows, "fast": fast_cpu(), "runtime": runtime_library(app).is_some() }))
    }

    pub fn cancel_download(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn download(&self, app: &AppHandle, id: &str) -> Result<()> {
        let s = spec(id)?;
        {
            let mut d = self.downloading.lock().map_err(|_| "Busy")?;
            if d.is_some() {
                return Err("Another model is downloading.".into());
            }
            *d = Some(s.id.into());
        }
        self.cancel.store(false, Ordering::SeqCst);
        let result = self.fetch(app, s);
        *self.downloading.lock().map_err(|_| "Busy")? = None;
        let _ = app.emit("embedding-download", json!({"id": s.id, "done": true, "ok": result.is_ok()}));
        result
    }

    fn fetch(&self, app: &AppHandle, s: &'static Spec) -> Result<()> {
        let dir = folder(app, s)?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(dir.join("verified.txt"));
        let total: u64 = files(s).iter().map(|f| f.size).sum();
        let mut done = 0u64;
        let mut verified = String::new();
        for f in files(s) {
            let target = dir.join(f.local);
            let part = dir.join(format!("{}.part", f.local));
            let url = format!("https://huggingface.co/{}/resolve/{}/{}", s.repo, s.revision, f.remote);
            let response = ureq::get(&url)
                .call()
                .map_err(|e| format!("Download failed: {e}"))?;
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
                if got > f.size {
                    break;
                }
                if last.elapsed().as_millis() > 250 {
                    last = std::time::Instant::now();
                    let _ = app.emit("embedding-download", json!({"id": s.id, "received": done + got, "total": total}));
                }
            }
            out.flush().map_err(|e| e.to_string())?;
            drop(out);
            let digest: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
            if got != f.size || digest != f.sha256 {
                let _ = std::fs::remove_file(&part);
                return Err("The download did not match the published file. Try again.".into());
            }
            std::fs::rename(&part, &target).map_err(|e| e.to_string())?;
            done += got;
            verified.push_str(&format!("{} {}\n", f.sha256, f.local));
        }
        std::fs::write(
            dir.join("LICENSE.txt"),
            format!("{} by IBM, Apache License 2.0.\nhttps://www.apache.org/licenses/LICENSE-2.0\nSource: https://huggingface.co/{}\n", s.name, s.repo),
        )
        .map_err(|e| e.to_string())?;
        std::fs::write(dir.join("verified.txt"), verified).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove(&self, app: &AppHandle, id: &str) -> Result<()> {
        let s = spec(id)?;
        if let Ok(mut l) = self.loaded.lock() {
            if l.as_ref().map(|x| x.id) == Some(s.id) {
                *l = None;
            }
        }
        let dir = folder(app, s)?;
        if dir.exists() {
            // Only Origami's own embeddings folder is ever removed.
            let base = root(app)?.canonicalize().map_err(|e| e.to_string())?;
            let real = dir.canonicalize().map_err(|e| e.to_string())?;
            if real.parent() != Some(base.as_path()) {
                return Err("Model is outside managed storage.".into());
            }
            std::fs::remove_dir_all(real).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Normalised vectors, DIMS numbers each, for up to 64 passages.
    pub fn embed(&self, app: &AppHandle, id: &str, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        let s = spec(id)?;
        if texts.len() > 64 {
            return Err("Too many passages at once.".into());
        }
        let mut guard = self.loaded.lock().map_err(|_| "Busy")?;
        if guard.as_ref().map(|l| l.id) != Some(s.id) {
            *guard = None;
            let dir = source(app, s)?;
            if !installed(&dir, s) {
                return Err("This model is not downloaded.".into());
            }
            *guard = Some(Loaded::open(s.id, &dir, runtime(app)?)?);
        }
        guard.as_mut().ok_or("Model not loaded")?.embed(texts)
    }
}

impl Loaded {
    fn open(id: &'static str, dir: &Path, environment: &ort::environment::Environment) -> Result<Self> {
            let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2);
            let session = ort::session::Session::builder(environment)
                .map_err(|e| e.to_string())?
                .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)
                .map_err(|e| e.to_string())?
                // Half the cores at most, so reading and the interface stay smooth.
                .with_intra_threads((threads / 2).clamp(1, 4))
                .map_err(|e| e.to_string())?
                .commit_from_file(dir.join("model.onnx"))
                .map_err(|e| e.to_string())?;
            let mut tokenizer =
                tokenizers::Tokenizer::from_file(dir.join("tokenizer.json")).map_err(|e| e.to_string())?;
            tokenizer
                .with_truncation(Some(tokenizers::TruncationParams {
                    max_length: MAX_TOKENS,
                    ..Default::default()
                }))
                .map_err(|e| e.to_string())?;
            tokenizer.with_padding(None);
            Ok(Loaded { id, session, tokenizer })
    }
    fn embed(&mut self, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
        let loaded = self;
        let mut out = Vec::with_capacity(texts.len());
        // One passage at a time: this export does not mask padding, so mixing
        // lengths in one batch would change the vectors.
        for chunk in texts.chunks(1) {
            let enc = loaded
                .tokenizer
                .encode_batch(chunk.to_vec(), true)
                .map_err(|e| e.to_string())?;
            let len = enc.iter().map(|e| e.get_ids().len()).max().unwrap_or(1).max(1);
            let mut ids = Vec::with_capacity(chunk.len() * len);
            let mut mask = Vec::with_capacity(chunk.len() * len);
            for e in &enc {
                let n = e.get_ids().len();
                ids.extend(e.get_ids().iter().map(|&x| x as i64));
                ids.extend(std::iter::repeat(PAD as i64).take(len - n));
                mask.extend(std::iter::repeat(1i64).take(n));
                mask.extend(std::iter::repeat(0i64).take(len - n));
            }
            let shape = [chunk.len(), len];
            let ids = ort::value::Tensor::from_array((shape, ids)).map_err(|e| e.to_string())?;
            let mask = ort::value::Tensor::from_array((shape, mask)).map_err(|e| e.to_string())?;
            let outputs = loaded
                .session
                .run(ort::inputs!["input_ids" => ids, "attention_mask" => mask])
                .map_err(|e| e.to_string())?;
            let (dims, data) = outputs[0]
                .try_extract_tensor::<f32>()
                .map_err(|e| e.to_string())?;
            let hidden = *dims.last().ok_or("Bad output")? as usize;
            for row in 0..chunk.len() {
                // The first token (CLS) is the passage's vector.
                let start = row * len * hidden;
                let mut v: Vec<f32> = data[start..start + hidden.min(DIMS)].to_vec();
                let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
                v.iter_mut().for_each(|x| *x /= norm);
                out.push(v);
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // Needs the downloaded model and ONNX Runtime:
    //   ORIGAMI_TEST_EMBED_DIR=<folder with model.onnx and tokenizer.json>
    //   ORT_DYLIB_PATH=<onnxruntime.dll> cargo test embed -- --ignored
    #[test]
    #[ignore]
    fn related_passages_score_higher_across_languages() {
        let dir = PathBuf::from(std::env::var("ORIGAMI_TEST_EMBED_DIR").unwrap());
        let env = ort::init_from(std::env::var("ORT_DYLIB_PATH").unwrap()).unwrap().build().unwrap();
        let mut m = Loaded::open("standard", &dir, &env).unwrap();
        let v = m
            .embed(
                [
                    "Osmosis is the movement of water across a semipermeable membrane toward higher solute concentration.",
                    "L'osmose est le passage de l'eau à travers une membrane semi-perméable vers la concentration la plus forte.",
                    "Bake the bread for forty minutes, then let it cool on a rack.",
                ]
                .map(String::from)
                .to_vec(),
            )
            .unwrap();
        let dot = |a: &Vec<f32>, b: &Vec<f32>| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        assert_eq!(v[0].len(), DIMS);
        let (same, other) = (dot(&v[0], &v[1]), dot(&v[0], &v[2]));
        println!("same idea {same:.3}, unrelated {other:.3}");
        assert!((same - 0.90).abs() < 0.02, "{same}");
        assert!(other < 0.7, "{other}");
        assert!(same > other + 0.2);
    }
}
