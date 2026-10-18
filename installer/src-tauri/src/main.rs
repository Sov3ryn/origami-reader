#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::{json, Value};
use std::{io::{BufRead, BufReader, Write}, path::PathBuf, process::{ChildStdin, Command, Stdio}, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use tauri::{Emitter, Manager, State};

#[derive(Default)]
struct Session { active: AtomicBool, input: Mutex<Option<ChildStdin>>, installed: Mutex<Option<PathBuf>> }
fn root() -> Result<PathBuf, String> { std::env::current_exe().map_err(|e|e.to_string())?.parent().map(PathBuf::from).ok_or("Missing package directory".into()) }
fn hidden(c: &mut Command) {
    #[cfg(windows)] { use std::os::windows::process::CommandExt; c.creation_flags(0x08000000); }
    #[cfg(not(windows))] { let _ = c; }
}
#[tauri::command]
fn package_info() -> Result<Value,String> {
    let manifest: Value = serde_json::from_slice(&std::fs::read(root()?.join("payload/manifest.json")).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    Ok(manifest)
}
// What this computer is, so setup can recommend the matching speech engine
// and, later, download the matching package. Read locally; nothing is sent.
fn graphics_adapters() -> Vec<String> {
    #[cfg(windows)]
    {
        let mut c = Command::new("powershell.exe");
        c.args(["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_VideoController).Name"]);
        hidden(&mut c);
        return c.output().ok().map(|o| String::from_utf8_lossy(&o.stdout).lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect()).unwrap_or_default();
    }
    #[cfg(target_os = "linux")]
    {
        // PCI vendor IDs from sysfs; no external tools needed.
        let mut names = Vec::new();
        if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
            for entry in entries.flatten() {
                if let Ok(vendor) = std::fs::read_to_string(entry.path().join("device/vendor")) {
                    let name = match vendor.trim() { "0x10de" => "NVIDIA", "0x1002" => "AMD", "0x8086" => "Intel", other => other }.to_string();
                    if !names.contains(&name) { names.push(name); }
                }
            }
        }
        return names;
    }
    #[cfg(target_os = "macos")]
    {
        return vec![if std::env::consts::ARCH == "aarch64" { "Apple silicon".into() } else { "Intel Mac graphics".into() }];
    }
    #[allow(unreachable_code)]
    Vec::new()
}
#[tauri::command]
async fn system_info() -> Value {
    tauri::async_runtime::spawn_blocking(|| {
        let gpus = graphics_adapters();
        let nvidia = gpus.iter().any(|g| g.to_lowercase().contains("nvidia"));
        let apple = cfg!(target_os = "macos") && std::env::consts::ARCH == "aarch64";
        // AMD's PyTorch for Windows (ROCm) supports Radeon RX 7000 and 9000
        // and Radeon AI PRO cards; older and integrated Radeon stay on the CPU.
        let rocm = cfg!(windows)
            && gpus.iter().any(|g| {
                let g = g.to_lowercase();
                g.contains("radeon")
                    && (g.contains("rx 7") || g.contains("rx 9") || g.contains("ai pro") || g.contains("pro w7"))
            });
        json!({
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "gpus": gpus,
            "speech": if nvidia { "cuda" } else if rocm { "rocm" } else if apple { "mps" } else { "cpu" },
        })
    }).await.unwrap_or_else(|_| json!({"os": std::env::consts::OS, "arch": std::env::consts::ARCH, "gpus": [], "speech": "cpu"}))
}
#[tauri::command]
async fn choose_folder() -> Option<String> { tauri::async_runtime::spawn_blocking(||rfd::FileDialog::new().set_title("Choose the parent folder for Origami").pick_folder().map(|p|p.to_string_lossy().into_owned())).await.ok().flatten() }
#[tauri::command]
fn control_install(state: State<Session>, action: String) -> Result<(),String> {
    if !["pause", "resume", "cancel"].contains(&action.as_str()) { return Err("Unknown action".into()); }
    if let Some(input) = state.input.lock().map_err(|_|"Installer busy")?.as_mut() { writeln!(input, "{}", json!({"action": action})).map_err(|e|e.to_string())?; }
    Ok(())
}
#[tauri::command]
async fn install(app: tauri::AppHandle, mut options: Value) -> Result<Value,String> {
    if app.state::<Session>().active.swap(true, Ordering::SeqCst) { return Err("Installation already running".into()); }
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<Value,String> {
        let base = root()?;
        options["configDir"] = json!(handle.path().config_dir().map_err(|e|e.to_string())?.join("app.origami.reader"));
        options["dataDir"] = json!(handle.path().data_dir().map_err(|e|e.to_string())?.join("app.origami.reader"));
        let py = if cfg!(windows) { "payload/files/python/python.exe" } else { "payload/files/python/bin/python3" };
        let mut command = Command::new(base.join(py));
        command.arg("-I").arg(base.join("bootstrap/install.py")).arg(&base).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        hidden(&mut command);
        let mut child = command.spawn().map_err(|e|format!("Cannot start the bundled installer runtime: {e}"))?;
        let mut input = child.stdin.take().ok_or("Missing installer input")?;
        writeln!(input,"{}",options).map_err(|e|e.to_string())?;
        *handle.state::<Session>().input.lock().map_err(|_|"Installer busy")? = Some(input);
        let stderr = child.stderr.take().ok_or("Missing installer diagnostics")?;
        let diagnostics = std::thread::spawn(move || { use std::io::Read; let mut s=String::new(); let _=stderr.take(65536).read_to_string(&mut s); s });
        let mut final_result = None;
        for line in BufReader::new(child.stdout.take().ok_or("Missing installer progress")?).lines() {
            let line = line.map_err(|e|e.to_string())?;
            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                let _ = handle.emit("install-progress", &event);
                if event["event"] == "complete" || event["event"] == "error" { final_result = Some(event); }
            }
        }
        let status = child.wait().map_err(|e|e.to_string())?;
        let details = diagnostics.join().unwrap_or_default();
        let result = final_result.ok_or_else(||format!("Installer stopped before completion. {details}"))?;
        if !status.success() || result["event"] == "error" { return Err(result["message"].as_str().unwrap_or("Installation failed").into()); }
        *handle.state::<Session>().installed.lock().map_err(|_|"Installer busy")? = result["executable"].as_str().map(PathBuf::from);
        Ok(result)
    }).await.map_err(|e|e.to_string()).and_then(|v|v);
    app.state::<Session>().active.store(false, Ordering::SeqCst);
    if let Ok(mut input) = app.state::<Session>().input.lock() { *input = None; }
    result
}
#[tauri::command]
fn finish(app: tauri::AppHandle, launch: bool) -> Result<(),String> {
    if app.state::<Session>().active.load(Ordering::SeqCst) { return Err("Installation is running".into()); }
    if launch {
        let exe=app.state::<Session>().installed.lock().map_err(|_|"Installer busy")?.clone().ok_or("No completed installation")?;
        let mut c=Command::new(&exe); c.current_dir(exe.parent().ok_or("Invalid app directory")?).env_remove("ORIGAMI_WORKER_CONFIG").env_remove("ORIGAMI_COVER_CONFIG").env_remove("ORIGAMI_DATA_DIR"); hidden(&mut c); c.spawn().map_err(|e|e.to_string())?;
    }
    app.exit(0); Ok(())
}
fn main() {
    tauri::Builder::default().manage(Session::default())
        // Small laptops (1366 x 768 at 125%) have less room than the default
        // window: shrink it to fit the screen's work area and center it.
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                if let Ok(Some(m)) = w.current_monitor() {
                    let area = m.work_area();
                    let scale = m.scale_factor();
                    let (aw, ah) = (area.size.width as f64 / scale, area.size.height as f64 / scale);
                    if let Ok(size) = w.inner_size() {
                        let (cw, ch) = (size.width as f64 / scale, size.height as f64 / scale);
                        if cw > aw - 16.0 || ch > ah - 16.0 {
                            let _ = w.set_size(tauri::LogicalSize::new(cw.min(aw - 16.0), ch.min(ah - 16.0)));
                            let _ = w.center();
                        }
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window,event| { if let tauri::WindowEvent::CloseRequested{api,..}=event { if window.state::<Session>().active.load(Ordering::SeqCst) { api.prevent_close(); let _=window.emit("install-close-requested",()); } } })
        .invoke_handler(tauri::generate_handler![package_info, system_info, choose_folder, install, control_install, finish])
        .run(tauri::generate_context!()).expect("Cannot open Origami Reader Installer");
}
