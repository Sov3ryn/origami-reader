// The voice library: every Origami voice as its own file on the public
// origami-voices repository (release voices-store-1), with a catalog that holds
// each file's SHA-256. Setup installs a few voices per language; the others are
// listed in the app, previewed from that file and downloaded on request. Every
// file is checked against the catalog before it is played or used.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub type Result<T> = std::result::Result<T, String>;

const STORE: &str = "https://github.com/Promethor/origami-voices/releases/download/voices-store-1";
const MAX_CATALOG: u64 = 4 << 20;
const MAX_VOICE: u64 = 24 << 20;

fn folder(app: &AppHandle, name: &str) -> Result<PathBuf> {
    let dir = crate::data_root(app)?.join(name);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn get(url: &str, limit: u64) -> Result<Vec<u8>> {
    // A stalled connection gives up instead of leaving the card spinning.
    let response = ureq::get(url)
        .config()
        .timeout_connect(Some(std::time::Duration::from_secs(15)))
        .timeout_global(Some(std::time::Duration::from_secs(120)))
        .build()
        .call()
        .map_err(|e| format!("The voice library could not be reached ({e})."))?;
    let mut data = Vec::new();
    response.into_body().into_reader().take(limit + 1).read_to_end(&mut data).map_err(|e| e.to_string())?;
    if data.len() as u64 > limit {
        return Err("The voice library sent a file that is too large.".into());
    }
    Ok(data)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() < 100 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

/// The catalog, from the library or, offline, the last copy kept.
fn catalog(app: &AppHandle) -> Result<Value> {
    let cache = folder(app, "VoiceStore")?.join("voice-store.json");
    let fresh = get(&format!("{STORE}/voice-store.json"), MAX_CATALOG).and_then(|d| {
        let v: Value = serde_json::from_slice(&d).map_err(|_| "The voice library catalog is damaged.".to_string())?;
        if v["format"] != 1 || !v["voices"].is_object() {
            return Err("The voice library catalog is damaged.".into());
        }
        let _ = std::fs::write(&cache, &d);
        Ok(v)
    });
    match fresh {
        Ok(v) => Ok(v),
        Err(e) => std::fs::read(&cache).ok().and_then(|d| serde_json::from_slice(&d).ok()).ok_or(e),
    }
}

/// The library's voices that are not on this computer yet, shaped like installed voices.
pub fn list(app: &AppHandle) -> Result<Vec<Value>> {
    let installed: Vec<String> = crate::speech::voices(app).iter().filter_map(|v| v["id"].as_str().map(str::to_string)).collect();
    let c = catalog(app)?;
    // The library's voices are read by Qwen3-TTS: without it, the app says where to get it.
    let config = crate::models::read(app, "reader").unwrap_or(json!({}));
    let qwen = config["models"].as_object().into_iter().flatten().any(|(_, m)| {
        m["engine"] == "qwen" && m["disabled"] != true && crate::models::present(m, &config, "reader")
    });
    let mut out = Vec::new();
    for (id, v) in c["voices"].as_object().into_iter().flatten() {
        if installed.contains(id) || !valid_id(id) {
            continue;
        }
        out.push(json!({
            "id": id,
            "name": v["name"],
            "description": v["description"],
            "available": false,
            "store": true,
            "engine": v["engine"].as_str().unwrap_or("qwen"),
            "languages": v.get("languages").cloned().unwrap_or_else(|| json!([v["language"].as_str().unwrap_or("Unspecified")])),
            "gender": v["gender"].as_str().unwrap_or("unspecified"),
            "styles": v.get("styles").cloned().unwrap_or_else(|| json!([])),
            "accent": v["accent"].as_str().unwrap_or(""),
            "portraitAppearance": v["portraitAppearance"].as_str().unwrap_or(""),
            "size": v["size"],
            "needsQwen": !qwen,
        }));
    }
    Ok(out)
}

/// A voice's file, downloaded once and checked against the catalog.
fn fetch(app: &AppHandle, id: &str) -> Result<(PathBuf, Value)> {
    if !valid_id(id) {
        return Err("Unknown voice.".into());
    }
    let c = catalog(app)?;
    let v = c["voices"][id].clone();
    let (file, sha) = (v["file"].as_str().unwrap_or_default(), v["sha256"].as_str().unwrap_or_default());
    if v.is_null() || file.is_empty() || file.contains(['/', '\\']) || file.contains("..") || sha.len() != 64 {
        return Err("This voice is not in the voice library.".into());
    }
    let path = folder(app, "VoiceStore")?.join(format!("{id}.wav"));
    let matches = |data: &[u8]| format!("{:x}", Sha256::digest(data)) == sha;
    if let Ok(data) = std::fs::read(&path) {
        if matches(&data) {
            return Ok((path, v));
        }
    }
    let data = get(&format!("{STORE}/{file}"), MAX_VOICE)?;
    if !matches(&data) || data.get(..4) != Some(b"RIFF") {
        return Err("The voice did not match the library's fingerprint, so it was not used.".into());
    }
    let part = path.with_extension("part");
    std::fs::write(&part, &data).map_err(|e| e.to_string())?;
    std::fs::rename(&part, &path).map_err(|e| e.to_string())?;
    Ok((path, v))
}

/// The voice's own recording, to hear it before downloading.
pub fn preview(app: &AppHandle, id: &str) -> Result<Vec<u8>> {
    let (path, _) = fetch(app, id)?;
    std::fs::read(path).map_err(|e| e.to_string())
}

/// Adds the voice to this computer's voices (the speech configuration).
pub fn install(app: &AppHandle, id: &str) -> Result<()> {
    let (cached, v) = fetch(app, id)?;
    let target = folder(app, "Voices")?.join(format!("{id}.wav"));
    std::fs::copy(&cached, &target).map_err(|e| e.to_string())?;
    let path = crate::models::path(app, "reader")?;
    let text = std::fs::read_to_string(&path).map_err(|_| "Local speech is not set up on this computer, so voices cannot be added yet.")?;
    let mut config: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|_| "Invalid speech configuration.")?;
    if !config["voices"].is_object() {
        config["voices"] = json!({});
    }
    let mut entry = v.clone();
    if let Some(o) = entry.as_object_mut() {
        for k in ["file", "sha256", "size", "pack"] {
            o.remove(k);
        }
        o.insert("reference".into(), json!(target));
    }
    config["voices"][id] = entry;
    let pending = path.with_extension("pending");
    std::fs::write(&pending, serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&pending, &path).map_err(|e| e.to_string())?;
    // A loaded worker keeps the old voice list; the next request starts fresh.
    let _ = app.state::<crate::speech::Speech>().cancel();
    Ok(())
}
