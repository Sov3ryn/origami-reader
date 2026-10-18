// Models added after setup, from Settings. Setup installs only what a computer
// needs; workers/add_components.py fetches the others with setup's own
// downloader (each file from its publisher, checked against its SHA-256) and
// adds them to the model configuration. Progress arrives as "model-download".
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

type Result<T> = std::result::Result<T, String>;

static RUNNING: Mutex<Option<ChildStdin>> = Mutex::new(None);

// Two women's and two men's voices, like a new installation.
const STARTERS: &[(&str, &[&str])] = &[
    ("en", &["origami-en-f-01", "origami-en-f-03", "origami-en-m-01", "origami-en-m-05"]),
    ("fr", &["origami-fr-f-01", "origami-fr-f-06", "origami-fr-m-01", "origami-fr-m-06"]),
];

/// The installed Origami folder (setup's receipt), which holds Python and the workers.
fn root(app: &AppHandle) -> Result<PathBuf> {
    if let Some(dir) = std::env::var_os("ORIGAMI_INSTALL_ROOT") {
        return Ok(PathBuf::from(dir));
    }
    let receipt = app.path().app_config_dir().map_err(|e| e.to_string())?.join("installation.json");
    let text = std::fs::read_to_string(receipt).map_err(|_| "Models can be downloaded in an Origami installed with setup.")?;
    let value: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|_| "Invalid installation record.")?;
    value["root"].as_str().map(PathBuf::from).ok_or_else(|| "Invalid installation record.".into())
}

pub fn download(app: &AppHandle, model: &str, accept_terms: bool, language: &str) -> Result<Value> {
    let dest = root(app)?;
    let python = dest.join(if cfg!(windows) { "python/python.exe" } else { "python/bin/python3" });
    let script = dest.join("workers/add_components.py");
    if !python.is_file() || !script.is_file() || !dest.join("workers/setup_install.py").is_file() {
        return Err("This installation cannot download models yet. Update Origami first.".into());
    }
    let mut command = Command::new(&python);
    command
        .arg("-I")
        .arg(&script)
        .arg(&dest)
        .arg(crate::models::path(app, "reader")?)
        .arg(crate::models::path(app, "image")?)
        .arg(model)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if accept_terms {
        command.arg("--accept-terms");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    {
        let mut running = RUNNING.lock().map_err(|_| "Download busy")?;
        if running.is_some() {
            return Err("Another model is downloading. Wait for it to finish.".into());
        }
        let mut child = command.spawn().map_err(|e| format!("The download could not start ({e})."))?;
        *running = child.stdin.take();
        drop(running);
        let mut failure = None;
        let mut finished = false;
        for line in BufReader::new(child.stdout.take().ok_or("No download output")?).lines() {
            let Ok(line) = line else { break };
            let Ok(mut event) = serde_json::from_str::<Value>(&line) else { continue };
            match event["event"].as_str() {
                Some("error") => failure = event["message"].as_str().map(str::to_string),
                Some("complete") => finished = true,
                _ => {}
            }
            event["model"] = json!(model);
            let _ = app.emit("model-download", event);
        }
        let status = child.wait().map_err(|e| e.to_string());
        *RUNNING.lock().map_err(|_| "Download busy")? = None;
        if let Some(message) = failure {
            return Err(message);
        }
        if !finished || !status?.success() {
            return Err("The download stopped. Try again: finished files are kept.".into());
        }
    }
    // The natural voices need voices of their own: the starters for the language.
    if model.starts_with("qwen3-tts") {
        let has_voice = crate::speech::voices(app).iter().any(|v| v["engine"].as_str().unwrap_or("qwen") == "qwen");
        if !has_voice {
            let ids = STARTERS.iter().find(|(code, _)| *code == language).unwrap_or(&STARTERS[0]).1;
            for id in ids {
                let _ = crate::voice_store::install(app, id);
            }
        }
    }
    let _ = app.state::<crate::speech::Speech>().cancel();
    Ok(crate::models::inventory(app))
}

pub fn cancel() -> Result<()> {
    if let Some(stdin) = RUNNING.lock().map_err(|_| "Download busy")?.as_mut() {
        let _ = stdin.write_all(b"{\"action\":\"cancel\"}\n");
        let _ = stdin.flush();
    }
    Ok(())
}
