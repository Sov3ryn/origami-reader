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
use std::time::Duration;
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
        // The uninstaller is accepted from beta 12 on; earlier updaters refuse
        // it, so it is shipped in an app update only after beta 12 is common.
        "app" => &["origami-reader.exe", "origami-reader", "runtime/", "licenses/", "Uninstall Origami.ps1"],
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

/// A request that gives up on a stalled server instead of waiting forever.
fn get(url: &str, body: Duration) -> std::result::Result<ureq::http::Response<ureq::Body>, ureq::Error> {
    ureq::get(url)
        .config()
        .timeout_connect(Some(Duration::from_secs(20)))
        .timeout_recv_response(Some(Duration::from_secs(60)))
        .timeout_recv_body(Some(body))
        .build()
        .call()
}

fn fetch(url: &str, limit: u64) -> Result<Vec<u8>> {
    if !url.starts_with("https://") && !url.starts_with("http://127.0.0.1") && !url.starts_with("http://localhost") {
        return Err("Updates only come over HTTPS.".into());
    }
    let response = get(url, Duration::from_secs(120)).map_err(|e| format!("Could not reach the update server: {e}"))?;
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

/// A downloaded, checked component waiting to be installed.
struct Ready {
    id: String,
    version: String,
    zip: PathBuf,
}

/// Downloads every pending component into the data folder and checks its
/// size, SHA-256 and paths. Only when all of them are here is anything
/// installed, so a failed download never leaves a new app with old workers.
/// Files are then swapped in place (the old ones are renamed and removed at
/// the next start); if one cannot be written, every swap is undone.
pub fn install(app: &AppHandle, data_root: &Path, update: &Value) -> Result<bool> {
    let dir = install_dir()?;
    if !dir.join("components.json").is_file() {
        return Err("This copy of Origami was not installed with the installer, so it cannot update itself.".into());
    }
    let staging = data_root.join("Updates");
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    let components = update["components"].as_array().cloned().unwrap_or_default();
    let mut ready: Vec<Ready> = vec![];
    let mut restart = false;
    let downloaded = download_all(app, &staging, &components, &mut ready, &mut restart);
    let discard = |ready: &[Ready]| {
        for r in ready {
            let _ = std::fs::remove_file(&r.zip);
        }
    };
    if let Err(e) = downloaded {
        discard(&ready);
        return Err(e);
    }
    let mut journal = vec![];
    let mut applied = Ok(());
    for r in &ready {
        if let Err(e) = apply_into(&r.zip, &dir, &r.id, &mut journal) {
            applied = Err(e);
            break;
        }
    }
    if applied.is_ok() {
        let versions: Vec<(&str, &str)> = ready.iter().map(|r| (r.id.as_str(), r.version.as_str())).collect();
        applied = set_installed(&dir, &versions);
    }
    discard(&ready);
    if let Err(e) = applied {
        undo(&journal);
        return Err(format!("{e} The update was undone; nothing changed."));
    }
    // Uninstalling removes what the update added, too.
    let written: Vec<String> = journal.iter().map(|c| c.name.clone()).collect();
    let app_version = ready.iter().find(|r| r.id == "app").map(|r| r.version.as_str());
    let _ = record_files(&dir, &written, app_version);
    Ok(restart)
}

fn download_all(app: &AppHandle, staging: &Path, components: &[Value], ready: &mut Vec<Ready>, restart: &mut bool) -> Result<()> {
    let total: u64 = components.iter().map(|c| c["size"].as_u64().unwrap_or(0)).sum();
    let mut done = 0u64;
    for c in components {
        let id = c["id"].as_str().ok_or("Invalid component")?;
        let url = c["url"].as_str().ok_or("Invalid component")?;
        let size = c["size"].as_u64().ok_or("Invalid component")?;
        let sha = c["sha256"].as_str().ok_or("Invalid component")?.to_ascii_lowercase();
        if allowed(id).is_empty() {
            return Err("Invalid component".into());
        }
        if !url.starts_with("https://") && !url.starts_with("http://127.0.0.1") {
            return Err("Updates only come over HTTPS.".into());
        }
        let file = staging.join(format!("{id}.zip"));
        let response = get(url, Duration::from_secs(3600)).map_err(|e| format!("Download failed: {e}"))?;
        let mut body = response.into_body().into_reader();
        let mut out = std::fs::File::create(&file).map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut buf = vec![0u8; 1 << 20];
        let mut got = 0u64;
        let copied: Result<()> = (|| loop {
            let n = body.read(&mut buf).map_err(|e| format!("Download failed: {e}"))?;
            if n == 0 {
                return Ok(());
            }
            got += n as u64;
            if got > size {
                return Err("The download is larger than announced.".into());
            }
            hash.update(&buf[..n]);
            out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            let _ = app.emit("update-progress", json!({"received": done + got, "total": total}));
        })();
        drop(out);
        let digest: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if copied.is_err() || got != size || digest != sha {
            let _ = std::fs::remove_file(&file);
            copied?;
            return Err("The download did not match the update list. Nothing was installed.".into());
        }
        done += got;
        let plain = if c["encrypted"] == true {
            let plain = decrypt(&file);
            let _ = std::fs::remove_file(&file);
            plain?
        } else {
            file
        };
        if let Err(e) = check_zip(&plain, id) {
            let _ = std::fs::remove_file(&plain);
            return Err(e);
        }
        ready.push(Ready { id: id.to_string(), version: c["version"].as_str().unwrap_or("").to_string(), zip: plain });
        *restart |= c["restart"].as_bool().unwrap_or(id == "app");
    }
    Ok(())
}

/// Writes a file through a temporary copy beside it, so a power cut leaves
/// either the old file or the new one.
fn write_atomic(path: &Path, data: &[u8]) -> Result<()> {
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let pending = path.with_file_name(format!("{name}.pending"));
    std::fs::write(&pending, data).map_err(|e| e.to_string())?;
    std::fs::rename(&pending, path).map_err(|e| {
        let _ = std::fs::remove_file(&pending);
        e.to_string()
    })
}

fn read_json(path: &Path) -> Option<Value> {
    std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
}

fn set_installed(dir: &Path, versions: &[(&str, &str)]) -> Result<()> {
    let path = dir.join("components.json");
    let mut v = read_json(&path).unwrap_or_else(|| json!({}));
    for (id, version) in versions {
        v[*id] = json!(version);
    }
    write_atomic(&path, &serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?)
}

/// Adds the files an update wrote to setup's receipt (installation.json),
/// which the uninstaller removes. Without a receipt there is nothing to do.
fn record_files(dir: &Path, written: &[String], app_version: Option<&str>) -> Result<()> {
    let path = dir.join("installation.json");
    let Some(mut receipt) = read_json(&path) else { return Ok(()) };
    let Some(files) = receipt["files"].as_array() else { return Ok(()) };
    let mut all: std::collections::BTreeSet<String> = files.iter().filter_map(|f| f.as_str().map(str::to_string)).collect();
    let before = all.len();
    all.extend(written.iter().cloned());
    let changed_version = app_version.is_some_and(|v| receipt["version"].as_str() != Some(v));
    if all.len() == before && !changed_version {
        return Ok(());
    }
    receipt["files"] = json!(all.into_iter().collect::<Vec<_>>());
    if let Some(v) = app_version {
        receipt["version"] = json!(v);
    }
    // ASCII only (other characters escaped): Windows PowerShell 5.1 runs the uninstaller.
    let text = serde_json::to_string_pretty(&receipt).map_err(|e| e.to_string())?;
    let ascii: String = text
        .encode_utf16()
        .fold(String::with_capacity(text.len()), |mut out, unit| {
            if unit < 0x80 {
                out.push(unit as u8 as char);
            } else {
                out.push_str(&format!("\\u{unit:04x}"));
            }
            out
        });
    write_atomic(&path, ascii.as_bytes())
}

/// One file swapped in by an update: where it went, and the earlier copy set aside.
struct Change {
    name: String,
    target: PathBuf,
    aside: Option<PathBuf>,
}

fn suffixed(target: &Path, suffix: &str) -> PathBuf {
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    target.with_file_name(format!("{name}.{suffix}"))
}

/// The entries of a component's zip, after checking every one stays inside
/// the component's own folders.
fn check_zip(zip_path: &Path, component: &str) -> Result<Vec<(usize, String, bool)>> {
    let prefixes = allowed(component);
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "The update file is damaged.")?;
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
    Ok(names)
}

