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
    // The loaded model. Any installed voice can use it without a restart.
    model: String,
    cancellation: PathBuf,
}
impl Drop for Worker {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.cancellation);
    }
}
#[derive(Default)]
pub struct Speech {
    worker: Mutex<Option<Worker>>,
    active: Mutex<Option<Arc<Mutex<Child>>>>,
    cancellation: Mutex<Option<PathBuf>>,
    closing: AtomicBool,
    generation: AtomicU64,
}
/// The speech worker's diagnostics, replaced at each start, so a failure can
/// be read afterwards (speech-worker.log in the app's log folder).
fn worker_log(app: &AppHandle) -> Stdio {
    app.path()
        .app_log_dir()
        .ok()
        .and_then(|dir| {
            std::fs::create_dir_all(&dir).ok()?;
            std::fs::File::create(dir.join("speech-worker.log")).ok()
        })
        .map(Stdio::from)
        .unwrap_or_else(Stdio::null)
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
pub(crate) fn config(app: &AppHandle) -> Result<Value> {
    let data = std::fs::read_to_string(config_path(app)?).map_err(|_| {
        "No local engine is configured. See the local speech setup guide.".to_string()
    })?;
    let mut config: Value = serde_json::from_str(data.trim_start_matches('\u{feff}')).map_err(|_| "Invalid worker configuration")?;
    crate::voice_studio::merge_profiles(app,&mut config);
    Ok(config)
}
/// Removes voices for good. Voices made in the designer lose their profile
/// and reference recording. Installed voices are unregistered, and their
/// recording is deleted only when it lies inside Origami's own folders, so a
/// developer's source recordings elsewhere are never touched.
pub fn delete_voices(app: &AppHandle, ids: &[String]) -> Result<Vec<String>> {
    if ids.is_empty() || ids.len() > 500 {
        return Err("Select voices to delete.".into());
    }
    let path = config_path(app)?;
    let mut stored: Option<Value> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|d| serde_json::from_str(d.trim_start_matches('\u{feff}')).ok());
    let created = crate::voice_studio::created_root(app)?;
    let owned: Vec<PathBuf> = [
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(PathBuf::from)),
        crate::data_root(app).ok(),
    ]
    .into_iter()
    .flatten()
    .filter_map(|p| p.canonicalize().ok())
    .collect();
    let mut removed = Vec::new();
    for id in ids {
        if id.is_empty() || id.len() > 128 || id.contains(['/', '\\', '.']) {
            return Err("Invalid voice identifier.".into());
        }
        if id.starts_with("designed-vd-") {
            let profile = created.join(format!("{id}.json"));
            if profile.is_file() {
                std::fs::remove_file(&profile).map_err(|e| e.to_string())?;
                let _ = std::fs::remove_file(created.join(format!("{id}.wav")));
                crate::voice_studio::forget_saved(app, id);
                removed.push(id.clone());
            }
            continue;
        }
        let Some(config) = stored.as_mut() else {
            continue;
        };
        let Some(voice) = config["voices"]
            .as_object_mut()
            .and_then(|v| v.remove(id))
        else {
            continue;
        };
        if let Some(reference) = voice["reference"]
            .as_str()
            .and_then(|r| PathBuf::from(r).canonicalize().ok())
        {
            if owned.iter().any(|root| reference.starts_with(root)) {
                let _ = std::fs::remove_file(reference);
            }
        }
        removed.push(id.clone());
    }
    if let Some(config) = stored {
        let temp = path.with_extension("pending");
        std::fs::write(
            &temp,
            serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        std::fs::rename(temp, &path).map_err(|e| e.to_string())?;
    }
    // A loaded worker keeps the old voice list; the next request starts fresh.
    let _ = app.state::<Speech>().cancel();
    Ok(removed)
}
pub fn voices(app: &AppHandle) -> Vec<Value> {
    let mut c = config(app).unwrap_or(json!({"voices":{}}));
    // A creator-only installation can still display its saved voices.
    crate::voice_studio::merge_profiles(app, &mut c);
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
                        "available": v["available"].as_bool().unwrap_or(true),
                        "engine": v["engine"].as_str().unwrap_or("qwen"),
                        "languages": v.get("languages").cloned().unwrap_or_else(||
                            json!([v["language"].as_str().unwrap_or("Unspecified")])
                        ),
                        "gender": gender,
                        "styles": v.get("styles").cloned().unwrap_or_else(|| json!([])),
                        "accent": v["accent"].as_str().unwrap_or(""),
                        "portraitAppearance": v["portraitAppearance"].as_str().unwrap_or(""),
                        // Made in the voice designer, or installed with Origami.
                        "created": v["origin"] == "qwen-voice-design"
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}
pub fn voices_for(app: &AppHandle, chosen: Option<&str>) -> Vec<Value> {
    let c = config(app).unwrap_or(json!({}));
    let id = resolve_model(&c, chosen);
    let engine = c["models"][&id]["engine"].as_str().unwrap_or("qwen");
    voices(app)
        .into_iter()
        .map(|mut v| {
            let same = v["engine"].as_str().unwrap_or("qwen") == engine;
            // Ready, but made for another installed model: the app offers to
            // switch models when it is chosen.
            v["otherModel"] = json!(id != "unavailable" && v["available"] == true && !same);
            v["available"] = json!(id != "unavailable" && v["available"] == true && same);
            v
        })
        .collect()
}
// The model a request runs on: the chosen one when installed, otherwise the
// configured default. Older configurations name a single "model" path.
fn resolve_model(c: &Value, chosen: Option<&str>) -> String {
    let Some(models) = c["models"].as_object().filter(|m| !m.is_empty()) else {
        return "default".into();
    };
    let valid = |id: &str| {
        models
            .get(id)
            .is_some_and(|m| m["disabled"] != true && crate::models::present(m, c, "reader"))
    };
    // Explicit selections never silently fall back to a different model.
    if let Some(id) = chosen.filter(|id| !id.is_empty()) {
        return if valid(id) {
            id.into()
        } else {
            "unavailable".into()
        };
    }
    c["defaultModel"]
        .as_str()
        .filter(|id| valid(id))
        .or_else(|| models.keys().find(|id| valid(id)).map(|s| s.as_str()))
        .unwrap_or("unavailable")
        .into()
}
fn folder_name(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Speech model".into())
}
// Installed speech model versions, for the model picker in Settings.
pub fn models(app: &AppHandle) -> Value {
    let Ok(c) = config(app) else {
        return json!({"models": [], "default": ""});
    };
    let default = resolve_model(&c, None);
    let list: Vec<Value> = match c["models"].as_object().filter(|m| !m.is_empty()) {
        Some(models) => models
            .iter()
            .filter(|(_, m)| m["disabled"] != true && crate::models::present(m, &c, "reader"))
            .map(|(id, m)| {
                json!({
                    "id": id,
                    "name": m["name"].as_str().map(String::from)
                        .unwrap_or_else(|| folder_name(m["path"].as_str().unwrap_or(id))),
                    "description": m["description"].as_str().unwrap_or(""),
                    "tier": m["tier"].as_str().unwrap_or(""),
                    "sizeGb": m["sizeGb"].as_f64(),
                    "engine": m["engine"].as_str().unwrap_or("qwen"),
                })
            })
            .collect(),
        None => vec![json!({
            "id": "default",
            "name": folder_name(c["model"].as_str().unwrap_or("")),
            "description": "",
            "tier": "",
            "sizeGb": null,
            "engine": "qwen",
        })],
    };
    json!({"models": list, "default": default})
}
impl Speech {
    pub fn interrupt(&self) -> Result<()> {
        let mut path = self
            .cancellation
            .lock()
            .map_err(|_| "Cancellation lock failed")?;
        let epoch = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some(path) = path.as_mut() {
            std::fs::write(path, epoch.to_string()).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
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
    pub fn prepare(&self, app: AppHandle, voice: String, model: Option<String>) -> Result<Value> {
        self.request(
            app,
            voice,
            model,
            json!({"version":1,"action":"prepare"}),
            "ready",
        )
    }
    /// Studio: why a voice cannot read now (not installed, unavailable, or made for
    /// another reader), or None when it can. Problems with the reader itself stop
    /// every voice, so they are left to `render`.
    pub fn voice_problem(app: &AppHandle, voice: &str) -> Option<String> {
        let c = config(app).ok()?;
        let v = &c["voices"][voice];
        if v.is_null() {
            return Some("Voice is not installed.".into());
        }
        if v["available"].as_bool() == Some(false) {
            return Some(v["unavailable_reason"].as_str().unwrap_or("This voice needs a compatible speech engine.").into());
        }
        let model = resolve_model(&c, None);
        if model != "unavailable" && v["engine"].as_str().unwrap_or("qwen") != c["models"][&model]["engine"].as_str().unwrap_or("qwen") {
            return Some("This voice is incompatible with the selected reader.".into());
        }
        None
    }
    /// Studio: renders several lines of one voice into WAV files in `out_dir`.
    pub fn render(&self, app: AppHandle, voice: String, items: Value, out_dir: &std::path::Path, temperature: Option<f64>) -> Result<Value> {
        let mut request = json!({"version":1,"action":"render","items":items,"out_dir":out_dir});
        if let Some(t) = temperature.filter(|t| t.is_finite()) {
            request["temperature"] = json!(t.clamp(0.3, 1.2));
        }
        self.request(app, voice, None, request, "rendered")
    }
    pub fn synthesize(
        &self,
        app: AppHandle,
        text: String,
        voice: String,
        model: Option<String>,
        temperature: Option<f64>,
    ) -> Result<Value> {
        if text.trim().is_empty() || text.chars().count() > 1200 {
            return Err("Read a passage of 1 to 1,200 characters.".into());
        }
        let mut request = json!({"version":1,"text":text});
        // Voice variation chosen in Settings, bounded to a range the model handles.
        if let Some(t) = temperature.filter(|t| t.is_finite()) {
            request["temperature"] = json!(t.clamp(0.3, 1.2));
        }
        self.request(app, voice, model, request, "audio")
    }
    fn request(
        &self,
        app: AppHandle,
        voice: String,
        model: Option<String>,
        mut request: Value,
        expected: &str,
    ) -> Result<Value> {
        if app.state::<crate::voice_studio::Studio>().busy() {return Err("Finish or cancel voice creation before reading aloud.".into());}
        let generation = self.generation.load(Ordering::SeqCst);
        if self.closing.load(Ordering::SeqCst) {
            return Err("Origami is closing.".into());
        }
        let _models = crate::models::OPERATIONS
            .read()
            .map_err(|_| "Model operation lock failed")?;
        let c = config(&app)?;
        if c["voices"].get(&voice).is_none() {
            return Err("Voice is not installed.".into());
        }
        if c["voices"][&voice]["available"].as_bool() == Some(false) {
            return Err(c["voices"][&voice]["unavailable_reason"]
                .as_str()
                .unwrap_or("This voice needs a compatible speech engine.")
                .into());
        }
        let model = resolve_model(&c, model.as_deref());
        if model == "unavailable" {
            return Err(
                "The selected reader is not installed. Choose one in Settings, Models.".into(),
            );
        }
        let engine = c["models"][&model]["engine"].as_str().unwrap_or("qwen");
        if c["voices"][&voice]["engine"].as_str().unwrap_or("qwen") != engine {
            return Err("This voice is incompatible with the selected reader. Choose one of its built-in voices, or switch to Qwen for custom voices.".into());
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
                w.model != model
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
            // Kitten and Kokoro run in their own GPL-3 program (light_tts.py),
            // kept apart from the rest of Origami; Qwen runs in tts_worker.py.
            let worker = match c["models"][&model]["engine"].as_str() {
                Some("kitten" | "kokoro") => "light_tts.py",
                _ => "tts_worker.py",
            };
            let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../workers")
                .join(worker);
            let script = if cfg!(debug_assertions) && dev.exists() {
                dev
            } else {
                app.path()
                    .resource_dir()
                    .map_err(|e| e.to_string())?
                    .join("workers")
                    .join(worker)
            };
            let python = c["models"][&model]["python"]
                .as_str()
                .or_else(|| c["python"].as_str())
                .ok_or("Missing Python interpreter")?;
            let mut command = Command::new(python);
            let cancellation = std::env::temp_dir().join(format!(
                "origami-speech-{}-{}.cancel",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ));
            command
                .args(["-u"])
                .arg(script)
                .arg(config_path(&app)?)
                .arg(&voice)
                .arg(&cancellation)
                .arg(&model)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(worker_log(&app))
                .env("PYTHONUTF8", "1")
                .env("ORIGAMI_CREATED_VOICES", crate::voice_studio::created_root(&app)?);
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
            let mut cancel_path = self
                .cancellation
                .lock()
                .map_err(|_| "Cancellation lock failed")?;
            if generation != self.generation.load(Ordering::SeqCst) {
                return Err("Speech request cancelled.".into());
            }
            std::fs::write(&cancellation, generation.to_string()).map_err(|e| e.to_string())?;
            *cancel_path = Some(cancellation.clone());
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
                model: model.clone(),
                cancellation,
            });
        }
        let worker = guard.as_mut().ok_or("Worker unavailable")?;
        request["generation"] = json!(generation);
        request["voice"] = json!(voice);
        let request = request.to_string();
        worker
            .input
            .write_all((request + "\n").as_bytes())
            .map_err(|_| "Worker input closed")?;
        worker.input.flush().map_err(|_| "Worker input closed")?;
        // Skip stray lines a native library may print; protocol lines are JSON objects.
        let result: Value = loop {
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
            match serde_json::from_str::<Value>(&line) {
                Ok(v) if v.is_object() => break v,
                _ => eprintln!("speech worker: {}", line.trim_end()),
            }
        };
        if result["event"] == "cancelled" || generation != self.generation.load(Ordering::SeqCst) {
            return Err("Speech request cancelled.".into());
        }
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
    fn requests_use_the_chosen_installed_model_or_the_default() {
        let legacy = json!({"model": "C:/models/Qwen3-TTS-12Hz-0.6B-Base"});
        assert_eq!(resolve_model(&legacy, Some("light")), "default");
        let d = tempfile::tempdir().unwrap();
        let runtime = d.path().join("python");
        std::fs::write(&runtime, b"runtime").unwrap();
        let c = json!({"python":runtime,"defaultModel": "standard", "models": {
            "standard": {"path":d.path()}, "light": {"path":d.path()}}});
        assert_eq!(resolve_model(&c, Some("light")), "light");
        assert_eq!(resolve_model(&c, Some("missing")), "unavailable");
        assert_eq!(resolve_model(&c, None), "standard");
        let mut removed = c.clone();
        removed["models"]["light"]["disabled"] = json!(true);
        assert_eq!(resolve_model(&removed, Some("light")), "unavailable");
    }

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
        let path = std::env::temp_dir().join(format!(
            "origami-interrupt-test-{}.cancel",
            std::process::id()
        ));
        std::fs::write(&path, "0").unwrap();
        *speech.cancellation.lock().unwrap() = Some(path.clone());
        speech.interrupt().unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "1");
        assert!(child.lock().unwrap().try_wait().unwrap().is_none());
        speech.shutdown().unwrap();
        assert!(speech.closing.load(Ordering::SeqCst));
        assert!(child.lock().unwrap().try_wait().unwrap().is_some());
        speech.shutdown().unwrap();
        std::fs::remove_file(path).unwrap();
    }
}
