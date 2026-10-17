// Updates, component by component, so a new version never means reinstalling
// the whole kit. A signed manifest lists each component (the app, the speech
// workers, voices...) with its version, download address, size and SHA-256.
// Nothing is checked until an update address and key are configured (no
// hosting yet), and nothing is downloaded without the reader asking.
//
// Manifest: {UPDATE_URL}/manifest.json, signed by {UPDATE_URL}/manifest.json.sig
// (Ed25519, base64). See docs/UPDATES.md and installer/scripts/make-update.py.
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Emitter};

type Result<T> = std::result::Result<T, String>;

/// Where updates come from (the newest release of the public updates
/// repository), and the public key that signs them. ORIGAMI_UPDATE_URL and
/// ORIGAMI_UPDATE_KEY override both, for testing.
const UPDATE_URL: &str = "https://github.com/Promethor/origami-updates/releases/latest/download";
const UPDATE_PUBLIC_KEY: &str = "flCemWjLu1Me9Vc9DmNCVEC5ypqX/g3oliGhcYij9YY=";
/// Update files are encrypted with this key so only friends' copies can open
/// them. It is given at build time (never in Git); a copy built without it
/// can still check for updates but not install encrypted ones.
const CONTENT_KEY: Option<&str> = option_env!("ORIGAMI_UPDATE_CONTENT_KEY");

/// Opens an encrypted update file ("OGU1", a 24-byte nonce, then
/// XChaCha20-Poly1305) into a plain zip beside it.
fn decrypt(file: &Path) -> Result<PathBuf> {
    use chacha20poly1305::{aead::{Aead, KeyInit}, XChaCha20Poly1305, XNonce};
    let key = CONTENT_KEY.ok_or("This copy of Origami cannot open friends-only updates. Download the new version from the Origami page.")?;
    let key: [u8; 32] = STANDARD.decode(key.trim()).ok().and_then(|k| k.try_into().ok()).ok_or("Invalid update key in this build.")?;
    let data = std::fs::read(file).map_err(|e| e.to_string())?;
    if data.len() < 28 || &data[..4] != b"OGU1" {
        return Err("The update file is damaged.".into());
    }
    let plain = XChaCha20Poly1305::new(&key.into())
        .decrypt(XNonce::from_slice(&data[4..28]), &data[28..])
        .map_err(|_| "This update was made for a different Origami group. Download the new version from the Origami page.")?;
    let out = file.with_extension("plain.zip");
    std::fs::write(&out, plain).map_err(|e| e.to_string())?;
    Ok(out)
}

fn config() -> (String, String) {
    let url = std::env::var("ORIGAMI_UPDATE_URL").unwrap_or_else(|_| UPDATE_URL.into());
    let key = std::env::var("ORIGAMI_UPDATE_KEY").unwrap_or_else(|_| UPDATE_PUBLIC_KEY.into());
    (url.trim_end_matches('/').to_string(), key)
}
pub fn platform() -> &'static str {
    if cfg!(all(windows, target_arch = "x86_64")) {
        "windows-x64"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "linux-x64"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "other"
    }
}

/// What each component may write, relative to the install folder.
fn allowed(component: &str) -> &'static [&'static str] {
    match component {
        "app" => &["origami-reader.exe", "origami-reader", "runtime/", "licenses/"],
        "workers" => &["workers/"],
        "voices" => &["voices/", "voice-catalog.json"],
        "image-runtime" => &["image-runtime/"],
        "python" => &["python/"],
        _ => &[],
    }
}

// --- Versions ----------------------------------------------------------------------------
/// Compares "0.1.0-beta.4", "0.2.0" or "2026.10.20". A release beats its own
/// pre-releases; numeric parts compare as numbers.
pub fn newer(candidate: &str, installed: &str) -> bool {
    fn parse(v: &str) -> (Vec<u64>, Vec<String>) {
        let (main, pre) = v.trim().trim_start_matches('v').split_once('-').unwrap_or((v.trim().trim_start_matches('v'), ""));
        let nums = main.split('.').map(|p| p.parse().unwrap_or(0)).collect();
        let pre = if pre.is_empty() { vec![] } else { pre.split('.').map(str::to_string).collect() };
        (nums, pre)
    }
    let (a, ap) = parse(candidate);
    let (b, bp) = parse(installed);
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    match (ap.is_empty(), bp.is_empty()) {
        (true, true) => false,
        (true, false) => true,
        (false, true) => false,
        (false, false) => {
            for i in 0..ap.len().max(bp.len()) {
                match (ap.get(i), bp.get(i)) {
                    (Some(x), Some(y)) if x != y => {
                        return match (x.parse::<u64>(), y.parse::<u64>()) {
                            (Ok(p), Ok(q)) => p > q,
                            _ => x > y,
                        }
                    }
                    (Some(_), None) => return true,
                    (None, Some(_)) => return false,
                    _ => {}
                }
            }
            false
        }
    }
}

