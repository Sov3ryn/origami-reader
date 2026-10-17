// Work mode plugins: folders with a manifest.json and JavaScript, kept in the
// data folder's Plugins directory. Each one is served to its own sandboxed
// frame from http://oplugin.localhost/<id>/ (oplugin://localhost/<id>/ off
// Windows) with a policy that only allows its own files: no network, no
// other plugins, no app. See docs/PLUGINS.md.
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};

type Result<T> = std::result::Result<T, String>;

pub const SCHEME: &str = "oplugin";
const API: &str = include_str!("plugin_api.js");
// Loads the plugin page (keeping ?block=... for blocks in notes) and passes
// messages both ways.
const RELAY: &str = "(function(){var c=document.querySelector('iframe');c.src=location.pathname.replace(/__host$/,'')+location.search;window.addEventListener('message',function(e){if(e.source===window.parent)c.contentWindow.postMessage(e.data,'*');else if(e.source===c.contentWindow)window.parent.postMessage(e.data,'*');});})();";
const PERMISSIONS: [&str; 4] = ["notes:read", "notes:write", "cards:read", "cards:write"];
const MAX_BYTES: u64 = 20 * 1024 * 1024;

const SAMPLE: [(&str, &str); 4] = [
    ("manifest.json", include_str!("../../plugins/sample-note-tools/manifest.json")),
    ("main.js", include_str!("../../plugins/sample-note-tools/main.js")),
    ("style.css", include_str!("../../plugins/sample-note-tools/style.css")),
    ("README.md", include_str!("../../plugins/sample-note-tools/README.md")),
];

pub fn root(data_root: &Path) -> PathBuf {
    data_root.join("Plugins")
}

fn valid_id(id: &str) -> bool {
    (2..=40).contains(&id.len()) && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Reads and checks a manifest; unknown permissions are refused.
pub fn manifest(folder: &Path) -> Result<Value> {
    let text = std::fs::read_to_string(folder.join("manifest.json")).map_err(|_| "This folder has no manifest.json.")?;
    let v: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| format!("manifest.json is not valid: {e}"))?;
    let id = v["id"].as_str().unwrap_or("");
    if !valid_id(id) {
        return Err("The plugin id must be 2 to 40 lowercase letters, digits or dashes.".into());
    }
    if v["name"].as_str().map(str::trim).unwrap_or("").is_empty() {
        return Err("The plugin needs a name.".into());
    }
    for p in v["permissions"].as_array().cloned().unwrap_or_default() {
        if !PERMISSIONS.contains(&p.as_str().unwrap_or("")) {
            return Err(format!("Unknown permission: {p}"));
        }
    }
    let main = v["main"].as_str().unwrap_or("main.js");
    if safe_relative(main).is_none() || !folder.join(main).is_file() {
        return Err(format!("The plugin's script ({main}) is missing."));
    }
    Ok(v)
}

pub fn list(data_root: &Path) -> Vec<Value> {
    // An older copy of the bundled sample is brought up to date.
    let sample = root(data_root).join("sample-note-tools");
    if let Ok(installed) = manifest(&sample) {
        let bundled: Value = serde_json::from_str(SAMPLE[0].1).unwrap_or_default();
        if installed["version"] != bundled["version"] {
            let _ = install_sample(data_root);
        }
    }
    let mut out = vec![];
    let Ok(dirs) = std::fs::read_dir(root(data_root)) else { return out };
    for d in dirs.flatten() {
        let path = d.path();
        if !path.is_dir() {
            continue;
        }
        match manifest(&path) {
            Ok(mut m) if m["id"].as_str() == path.file_name().and_then(|n| n.to_str()) => {
                m["folder"] = json!(path.to_string_lossy());
                out.push(m);
            }
            Ok(_) => out.push(json!({"id": path.file_name().map(|n| n.to_string_lossy()), "error": "The folder name must match the plugin id."})),
            Err(e) => out.push(json!({"id": path.file_name().map(|n| n.to_string_lossy()), "error": e})),
        }
    }
    out.sort_by(|a, b| a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or("")));
    out
}

/// Copies a plugin folder in (replacing an older copy of the same plugin).
pub fn install(data_root: &Path, from: &Path) -> Result<Value> {
    let m = manifest(from)?;
    let id = m["id"].as_str().unwrap_or_default().to_string();
    let mut files = vec![];
    let mut total = 0u64;
    collect(from, from, &mut files, &mut total, 0)?;
    let target = root(data_root).join(&id);
    let staging = root(data_root).join(format!(".{id}.new"));
    let _ = std::fs::remove_dir_all(&staging);
    for (src, rel) in &files {
        let dst = staging.join(rel);
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::copy(src, &dst).map_err(|e| e.to_string())?;
    }
    let _ = std::fs::remove_dir_all(&target);
    std::fs::rename(&staging, &target).map_err(|e| e.to_string())?;
    Ok(m)
}
fn collect(base: &Path, dir: &Path, out: &mut Vec<(PathBuf, PathBuf)>, total: &mut u64, depth: u32) -> Result<()> {
    if depth > 6 {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_dir() {
            collect(base, &path, out, total, depth + 1)?;
        } else if meta.is_file() {
            *total += meta.len();
            if *total > MAX_BYTES {
                return Err("This plugin is larger than 20 MB.".into());
            }
            out.push((path.clone(), path.strip_prefix(base).map_err(|e| e.to_string())?.to_path_buf()));
        }
    }
    Ok(())
}

pub fn install_sample(data_root: &Path) -> Result<Value> {
    let folder = root(data_root).join("sample-note-tools");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    for (name, body) in SAMPLE {
        std::fs::write(folder.join(name), body).map_err(|e| e.to_string())?;
    }
    manifest(&folder)
}

