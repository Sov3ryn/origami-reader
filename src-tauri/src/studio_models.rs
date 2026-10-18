// Studio's models, downloaded inside Studio when the reader sets it up, so only
// people who use Studio download them. Each file comes from its publisher (or,
// for the files Origami converted, from the public origami-voices repository),
// pinned to a revision and checked against its SHA-256 before it is used.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

pub type Result<T> = std::result::Result<T, String>;

const VOICES: &str = "https://github.com/Promethor/origami-voices/releases/download/studio-models-1";
const LLAMA: &str = "https://github.com/ggml-org/llama.cpp/releases/download/b11714/llama-b11714-bin-win-vulkan-x64.zip";
const MINISTRAL_8B: &str = "https://huggingface.co/unsloth/Ministral-3-8B-Instruct-2512-GGUF/resolve/3731507ec3e867db16d620f73e14d689125758f4/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf";
const MINISTRAL_3B: &str = "https://huggingface.co/unsloth/Ministral-3-3B-Instruct-2512-GGUF/resolve/7564922f37fa5bbb62b87f09a55c12f1f91d7a6a/Ministral-3-3B-Instruct-2512-Q4_K_M.gguf";
const PARAKEET: &str = "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce";

/// One file: where it comes from, where it goes (relative to Models), its size and SHA-256.
/// A zip is unpacked into the folder of `to`.
#[derive(Clone)]
pub struct File {
    pub url: String,
    pub to: &'static str,
    pub size: u64,
    pub sha256: &'static str,
    pub zip: bool,
}

/// The parts of Studio's setup, with their files. The analysis model depends on the
/// graphics memory: the 8B model with 8 GB or more, else the 3B.
pub fn parts(vram_mb: u64) -> Vec<(&'static str, Vec<File>)> {
    let f = |url: String, to: &'static str, size: u64, sha256: &'static str| File { url, to, size, sha256, zip: false };
    let model = if vram_mb >= 7_500 {
        f(MINISTRAL_8B.into(), "analysis/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf", 5_198_386_720, "5dbc3647eb563b9f8d3c70ec3d906cce84b86bb35c5e0b8a36e7df3937ab7174")
    } else {
        f(MINISTRAL_3B.into(), "analysis/Ministral-3-3B-Instruct-2512-Q4_K_M.gguf", 2_146_497_824, "fd46fc371ff0509bfa8657ac956b7de8534d7d9baaa4947975c0648c3aa397f4")
    };
    vec![
        (
            "watermark",
            vec![
                f(format!("{VOICES}/audioseal_generator_5s.onnx"), "audioseal/audioseal_generator_5s.onnx", 387_100, "c680ae7f0265de04579397e5341c593058976a5a00325b678c84c125c9ba126e"),
                f(format!("{VOICES}/audioseal_generator_5s.onnx.data"), "audioseal/audioseal_generator_5s.onnx.data", 58_720_256, "635fde5ff3502a620cee48cca74b086fbd257433c33b43d7b587212f5fe651a0"),
                f(format!("{VOICES}/audioseal_detector_5s.onnx"), "audioseal/audioseal_detector_5s.onnx", 253_879, "0f48a5b91db60fee74f4294360e78454ae1a905f0708b4bf1cbb74ca1aa7fec9"),
                f(format!("{VOICES}/audioseal_detector_5s.onnx.data"), "audioseal/audioseal_detector_5s.onnx.data", 34_603_008, "28e0720be4de3a53a0cc19ecadf132c86c48bd24e82487542b68a3a35c2f1e83"),
                f(format!("{VOICES}/NOTICE-studio-models.txt"), "audioseal/NOTICE.txt", 1_868, "361b14c9d8c8e2e60ad49034f1cea952bc51e059324b803976d61763be1cba67"),
            ],
        ),
        (
            "analysis",
            vec![File { url: LLAMA.into(), to: "analysis/bin/llama.zip", size: 32_306_237, sha256: "d4765447307f29fc0b4c8ae5b8b806c46b3e515d0ce5c2a54dd90d9b2c7a392f", zip: true }, model],
        ),
        (
            "transcription",
            vec![
                f(format!("{VOICES}/parakeet-tdt-0.6b-v3-encoder.int8.onnx"), "transcribe/encoder.int8.onnx", 879_648_739, "72aa1c9100c2004dd3728742f0e1254e42c30ef14115d050f0ec9e17a030178e"),
                f(format!("{PARAKEET}/decoder_joint-model.int8.onnx"), "transcribe/decoder_joint.int8.onnx", 18_202_004, "eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70"),
                f(format!("{PARAKEET}/vocab.txt"), "transcribe/vocab.txt", 93_939, "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d"),
                f(format!("{VOICES}/NOTICE-studio-models.txt"), "transcribe/NOTICE.txt", 1_868, "361b14c9d8c8e2e60ad49034f1cea952bc51e059324b803976d61763be1cba67"),
            ],
        ),
    ]
}