/// Unpacks a component into `root`. Every entry must stay inside the
/// component's own folders; a file in use is renamed aside first (Windows
/// allows renaming a running program) and cleaned up at the next start.
/// If a file cannot be written, the files already swapped are put back.
#[cfg(test)]
pub fn apply_zip(zip_path: &Path, root: &Path, component: &str) -> Result<()> {
    let mut journal = vec![];
    apply_into(zip_path, root, component, &mut journal).inspect_err(|_| undo(&journal))
}

fn apply_into(zip_path: &Path, root: &Path, component: &str, journal: &mut Vec<Change>) -> Result<()> {
    // Check every path before writing anything.
    let names = check_zip(zip_path, component)?;
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "The update file is damaged.")?;
    for (i, name, is_dir) in names {
        let target = root.join(&name);
        if is_dir {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let fresh = suffixed(&target, "update-new");
        let written: Result<()> = (|| {
            let mut entry = archive.by_index(i).map_err(|_| "The update file is damaged.")?;
            let mut out = std::fs::File::create(&fresh).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            out.sync_all().map_err(|e| e.to_string())
        })();
        if let Err(e) = written {
            let _ = std::fs::remove_file(&fresh);
            return Err(e);
        }
        let mut aside = None;
        if target.exists() {
            let old = suffixed(&target, "update-old");
            let _ = std::fs::remove_file(&old);
            if let Err(e) = std::fs::rename(&target, &old) {
                let _ = std::fs::remove_file(&fresh);
                return Err(format!("Could not replace {name}: {e}"));
            }
            aside = Some(old);
        }
        if let Err(e) = std::fs::rename(&fresh, &target) {
            if let Some(old) = &aside {
                let _ = std::fs::rename(old, &target);
            }
            let _ = std::fs::remove_file(&fresh);
            return Err(format!("Could not install {name}: {e}"));
        }
        journal.push(Change { name, target, aside });
    }
    Ok(())
}