pub fn remove(data_root: &Path, id: &str) -> Result<()> {
    if !valid_id(id) {
        return Err("Unknown plugin".into());
    }
    let folder = root(data_root).join(id);
    if folder.is_dir() {
        std::fs::remove_dir_all(folder).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn safe_relative(path: &str) -> Option<PathBuf> {
    let p = Path::new(path);
    (!path.is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)))).then(|| p.to_path_buf())
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "html" => "text/html; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        "txt" | "md" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// What the plugin frame may load: its own files, nothing else.
fn policy(origin: &str, id: &str) -> String {
    let own = format!("{origin}/{id}/");
    format!("default-src 'none'; script-src {own}; style-src {own} 'unsafe-inline'; img-src {own} data: blob:; font-src {own} data:; media-src {own} data: blob:; form-action 'none'; base-uri 'none'")
}

/// Answers http://oplugin.localhost/<id>/<file>.
pub fn serve(data_root: &Path, uri_path: &str, origin: &str) -> (u16, &'static str, Vec<u8>, String) {
    let path = uri_path.trim_start_matches('/');
    let (id, rest) = path.split_once('/').unwrap_or((path, ""));
    let not_found = (404, "text/plain; charset=utf-8", b"Not found".to_vec(), String::from("default-src 'none'"));
    if !valid_id(id) {
        return not_found;
    }
    let folder = root(data_root).join(id);
    let Ok(m) = manifest(&folder) else { return not_found };
    let csp = policy(origin, id);
    if rest.is_empty() || rest == "index.html" {
        let style = m["style"].as_str().unwrap_or("style.css");
        let link = if safe_relative(style).is_some() && folder.join(style).is_file() {
            format!("<link rel=\"stylesheet\" href=\"/{id}/{style}\">")
        } else {
            String::new()
        };
        let main = m["main"].as_str().unwrap_or("main.js");
        let html = format!(
            "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"color-scheme\" content=\"light dark\">{link}</head><body><script src=\"/{id}/__origami.js\"></script><script src=\"/{id}/{main}\"></script></body></html>"
        );
        return (200, "text/html; charset=utf-8", html.into_bytes(), csp);
    }
    // The frame the app loads: it only relays messages, and its policy keeps
    // the plugin frame inside the plugin's folder (a plugin cannot navigate
    // itself to a website to send data out).
    if rest == "__host" {
        let html = format!(
            "<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{{margin:0;height:100%;overflow:hidden;background:transparent}}iframe{{border:0;width:100%;height:100%;display:block}}</style></head><body><iframe sandbox=\"allow-scripts\" title=\"{id}\"></iframe><script src=\"/{id}/__relay.js\"></script></body></html>"
        );
        let host_csp = format!("default-src 'none'; script-src {origin}/{id}/__relay.js; frame-src {origin}/{id}/; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
        return (200, "text/html; charset=utf-8", html.into_bytes(), host_csp);
    }
    if rest == "__relay.js" {
        return (200, "text/javascript; charset=utf-8", RELAY.as_bytes().to_vec(), csp);
    }
    if rest == "__origami.js" {
        return (200, "text/javascript; charset=utf-8", API.as_bytes().to_vec(), csp);
    }
    let Some(rel) = safe_relative(rest) else { return not_found };
    let file = folder.join(&rel);
    match std::fs::read(&file) {
        Ok(bytes) => (200, content_type(&file), bytes, csp),
        Err(_) => not_found,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugins_install_list_serve_and_stay_in_their_folder() {
        let d = tempfile::tempdir().unwrap();
        let m = install_sample(d.path()).unwrap();
        assert_eq!(m["id"], "sample-note-tools");
        let all = list(d.path());
        assert_eq!(all.len(), 1);
        let (status, kind, body, csp) = serve(d.path(), "/sample-note-tools/", "http://oplugin.localhost");
        assert_eq!(status, 200);
        assert!(kind.starts_with("text/html"));
        assert!(String::from_utf8(body).unwrap().contains("/sample-note-tools/main.js"));
        assert!(csp.contains("script-src http://oplugin.localhost/sample-note-tools/;"));
        assert!(!csp.contains("connect-src") || csp.contains("connect-src 'none'"));
        assert_eq!(serve(d.path(), "/sample-note-tools/__origami.js", "x").0, 200);
        let (_, _, host, host_csp) = serve(d.path(), "/sample-note-tools/__host", "http://oplugin.localhost");
        assert!(String::from_utf8(host).unwrap().contains("sandbox=\"allow-scripts\""));
        assert!(host_csp.contains("frame-src http://oplugin.localhost/sample-note-tools/;"));
        assert_eq!(serve(d.path(), "/sample-note-tools/../../secret.txt", "x").0, 404);
        assert_eq!(serve(d.path(), "/Bad_Id/main.js", "x").0, 404);
        // A copy installs from a folder; bad manifests are refused.
        let src = d.path().join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("manifest.json"), r#"{"id":"my-tool","name":"Mine","permissions":["notes:read"]}"#).unwrap();
        std::fs::write(src.join("main.js"), "1").unwrap();
        install(d.path(), &src).unwrap();
        assert_eq!(list(d.path()).len(), 2);
        std::fs::write(src.join("manifest.json"), r#"{"id":"my-tool","name":"Mine","permissions":["files:all"]}"#).unwrap();
        assert!(install(d.path(), &src).is_err());
        remove(d.path(), "my-tool").unwrap();
        assert_eq!(list(d.path()).len(), 1);
    }
}
