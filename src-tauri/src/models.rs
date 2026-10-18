use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::{Mutex, RwLock},
};
use tauri::{AppHandle, Manager};
type Result<T> = std::result::Result<T, String>;
static CHANGES: Mutex<()> = Mutex::new(());
// Generation holds a shared lease. Removal waits until cancelled jobs have
// released their files, and new jobs read the updated configuration afterward.
pub static OPERATIONS: RwLock<()> = RwLock::new(());
pub const CREATORS: &[&str] = &["qwen-voice-design"];
pub const READERS: &[&str] = &[
    "kitten-mini",
    "kitten-micro",
    "kokoro",
    "qwen3-tts-0.6b",
    "qwen3-tts-1.7b",
];
pub const IMAGES: &[&str] = &[
    "sd15-lcm",
    "dreamshaper-8-lcm",
    "sd-turbo",
    "sdxl-lightning",
    "z-image-turbo",
];

pub fn path(app: &AppHandle, kind: &str) -> Result<PathBuf> {
    let (env, file) = match kind {
        "reader" => ("ORIGAMI_WORKER_CONFIG", "worker.json"),
        "image" => ("ORIGAMI_COVER_CONFIG", "cover-engine.json"),
        "creator" => ("ORIGAMI_VOICE_DESIGN_CONFIG", "voice-design.json"),
        _ => return Err("Unknown model category".into()),
    };
    if kind == "creator" && std::env::var_os(env).is_none() {
        if let Some(worker) = std::env::var_os("ORIGAMI_WORKER_CONFIG") {
            let local = PathBuf::from(worker).with_file_name(file);
            if local.is_file() {
                return Ok(local);
            }
        }
    }
    Ok(std::env::var_os(env).map(PathBuf::from).unwrap_or(
        app.path()
            .app_config_dir()
            .map_err(|e| e.to_string())?
            .join(file),
    ))
}
pub fn read(app: &AppHandle, kind: &str) -> Result<Value> {
    let text = std::fs::read_to_string(path(app, kind)?)
        .map_err(|_| "Models are not configured on this computer.")?;
    serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|_| "Invalid model configuration.".into())
}
pub fn present(m: &Value, c: &Value, kind: &str) -> bool {
    let model = m[if kind == "reader" { "path" } else { "model" }]
        .as_str()
        .unwrap_or("");
    let runtime = m["python"]
        .as_str()
        .or_else(|| m["executable"].as_str())
        .or_else(|| {
            c[if kind == "reader" {
                "python"
            } else {
                "executable"
            }]
            .as_str()
        })
        .unwrap_or("");
    if !Path::new(model).exists() || !Path::new(runtime).is_file() {
        return false;
    }
    for key in ["adapter", "unet"] {
        if let Some(p) = m[key].as_str() {
            if !Path::new(p).exists() {
                return false;
            }
        }
    }
    true
}
pub fn inventory(app: &AppHandle) -> Value {
    let mut rows = vec![];
    for (kind, ids) in [
        ("reader", READERS),
        ("image", IMAGES),
        ("creator", CREATORS),
    ] {
        let c = read(app, kind).unwrap_or(json!({}));
        for id in ids {
            let m = &c["models"][id];
            let exists = present(m, &c, kind);
            let enabled = m["disabled"] != true;
            // External models can be disconnected, but never erased by this app.
            let managed = managed_path(app, id, m, kind).is_ok();
            rows.push(json!({"id":id,"installed":exists && enabled,"availableLocally":exists,"managed":managed}));
        }
    }
    json!(rows)
}
fn owned_directory(root: &Path, id: &str, model: &Path) -> Result<PathBuf> {
    if !READERS.contains(&id) && !IMAGES.contains(&id) && !CREATORS.contains(&id) {
        return Err("Unknown model.".into());
    }
    let target = root.join(id);
    let meta =
        std::fs::symlink_metadata(&target).map_err(|_| "Model is outside managed storage.")?;
    if meta.file_type().is_symlink() {
        return Err("Linked models are not managed storage.".into());
    }
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let target = target.canonicalize().map_err(|e| e.to_string())?;
    let model = model.canonicalize().map_err(|e| e.to_string())?;
    if target.parent() != Some(root.as_path()) || !model.starts_with(&target) {
        return Err("Model is outside managed storage.".into());
    }
    Ok(target)
}
fn managed_path(app: &AppHandle, id: &str, m: &Value, kind: &str) -> Result<PathBuf> {
    if m["managed"] != true {
        return Err("External model.".into());
    }
    owned_directory(
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("Models"),
        id,
        Path::new(
            m[if kind == "reader" { "path" } else { "model" }]
                .as_str()
                .unwrap_or(""),
        ),
    )
}
pub fn change(app: &AppHandle, id: &str, install: bool) -> Result<Value> {
    let _lock = CHANGES.lock().map_err(|_| "Model settings busy")?;
    let _operations = OPERATIONS
        .write()
        .map_err(|_| "Model operation lock failed")?;
    let kind = if READERS.contains(&id) {
        "reader"
    } else if IMAGES.contains(&id) {
        "image"
    } else if CREATORS.contains(&id) {
        "creator"
    } else {
        return Err("Unknown model.".into());
    };
    let mut c = read(app, kind)?;
    if install {
        if !present(&c["models"][id], &c, kind) {
            return Err("Download links are not available yet.".into());
        }
        c["models"][id]["disabled"] = json!(false);
    } else {
        let m = &c["models"][id];
        if !m.is_object() {
            return Err("Model is not installed.".into());
        }
        if m["managed"] == true {
            let target = managed_path(app, id, m, kind)?;
            std::fs::remove_dir_all(target).map_err(|e| e.to_string())?;
        }
        c["models"][id]["disabled"] = json!(true);
    }
    let dest = path(app, kind)?;
    // Keep the previous configuration recoverable before replacing it.
    std::fs::copy(&dest, dest.with_extension("json.bak")).map_err(|e| e.to_string())?;
    let text = serde_json::to_vec_pretty(&c).map_err(|e| e.to_string())?;
    let staging = dest.with_extension("json.pending");
    std::fs::write(&staging, text).map_err(|e| e.to_string())?;
    std::fs::rename(staging, dest).map_err(|e| e.to_string())?;
    Ok(inventory(app))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn removal_stays_in_owned_directory() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Models");
        let owned = root.join("kitten-mini");
        std::fs::create_dir_all(&owned).unwrap();
        let file = owned.join("model.onnx");
        std::fs::write(&file, b"test").unwrap();
        assert_eq!(
            owned_directory(&root, "kitten-mini", &file).unwrap(),
            owned.canonicalize().unwrap()
        );
        assert!(owned_directory(&root, "../user-books", &file).is_err());
        let outside = temp.path().join("book.epub");
        std::fs::write(&outside, b"book").unwrap();
        assert!(owned_directory(&root, "kitten-mini", &outside).is_err());
    }
}