// --- Signatures ------------------------------------------------------------------------
pub fn verify(manifest: &[u8], signature_b64: &str, key_b64: &str) -> Result<()> {
    let key: [u8; 32] = STANDARD
        .decode(key_b64.trim())
        .map_err(|_| "Invalid update key")?
        .try_into()
        .map_err(|_| "Invalid update key")?;
    let sig: [u8; 64] = STANDARD
        .decode(signature_b64.trim())
        .map_err(|_| "Invalid update signature")?
        .try_into()
        .map_err(|_| "Invalid update signature")?;
    VerifyingKey::from_bytes(&key)
        .map_err(|_| "Invalid update key")?
        .verify(manifest, &Signature::from_bytes(&sig))
        .map_err(|_| "The update list is not signed by Origami. Nothing was installed.".to_string())
}

// --- Installed versions ------------------------------------------------------------------
fn install_dir() -> Result<PathBuf> {
    std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "No install folder".into())
}
/// components.json is written by the packager beside the app. Without it this
/// copy cannot update itself (a development build, for example).
fn installed() -> Value {
    let file = install_dir().map(|d| d.join("components.json"));
    let mut v = file
        .ok()
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str::<Value>(s.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_else(|| json!({}));
    if v.get("app").is_none() {
        v["app"] = json!(env!("CARGO_PKG_VERSION"));
    }
    v
}

pub fn status() -> Value {
    let (url, key) = config();
    let managed = install_dir().map(|d| d.join("components.json").is_file()).unwrap_or(false);
    json!({
        "configured": !url.is_empty() && !key.is_empty(),
        "managed": managed,
        "platform": platform(),
        "installed": installed(),
    })
}

fn fetch(url: &str, limit: u64) -> Result<Vec<u8>> {
    if !url.starts_with("https://") && !url.starts_with("http://127.0.0.1") && !url.starts_with("http://localhost") {
        return Err("Updates only come over HTTPS.".into());
    }
    let response = ureq::get(url).call().map_err(|e| format!("Could not reach the update server: {e}"))?;
    let mut out = Vec::new();
    response
        .into_body()
        .into_reader()
        .take(limit + 1)
        .read_to_end(&mut out)
        .map_err(|e| e.to_string())?;
    if out.len() as u64 > limit {
        return Err("The update list is too large.".into());
    }
    Ok(out)
}

/// The signed list, and the components newer than what is installed.
pub fn check() -> Result<Value> {
    let (url, key) = config();
    if url.is_empty() || key.is_empty() {
        return Err("Update hosting is not set up yet.".into());
    }
    let manifest = fetch(&format!("{url}/manifest.json"), 1 << 20)?;
    let sig = fetch(&format!("{url}/manifest.json.sig"), 4096)?;
    verify(&manifest, &String::from_utf8_lossy(&sig), &key)?;
    let list: Value = serde_json::from_slice(&manifest).map_err(|_| "Invalid update list")?;
    pending(&list, &installed())
}
/// Components of `list` that are newer than `have` and meant for this system.
pub fn pending(list: &Value, have: &Value) -> Result<Value> {
    if list["format"] != 1 {
        return Err("This update needs a newer Origami. Please download it from the website.".into());
    }
    let mut out = vec![];
    for c in list["components"].as_array().ok_or("Invalid update list")? {
        let id = c["id"].as_str().unwrap_or("");
        let version = c["version"].as_str().unwrap_or("");
        let target = c["platform"].as_str().unwrap_or("any");
        if allowed(id).is_empty() || (target != "any" && target != platform()) {
            continue;
        }
        // Components the kit never had (an image runtime, say) are not added.
        let Some(current) = have[id].as_str() else { continue };
        if newer(version, current) {
            out.push(c.clone());
        }
    }
    Ok(json!({ "version": list["version"], "notes": list["notes"], "released": list["released"], "components": out }))
}

/// Downloads every pending component into the data folder, checking size and
/// SHA-256, then installs it: files are swapped in place (the old ones are
/// renamed and removed at the next start), and components.json is updated.
pub fn install(app: &AppHandle, data_root: &Path, update: &Value) -> Result<bool> {
    let dir = install_dir()?;
    if !dir.join("components.json").is_file() {
        return Err("This copy of Origami was not installed with the installer, so it cannot update itself.".into());
    }
    let staging = data_root.join("Updates");
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    let components = update["components"].as_array().cloned().unwrap_or_default();
    let total: u64 = components.iter().map(|c| c["size"].as_u64().unwrap_or(0)).sum();
    let mut done = 0u64;
    let mut restart = false;
    for c in &components {
        let id = c["id"].as_str().ok_or("Invalid component")?;
        let url = c["url"].as_str().ok_or("Invalid component")?;
        let size = c["size"].as_u64().ok_or("Invalid component")?;
        let sha = c["sha256"].as_str().ok_or("Invalid component")?.to_ascii_lowercase();
        if !url.starts_with("https://") && !url.starts_with("http://127.0.0.1") {
            return Err("Updates only come over HTTPS.".into());
        }
        let file = staging.join(format!("{id}.zip"));
        let response = ureq::get(url).call().map_err(|e| format!("Download failed: {e}"))?;
        let mut body = response.into_body().into_reader();
        let mut out = std::fs::File::create(&file).map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut buf = vec![0u8; 1 << 20];
        let mut got = 0u64;
        loop {
            let n = body.read(&mut buf).map_err(|e| format!("Download failed: {e}"))?;
            if n == 0 {
                break;
            }
            got += n as u64;
            if got > size {
                return Err("The download is larger than announced.".into());
            }
            hash.update(&buf[..n]);
            out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            let _ = app.emit("update-progress", json!({"received": done + got, "total": total}));
        }
        drop(out);
        let digest: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if got != size || digest != sha {
            let _ = std::fs::remove_file(&file);
            return Err("The download did not match the update list. Nothing was installed.".into());
        }
        done += got;
        let plain = if c["encrypted"] == true { decrypt(&file)? } else { file.clone() };
        let applied = apply_zip(&plain, &dir, id);
        let _ = std::fs::remove_file(&plain);
        let _ = std::fs::remove_file(&file);
        applied?;
        set_installed(&dir, id, c["version"].as_str().unwrap_or(""))?;
        restart |= c["restart"].as_bool().unwrap_or(id == "app");
    }
    Ok(restart)
}

fn set_installed(dir: &Path, id: &str, version: &str) -> Result<()> {
    let path = dir.join("components.json");
    let mut v: Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_else(|| json!({}));
    v[id] = json!(version);
    std::fs::write(&path, serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Unpacks a component into `root`. Every entry must stay inside the
/// component's own folders; a file in use is renamed aside first (Windows
/// allows renaming a running program) and cleaned up at the next start.
pub fn apply_zip(zip_path: &Path, root: &Path, component: &str) -> Result<()> {
    let prefixes = allowed(component);
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "The update file is damaged.")?;
    // Check every path before writing anything.
    let mut names = vec![];
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|_| "The update file is damaged.")?;
        let name = entry.name().replace('\\', "/");
        let path = Path::new(&name);
        let safe = !name.is_empty()
            && path.components().all(|c| matches!(c, Component::Normal(_)))
            && prefixes.iter().any(|p| if p.ends_with('/') { name.starts_with(p) } else { name == *p });
        if !safe {
            return Err(format!("The update contains a file it may not write: {name}"));
        }
        names.push((i, name, entry.is_dir()));
    }
    for (i, name, is_dir) in names {
        let target = root.join(&name);
        if is_dir {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let fresh = target.with_extension(format!("{}update-new", target.extension().map(|e| format!("{}.", e.to_string_lossy())).unwrap_or_default()));
        {
            let mut entry = archive.by_index(i).map_err(|_| "The update file is damaged.")?;
            let mut out = std::fs::File::create(&fresh).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
        if target.exists() {
            let aside = target.with_extension(format!("{}update-old", target.extension().map(|e| format!("{}.", e.to_string_lossy())).unwrap_or_default()));
            let _ = std::fs::remove_file(&aside);
            std::fs::rename(&target, &aside).map_err(|e| format!("Could not replace {name}: {e}"))?;
        }
        std::fs::rename(&fresh, &target).map_err(|e| format!("Could not install {name}: {e}"))?;
    }
    Ok(())
}

/// Removes files set aside by the last update (they were in use then).
pub fn clean_up() {
    fn walk(dir: &Path, depth: u32) {
        let Ok(list) = std::fs::read_dir(dir) else { return };
        for entry in list.flatten() {
            let p = entry.path();
            if p.is_dir() && depth < 4 {
                walk(&p, depth + 1);
            } else if p.to_string_lossy().ends_with("update-old") {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
    if let Ok(dir) = install_dir() {
        if dir.join("components.json").is_file() {
            walk(&dir, 0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn versions_compare_like_releases() {
        assert!(newer("0.1.0-beta.4", "0.1.0-beta.3"));
        assert!(newer("0.1.0-beta.10", "0.1.0-beta.9"));
        assert!(newer("0.1.0", "0.1.0-beta.9"));
        assert!(!newer("0.1.0-beta.9", "0.1.0"));
        assert!(newer("0.2.0", "0.1.9"));
        assert!(newer("2026.10.20", "2026.10.16"));
        assert!(!newer("0.1.0", "0.1.0"));
        assert!(!newer("v0.1.0", "0.1.0"));
    }

    #[test]
    fn only_signed_lists_are_trusted() {
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let public = STANDARD.encode(key.verifying_key().to_bytes());
        let list = br#"{"format":1}"#;
        let sig = STANDARD.encode(key.sign(list).to_bytes());
        assert!(verify(list, &sig, &public).is_ok());
        assert!(verify(br#"{"format":2}"#, &sig, &public).is_err());
        let other = STANDARD.encode(SigningKey::from_bytes(&[8u8; 32]).verifying_key().to_bytes());
        assert!(verify(list, &sig, &other).is_err());
    }

    #[test]
    fn pending_keeps_newer_components_for_this_system() {
        let list = json!({"format":1,"version":"0.1.0-beta.4","components":[
            {"id":"app","version":"0.1.0-beta.4","platform":platform()},
            {"id":"workers","version":"2026.10.10","platform":"any"},
            {"id":"voices","version":"2026.11.01","platform":"any"},
            {"id":"app","version":"9.9.9","platform":"elsewhere"},
            {"id":"evil","version":"9.9.9","platform":"any"}
        ]});
        let have = json!({"app":"0.1.0-beta.3","workers":"2026.10.16"});
        let out = pending(&list, &have).unwrap();
        let ids: Vec<_> = out["components"].as_array().unwrap().iter().map(|c| c["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, vec!["app"]);
        assert!(pending(&json!({"format":2}), &have).is_err());
    }

    #[test]
    fn zips_only_write_inside_their_component() {
        let dir = tempfile::tempdir().unwrap();
        let make = |entries: &[(&str, &str)]| {
            let path = dir.path().join("c.zip");
            let mut w = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
            for (name, body) in entries {
                w.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
                w.write_all(body.as_bytes()).unwrap();
            }
            w.finish().unwrap();
            path
        };
        let root = dir.path().join("install");
        std::fs::create_dir_all(root.join("workers")).unwrap();
        std::fs::write(root.join("workers/tts_worker.py"), "old").unwrap();
        let ok = make(&[("workers/tts_worker.py", "new"), ("workers/extra/a.py", "a")]);
        apply_zip(&ok, &root, "workers").unwrap();
        assert_eq!(std::fs::read_to_string(root.join("workers/tts_worker.py")).unwrap(), "new");
        assert_eq!(std::fs::read_to_string(root.join("workers/extra/a.py")).unwrap(), "a");
        assert!(root.join("workers/tts_worker.py.update-old").exists());
        for bad in [&[("../escape.txt", "x")][..], &[("python/evil.py", "x")][..], &[("workers/../../x", "x")][..]] {
            let z = make(bad);
            assert!(apply_zip(&z, &root, "workers").is_err());
        }
        assert!(!dir.path().join("escape.txt").exists());
    }
}