/// A part is installed when a record of its verified files is present.
fn installed(models: &Path, part: &str) -> bool {
    models.join(format!(".studio-{part}.verified")).is_file()
}

#[derive(Default)]
pub struct Setup {
    running: AtomicBool,
    cancel: AtomicBool,
    current: Mutex<Option<String>>,
    // The last progress (part, received, total), so a reopened Studio shows it.
    last: Mutex<Option<(String, u64, u64)>>,
}

// A download that receives nothing for this long has stalled; it stops, and
// trying again continues where it stopped.
const STALL: std::time::Duration = std::time::Duration::from_secs(60);

pub fn status(models: &Path, vram_mb: u64, dev_ready: &dyn Fn(&str) -> bool) -> Value {
    let list: Vec<Value> = parts(vram_mb)
        .into_iter()
        .map(|(id, files)| {
            json!({
                "id": id,
                "bytes": files.iter().map(|f| f.size).sum::<u64>(),
                "installed": installed(models, id) || dev_ready(id),
            })
        })
        .collect();
    json!({ "parts": list })
}

impl Setup {
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// Whether a download is running and how far it is, for the setup panel.
    pub fn state(&self) -> Value {
        let last = self.last.lock().ok().and_then(|l| l.clone());
        json!({
            "running": self.running.load(Ordering::SeqCst),
            "progress": last.map(|(part, received, total)| json!({ "part": part, "received": received, "total": total })),
        })
    }

    /// Downloads the chosen parts. `progress(part, received, total)` reports bytes.
    pub fn download(&self, models: &Path, vram_mb: u64, chosen: &[String], progress: &dyn Fn(&str, u64, u64)) -> Result<()> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Err("Studio's models are already downloading.".into());
        }
        self.cancel.store(false, Ordering::SeqCst);
        let progress = |part: &str, received: u64, total: u64| {
            if let Ok(mut l) = self.last.lock() {
                *l = Some((part.to_string(), received, total));
            }
            progress(part, received, total);
        };
        let result = (|| {
            for (id, files) in parts(vram_mb).into_iter().filter(|(id, _)| chosen.iter().any(|c| c == id)) {
                if installed(models, id) {
                    continue;
                }
                if let Ok(mut c) = self.current.lock() {
                    *c = Some(id.to_string());
                }
                let total: u64 = files.iter().map(|f| f.size).sum();
                let mut done = 0u64;
                let mut record = String::new();
                for file in &files {
                    let to = models.join(file.to);
                    self.fetch(file, &to, &|got| progress(id, done + got, total))?;
                    done += file.size;
                    if file.zip {
                        unzip(&to)?;
                        let _ = std::fs::remove_file(&to);
                    }
                    record.push_str(&format!("{} {}\n", file.sha256, file.to));
                }
                std::fs::write(models.join(format!(".studio-{id}.verified")), record).map_err(|e| e.to_string())?;
            }
            Ok(())
        })();
        if let Ok(mut c) = self.current.lock() {
            *c = None;
        }
        if let Ok(mut l) = self.last.lock() {
            *l = None;
        }
        self.running.store(false, Ordering::SeqCst);
        result
    }

    /// One file, streamed to a .part file, checked, then renamed. A finished file
    /// with the right size and SHA-256 is kept and not downloaded again. A .part
    /// left by an interrupted download is continued with an HTTP range request
    /// (from the start when the server does not support it); it is removed only
    /// when the download is cancelled or does not match the published file.
    fn fetch(&self, file: &File, to: &Path, progress: &dyn Fn(u64)) -> Result<()> {
        use std::sync::mpsc::RecvTimeoutError;
        use std::time::{Duration, Instant};
        if let Some(dir) = to.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        if to.is_file() && std::fs::metadata(to).map(|m| m.len()).unwrap_or(0) == file.size && sha256_of(to)? == file.sha256 {
            progress(file.size);
            return Ok(());
        }
        let part = PathBuf::from(format!("{}.part", to.display()));
        let mut have = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        if have == file.size && sha256_of(&part)? == file.sha256 {
            progress(file.size);
            return std::fs::rename(&part, to).map_err(|e| e.to_string());
        }
        if have >= file.size {
            let _ = std::fs::remove_file(&part);
            have = 0;
        }
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(Duration::from_secs(30)))
            .timeout_recv_response(Some(Duration::from_secs(60)))
            .build()
            .into();
        let mut request = agent.get(&file.url);
        if have > 0 {
            request = request.header("Range", &format!("bytes={have}-"));
        }
        let response = request.call().map_err(|e| format!("Download failed: {e}"))?;
        let mut hash = Sha256::new();
        let mut out = if have > 0 && response.status() == 206 {
            hash_into(&part, &mut hash)?;
            std::fs::OpenOptions::new().append(true).open(&part).map_err(|e| e.to_string())?
        } else {
            have = 0;
            std::fs::File::create(&part).map_err(|e| e.to_string())?
        };
        // The body is read on its own thread, so a connection that goes quiet is
        // noticed (ureq has no timeout per read) and Cancel answers at once.
        let mut body = response.into_body().into_reader();
        let (tx, rx) = std::sync::mpsc::sync_channel::<std::io::Result<Vec<u8>>>(4);
        std::thread::spawn(move || loop {
            let mut buf = vec![0u8; 1 << 20];
            match body.read(&mut buf) {
                Ok(n) => {
                    buf.truncate(n);
                    if tx.send(Ok(buf)).is_err() || n == 0 {
                        return;
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e));
                    return;
                }
            }
        });
        let mut got = have;
        progress(got);
        let mut last = Instant::now();
        let mut heard = Instant::now();
        loop {
            if self.cancel.load(Ordering::SeqCst) {
                drop(out);
                let _ = std::fs::remove_file(&part);
                return Err("cancelled".into());
            }
            let chunk = match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(chunk)) => chunk,
                Ok(Err(e)) => return Err(format!("Download failed: {e}. Try again to continue where it stopped.")),
                Err(RecvTimeoutError::Timeout) if heard.elapsed() < STALL => continue,
                Err(RecvTimeoutError::Timeout) => return Err("The download stopped receiving data. Try again to continue where it stopped.".into()),
                Err(RecvTimeoutError::Disconnected) => return Err("Download failed. Try again to continue where it stopped.".into()),
            };
            heard = Instant::now();
            if chunk.is_empty() {
                break;
            }
            out.write_all(&chunk).map_err(|e| e.to_string())?;
            hash.update(&chunk);
            got += chunk.len() as u64;
            if got > file.size {
                break;
            }
            if last.elapsed().as_millis() > 300 {
                last = Instant::now();
                progress(got);
            }
        }
        out.flush().map_err(|e| e.to_string())?;
        drop(out);
        let digest: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if got != file.size || digest != file.sha256 {
            let _ = std::fs::remove_file(&part);
            return Err("A download did not match the published file. Try again.".into());
        }
        std::fs::rename(&part, to).map_err(|e| e.to_string())
    }
}

