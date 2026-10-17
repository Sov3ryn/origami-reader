use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
type Result<T> = std::result::Result<T, String>;
pub const MODEL: &str = "qwen-voice-design";
pub const LANGUAGES: &[&str] = &[
    "English",
    "Chinese",
    "Japanese",
    "Korean",
    "French",
    "German",
    "Spanish",
    "Portuguese",
    "Italian",
    "Russian",
];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Design {
    pub name: String,
    pub prompt: String,
    pub text: String,
    pub language: String,
    pub gender: String,
    pub accent: String,
    pub style: String,
    pub portrait: String,
    pub temperature: f64,
    pub seed: u32,
    pub count: u8,
}
impl Design {
    fn validate(&self) -> Result<()> {
        if !(1..=3).contains(&self.count)
            || !self.temperature.is_finite()
            || !(0.3..=1.2).contains(&self.temperature)
            || self.seed > 2147483646
        {
            return Err("Choose 1 to 3 takes, a valid seed and variation from 0.3 to 1.2.".into());
        }
        if !LANGUAGES.contains(&self.language.as_str())
            || !["female", "male", "unspecified"].contains(&self.gender.as_str())
        {
            return Err("Choose a supported language and voice category.".into());
        }
        for (value, min, max, label) in [
            (&self.name, 0, 80, "name"),
            (&self.prompt, 20, 2000, "description"),
            (&self.text, 30, 600, "sample text"),
            (&self.accent, 0, 100, "accent"),
            (&self.style, 0, 80, "style"),
            (&self.portrait, 0, 500, "portrait description"),
        ] {
            if !(min..=max).contains(&value.trim().chars().count()) {
                return Err(format!(
                    "The {label} must contain {min} to {max} characters."
                ));
            }
        }
        Ok(())
    }
}
pub fn created_root(app: &AppHandle) -> Result<PathBuf> {
    Ok(crate::data_root(app)?.join("CreatedVoices"))
}
fn drafts(app: &AppHandle) -> Result<PathBuf> {
    Ok(crate::data_root(app)?.join("VoiceStudio").join("drafts"))
}
fn valid_id(id: &str) -> bool {
    id.starts_with("vd-")
        && id.len() < 80
        && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}
fn draft_file(app: &AppHandle, id: &str, ext: &str) -> Result<PathBuf> {
    if !valid_id(id) {
        return Err("Invalid preview identifier.".into());
    }
    Ok(drafts(app)?.join(format!("{id}.{ext}")))
}
fn read_json(path: &Path) -> Result<Value> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() > 64 * 1024 {
        return Err("Invalid voice metadata.".into());
    }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
