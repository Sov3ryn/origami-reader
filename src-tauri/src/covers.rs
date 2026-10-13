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
const COVER_WIDTH: &str = "320";
const COVER_HEIGHT: &str = "448";
pub fn starter_cover(meta: &Value) -> bool {
    if meta["format"] == "Sample"
        || meta["id"]
            .as_str()
            .is_some_and(|id| id.starts_with("starter-"))
    {
        return true;
    }
    let Some(hash) = meta["sourceHash"].as_str().filter(|hash| !hash.is_empty()) else {
        return false;
    };
    let manifest: Value =
        serde_json::from_str(include_str!("../../assets/starter-library/manifest.json"))
            .expect("Invalid bundled starter manifest");
    manifest["books"]
        .as_array()
        .is_some_and(|books| books.iter().any(|b| b["sha256"] == hash))
}
fn generation_prompt(description: &str, mature: bool) -> String {
    // Put mode and layout before the editable description, where CLIP sees them.
    // SD-Turbo does not use negative prompts at its distilled guidance setting.
    let human_subject = description
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .any(|word| {
            matches!(
                word,
                "person"
                    | "people"
                    | "man"
                    | "men"
                    | "woman"
                    | "women"
                    | "couple"
                    | "character"
                    | "hero"
                    | "heroine"
                    | "portrait"
                    | "figure"
                    | "body"
                    | "nude"
                    | "naked"
                    | "nudity"
                    | "pinup"
            )
        });
    let mode = if mature {
        "Mature, non-explicit cover art, adults only. "
    } else if human_subject {
        "Wholesome artwork, fully clothed adults, suitable for a general audience. "
    } else {
        "Wholesome symbolic landscape or still-life artwork, suitable for a general audience. "
    };
    let clothing = if mature {
        ""
    } else {
        "Any depicted people are fully clothed. "
    };
    format!("{mode}Text-free vertical book-cover illustration, flat full-bleed artwork, strong focal point, open space for title overlay. {description}. {clothing}No lettering, printed words, logos, watermarks, explicit sexual acts or graphic violence.")
}

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
        mature: bool,
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
                .arg(generation_prompt(&prompt, mature))
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
                    COVER_WIDTH,
                    "-H",
                    COVER_HEIGHT,
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
    fn mode_and_layout_are_applied_outside_the_editable_description() {
        let safe = generation_prompt("A moonlit castle", false);
        assert!(safe.starts_with("Wholesome symbolic landscape or still-life artwork"));
        assert!(safe.contains("Text-free vertical book-cover illustration"));
        assert!(safe.contains("A moonlit castle"));
        assert!(safe.contains("No lettering, printed words"));
        let person = generation_prompt("A woman holding a lantern", false);
        assert!(person.starts_with("Wholesome artwork, fully clothed adults"));
        let mature = generation_prompt("A moonlit castle", true);
        assert!(mature.starts_with("Mature, non-explicit cover art, adults only"));
        assert!(!mature.contains("fully clothed"));
        assert!(mature.contains("No lettering, printed words"));
    }
    #[test]
    fn starter_editions_stay_in_standard_mode_even_after_import() {
        let manifest: Value =
            serde_json::from_str(include_str!("../../assets/starter-library/manifest.json"))
                .unwrap();
        for book in manifest["books"].as_array().unwrap() {
            assert!(starter_cover(
                &json!({"id":"freshly-imported-uuid","format":"EPUB","sourceHash":book["sha256"]})
            ));
        }
        assert!(starter_cover(&json!({"id":"sample-0","format":"Sample"})));
        assert!(!starter_cover(
            &json!({"id":"user-book","format":"Text","sourceHash":"different"})
        ));
    }
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