fn sha256_of(path: &Path) -> Result<String> {
    let mut hash = Sha256::new();
    hash_into(path, &mut hash)?;
    Ok(hash.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Feeds a file to a hash (also the part already there when a download continues).
fn hash_into(path: &Path, hash: &mut Sha256) -> Result<()> {
    let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    Ok(())
}

/// Unpacks llama.cpp's zip beside it, refusing any path that would leave the folder.
fn unzip(zip_path: &Path) -> Result<()> {
    let dir = zip_path.parent().ok_or("Bad folder")?;
    let mut zip = zip::ZipArchive::new(std::fs::File::open(zip_path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(name) = entry.enclosed_name() else { continue };
        let out = dir.join(name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unzip_stays_in_its_folder() {
        use zip::write::SimpleFileOptions;
        let dir = std::env::temp_dir().join(format!("origami-unzip-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("llama.zip");
        let mut z = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        z.start_file("llama-server.exe", SimpleFileOptions::default()).unwrap();
        z.write_all(b"exe").unwrap();
        z.start_file("sub/ggml.dll", SimpleFileOptions::default()).unwrap();
        z.write_all(b"dll").unwrap();
        z.start_file("../escape.txt", SimpleFileOptions::default()).unwrap();
        z.write_all(b"no").unwrap();
        z.finish().unwrap();
        unzip(&path).unwrap();
        assert!(dir.join("llama-server.exe").is_file() && dir.join("sub/ggml.dll").is_file());
        assert!(!dir.parent().unwrap().join("escape.txt").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_model_follows_the_graphics_memory() {
        let big = parts(16_000);
        let small = parts(4_000);
        let model = |p: &Vec<(&str, Vec<File>)>| p.iter().find(|(id, _)| *id == "analysis").unwrap().1[1].to.to_string();
        assert!(model(&big).contains("8B"));
        assert!(model(&small).contains("3B"));
        // Every file is pinned: a revision or a release tag, and a SHA-256.
        for (_, files) in big.iter().chain(small.iter()) {
            for f in files {
                assert_eq!(f.sha256.len(), 64);
                assert!(f.url.starts_with("https://"));
                assert!(!f.url.contains("/resolve/main/"));
            }
        }
    }
}