fn write_json(path: &Path, value: &Value) -> Result<()> {
    let temp = path.with_extension("pending");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temp, path).map_err(|e| e.to_string())
}
fn wav(app: &AppHandle, id: &str) -> Result<Vec<u8>> {
    let b = fs::read(draft_file(app, id, "wav")?).map_err(|_| "Preview audio is missing.")?;
    if b.len() > 8 * 1024 * 1024 || b.get(..4) != Some(b"RIFF") || b.get(8..12) != Some(b"WAVE") {
        return Err("Invalid preview audio.".into());
    }
    Ok(b)
}
pub fn merge_profiles(app: &AppHandle, config: &mut Value) {
    let Ok(root) = created_root(app) else { return };
    let Ok(entries) = fs::read_dir(&root) else {
        return;
    };
    if !config["voices"].is_object() {
        config["voices"] = json!({});
    }
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let Some(id) = p.file_stem().and_then(|x| x.to_str()) else {
            continue;
        };
        if !id.starts_with("designed-vd-") {
            continue;
        }
        let Ok(mut v) = read_json(&p) else { continue };
        let audio = root.join(format!("{id}.wav"));
        if !audio.is_file() {
            continue;
        }
        v["reference"] = json!(audio);
        if config["voices"].get(id).is_none() {
            config["voices"][id] = v;
        }
    }
}
/// A deleted designed voice can be saved again from its take, if kept.
pub fn forget_saved(app: &AppHandle, voice: &str) {
    let Some(id) = voice.strip_prefix("designed-") else {
        return;
    };
    let Ok(path) = draft_file(app, id, "json") else {
        return;
    };
    if let Ok(mut take) = read_json(&path) {
        take["savedVoice"] = Value::Null;
        let _ = write_json(&path, &take);
    }
}
#[derive(Default)]
pub struct Studio {
    child: Mutex<Option<Child>>,
    busy: AtomicBool,
    epoch: AtomicU64,
    closing: AtomicBool,
    files: Mutex<()>,
}
impl Studio {
    pub fn busy(&self) -> bool {
        self.busy.load(Ordering::SeqCst)
    }
    pub fn cancel(&self) -> Result<()> {
        self.epoch.fetch_add(1, Ordering::SeqCst);
        if let Some(mut child) = self
            .child
            .lock()
            .map_err(|_| "Voice studio lock failed")?
            .take()
        {
            #[cfg(windows)]
            {
                if child.try_wait().ok().flatten().is_none() {
                    use std::os::windows::process::CommandExt;
                    let _ = Command::new("taskkill.exe")
                        .args(["/PID", &child.id().to_string(), "/T", "/F"])
                        .creation_flags(0x08000000)
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();
                }
            }
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::SeqCst);
        let _ = self.cancel();
    }
    fn generate(&self, app: &AppHandle, spec: Design) -> Result<Value> {
        spec.validate()?;
        let epoch = self.epoch.load(Ordering::SeqCst);
        if self.closing.load(Ordering::SeqCst) || self.busy.swap(true, Ordering::SeqCst) {
            return Err("A voice design is already running or the app is closing.".into());
        }
        let result = (|| {
            app.state::<crate::speech::Speech>().cancel()?;
            app.state::<crate::covers::Covers>().cancel()?;
            let _lease = crate::models::OPERATIONS
                .write()
                .map_err(|_| "Model operation lock failed")?;
            let c = crate::models::read(app, "creator")?;
            let engine = &c["models"][MODEL];
            if engine["disabled"] == true || !crate::models::present(engine, &c, "creator") {
                return Err(
                    "Install Qwen VoiceDesign in Settings, Models to create a voice.".into(),
                );
            }
            let folder = drafts(app)?;
            fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?;
            let job = format!("vd-{}", now.as_nanos());
            let input = folder.join(format!("{job}.request"));
            write_json(
                &input,
                &json!({"spec":spec,"engine":engine,"directory":folder,"job":job,"createdAt":now.as_millis() as u64}),
            )?;
            let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../workers/voice_design.py");
            // Release builds always run their installed worker.
            let script = if cfg!(debug_assertions) && dev.exists() {
                dev
            } else {
                app.path()
                    .resource_dir()
                    .map_err(|e| e.to_string())?
                    .join("workers/voice_design.py")
            };
            let log = folder.join("last-job.log");
            let output = fs::File::create(&log).map_err(|e| e.to_string())?;
            let mut command = Command::new(
                engine["python"]
                    .as_str()
                    .ok_or("Missing voice creator runtime.")?,
            );
            command
                .arg("-u")
                .arg(script)
                .arg(&input)
                .env("PYTHONUTF8", "1")
                .stdin(Stdio::null())
                .stdout(output.try_clone().map_err(|e| e.to_string())?)
                .stderr(output);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            {
                let mut child = self.child.lock().map_err(|_| "Voice studio lock failed")?;
                if self.closing.load(Ordering::SeqCst) || epoch != self.epoch.load(Ordering::SeqCst)
                {
                    let _ = fs::remove_file(input);
                    return Err("Voice generation cancelled.".into());
                }
                *child = Some(command.spawn().map_err(|e| e.to_string())?);
            }
            let start = Instant::now();
            let completed: Result<()> = loop {
                if epoch != self.epoch.load(Ordering::SeqCst) {
                    break Err("Voice generation cancelled. Completed takes were kept.".into());
                }
                let status = self
                    .child
                    .lock()
                    .map_err(|_| "Voice studio lock failed")?
                    .as_mut()
                    .and_then(|p| p.try_wait().ok().flatten());
                if let Some(status) = status {
                    break if status.success() {
                        Ok(())
                    } else {
                        Err("Voice generation failed. Try a shorter passage or free device memory. Diagnostic details are in VoiceStudio/drafts/last-job.log.".into())
                    };
                }
                if start.elapsed() > Duration::from_secs(900) {
                    let _ = self.cancel();
                    break Err("Voice generation timed out and the model was unloaded.".into());
                }
                std::thread::sleep(Duration::from_millis(120));
            };
            let _ = fs::remove_file(input);
            // Incomplete files cannot become playable takes or saved voices.
            for e in fs::read_dir(&folder).into_iter().flatten().flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with(&job)
                    && (name.ends_with(".partial.wav")
                        || name.ends_with(".pending")
                        || (name.ends_with(".wav") && !e.path().with_extension("json").is_file()))
                {
                    let _ = fs::remove_file(e.path());
                }
            }
            completed?;
            list(app)
        })();
        let _ = self.cancel();
        self.busy.store(false, Ordering::SeqCst);
        result
    }
}
pub fn list(app: &AppHandle) -> Result<Value> {
    let mut items = Vec::new();
    if let Ok(entries) = fs::read_dir(drafts(app)?) {
        for e in entries.flatten() {
            let p = e.path();
            let Some(id) = p.file_stem().and_then(|x| x.to_str()) else {
                continue;
            };
            if p.extension().and_then(|x| x.to_str()) == Some("json") && valid_id(id) {
                if let Ok(v) = read_json(&p) {
                    if v["id"] == id
                        && v["savedVoice"].as_str().is_none()
                        && draft_file(app, id, "wav")?.is_file()
                    {
                        items.push(v);
                    }
                }
            }
        }
    }
    items.sort_by(|a, b| b["id"].as_str().cmp(&a["id"].as_str()));
    Ok(json!(items))
}
#[tauri::command]
pub fn voice_studio_state(app: AppHandle) -> Result<Value> {
    let c = crate::models::read(&app, "creator").unwrap_or(json!({}));
    let m = &c["models"][MODEL];
    Ok(
        json!({"installed":m["disabled"]!=true&&crate::models::present(m,&c,"creator"),"busy":app.state::<Studio>().busy(),"previews":list(&app)?}),
    )
}
#[tauri::command]
pub async fn design_voice(app: AppHandle, spec: Design) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Studio>().generate(&app, spec))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn cancel_voice_design(state: tauri::State<Studio>) -> Result<()> {
    state.cancel()
}
#[tauri::command]
pub fn voice_preview_audio(app: AppHandle, id: String) -> Result<String> {
    Ok(format!(
        "data:audio/wav;base64,{}",
        STANDARD.encode(wav(&app, &id)?)
    ))
}
#[tauri::command]
pub fn update_voice_preview(
    app: AppHandle,
    id: String,
    favorite: bool,
    notes: String,
) -> Result<()> {
    if notes.chars().count() > 2000 {
        return Err("Keep review notes under 2,000 characters.".into());
    }
    let state = app.state::<Studio>();
    let _guard = state.files.lock().map_err(|_| "Voice files busy")?;
    let p = draft_file(&app, &id, "json")?;
    let mut v = read_json(&p)?;
    v["favorite"] = json!(favorite);
    v["notes"] = json!(notes);
    write_json(&p, &v)
}
#[tauri::command]
pub fn delete_voice_preview(app: AppHandle, id: String) -> Result<()> {
    let state = app.state::<Studio>();
    let _guard = state.files.lock().map_err(|_| "Voice files busy")?;
    let p = draft_file(&app, &id, "json")?;
    if !p.is_file() {
        return Err("Preview not found.".into());
    }
    fs::remove_file(p).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(draft_file(&app, &id, "wav")?);
    Ok(())
}
#[tauri::command]
pub fn save_designed_voice(
    app: AppHandle,
    id: String,
    name: String,
    transcript: String,
    reviewed: bool,
) -> Result<String> {
    if !reviewed {
        return Err("Listen to the take and confirm its transcript before saving.".into());
    }
    if name.trim().is_empty()
        || name.chars().count() > 80
        || transcript.trim().chars().count() < 20
        || transcript.chars().count() > 800
    {
        return Err("Enter a name and the exact words spoken in this take.".into());
    }
    let state = app.state::<Studio>();
    let _guard = state.files.lock().map_err(|_| "Voice files busy")?;
    let source = draft_file(&app, &id, "json")?;
    let mut take = read_json(&source)?;
    if let Some(existing) = take["savedVoice"].as_str() {
        return Ok(existing.into());
    }
    let audio = wav(&app, &id)?;
    let root = created_root(&app)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let voice = format!("designed-{id}");
    let reference = root.join(format!("{voice}.wav"));
    fs::write(&reference, audio).map_err(|e| e.to_string())?;
    let spec = &take["spec"];
    let profile = json!({"name":name.trim(),"description":format!("{}{}",spec["style"].as_str().unwrap_or("Custom voice"),spec["accent"].as_str().filter(|a|!a.is_empty()).map(|a|format!(" · {a}")).unwrap_or_default()),"engine":"qwen","reference":reference,"reference_text":transcript.trim(),"language":spec["language"],"languages":[spec["language"]],"gender":spec["gender"],"accent":spec["accent"],"styles":[spec["style"]],"portraitAppearance":spec["portrait"],"origin":"qwen-voice-design","design":spec,"seed":take["seed"],"notes":take["notes"]});
    write_json(&root.join(format!("{voice}.json")), &profile)?;
    take["savedVoice"] = json!(voice);
    write_json(&source, &take)?;
    Ok(voice)
}
#[tauri::command]
pub async fn export_voice_preview(app: AppHandle, id: String) -> Result<bool> {
    let bytes = wav(&app, &id)?;
    let internal = [drafts(&app)?, created_root(&app)?];
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("WAV audio", &["wav"])
            .set_file_name(format!("{id}.wav"))
            .save_file()
        {
            let parent = path
                .parent()
                .ok_or("Choose an export folder.")?
                .canonicalize()
                .map_err(|e| e.to_string())?;
            if internal
                .iter()
                .filter_map(|p| p.canonicalize().ok())
                .any(|p| parent.starts_with(p))
            {
                return Err(
                    "Choose a folder outside Origami's internal voice storage for your export."
                        .into(),
                );
            }
            fs::write(path, bytes).map_err(|e| e.to_string())?;
            Ok(true)
        } else {
            Ok(false)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_ids_cannot_escape_storage() {
        for id in [
            "../book",
            "vd-../../voice",
            "vd-a/b",
            "vd-a\\b",
            "vd-a.json",
            "",
        ] {
            assert!(!valid_id(id));
        }
        assert!(valid_id("vd-123456-1"));
    }
    #[test]
    fn requests_bound_model_work() {
        let mut s = Design {
            name: "Test".into(),
            prompt: "A warm clear storyteller.".into(),
            text: "The garden was quiet, and the gate stood open.".into(),
            language: "English".into(),
            gender: "female".into(),
            accent: "".into(),
            style: "Narration".into(),
            portrait: "".into(),
            temperature: 0.8,
            seed: 42,
            count: 1,
        };
        assert!(s.validate().is_ok());
        s.count = 4;
        assert!(s.validate().is_err());
        s.count = 1;
        s.language = "Unsupported".into();
        assert!(s.validate().is_err());
    }
}
