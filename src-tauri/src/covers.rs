use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct Covers {
    active: Mutex<Option<Arc<Mutex<Child>>>>,
    serial: Mutex<()>,
    epoch: AtomicU64,
    closing: AtomicBool,
}

fn config(app: &AppHandle) -> Result<Value> {
    let path = std::env::var_os("ORIGAMI_COVER_CONFIG")
        .map(PathBuf::from)
        .unwrap_or(
            app.path()
                .app_config_dir()
                .map_err(|e| e.to_string())?
                .join("cover-engine.json"),
        );
    let data = std::fs::read_to_string(path).map_err(|_| {
        "The local cover generator is not installed. See Settings and the cover setup guide."
    })?;
    serde_json::from_str(data.trim_start_matches('\u{feff}'))
        .map_err(|_| "Invalid cover engine configuration".into())
}
pub fn status(app: &AppHandle) -> Value {
    let installed = config(app).ok().is_some_and(|c| {
        c["executable"]
            .as_str()
            .is_some_and(|p| PathBuf::from(p).is_file())
            && c["model"]
                .as_str()
                .is_some_and(|p| PathBuf::from(p).is_file())
    });
    json!({"installed":installed,"name":"SD-Turbo · local","attribution":"Powered by Stability AI"})
}
impl Covers {
    pub fn generation_epoch(&self) -> u64 {
        self.epoch.load(Ordering::SeqCst)
    }
    pub fn cancel(&self) -> Result<()> {
        self.epoch.fetch_add(1, Ordering::SeqCst);
        if let Some(child) = self
            .active
            .lock()
            .map_err(|_| "Cover process lock failed")?
            .take()
        {
            let mut child = child.lock().map_err(|_| "Cover process lock failed")?;
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
    pub fn shutdown(&self) -> Result<()> {
        self.closing.store(true, Ordering::SeqCst);
        self.cancel()
    }
    pub fn generate(
        &self,
        app: AppHandle,
        prompt: String,
        seed: u32,
        epoch: u64,
    ) -> Result<String> {
        if prompt.trim().is_empty() || prompt.chars().count() > 1400 {
            return Err("Use a cover prompt of 1 to 1,400 characters.".into());
        }
        let _serial = self
            .serial
            .lock()
            .map_err(|_| "Cover generator lock failed")?;
        if self.closing.load(Ordering::SeqCst) || epoch != self.epoch.load(Ordering::SeqCst) {
            return Err("Cover generation cancelled.".into());
        }
        // Register a job and release speech under the same cancellation lock.
        // A queued image request cannot unload a newer speech session.
        app.state::<crate::speech::Speech>().cancel()?;
        let c = config(&app)?;
        let directory = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("cover-drafts");
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let path = directory.join(format!("cover-{stamp}.png"));
        let result = (|| {
            let mut command =
                Command::new(c["executable"].as_str().ok_or("Missing cover executable")?);
            command
                .arg("-m")
                .arg(c["model"].as_str().ok_or("Missing cover model")?)
                .arg("-p")
                .arg(&prompt)
                .arg("-o")
                .arg(&path)
                .args([
                    "--steps",
                    "2",
                    "--cfg-scale",
                    "1",
                    "--sampling-method",
                    "euler",
                    "--scheduler",
                    "discrete",
                    "-W",
                    "384",
                    "-H",
                    "512",
                    "--disable-image-metadata",
                    "--log-level",
                    "error",
                ])
                .arg("--seed")
                .arg(seed.to_string())
                .arg("--backend")
                .arg(c["backend"].as_str().unwrap_or("cpu"))
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            let child = {
                let mut active = self
                    .active
                    .lock()
                    .map_err(|_| "Cover process lock failed")?;
                if self.closing.load(Ordering::SeqCst) || epoch != self.epoch.load(Ordering::SeqCst)
                {
                    return Err("Cover generation cancelled.".into());
                }
                let child = Arc::new(Mutex::new(
                    command
                        .spawn()
                        .map_err(|_| "Could not start the local cover generator")?,
                ));
                *active = Some(child.clone());
                child
            };
            let started = Instant::now();
            loop {
                if epoch != self.epoch.load(Ordering::SeqCst) {
                    return Err("Cover generation cancelled.".into());
                }
                let status = child
                    .lock()
                    .map_err(|_| "Cover process lock failed")?
                    .try_wait()
                    .map_err(|e| e.to_string())?;
                if let Some(status) = status {
                    if !status.success() {
                        return Err("The local cover generator failed. Check its model and GPU configuration.".into());
                    }
                    break;
                }
                if started.elapsed() > Duration::from_secs(180) {
                    self.cancel()?;
                    return Err("Cover generation timed out and was unloaded.".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            let bytes = std::fs::read(&path).map_err(|_| "No generated cover was returned")?;
            if bytes.len() > 4 * 1024 * 1024 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
                return Err("Invalid generated cover image".into());
            }
            Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
        })();
        let _ = std::fs::remove_file(&path);
        *self
            .active
            .lock()
            .map_err(|_| "Cover process lock failed")? = None;
        result
    }
}
impl Drop for Covers {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shutdown_reaps_the_cover_child_and_blocks_further_work() {
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
        let covers = Covers::default();
        *covers.active.lock().unwrap() = Some(child.clone());
        covers.shutdown().unwrap();
        assert!(covers.closing.load(Ordering::SeqCst));
        assert!(covers.active.lock().unwrap().is_none());
        assert!(child.lock().unwrap().try_wait().unwrap().is_some());
        covers.shutdown().unwrap();
    }
}