/// Puts back the files an unfinished update replaced, newest first.
fn undo(journal: &[Change]) {
    for change in journal.iter().rev() {
        let _ = std::fs::remove_file(&change.target);
        if let Some(old) = &change.aside {
            let _ = std::fs::rename(old, &change.target);
        }
    }
}

/// Tidies after the last update: a file set aside whose replacement never
/// arrived (the computer stopped between the two renames) is put back,
/// half-written new files are removed, and set-aside files that were in use
/// then are removed.
pub fn clean_up() {
    if let Ok(dir) = install_dir() {
        if dir.join("components.json").is_file() {
            tidy(&dir);
        }
    }
}

fn tidy(dir: &Path) {
    fn walk(dir: &Path, depth: u32) {
        let Ok(list) = std::fs::read_dir(dir) else { return };
        for entry in list.flatten() {
            let p = entry.path();
            let name = p.to_string_lossy().to_string();
            if p.is_dir() && depth < 4 {
                walk(&p, depth + 1);
            } else if name.ends_with(".update-new") {
                let _ = std::fs::remove_file(&p);
            } else if let Some(target) = name.strip_suffix(".update-old") {
                let target = Path::new(target);
                if target.exists() {
                    let _ = std::fs::remove_file(&p);
                } else {
                    let _ = std::fs::rename(&p, target);
                }
            }
        }
    }
    walk(dir, 0);
    // A components list half-written by a power cut.
    let _ = std::fs::remove_file(dir.join("components.json.pending"));
    let _ = std::fs::remove_file(dir.join("installation.json.pending"));
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

    #[test]
    fn failed_updates_put_every_file_back() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("install");
        std::fs::create_dir_all(root.join("workers")).unwrap();
        std::fs::write(root.join("workers/a.py"), "old a").unwrap();
        let zip_path = dir.path().join("w.zip");
        let mut w = zip::ZipWriter::new(std::fs::File::create(&zip_path).unwrap());
        for (name, body) in [("workers/a.py", "new a"), ("workers/b.py", "new b")] {
            w.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            w.write_all(body.as_bytes()).unwrap();
        }
        w.finish().unwrap();
        let mut journal = vec![];
        apply_into(&zip_path, &root, "workers", &mut journal).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("workers/a.py")).unwrap(), "new a");
        undo(&journal);
        assert_eq!(std::fs::read_to_string(root.join("workers/a.py")).unwrap(), "old a");
        assert!(!root.join("workers/b.py").exists());
        assert!(!root.join("workers/a.py.update-old").exists());
    }

    #[test]
    fn start_up_restores_files_an_interrupted_update_set_aside() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("workers")).unwrap();
        // Stopped between the two renames: only the old copy and the new one exist.
        std::fs::write(root.join("workers/a.py.update-old"), "old a").unwrap();
        std::fs::write(root.join("workers/a.py.update-new"), "new a").unwrap();
        // Finished, but the old copy was in use.
        std::fs::write(root.join("origami-reader.exe"), "new").unwrap();
        std::fs::write(root.join("origami-reader.exe.update-old"), "old").unwrap();
        tidy(root);
        assert_eq!(std::fs::read_to_string(root.join("workers/a.py")).unwrap(), "old a");
        assert!(!root.join("workers/a.py.update-new").exists());
        assert!(!root.join("workers/a.py.update-old").exists());
        assert_eq!(std::fs::read_to_string(root.join("origami-reader.exe")).unwrap(), "new");
        assert!(!root.join("origami-reader.exe.update-old").exists());
    }

    #[test]
    fn receipts_list_files_an_update_added() {
        let dir = tempfile::tempdir().unwrap();
        let receipt = dir.path().join("installation.json");
        std::fs::write(&receipt, r#"{"root":"C:\\Users\\Ren\u00e9\\Origami","version":"1","files":["workers/a.py"]}"#).unwrap();
        record_files(dir.path(), &["workers/b.py".into(), "workers/a.py".into()], Some("2")).unwrap();
        let text = std::fs::read_to_string(&receipt).unwrap();
        assert!(text.is_ascii());
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["files"], json!(["workers/a.py", "workers/b.py"]));
        assert_eq!(v["version"], "2");
        assert_eq!(v["root"], "C:\\Users\\Ren\u{e9}\\Origami");
        set_installed(dir.path(), &[("app", "2"), ("workers", "3")]).unwrap();
        let c = read_json(&dir.path().join("components.json")).unwrap();
        assert_eq!(c, json!({"app": "2", "workers": "3"}));
        assert!(!dir.path().join("components.json.pending").exists());
    }
}
