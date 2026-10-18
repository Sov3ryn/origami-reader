// Studio's analysis model: a local llama.cpp server (llama-server, MIT) with
// Ministral 3 (Apache-2.0), started only while a book is being analysed and
// stopped afterwards so the graphics memory goes back to the voices. It
// listens on 127.0.0.1 only and every answer is constrained to a JSON schema.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;

pub type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct Analysis {
    server: Mutex<Option<Server>>,
}

struct Server {
    child: Child,
    port: u16,
    model: PathBuf,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Where the analysis files are: Models/analysis in the data folder (llama-server
/// and the model files), or ORIGAMI_LLM_BIN and ORIGAMI_LLM_MODELS for development.
pub fn locate(data: &Path) -> (Option<PathBuf>, Vec<PathBuf>) {
    let base = data.join("Models").join("analysis");
    let bin_dir = std::env::var_os("ORIGAMI_LLM_BIN").map(PathBuf::from).unwrap_or_else(|| base.join("bin"));
    let exe = bin_dir.join(if cfg!(windows) { "llama-server.exe" } else { "llama-server" });
    let models_dir = std::env::var_os("ORIGAMI_LLM_MODELS").map(PathBuf::from).unwrap_or(base);
    let mut models: Vec<PathBuf> = std::fs::read_dir(&models_dir)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "gguf") && p.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase().contains("ministral"))).collect())
        .unwrap_or_default();
    models.sort();
    (exe.is_file().then_some(exe), models)
}

/// The model for this computer: the 8B with 8 GB of graphics memory or more, else the 3B.
pub fn choose(models: &[PathBuf], vram_mb: u64) -> Option<PathBuf> {
    let find = |tag: &str| models.iter().find(|m| m.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase().contains(tag))).cloned();
    if vram_mb >= 7_500 {
        find("8b").or_else(|| find("3b"))
    } else {
        find("3b").or_else(|| find("8b"))
    }
    .or_else(|| models.first().cloned())
}

fn free_port() -> Result<u16> {
    let l = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    Ok(l.local_addr().map_err(|e| e.to_string())?.port())
}

impl Analysis {
    fn ensure(&self, exe: &Path, model: &Path, gpu: bool) -> Result<u16> {
        let mut guard = self.server.lock().map_err(|_| "The analysis is busy.")?;
        if let Some(s) = guard.as_mut() {
            if s.model == model && s.child.try_wait().ok().flatten().is_none() {
                return Ok(s.port);
            }
        }
        *guard = None;
        let port = free_port()?;
        let mut cmd = Command::new(exe);
        cmd.args(["-m"]).arg(model).args(["--host", "127.0.0.1", "--port", &port.to_string(), "-c", "16384", "-np", "1", "--jinja", "--no-webui"]);
        cmd.args(["-ngl", if gpu { "99" } else { "0" }]);
        cmd.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let child = cmd.spawn().map_err(|e| format!("The analysis model could not start: {e}"))?;
        *guard = Some(Server { child, port, model: model.to_path_buf() });
        drop(guard);
        // Loading a 5 GB model takes a few seconds on a graphics card, longer from a hard disk.
        let url = format!("http://127.0.0.1:{port}/health");
        for _ in 0..900 {
            if let Ok(mut r) = ureq::get(&url).call() {
                let text = r.body_mut().read_to_string().unwrap_or_default();
                if serde_json::from_str::<Value>(&text).ok().is_some_and(|v| v["status"] == "ok") {
                    return Ok(port);
                }
            }
            if self.server.lock().ok().and_then(|mut g| g.as_mut().map(|s| s.child.try_wait().ok().flatten().is_some())).unwrap_or(true) {
                return Err("The analysis model stopped while loading.".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(400));
        }
        Err("The analysis model did not start in time.".into())
    }

    /// One answer from the model, as the JSON text that matches `schema`.
    pub fn chat(&self, exe: &Path, model: &Path, gpu: bool, system: &str, user: &str, schema: Value, max_tokens: u32) -> Result<String> {
        let port = self.ensure(exe, model, gpu)?;
        let body = json!({
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0.0,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_schema", "json_schema": {"name": "answer", "schema": schema, "strict": true}},
            "chat_template_kwargs": {"enable_thinking": false},
        });
        let mut r = ureq::post(&format!("http://127.0.0.1:{port}/v1/chat/completions"))
            .config()
            .timeout_global(Some(std::time::Duration::from_secs(900)))
            .build()
            .header("Content-Type", "application/json")
            .send(body.to_string())
            .map_err(|e| format!("The analysis model did not answer: {e}"))?;
        let text = r.body_mut().with_config().limit(16 * 1024 * 1024).read_to_string().map_err(|e| e.to_string())?;
        let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        v["choices"][0]["message"]["content"].as_str().map(str::to_string).ok_or_else(|| "The analysis model gave no answer.".into())
    }

    pub fn stop(&self) {
        if let Ok(mut g) = self.server.lock() {
            *g = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_model_for_the_graphics_memory() {
        let models = vec![PathBuf::from("Ministral-3-3B-Instruct-Q4.gguf"), PathBuf::from("Ministral-3-8B-Instruct-Q4.gguf")];
        assert!(choose(&models, 16_000).unwrap().to_string_lossy().contains("8B"));
        assert!(choose(&models, 4_000).unwrap().to_string_lossy().contains("3B"));
        assert!(choose(&models[..1], 16_000).unwrap().to_string_lossy().contains("3B"));
        assert!(choose(&[], 16_000).is_none());
    }
}
