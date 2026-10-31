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
#[derive(Clone, Copy)]
enum ArtworkKind {
    Cover,
    VoicePortrait,
}
impl ArtworkKind {
    fn size(self, profile: &str) -> (&'static str, &'static str) {
        match self {
            Self::Cover if matches!(profile, "dreamshaper-8-lcm" | "sd15-lcm") => ("512", "704"),
            Self::Cover if matches!(profile, "sdxl-lightning" | "z-image-turbo") => ("768", "1024"),
            Self::Cover => (COVER_WIDTH, COVER_HEIGHT),
            Self::VoicePortrait if matches!(profile, "sdxl-lightning" | "z-image-turbo") => {
                ("1024", "1024")
            }
            Self::VoicePortrait => ("512", "512"),
        }
    }
}
// How an artwork job runs: an optional installed model version, and whether
// the speech model may stay loaded beside it on a graphics card with room.
#[derive(Default, Clone)]
pub struct ArtOptions {
    pub model: Option<String>,
    pub keep_speech: bool,
}
fn image_profile<'a>(
    kind: ArtworkKind,
    c: &'a Value,
    chosen: Option<&str>,
) -> Result<(&'a Value, &'a str)> {
    let key = match kind {
        ArtworkKind::Cover => "cover",
        ArtworkKind::VoicePortrait => "portrait",
    };
    let chosen = chosen
        .filter(|id| !id.is_empty())
        .or_else(|| c["defaultModel"].as_str());
    if let Some(id) = chosen {
        if c["models"][id]["disabled"] == true || !c["models"][id].is_object() {
            return Err(
                "The selected image model is not installed. Choose one in Settings, Models.".into(),
            );
        }
    }
    let named = chosen.map(|id| &c["models"][id]).filter(|m| m.is_object());
    let selected = match named {
        Some(model) => model,
        None if c[key].is_object() => &c[key],
        None => c,
    };
    let profile = selected["profile"].as_str().unwrap_or("sd-turbo");
    if !matches!(
        profile,
        "sd-turbo" | "dreamshaper-8-lcm" | "sd15-lcm" | "sdxl-lightning" | "z-image-turbo"
    ) {
        return Err("Unsupported image model profile.".into());
    }
    Ok((selected, profile))
}
fn negative_prompt(kind: ArtworkKind, mature: bool) -> &'static str {
    match kind {
        ArtworkKind::VoicePortrait => "text, lettering, watermark, signature, logo, border, nudity, naked, distorted face, bad eyes, duplicate person",
        ArtworkKind::Cover if mature => "text, lettering, printed words, typography, watermark, signature, logo, border, book mockup, explicit sexual acts, graphic violence",
        ArtworkKind::Cover => "text, lettering, printed words, typography, watermark, signature, logo, border, book mockup, nudity, naked, sexual content, graphic violence",
    }
}
fn portrait_prompt(description: &str) -> String {
    format!("Painted character portrait, fully clothed, adult. {description}. Centered face, head and shoulders, soft cinematic light, plain background, smooth illustration, text-free, no border.")
}
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
    // The wrapper applies to both profiles; DreamShaper also receives negative guidance.
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
    let settings = config(app).ok();
    // Optional named versions, for example a faster model for laptops.
    let models: Vec<Value> = settings
        .as_ref()
        .and_then(|c| c["models"].as_object())
        .map(|models| {
            models
                .iter()
                .filter(|(_, m)| {
                    m["disabled"] != true
                        && crate::models::present(m, settings.as_ref().unwrap(), "image")
                })
                .map(|(id, m)| {
                    json!({
                        "id": id,
                        "name": m["name"].as_str().unwrap_or(id),
                        "description": m["description"].as_str().unwrap_or(""),
                        "tier": m["tier"].as_str().unwrap_or(""),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let installed = !models.is_empty()
        || settings.as_ref().is_some_and(|c| {
            image_profile(ArtworkKind::Cover, c, None)
                .is_ok_and(|(m, _)| crate::models::present(m, c, "image"))
        });
    json!({"installed":installed,"name":"Local image generation","attribution":"Model credits and terms are listed in Settings, Models.","models":models,"default":settings.as_ref().and_then(|c|c["defaultModel"].as_str()).unwrap_or("")})
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
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = Command::new("taskkill.exe")
                    .args(["/PID", &child.id().to_string(), "/T", "/F"])
                    .creation_flags(0x08000000)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
    pub fn shutdown(&self) -> Result<()> {
        self.closing.store(true, Ordering::SeqCst);
        self.cancel()
    }
    /// Lets the worker start again after a temporary stop (an update that did not restart the app).
    pub fn resume(&self) {
        self.closing.store(false, Ordering::SeqCst);
    }
    pub fn generate(
        &self,
        app: AppHandle,
        prompt: String,
        seed: u32,
        mature: bool,
        epoch: u64,
        options: ArtOptions,
    ) -> Result<String> {
        self.generate_image(
            app,
            prompt,
            seed,
            mature,
            epoch,
            ArtworkKind::Cover,
            options,
        )
    }
    pub fn portrait(
        &self,
        app: AppHandle,
        prompt: String,
        seed: u32,
        epoch: u64,
        options: ArtOptions,
    ) -> Result<String> {
        self.generate_image(
            app,
            prompt,
            seed,
            false,
            epoch,
            ArtworkKind::VoicePortrait,
            options,
        )
    }
    fn generate_image(
        &self,
        app: AppHandle,
        prompt: String,
        seed: u32,
        mature: bool,
        epoch: u64,
        kind: ArtworkKind,
        options: ArtOptions,
    ) -> Result<String> {
        if prompt.trim().is_empty() || prompt.chars().count() > 1400 {
            return Err("Use an image description of 1 to 1,400 characters.".into());
        }
        let _serial = self
            .serial
            .lock()
            .map_err(|_| "Cover generator lock failed")?;
        if self.closing.load(Ordering::SeqCst) || epoch != self.epoch.load(Ordering::SeqCst) {
            return Err("Cover generation cancelled.".into());
        }
        // Register a job and release speech under the same cancellation lock.
        // A queued image request cannot unload a newer speech session. Graphics
        // cards with enough memory keep the speech model ready instead.
        if !options.keep_speech {
            app.state::<crate::speech::Speech>().cancel()?;
        }
        if app.state::<crate::voice_studio::Studio>().busy() {return Err("Finish or cancel voice creation before generating artwork.".into());}
        let _models = crate::models::OPERATIONS
            .read()
            .map_err(|_| "Model operation lock failed")?;
        let c = config(&app)?;
        let is_portrait = matches!(kind, ArtworkKind::VoicePortrait);
        let (model_config, profile) = image_profile(kind, &c, options.model.as_deref())?;
        if !crate::models::present(model_config, &c, "image") {
            return Err("The image model or runtime files are missing.".into());
        }
        let (steps, cfg, sampler, scheduler) = match profile {
            "sd-turbo" => ("2", "1", "euler", "discrete"),
            "dreamshaper-8-lcm" => ("6", "2", "lcm", "lcm"),
            "sd15-lcm" | "sdxl-lightning" | "z-image-turbo" => ("0", "0", "", ""),
            _ => {
                return Err(
                    "Unsupported portrait model profile. Use sd-turbo or dreamshaper-8-lcm.".into(),
                )
            }
        };
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
        let (width, height) = kind.size(profile);
        let rendered_prompt = match kind {
            ArtworkKind::Cover => generation_prompt(&prompt, mature),
            ArtworkKind::VoicePortrait => portrait_prompt(&prompt),
        };
        // One render on a backend. The processor is slower, so it gets longer.
        let attempt = |backend: &str| -> Result<String> {
            let python_job = matches!(profile, "sd15-lcm" | "sdxl-lightning" | "z-image-turbo");
            let mut command = if python_job {
                let dev =
                    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../workers/image_worker.py");
                let script = if cfg!(debug_assertions) && dev.exists() {
                    dev
                } else {
                    app.path()
                        .resource_dir()
                        .map_err(|e| e.to_string())?
                        .join("workers/image_worker.py")
                };
                let mut cmd = Command::new(
                    model_config["python"]
                        .as_str()
                        .ok_or("Missing image Python runtime")?,
                );
                cmd.arg("-u")
                    .arg(script)
                    .arg("--config")
                    .arg(crate::models::path(&app, "image")?)
                    .args([
                        "--model",
                        options
                            .model
                            .as_deref()
                            .filter(|id| !id.is_empty())
                            .or_else(|| c["defaultModel"].as_str())
                            .unwrap_or(""),
                        "--prompt",
                        &rendered_prompt,
                        "--negative",
                        negative_prompt(kind, mature),
                        "--width",
                        width,
                        "--height",
                        height,
                    ])
                    .arg("--seed")
                    .arg(seed.to_string())
                    .arg("--output")
                    .arg(&path);
                cmd
            } else {
                Command::new(
                    model_config["executable"]
                        .as_str()
                        .or_else(|| c["executable"].as_str())
                        .ok_or("Missing cover executable")?,
                )
            };
            if !python_job {
                command
                    .arg("-m")
                    .arg(
                        model_config["model"]
                            .as_str()
                            .ok_or("Missing image model")?,
                    )
                    .arg("-p")
                    .arg(&rendered_prompt)
                    .arg("-o")
                    .arg(&path)
                    .args([
                        "--steps",
                        steps,
                        "--cfg-scale",
                        cfg,
                        "--sampling-method",
                        sampler,
                        "--scheduler",
                        scheduler,
                        "-W",
                        width,
                        "-H",
                        height,
                        "--disable-image-metadata",
                        "--log-level",
                        "error",
                    ])
                    .arg("--seed")
                    .arg(seed.to_string())
                    .arg("--backend")
                    .arg(backend)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                if is_portrait || profile == "dreamshaper-8-lcm" {
                    command.args(["--max-vram", "3"]);
                }
                if profile == "dreamshaper-8-lcm" {
                    command.args(["-n", negative_prompt(kind, mature)]);
                }
            }
            command
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .env("PYTHONUTF8", "1");
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
                let limit = if backend == "cpu" || python_job {
                    900
                } else {
                    180
                };
                if started.elapsed() > Duration::from_secs(limit) {
                    self.cancel()?;
                    return Err("Cover generation timed out and was unloaded.".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            let bytes = std::fs::read(&path).map_err(|_| "No generated cover was returned")?;
            if bytes.len() > 4 * 1024 * 1024 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
                return Err("Invalid generated cover image".into());
            }
            // The invisible "AI-generated" watermark. Without the ONNX Runtime
            // or the model the picture is kept as it is.
            let bytes = crate::image_mark::watermark_png(&app, &bytes).unwrap_or(bytes);
            Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
        };
        let configured = model_config["backend"]
            .as_str()
            .or(c["backend"].as_str())
            .unwrap_or("cpu")
            .to_string();
        // A graphics backend that is missing or fails (no driver, a virtual
        // machine, too little memory) falls back to the processor once.
        let result = match attempt(&configured) {
            Err(error)
                if configured != "cpu"
                    && !matches!(profile, "sd15-lcm" | "sdxl-lightning" | "z-image-turbo")
                    && (error.starts_with("The local cover generator failed")
                        || error.starts_with("No generated cover")) =>
            {
                let _ = std::fs::remove_file(&path);
                attempt("cpu")
            }
            other => other,
        };
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
    fn portraits_use_a_small_square_and_do_not_inherit_cover_layout_or_mature_mode() {
        assert_eq!(
            ArtworkKind::VoicePortrait.size("dreamshaper-8-lcm"),
            ("512", "512")
        );
        let prompt = portrait_prompt("Woman with an auburn bob and wool jacket");
        assert!(prompt.contains("fully clothed, adult"));
        assert!(prompt.contains("Centered face"));
        assert!(prompt.contains("text-free"));
        assert!(!prompt.contains("book-cover"));
        assert!(!prompt.contains("title overlay"));
    }
    #[test]
    fn covers_use_the_selected_profile_and_portrait_overrides_are_independent() {
        let c = json!({"model":"covers", "profile":"dreamshaper-8-lcm", "portrait":{"model":"avatars", "profile":"sd-turbo"}});
        let (cover, profile) = image_profile(ArtworkKind::Cover, &c, None).unwrap();
        assert_eq!(cover["model"], "covers");
        assert_eq!(profile, "dreamshaper-8-lcm");
        assert_eq!(ArtworkKind::Cover.size(profile), ("512", "704"));
        let (portrait, profile) = image_profile(ArtworkKind::VoicePortrait, &c, None).unwrap();
        assert_eq!(portrait["model"], "avatars");
        assert_eq!(profile, "sd-turbo");
        assert_eq!(
            image_profile(ArtworkKind::Cover, &json!({"model":"legacy"}), None)
                .unwrap()
                .1,
            "sd-turbo"
        );
        assert!(
            image_profile(ArtworkKind::Cover, &json!({"profile":"unsupported"}), None).is_err()
        );
        let versions = json!({"cover":{"model":"standard", "profile":"dreamshaper-8-lcm"},
            "models":{"fast":{"model":"turbo", "profile":"sd-turbo"}}});
        let (fast, profile) = image_profile(ArtworkKind::Cover, &versions, Some("fast")).unwrap();
        assert_eq!(
            (fast["model"].as_str(), profile),
            (Some("turbo"), "sd-turbo")
        );
        assert!(image_profile(ArtworkKind::Cover, &versions, Some("gone")).is_err());
        let upgrade = json!({"model":"legacy-sd-model", "cover":{"model":"new-model", "profile":"dreamshaper-8-lcm"}});
        assert_eq!(
            image_profile(ArtworkKind::Cover, &upgrade, None).unwrap().0["model"],
            "new-model"
        );
        assert_eq!(upgrade["model"], "legacy-sd-model");
    }
    #[test]
    fn cover_negative_guidance_always_excludes_text_and_standard_mode_discourages_nudity() {
        let safe = negative_prompt(ArtworkKind::Cover, false);
        assert!(safe.contains("text, lettering, printed words"));
        assert!(safe.contains("nudity, naked, sexual content"));
        let mature = negative_prompt(ArtworkKind::Cover, true);
        assert!(mature.contains("text, lettering, printed words"));
        assert!(mature.contains("explicit sexual acts"));
        assert!(!mature.contains("nudity"));
        assert!(negative_prompt(ArtworkKind::VoicePortrait, true).contains("nudity"));
    }
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
