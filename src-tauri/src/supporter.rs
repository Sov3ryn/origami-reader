//! Reusable signed cosmetic grants, verified offline. Payment secrets never enter the app.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::Path, sync::Mutex};
use tauri::Manager;

const PUBLIC_KEYS: &str = include_str!("../../supporter/public-keys.json");
const MAX_KEY: usize = 4096;
static WRITE_LOCK: Mutex<()> = Mutex::new(());
type Result<T> = std::result::Result<T, String>;

#[derive(Deserialize)]
struct Grant {
    v: u8,
    kid: String,
    product: String,
    grant: String,
    id: String,
    #[serde(rename = "issuedAt")]
    issued_at: String,
}
#[derive(Serialize, Default)]
pub struct Status {
    active: bool,
    id: Option<String>,
}
fn verify_with(key: &str, public_keys: &str) -> Result<Grant> {
    let invalid = || "Invalid supporter key".to_string();
    if key.len() > MAX_KEY { return Err(invalid()); }
    let normalized: String = key.split_whitespace().collect();
    let parts: Vec<_> = normalized.split('.').collect();
    if parts.len() != 3 || parts[0] != "ORIGAMI1" { return Err(invalid()); }
    let payload = URL_SAFE_NO_PAD.decode(parts[1]).map_err(|_| invalid())?;
    let signature = URL_SAFE_NO_PAD.decode(parts[2]).map_err(|_| invalid())?;
    let grant: Grant = serde_json::from_slice(&payload).map_err(|_| invalid())?;
    if grant.v != 1 || grant.product != "origami-reader" || grant.grant != "all-cosmetics"
        || grant.id.is_empty() || grant.id.len() > 128 || grant.issued_at.is_empty() {
        return Err(invalid());
    }
    let keys: HashMap<String, String> = serde_json::from_str(public_keys.trim_start_matches('\u{feff}')).map_err(|_| invalid())?;
    let public = URL_SAFE_NO_PAD.decode(keys.get(&grant.kid).ok_or_else(invalid)?).map_err(|_| invalid())?;
    let bytes: [u8; 32] = public.try_into().map_err(|_| invalid())?;
    let public = VerifyingKey::from_bytes(&bytes).map_err(|_| invalid())?;
    let signature = Signature::from_slice(&signature).map_err(|_| invalid())?;
    public.verify_strict(&payload, &signature).map_err(|_| invalid())?;
    Ok(grant)
}
fn path(app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("supporter-key.txt"))
}
fn read_key(path: &Path) -> Result<String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_KEY as u64 {
        return Err("Invalid supporter key".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn supporter_status(app: tauri::AppHandle) -> Status {
    path(&app).and_then(|p| read_key(&p)).and_then(|key| verify_with(&key, PUBLIC_KEYS))
        .map(|grant| Status { active: true, id: Some(grant.id) }).unwrap_or_default()
}
#[tauri::command]
pub fn supporter_activate(app: tauri::AppHandle, key: String) -> Result<Status> {
    let grant = verify_with(&key, PUBLIC_KEYS)?;
    save_key(&path(&app)?, &key)?;
    Ok(Status { active: true, id: Some(grant.id) })
}
fn save_key(target: &Path, key: &str) -> Result<()> {
    let _lock = WRITE_LOCK.lock().map_err(|_| "Could not save supporter key")?;
    fs::create_dir_all(target.parent().ok_or("Could not save supporter key")?).map_err(|e| e.to_string())?;
    let pending = target.with_extension("pending");
    let normalized: String = key.split_whitespace().collect();
    fs::write(&pending, normalized).map_err(|e| e.to_string())?;
    fs::rename(pending, target).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn supporter_import(app: tauri::AppHandle) -> Result<Option<Status>> {
    let Some(file) = rfd::AsyncFileDialog::new().add_filter("Origami supporter key", &["origami-supporter", "txt"]).pick_file().await else { return Ok(None) };
    let key = read_key(file.path())?;
    supporter_activate(app, key).map(Some)
}
#[tauri::command]
pub async fn supporter_export(app: tauri::AppHandle) -> Result<bool> {
    let key = read_key(&path(&app)?)?;
    verify_with(&key, PUBLIC_KEYS)?;
    let Some(file) = rfd::AsyncFileDialog::new().set_file_name("Origami.origami-supporter").add_filter("Origami supporter key", &["origami-supporter"]).save_file().await else { return Ok(false) };
    // A manual export belongs to the reader, outside the app's managed files.
    fs::write(file.path(), key).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    fn fixture(product: &str) -> (String, String) {
        let signing = SigningKey::from_bytes(&[47; 32]);
        let payload = serde_json::json!({"v":1,"kid":"test","product":product,"grant":"all-cosmetics","id":"test-grant","issuedAt":"2026-01-01"}).to_string();
        let signature = signing.sign(payload.as_bytes());
        let keys = serde_json::json!({"test":URL_SAFE_NO_PAD.encode(signing.verifying_key().as_bytes())}).to_string();
        (format!("ORIGAMI1.{}.{}", URL_SAFE_NO_PAD.encode(payload), URL_SAFE_NO_PAD.encode(signature.to_bytes())), keys)
    }
    #[test]
    fn reusable_grant_and_forgery_checks() {
        let (key, keys) = fixture("origami-reader");
        assert!(verify_with(&key, &keys).is_ok());
        assert!(verify_with(&key, &keys).is_ok());
        assert!(verify_with(&format!("{key}.extra"), &keys).is_err());
        assert!(verify_with(&key, "{}").is_err());
        let mut parts: Vec<String> = key.split('.').map(str::to_string).collect();
        parts[1] = URL_SAFE_NO_PAD.encode(br#"{"v":1,"kid":"test","product":"origami-reader","grant":"all-cosmetics","id":"changed","issuedAt":"2026"}"#);
        assert!(verify_with(&parts.join("."), &keys).is_err());
        let (wrong, keys) = fixture("another-app");
        assert!(verify_with(&wrong, &keys).is_err());
        assert!(verify_with(&"x".repeat(5000), &keys).is_err());
    }
    #[test]
    fn node_issued_key_survives_backup_and_restoration() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../supporter/test-fixture.json")).unwrap();
        let key = fixture["key"].as_str().unwrap();
        let keys = fixture["publicKeys"].to_string();
        assert_eq!(verify_with(key, &keys).unwrap().id, "node-interop-test");
        // Email line wrapping is harmless when copying the reusable key.
        let wrapped = format!(" {}\r\n{} ", &key[..80], &key[80..]);
        assert!(verify_with(&wrapped, &keys).is_ok());
        let old = tempfile::tempdir().unwrap();
        let fresh = tempfile::tempdir().unwrap();
        let original = old.path().join("supporter-key.txt");
        save_key(&original, &wrapped).unwrap();
        save_key(&original, key).unwrap();
        let backup = read_key(&original).unwrap();
        let restored = fresh.path().join("supporter-key.txt");
        save_key(&restored, &backup).unwrap();
        assert_eq!(verify_with(&read_key(&restored).unwrap(), &keys).unwrap().id, "node-interop-test");
        assert!(verify_with(key, PUBLIC_KEYS).is_err(), "test keys are never trusted by the app");
    }
}
