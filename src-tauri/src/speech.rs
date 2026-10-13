use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Manager};
type Result<T> = std::result::Result<T, String>;
struct Worker {
    process: Arc<Mutex<Child>>,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    voice: String,
}
#[derive(Default)]
pub struct Speech {
    worker: Mutex<Option<Worker>>,
    active: Mutex<Option<Arc<Mutex<Child>>>>,
    closing: AtomicBool,
    generation: AtomicU64,
}
fn config_path(app: &AppHandle) -> Result<PathBuf> {
    if let Some(p) = std::env::var_os("ORIGAMI_WORKER_CONFIG") {
        return Ok(PathBuf::from(p));
    }
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("worker.json"))
}
fn config(app: &AppHandle) -> Result<Value> {
    let data = std::fs::read_to_string(config_path(app)?).map_err(|_| {
        "No local engine is configured. See the local speech setup guide.".to_string()
    })?;
    serde_json::from_str(&data).map_err(|_| "Invalid worker configuration".into())
}
pub fn voices(app: &AppHandle) -> Vec<Value> {
    let Ok(c) = config(app) else { return vec![] };
    c["voices"]
        .as_object()
        .map(|vs| {
            vs.iter()
                .map(|(id, v)| {
                    let gender = match v["gender"]
                        .as_str()
                        .unwrap_or("")
                        .trim()
                        .to_ascii_lowercase()
                        .as_str()
                    {
                        "female" => "female",
                        "male" => "male",
                        _ => "unspecified",
                    };
                    json!({
                        "id": id,
                        "name": v["name"],
                        "description": v["description"],
                        "available": true,
                        "engine": "Qwen · local",
                        "languages": v.get("languages").cloned().unwrap_or_else(||
                            json!([v["language"].as_str().unwrap_or("Unspecified")])
                        ),
                        "gender": gender,
                        "styles": v.get("styles").cloned().unwrap_or_else(|| json!([])),
                        "accent": v["accent"].as_str().unwrap_or("")
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}
impl Speech {
    pub fn cancel(&self) -> Result<()> {
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Some(child) = self
            .active
            .lock()
            .map_err(|_| "Worker lock failed")?
            .as_ref()
        {
            let mut c = child.lock().map_err(|_| "Process lock failed")?;
            #[cfg(windows)]
            if c.try_wait().ok().flatten().is_none() {
                use std::os::windows::process::CommandExt;
                // A Windows virtual-environment launcher can own a second Python
                // process. Stop only this worker's tree, including its GPU process.
                let _ = Command::new("taskkill.exe")
                    .args(["/PID", &c.id().to_string(), "/T", "/F"])
                    .creation_flags(0x08000000)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            let _ = c.kill();
            let _ = c.wait();
        }
        Ok(())
    }
    pub fn shutdown(&self) -> Result<()> {
        self.closing.store(true, Ordering::SeqCst);
        self.cancel()
    }
    pub fn prepare(&self, app: AppHandle, voice: String) -> Result<Value> {
        self.request(app, voice, json!({"version":1,"action":"prepare"}), "ready")
    }
    pub fn synthesize(&self, app: AppHandle, text: String, voice: String) -> Result<Value> {
        if text.trim().is_empty() || text.chars().count() > 1200 {
            return Err("Read a passage of 1 to 1,200 characters.".into());
        }
        self.request(app, voice, json!({"version":1,"text":text}), "audio")
    }
    fn request(
        &self,
        app: AppHandle,
        voice: String,
        request: Value,
        expected: &str,
    ) -> Result<Value> {
        let generation = self.generation.load(Ordering::SeqCst);
        if self.closing.load(Ordering::SeqCst) {
            return Err("Origami is closing.".into());
        }
        let c = config(&app)?;
        if c["voices"].get(&voice).is_none() {
            return Err("Voice is not installed.".into());
        }
        let mut guard = self.worker.lock().map_err(|_| "Worker lock failed")?;
        if self.closing.load(Ordering::SeqCst) {
            return Err("Origami is closing.".into());
        }
        if generation != self.generation.load(Ordering::SeqCst) {
            return Err("Speech request cancelled.".into());
        }
        let needs_new = guard
            .as_mut()
            .map(|w| {
                w.voice != voice
                    || w.process
                        .lock()
                        .map(|mut p| p.try_wait().ok().flatten().is_some())
                        .unwrap_or(true)
            })
            .unwrap_or(true);
        if needs_new {
            if let Some(old) = guard.take() {
                let mut p = old.process.lock().map_err(|_| "Process lock failed")?;
                #[cfg(windows)]
                if p.try_wait().ok().flatten().is_none() {
                    use std::os::windows::process::CommandExt;
                    let _ = Command::new("taskkill.exe")
                        .args(["/PID", &p.id().to_string(), "/T", "/F"])
                        .creation_flags(0x08000000)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();
                }
                let _ = p.kill();
                let _ = p.wait();
            }
            let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../workers/tts_worker.py");
            let script = if dev.exists() {
                dev
            } else {
                app.path()
                    .resource_dir()
                    .map_err(|e| e.to_string())?
                    .join("workers/tts_worker.py")
            };
            let python = c["python"].as_str().ok_or("Missing Python interpreter")?;
            let mut command = Command::new(python);
            command
                .args(["-u"])
                .arg(script)
                .arg(config_path(&app)?)
                .arg(&voice)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .env("PYTHONUTF8", "1");
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            // Shutdown and process registration share this lock, so a new child
            // cannot slip through after the window has closed.
            let mut active = self.active.lock().map_err(|_| "Process lock failed")?;
            if self.closing.load(Ordering::SeqCst) {
                return Err("Origami is closing.".into());
            }
            if generation != self.generation.load(Ordering::SeqCst) {
                return Err("Speech request cancelled.".into());
            }
            let mut p = command
                .spawn()
                .map_err(|_| "Could not start local speech worker".to_string())?;
            let input = p.stdin.take().ok_or("Missing worker input")?;
            let output = BufReader::new(p.stdout.take().ok_or("Missing worker output")?);
            let process = Arc::new(Mutex::new(p));
            *active = Some(process.clone());
            *guard = Some(Worker {
                process,
                input,
                output,
                voice: voice.clone(),
            });
        }
        let worker = guard.as_mut().ok_or("Worker unavailable")?;
        let request = request.to_string();
        worker
            .input
            .write_all((request + "\n").as_bytes())
            .map_err(|_| "Worker input closed")?;
        worker.input.flush().map_err(|_| "Worker input closed")?;
        let mut line = String::new();
        if worker
            .output
            .read_line(&mut line)
            .map_err(|_| "Worker output failed")?
            == 0
        {
            *guard = None;
            return Err(
                "Generation stopped or the local model failed. Completed library data is safe."
                    .into(),
            );
        }
        let result: Value = serde_json::from_str(&line).map_err(|_| "Invalid worker response")?;
        if result["event"] == "error" {
            return Err(result["message"]
                .as_str()
                .unwrap_or("Speech generation failed")
                .into());
        }
        if result["event"] != expected
            || (expected == "audio" && result["audio"].as_str().is_none())
        {
            return Err("Unexpected worker response".into());
        }
        Ok(result)
    }
}
impl Drop for Speech {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shutdown_terminates_and_reaps_the_registered_child() {
        #[cfg(windows)]
        let mut command = {
            use std::os::windows::process::CommandExt;
            let mut c = Command::new("powershell.exe");
            c.args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 60",
            ]);
            c.creation_flags(0x08000000);
            c
        };
        #[cfg(not(windows))]
        let mut command = {
            let mut c = Command::new("sleep");
            c.arg("60");
            c
        };
        let child = Arc::new(Mutex::new(
            command
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap(),
        ));
        let speech = Speech::default();
        *speech.active.lock().unwrap() = Some(child.clone());
        speech.shutdown().unwrap();
        assert!(speech.closing.load(Ordering::SeqCst));
        assert!(child.lock().unwrap().try_wait().unwrap().is_some());
        speech.shutdown().unwrap();
    }
}
