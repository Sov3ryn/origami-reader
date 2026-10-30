mod covers;
mod embed;
mod handwriting;
mod whisper;
mod hardware;
mod ink;
mod plugins;
mod models;
mod speech;
mod store;
mod studio;
mod studio_audio;
mod studio_book;
mod studio_llm;
mod studio_verify;
mod studio_asr;
mod studio_models;
mod studio_archive;
mod voice_store;
mod model_download;
mod update;
mod vault;
mod voice_studio;
use voice_studio::{voice_studio_state, design_voice, cancel_voice_design, voice_preview_audio, update_voice_preview, delete_voice_preview, save_designed_voice, export_voice_preview};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use std::sync::Mutex;
use store::Store;
use tauri::{Manager, State};
type Result<T> = std::result::Result<T, String>;
struct Database(Mutex<Store>);

#[tauri::command]
fn model_inventory(app: tauri::AppHandle) -> Value {models::inventory(&app)}
#[tauri::command]
async fn change_model_installation(app: tauri::AppHandle, id: String, install: bool) -> Result<Value> {
    app.state::<voice_studio::Studio>().cancel()?;
    app.state::<speech::Speech>().cancel()?;
    app.state::<covers::Covers>().cancel()?;
    tauri::async_runtime::spawn_blocking(move ||models::change(&app,&id,install)).await.map_err(|e|e.to_string())?
}
// The only web pages Origami can open, and only when the reader clicks them.
// Fill these in before a public release; empty links are hidden in the app.
const SUPPORT_URL: &str = "https://ko-fi.com/sov3ryn";
const SOURCE_URL: &str = "";
#[tauri::command]
fn external_links() -> Value {
    serde_json::json!({ "support": SUPPORT_URL, "source": SOURCE_URL })
}
#[tauri::command]
fn open_external_link(kind: String) -> Result<()> {
    let url = match kind.as_str() {
        "support" => SUPPORT_URL,
        "source" => SOURCE_URL,
        _ => "",
    };
    if !url.starts_with("https://") {
        return Err("This link is not configured.".into());
    }
    open_in_browser(url)
}
// The licenses folder setup installs beside the program: the app and source
// licenses, model licenses and THIRD-PARTY-NOTICES.txt.
#[tauri::command]
fn open_licenses_folder() -> Result<()> {
    let folder = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("licenses")))
        .filter(|dir| dir.is_dir())
        .ok_or("The licenses folder is installed with the app by setup.")?;
    #[cfg(windows)]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(&folder)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open the folder.".into())
}
// A web page from a note (an embed's "Open in your browser"). Only plain
// http(s) addresses, without spaces or quotes, are passed on.
#[tauri::command]
fn open_url(url: String) -> Result<()> {
    let ok = (url.starts_with("https://") || url.starts_with("http://"))
        && url.len() < 4096
        && !url.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"' || c == '<' || c == '>' || c == '^' || c == '|');
    if !ok {
        return Err("This address cannot be opened.".into());
    }
    open_in_browser(&url)
}
fn open_in_browser(url: &str) -> Result<()> {
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("rundll32.exe");
        c.args(["url.dll,FileProtocolHandler", url]).creation_flags(0x08000000);
        c
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = std::process::Command::new("open");
        c.arg(url);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url);
        c
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open the web browser.".into())
}

// The folder holding the library database, as chosen at startup.
fn data_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    match std::env::var_os("ORIGAMI_DATA_DIR") {
        Some(path) => Ok(std::path::PathBuf::from(path)),
        None => app.path().app_data_dir().map_err(|e| e.to_string()),
    }
}
fn artwork_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    Ok(data_root(app)?.join("Artwork"))
}
#[derive(serde::Deserialize)]
struct ArtworkCopy {
    folder: String,
    name: String,
    data: String,
}
// File names people can read, safe on Windows, macOS and Linux.
fn artwork_file_name(name: &str, ext: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || " -_.,()'".contains(c) { c } else { '_' })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .chars()
        .take(80)
        .collect();
    format!("{}.{}", if cleaned.is_empty() { "image" } else { &cleaned }, ext)
}
// Copies of the library's covers and voice portraits as image files. The
// app's database stays the source; files written by an earlier copy that no
// longer match an image are removed, and nothing else in the folder is touched.
#[tauri::command]
fn save_artwork_copies(app: tauri::AppHandle, items: Vec<ArtworkCopy>) -> Result<String> {
    let root = artwork_root(&app)?;
    let manifest_path = root.join(".origami-copies.json");
    let previous: Vec<String> = std::fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    let mut written = Vec::new();
    for item in items {
        let folder = match item.folder.as_str() {
            "covers" => "Book covers",
            "portraits" => "Voice portraits",
            _ => return Err("Unknown artwork folder.".into()),
        };
        let (ext, data) = if let Some(d) = item.data.strip_prefix("data:image/webp;base64,") {
            ("webp", d)
        } else if let Some(d) = item.data.strip_prefix("data:image/png;base64,") {
            ("png", d)
        } else if let Some(d) = item.data.strip_prefix("data:image/jpeg;base64,") {
            ("jpg", d)
        } else {
            continue;
        };
        let bytes = STANDARD.decode(data).map_err(|_| "Invalid image data.")?;
        let dir = root.join(folder);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut name = artwork_file_name(&item.name, ext);
        let mut n = 2;
        while written.contains(&format!("{folder}/{name}")) {
            name = artwork_file_name(&format!("{} ({n})", item.name), ext);
            n += 1;
        }
        std::fs::write(dir.join(&name), bytes).map_err(|e| e.to_string())?;
        written.push(format!("{folder}/{name}"));
    }
    for old in previous.iter().filter(|p| !written.contains(p)) {
        if !old.contains("..") {
            let _ = std::fs::remove_file(root.join(old));
        }
    }
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    std::fs::write(&manifest_path, serde_json::to_string(&written).unwrap_or_default())
        .map_err(|e| e.to_string())?;
    Ok(root.to_string_lossy().into_owned())
}
#[tauri::command]
fn open_artwork_folder(app: tauri::AppHandle) -> Result<()> {
    let root = artwork_root(&app)?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(&root)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open the folder.".into())
}
#[tauri::command]
fn delete_voice_portrait(db: State<Database>, voice: String) -> Result<()> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .delete_voice_portrait(&voice)
}
#[tauri::command]
fn list_books(db: State<Database>) -> Result<Vec<Value>> {
    db.0.lock().map_err(|_| "Database busy")?.list()
}
#[tauri::command]
fn starter_library_installed(db: State<Database>) -> Result<bool> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .starter_installed()
}
#[tauri::command]
fn install_starter_library(db: State<Database>, books: Vec<Value>) -> Result<()> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .install_starters(books)
}
#[tauri::command]
fn read_book(db: State<Database>, id: String) -> Result<Value> {
    db.0.lock().map_err(|_| "Database busy")?.read(&id)
}
#[tauri::command]
fn save_book(db: State<Database>, book: Value) -> Result<()> {
    db.0.lock().map_err(|_| "Database busy")?.save(book)
}
#[tauri::command]
fn save_meta(db: State<Database>, meta: Value) -> Result<()> {
    db.0.lock().map_err(|_| "Database busy")?.save_meta(meta)
}
#[tauri::command]
fn delete_trashed_books(db: State<Database>, ids: Vec<String>) -> Result<()> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .delete_trashed(&ids)
}
#[tauri::command]
fn purge_trash(db: State<Database>, days: Option<u32>) -> Result<Vec<String>> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    db.0.lock()
        .map_err(|_| "Database busy")?
        .purge_trash(days, now)
}
#[tauri::command]
fn save_spoken_edits(
    db: State<Database>,
    book_id: String,
    paragraph_id: String,
    edits: Value,
) -> Result<()> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .save_spoken_edits(&book_id, &paragraph_id, edits)
}
#[tauri::command]
fn read_settings(db: State<Database>) -> Result<Value> {
    db.0.lock().map_err(|_| "Database busy")?.settings()
}
#[tauri::command]
fn save_settings(db: State<Database>, settings: Value) -> Result<()> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .save_settings(settings)
}
// --- Work Mode: embedding models for Related notes --------------------------------
#[tauri::command]
fn embedding_status(app: tauri::AppHandle) -> Result<Value> {
    app.state::<embed::Embedder>().status(&app)
}
#[tauri::command]
async fn download_embedding_model(app: tauri::AppHandle, id: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || app.state::<embed::Embedder>().download(&app, &id))
        .await
        .map_err(|_| "Download failed")?
}
#[tauri::command]
fn cancel_embedding_download(app: tauri::AppHandle) {
    app.state::<embed::Embedder>().cancel_download();
}
#[tauri::command]
fn remove_embedding_model(app: tauri::AppHandle, id: String) -> Result<()> {
    app.state::<embed::Embedder>().remove(&app, &id)
}
#[tauri::command]
async fn embed_texts(app: tauri::AppHandle, id: String, texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
    tauri::async_runtime::spawn_blocking(move || app.state::<embed::Embedder>().embed(&app, &id, texts))
        .await
        .map_err(|_| "Embedding failed")?
}
#[tauri::command]
fn list_work(db: State<Database>, kind: Option<String>) -> Result<Vec<Value>> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .work(kind.as_deref())
}
#[tauri::command]
fn save_work(db: State<Database>, items: Vec<Value>) -> Result<()> {
    let store = db.0.lock().map_err(|_| "Database busy")?;
    // One transaction: a batch is saved whole or not at all (a link batch,
    // an import), and a large import pays for one disk sync, not one per item.
    store.connection.execute_batch("BEGIN IMMEDIATE").map_err(|e| e.to_string())?;
    for item in items {
        if let Err(e) = store.save_work(item) {
            let _ = store.connection.execute_batch("ROLLBACK");
            return Err(e);
        }
    }
    store.connection.execute_batch("COMMIT").map_err(|e| e.to_string())
}
#[tauri::command]
fn work_item(db: State<Database>, id: String) -> Result<Option<Value>> {
    db.0.lock().map_err(|_| "Database busy")?.work_item(&id)
}
#[tauri::command]
fn note_versions(db: State<Database>, note: String) -> Result<Vec<Value>> {
    db.0.lock().map_err(|_| "Database busy")?.versions(&note)
}
#[tauri::command]
fn prune_note_versions(db: State<Database>, note: String, keep: usize) -> Result<usize> {
    db.0.lock().map_err(|_| "Database busy")?.prune_versions(&note, keep)
}
// --- Studio productions -------------------------------------------------------------
#[tauri::command]
fn list_productions(app: tauri::AppHandle) -> Result<Vec<Value>> {
    studio::list(&data_root(&app)?)
}
#[tauri::command]
fn create_production(app: tauri::AppHandle, info: Value, units: Vec<Value>) -> Result<Value> {
    studio::create(&data_root(&app)?, info, units)
}
#[tauri::command]
fn read_production(app: tauri::AppHandle, id: String) -> Result<Value> {
    studio::read(&data_root(&app)?, &id)
}
#[tauri::command]
fn save_production_info(app: tauri::AppHandle, info: Value) -> Result<()> {
    studio::save_info(&data_root(&app)?, info)
}
#[tauri::command]
fn save_production_units(app: tauri::AppHandle, id: String, units: Vec<Value>) -> Result<()> {
    studio::save_units(&data_root(&app)?, &id, units)
}
#[tauri::command]
fn delete_production(app: tauri::AppHandle, id: String) -> Result<()> {
    studio::delete(&data_root(&app)?, &id)
}
// Studio rendering: one job at a time, in batches of lines of one voice. Each
// finished batch is saved at once, so closing or a crash loses at most one batch.
#[derive(Default)]
struct StudioJob {
    running: std::sync::atomic::AtomicBool,
    cancel: std::sync::atomic::AtomicBool,
}
const STUDIO_BATCH: usize = 8;
#[tauri::command]
fn studio_render(app: tauri::AppHandle, job: State<StudioJob>, id: String, chapter: Option<i64>, units: Option<Vec<String>>) -> Result<()> {
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    if job.running.swap(true, Ordering::SeqCst) {
        return Err("A production is already rendering.".into());
    }
    job.cancel.store(false, Ordering::SeqCst);
    let data = match data_root(&app) {
        Ok(d) => d,
        Err(e) => {
            job.running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    // Chosen lines (regenerate) are rendered once each, whatever their status.
    let mut chosen: Option<std::collections::VecDeque<String>> = units.map(|u| u.into_iter().collect());
    let busy = studio::busy(&id);
    std::thread::spawn(move || {
        let _busy = busy;
        let job = app.state::<StudioJob>();
        // Voices that cannot read (not installed, say): their lines are left out and
        // named at the end, and the other voices carry on.
        let mut skipped: Vec<String> = Vec::new();
        let mut missing: Vec<String> = Vec::new();
        let mut problem = String::new();
        let outcome = (|| -> Result<()> {
            loop {
                if job.cancel.load(Ordering::SeqCst) {
                    return Err("cancelled".into());
                }
                let p = studio::read(&data, &id)?;
                let narrator = p["info"]["voice"].as_str().unwrap_or_default().to_string();
                let units = p["units"].as_array().cloned().unwrap_or_default();
                let total = units.len();
                // Each unit speaks with its own voice (a character's) or the narrator's;
                // a batch is always one voice, so the worker never switches mid-batch.
                let voice_of = |u: &Value| u["voice"].as_str().filter(|v| !v.is_empty()).unwrap_or(&narrator).to_string();
                let pending = |u: &&Value| u["status"] == "pending";
                let can_read = |u: &&Value| !skipped.contains(&voice_of(u));
                let one_voice = |candidates: Vec<&Value>| -> Vec<Value> {
                    let Some(first) = candidates.first() else { return Vec::new() };
                    let v = voice_of(first);
                    candidates.into_iter().filter(|u| voice_of(u) == v).take(STUDIO_BATCH).cloned().collect()
                };
                let batch: Vec<Value> = if let Some(queue) = chosen.as_mut() {
                    let Some(first) = queue.front().and_then(|f| units.iter().find(|u| u["id"].as_str() == Some(f.as_str()))) else {
                        return Ok(());
                    };
                    let v = voice_of(first);
                    let mut picked = Vec::new();
                    queue.retain(|n| {
                        let same = picked.len() < STUDIO_BATCH && units.iter().find(|u| u["id"].as_str() == Some(n.as_str())).is_some_and(|u| voice_of(u) == v);
                        if same {
                            picked.push(n.clone());
                        }
                        !same
                    });
                    units.iter().filter(|u| picked.iter().any(|n| u["id"].as_str() == Some(n))).cloned().collect()
                } else {
                    // Chapter by chapter (the asked one, or the first with work left),
                    // and inside a chapter one voice at a time.
                    let scope = chapter.or_else(|| units.iter().filter(pending).find(can_read).and_then(|u| u["chapter"].as_i64()));
                    one_voice(units.iter().filter(pending).filter(can_read).filter(|u| scope.is_some_and(|c| u["chapter"].as_i64() == Some(c))).collect())
                };
                if batch.is_empty() {
                    return Ok(());
                }
                let voice = voice_of(&batch[0]);
                if let Some(why) = speech::Speech::voice_problem(&app, &voice) {
                    // Who reads with this voice: the characters' names, "" for the narrator.
                    let cast = p["info"]["cast"].as_array().cloned().unwrap_or_default();
                    for u in units.iter().filter(|u| voice_of(u) == voice && (u["status"] == "pending" || batch.iter().any(|b| b["id"] == u["id"]))) {
                        let name = match u["speaker"].as_str() {
                            Some(s) => cast.iter().find(|c| c["id"].as_str() == Some(s)).and_then(|c| c["name"].as_str()).unwrap_or(s).to_string(),
                            None => String::new(),
                        };
                        if !missing.contains(&name) {
                            missing.push(name);
                        }
                    }
                    skipped.push(voice);
                    problem = why;
                    continue;
                }
                // The lines being voiced now, so the editor can show work in progress
                // on a slow computer before the batch is saved.
                let _ = app.emit("studio-batch", serde_json::json!({"id": id, "units": batch.iter().map(|u| u["id"].clone()).collect::<Vec<_>>()}));
                let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
                let items: Vec<Value> = batch
                    .iter()
                    .enumerate()
                    .map(|(i, u)| serde_json::json!({"id": u["id"], "text": u["text"], "seed": (now as u64 + i as u64) % 2147483647, "take": format!("{}-{}", u["id"].as_str().unwrap_or("u"), now)}))
                    .collect();
                let out = studio::takes_dir(&data, &id)?;
                let speech = app.state::<speech::Speech>();
                let result = speech.render(app.clone(), voice.clone(), Value::Array(items.clone()), &out, None)?;
                let takes: Vec<Value> = result["items"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                    .into_iter()
                    .zip(items.iter())
                    .map(|(r, item)| serde_json::json!({
                        "id": r["take"], "unit": r["id"], "file": r["file"], "duration": r["duration"], "ended": r["ended"],
                        "rate": r["rate"], "checks": r["checks"],
                        "seed": item["seed"], "voice": voice, "text": item["text"], "created": now as f64, "model": ""
                    }))
                    .collect();
                studio::add_takes(&data, &id, &takes)?;
                let done = if chosen.is_some() { total - units.iter().filter(pending).count() } else { total - units.iter().filter(pending).count() + takes.len() };
                let _ = app.emit("studio-progress", serde_json::json!({"id": id, "done": done, "total": total}));
            }
        })();
        job.running.store(false, Ordering::SeqCst);
        let _ = app.emit("studio-render-done", match outcome {
            Ok(()) => serde_json::json!({"id": id, "ok": true, "missing": missing, "problem": problem}),
            Err(e) if e == "cancelled" => serde_json::json!({"id": id, "ok": true, "cancelled": true, "missing": missing, "problem": problem}),
            Err(e) => serde_json::json!({"id": id, "ok": false, "message": e}),
        });
    });
    Ok(())
}
#[tauri::command]
fn studio_cancel_render(job: State<StudioJob>) {
    job.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
}
#[tauri::command]
fn studio_render_running(job: State<StudioJob>) -> bool {
    job.running.load(std::sync::atomic::Ordering::SeqCst)
}
#[tauri::command]
fn studio_take_audio(app: tauri::AppHandle, id: String, file: String) -> Result<String> {
    Ok(STANDARD.encode(studio::take_audio(&data_root(&app)?, &id, &file)?))
}
#[tauri::command]
async fn studio_choose_folder() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new().set_title("Choose where to save the export").pick_folder().map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .ok()
    .flatten()
}
#[tauri::command]
fn studio_reveal(path: String) -> Result<()> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err("This file is no longer there.".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe").arg(format!("/select,{}", p.display())).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let dir = p.parent().map(|d| d.to_path_buf()).unwrap_or(p);
        std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" }).arg(dir).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
}
// --- Studio analysis (characters and speakers) -------------------------------------------
/// The largest dedicated graphics memory on this computer, read once.
fn graphics_memory_mb() -> u64 {
    static VRAM: std::sync::OnceLock<u64> = std::sync::OnceLock::new();
    *VRAM.get_or_init(|| {
        hardware::profile()["gpus"]
            .as_array()
            .map(|g| g.iter().filter(|x| x["integrated"] != true).filter_map(|x| x["vramMb"].as_u64()).max().unwrap_or(0))
            .unwrap_or(0)
    })
}
fn analysis_files(app: &tauri::AppHandle) -> Result<(std::path::PathBuf, std::path::PathBuf, bool)> {
    let (exe, models) = studio_llm::locate(&data_root(app)?);
    let exe = exe.ok_or("The analysis model is not installed.")?;
    let vram = graphics_memory_mb();
    let model = studio_llm::choose(&models, vram).ok_or("The analysis model is not installed.")?;
    Ok((exe, model, vram >= 3_000))
}
#[tauri::command]
async fn studio_analysis_status(app: tauri::AppHandle) -> Value {
    tauri::async_runtime::spawn_blocking(move || match analysis_files(&app) {
        Ok((_, model, gpu)) => serde_json::json!({"ready": true, "model": model.file_name().map(|n| n.to_string_lossy().into_owned()), "gpu": gpu}),
        Err(e) => serde_json::json!({"ready": false, "message": e}),
    })
    .await
    .unwrap_or_else(|_| serde_json::json!({"ready": false}))
}
#[tauri::command]
async fn studio_analysis_chat(app: tauri::AppHandle, system: String, user: String, schema: Value, max_tokens: Option<u32>) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (exe, model, gpu) = analysis_files(&app)?;
        app.state::<studio_llm::Analysis>().chat(&exe, &model, gpu, &system, &user, schema, max_tokens.unwrap_or(4000))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn studio_analysis_stop(analysis: State<studio_llm::Analysis>) {
    analysis.stop();
}
#[tauri::command]
fn studio_replace_units(app: tauri::AppHandle, id: String, units: Vec<Value>) -> Result<()> {
    studio::replace_units(&data_root(&app)?, &id, units)
}
// --- Studio phase 3: verify a file, and check takes by transcribing them ---------------------
#[tauri::command]
async fn studio_verify_file(app: tauri::AppHandle, path: Option<String>) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = match path {
            Some(p) => std::path::PathBuf::from(p),
            None => match rfd::FileDialog::new()
                .set_title("Choose an audio file to verify")
                .add_filter("Audio", &["m4b", "m4a", "mp3", "wav", "flac"])
                .pick_file()
            {
                Some(p) => p,
                None => return Ok(serde_json::json!({"cancelled": true})),
            },
        };
        let (x, sr) = studio_verify::decode_any(&path)?;
        let x16 = studio_audio::resample(&x, sr, 16_000)?;
        let labels = studio_verify::labels(&path);
        let dir = watermark_dir(&app)?;
        let watermark = if dir.join("audioseal_detector_5s.onnx").is_file() {
            let mut d = studio_verify::Detector::open(&dir, embed::runtime_env(&app)?)?;
            let f = d.find(&x16)?;
            let detected = f.probability > 0.5 && f.confidence > 0.2;
            // The 16 bits are matched against the exports made on this computer.
            let data = data_root(&app)?;
            let mut matched = Value::Null;
            if detected {
                for p in studio::list(&data).unwrap_or_default() {
                    let id = p["id"].as_str().unwrap_or_default().to_string();
                    let Ok(full) = studio::read(&data, &id) else { continue };
                    if let Some(e) = full["info"]["exports"].as_array().and_then(|list| list.iter().rev().find(|e| e["message"].as_u64() == Some(f.message as u64))) {
                        matched = serde_json::json!({"title": full["info"]["title"], "author": full["info"]["author"], "export": e["id"], "date": e["date"]});
                        break;
                    }
                }
            }
            serde_json::json!({"detected": detected, "probability": (f.probability * 100.0).round() / 100.0, "confidence": (f.confidence * 100.0).round() / 100.0, "message": format!("{:04X}", f.message), "offset": f.offset, "match": matched})
        } else {
            serde_json::json!({"missing": true})
        };
        Ok(serde_json::json!({
            "file": path.file_name().map(|n| n.to_string_lossy().into_owned()),
            "seconds": (x.len() as f64 / sr.max(1) as f64).round(),
            "labels": labels,
            "watermark": watermark,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Two words heard as the same: equal, or one letter apart (two for long words), so a name
/// spelled another way ("Bennet", "Bennett") still counts as heard.
fn near(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    let (x, y): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let allowed = match x.len().min(y.len()) {
        0..=3 => return false,
        4..=6 => 1,
        _ => 2,
    };
    if x.len().abs_diff(y.len()) > allowed {
        return false;
    }
    let mut prev: Vec<usize> = (0..=y.len()).collect();
    for i in 1..=x.len() {
        let mut cur = vec![i; y.len() + 1];
        for j in 1..=y.len() {
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + usize::from(x[i - 1] != y[j - 1]));
        }
        prev = cur;
    }
    prev[y.len()] <= allowed
}
/// How much of a line was heard in its take: 1 when every word was heard, 0 when none.
/// Numbers and punctuation are left out, since "16" and "sixteen" are both right.
fn heard_share(reference: &str, heard: &str) -> f64 {
    let words = |s: &str| -> Vec<String> {
        s.split(|c: char| !c.is_alphanumeric() && c != '\'' && c != '\u{2019}')
            .map(|w| w.trim_matches(|c| c == '\'' || c == '\u{2019}').to_lowercase())
            .filter(|w| !w.is_empty() && !w.chars().all(|c| c.is_ascii_digit()))
            .collect()
    };
    let (a, b) = (words(reference), words(heard));
    if a.is_empty() {
        return 1.0;
    }
    // Word-level edit distance.
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i; b.len() + 1];
        for j in 1..=b.len() {
            let cost = usize::from(!near(&a[i - 1], &b[j - 1]));
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        prev = cur;
    }
    (1.0 - prev[b.len()] as f64 / a.len() as f64).max(0.0)
}
#[tauri::command]
fn studio_check_takes(app: tauri::AppHandle, job: State<CheckJob>, id: String, units: Vec<String>, model: String) -> Result<()> {
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    if job.running.swap(true, Ordering::SeqCst) {
        return Err("A check is already running.".into());
    }
    job.cancel.store(false, Ordering::SeqCst);
    let data = match data_root(&app) {
        Ok(d) => d,
        Err(e) => {
            job.running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    let busy = studio::busy(&id);
    std::thread::spawn(move || {
        let _busy = busy;
        let job = app.state::<CheckJob>();
        let outcome = (|| -> Result<usize> {
            let p = studio::read(&data, &id)?;
            let language = p["info"]["language"].as_str().unwrap_or("").chars().take(2).collect::<String>().to_lowercase();
            let dir = studio::takes_dir(&data, &id)?;
            let takes: std::collections::HashMap<String, Value> = p["takes"].as_array().cloned().unwrap_or_default().into_iter().map(|t| (t["id"].as_str().unwrap_or_default().to_string(), t)).collect();
            let all = p["units"].as_array().cloned().unwrap_or_default();
            let mut flagged = 0;
            for (n, unit_id) in units.iter().enumerate() {
                if job.cancel.load(Ordering::SeqCst) {
                    return Err("cancelled".into());
                }
                let Some(unit) = all.iter().find(|u| u["id"].as_str() == Some(unit_id)) else { continue };
                let Some(mut take) = unit["take"].as_str().and_then(|t| takes.get(t)).cloned() else { continue };
                let (x, sr) = studio_audio::decode(&dir.join(take["file"].as_str().unwrap_or_default()))?;
                let x16 = studio_audio::resample(&x, sr, 16_000)?;
                let heard = app.state::<whisper::Transcriber>().transcribe(&app, &model, &x16, &language)?;
                let text = heard["text"].as_str().unwrap_or_default().to_string();
                let share = heard_share(take["text"].as_str().unwrap_or_default(), &text);
                if share < 0.8 {
                    flagged += 1;
                }
                take["checks"]["heard"] = serde_json::json!(text);
                take["checks"]["match"] = serde_json::json!((share * 100.0).round() / 100.0);
                studio::update_takes(&data, &id, &[take])?;
                let _ = app.emit("studio-check-progress", serde_json::json!({"id": id, "done": n + 1, "total": units.len()}));
            }
            Ok(flagged)
        })();
        job.running.store(false, Ordering::SeqCst);
        let _ = app.emit("studio-check-done", match outcome {
            Ok(flagged) => serde_json::json!({"id": id, "ok": true, "flagged": flagged}),
            Err(e) if e == "cancelled" => serde_json::json!({"id": id, "ok": true, "cancelled": true}),
            Err(e) => serde_json::json!({"id": id, "ok": false, "message": e}),
        });
    });
    Ok(())
}
#[derive(Default)]
struct CheckJob {
    running: std::sync::atomic::AtomicBool,
    cancel: std::sync::atomic::AtomicBool,
}
#[tauri::command]
fn studio_cancel_check(job: State<CheckJob>) {
    job.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
}
// --- Studio phase 4: recordings to text ---------------------------------------------------------
#[derive(Default)]
struct AsrJob {
    running: std::sync::atomic::AtomicBool,
    cancel: std::sync::atomic::AtomicBool,
}
#[tauri::command]
fn studio_asr_ready(app: tauri::AppHandle) -> bool {
    data_root(&app).map(|d| studio_asr::installed(&studio_asr::model_dir(&d))).unwrap_or(false) && embed::runtime_available(&app)
}
#[tauri::command]
async fn studio_pick_recordings() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut files: Vec<String> = rfd::FileDialog::new()
            .set_title("Choose the recording (one file, or one file per chapter)")
            .add_filter("Audio", &["mp3", "m4a", "m4b", "wav"])
            .pick_files()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        // Chapter files are usually numbered: keep them in natural order.
        files.sort_by(|a, b| {
            let key = |s: &str| {
                let name = std::path::Path::new(s).file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
                let digits: String = name.chars().skip_while(|c| !c.is_ascii_digit()).take_while(|c| c.is_ascii_digit()).collect();
                (digits.parse::<u64>().unwrap_or(u64::MAX), name)
            };
            key(a).cmp(&key(b))
        });
        files
    })
    .await
    .unwrap_or_default()
}
#[tauri::command]
fn studio_cancel_transcribe(job: State<AsrJob>) {
    job.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
}
#[tauri::command]
fn studio_transcribe(app: tauri::AppHandle, job: State<AsrJob>, files: Vec<String>) -> Result<()> {
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    if files.is_empty() {
        return Err("Choose a recording first.".into());
    }
    if job.running.swap(true, Ordering::SeqCst) {
        return Err("A recording is already being transcribed.".into());
    }
    job.cancel.store(false, Ordering::SeqCst);
    let dir = studio_asr::model_dir(&data_root(&app)?);
    std::thread::spawn(move || {
        let job = app.state::<AsrJob>();
        let outcome = (|| -> Result<Vec<Value>> {
            if !studio_asr::installed(&dir) {
                return Err("The transcription model is not installed.".into());
            }
            let mut model = studio_asr::Parakeet::open(embed::runtime_env(&app)?, &dir)?;
            let mut out = Vec::new();
            let n = files.len();
            for (i, f) in files.iter().enumerate() {
                let path = std::path::PathBuf::from(f);
                let report = |v: f64| {
                    let _ = app.emit("studio-asr-progress", serde_json::json!({"file": i, "files": n, "value": (i as f64 + v) / n as f64, "name": path.file_name().map(|x| x.to_string_lossy().into_owned())}));
                };
                let (words, seconds) = studio_asr::transcribe_file(&mut model, &path, &report, &|| job.cancel.load(Ordering::SeqCst))?;
                out.push(serde_json::json!({
                    "name": path.file_stem().map(|x| x.to_string_lossy().into_owned()),
                    "seconds": seconds,
                    "words": words.iter().map(|w| serde_json::json!([w.text, (w.start * 100.0).round() / 100.0, (w.end * 100.0).round() / 100.0, (w.conf as f64 * 100.0).round() / 100.0])).collect::<Vec<_>>(),
                }));
            }
            Ok(out)
        })();
        job.running.store(false, Ordering::SeqCst);
        let _ = app.emit("studio-asr-done", match outcome {
            Ok(files) => serde_json::json!({"ok": true, "files": files}),
            Err(e) if e == "cancelled" => serde_json::json!({"ok": false, "cancelled": true}),
            Err(e) => serde_json::json!({"ok": false, "message": e}),
        });
    });
    Ok(())
}
/// A read-along EPUB from a recording made into a book: the original audio, with each
/// sentence highlighted as it is heard. Saved where the reader chooses.
#[tauri::command]
async fn studio_recording_readalong(files: Vec<String>, chapters: Vec<Value>, meta: Value, folder: Option<String>) -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = match folder {
            Some(f) => std::path::PathBuf::from(f),
            None => match rfd::FileDialog::new().set_title("Choose where to save the read-along ebook").pick_folder() {
                Some(f) => f,
                None => return Ok(None),
            },
        };
        let text = |v: &Value| v.as_str().unwrap_or_default().to_string();
        let mut out = Vec::new();
        for (ci, c) in chapters.iter().enumerate() {
            let timed = c["timed"].as_array().cloned().unwrap_or_default();
            let mut paragraphs = Vec::new();
            let mut file: Option<usize> = None;
            let mut seconds = 0.0;
            for (pi, para) in timed.iter().enumerate() {
                let mut lines = Vec::new();
                for (si, line) in para.as_array().cloned().unwrap_or_default().iter().enumerate() {
                    let (start, end) = (line["start"].as_f64().unwrap_or(0.0), line["end"].as_f64().unwrap_or(0.0));
                    file.get_or_insert(line["file"].as_u64().unwrap_or(0) as usize);
                    seconds += (end - start).max(0.0);
                    lines.push(studio_book::ReadLine { id: format!("s{ci}-{pi}-{si}"), text: text(&line["text"]), start, end });
                }
                paragraphs.push(lines);
            }
            let Some(path) = file.and_then(|f| files.get(f)) else { continue };
            let title = c["title"].as_str().map(str::to_string).unwrap_or_else(|| format!("{}", ci + 1));
            out.push(studio_book::ReadChapter { title, paragraphs, audio: std::path::PathBuf::from(path), seconds });
        }
        if out.is_empty() {
            return Err("The recording has no chapters to read along.".into());
        }
        let title = text(&meta["title"]);
        let read = studio_book::ReadMeta {
            title: title.clone(),
            author: text(&meta["author"]),
            lang: text(&meta["language"]),
            narrator: String::new(),
            // An edition aligned with the ebook keeps the book's text; otherwise it was transcribed.
            ai: meta["note"].as_str().filter(|n| !n.is_empty()).unwrap_or("Text transcribed from the recording with Origami Reader.").to_string(),
            rights: Vec::new(),
            theme: String::new(),
        };
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        let path = studio_audio::free_path(&folder, &format!("{} (read-along)", studio_audio::safe_name(&title)), "epub");
        studio_book::readalong_epub(&read, &out, None, &format!("REC-{now:x}"), &path)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}
// --- Studio setup: its models, downloaded inside Studio -------------------------------------
#[tauri::command]
async fn studio_setup_status(app: tauri::AppHandle) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = data_root(&app)?;
        let models = data.join("Models");
        let ready = |part: &str| match part {
            "watermark" => watermark_dir(&app).map(|d| d.join("audioseal_generator_5s.onnx").is_file() && d.join("audioseal_detector_5s.onnx").is_file()).unwrap_or(false),
            "analysis" => analysis_files(&app).is_ok(),
            "transcription" => studio_asr::installed(&studio_asr::model_dir(&data)),
            _ => false,
        };
        let mut v = studio_models::status(&models, graphics_memory_mb(), &ready);
        v["runtime"] = serde_json::json!(embed::runtime_available(&app));
        v["download"] = app.state::<studio_models::Setup>().state();
        Ok(v)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn studio_setup_download(app: tauri::AppHandle, parts: Vec<String>) -> Result<()> {
    use tauri::Emitter;
    let models = data_root(&app)?.join("Models");
    std::thread::spawn(move || {
        let vram = graphics_memory_mb();
        let result = app.state::<studio_models::Setup>().download(&models, vram, &parts, &|part, received, total| {
            let _ = app.emit("studio-setup-progress", serde_json::json!({"part": part, "received": received, "total": total}));
        });
        let _ = app.emit("studio-setup-done", match result {
            Ok(()) => serde_json::json!({"ok": true}),
            Err(e) if e == "cancelled" => serde_json::json!({"ok": false, "cancelled": true}),
            Err(e) => serde_json::json!({"ok": false, "message": e}),
        });
    });
    Ok(())
}
#[tauri::command]
fn studio_setup_cancel(setup: State<studio_models::Setup>) {
    setup.cancel();
}
/// Saves a portable copy of a production (its takes, its book and its designed
/// voices) as one file, to continue on another computer. Returns the file, or
/// None when the reader cancels.
#[tauri::command]
async fn studio_save_portable(app: tauri::AppHandle, id: String, path: Option<String>) -> Result<Option<String>> {
    use tauri::Emitter;
    let data = data_root(&app)?;
    let p = studio::read(&data, &id)?;
    let name = format!("{}.{}", studio_audio::safe_name(p["info"]["title"].as_str().unwrap_or("Production")), studio_archive::EXTENSION);
    let picked = tauri::async_runtime::spawn_blocking(move || {
        if let Some(p) = path {
            return Some(std::path::PathBuf::from(p));
        }
        rfd::FileDialog::new().set_title("Save a portable copy").set_file_name(name).add_filter("Origami production", &[studio_archive::EXTENSION]).save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(out) = picked else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || {
        let book = p["info"]["bookId"].as_str().and_then(|b| app.state::<Database>().0.lock().ok().and_then(|db| db.read(b).ok()));
        let created = voice_studio::created_root(&app)?;
        let voices: Vec<studio_archive::VoiceFile> = studio_archive::voices_used(&p)
            .into_iter()
            .filter(|v| studio_archive::voice_id_ok(v))
            .filter_map(|v| {
                let profile: Value = serde_json::from_slice(&std::fs::read(created.join(format!("{v}.json"))).ok()?).ok()?;
                let audio = created.join(format!("{v}.wav"));
                audio.is_file().then_some(studio_archive::VoiceFile { id: v, profile, audio })
            })
            .collect();
        let takes = studio::takes_dir(&data, &id)?;
        studio_archive::write(&out, &p, book.as_ref(), &voices, &takes, &|v| {
            let _ = app.emit("studio-portable-progress", v);
        })?;
        Ok(Some(out.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens a portable copy: the production (under a new id if this one is already
/// here), its book when the library does not have it, and its designed voices.
/// Returns the new production's id and the voices this computer is missing.
#[tauri::command]
async fn studio_open_portable(app: tauri::AppHandle, path: Option<String>) -> Result<Option<Value>> {
    use tauri::Emitter;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        if let Some(p) = path {
            return Some(std::path::PathBuf::from(p));
        }
        rfd::FileDialog::new().set_title("Open a portable production").add_filter("Origami production", &[studio_archive::EXTENSION]).pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || {
        let data = data_root(&app)?;
        let mut opened = studio_archive::open(&path)?;
        let mut info = opened.production["info"].clone();
        let mut id = info["id"].as_str().unwrap_or_default().to_string();
        if id.is_empty() || studio::exists(&data, &id) || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') || id.len() >= 80 {
            let mut r = [0u8; 4];
            getrandom::getrandom(&mut r).map_err(|e| e.to_string())?;
            id = format!("prod-{}", r.iter().map(|b| format!("{b:02x}")).collect::<String>());
        }
        info["id"] = serde_json::json!(id);
        info["updated"] = serde_json::json!(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0));
        let units = opened.production["units"].as_array().cloned().unwrap_or_default();
        let takes = opened.production["takes"].as_array().cloned().unwrap_or_default();
        let takes_dir = studio::restore(&data, info, units, &takes)?;
        let extracted = studio_archive::extract_takes(&mut opened.zip, &takes_dir, &|v| {
            let _ = app.emit("studio-portable-progress", v);
        });
        if let Err(e) = extracted {
            let _ = studio::delete(&data, &id);
            return Err(e);
        }
        let added = studio_archive::extract_voices(&mut opened.zip, &voice_studio::created_root(&app)?)?;
        let mut book_added = false;
        if let Some(book) = opened.book.take() {
            let db = app.state::<Database>();
            let db = db.0.lock().map_err(|_| "Database busy")?;
            if db.read(book["id"].as_str().unwrap_or_default()).is_err() {
                db.save(book)?;
                book_added = true;
            }
        }
        let have: Vec<String> = speech::voices(&app).iter().filter_map(|v| v["id"].as_str().map(str::to_string)).collect();
        let missing: Vec<String> = studio_archive::voices_used(&opened.production).into_iter().filter(|v| !have.contains(v)).collect();
        Ok(Some(serde_json::json!({ "id": id, "voicesAdded": added, "missingVoices": missing, "bookAdded": book_added })))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A moment of a recording as a WAV, to hear a word the transcription was unsure of.
#[tauri::command]
async fn studio_recording_clip(path: String, start: f64, end: f64) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (x, rate) = studio_verify::decode_range(std::path::Path::new(&path), start.max(0.0), (end - start).clamp(0.2, 30.0))?;
        let mut bytes = std::io::Cursor::new(Vec::new());
        let spec = hound::WavSpec { channels: 1, sample_rate: rate.max(1), bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let mut w = hound::WavWriter::new(&mut bytes, spec).map_err(|e| e.to_string())?;
        for v in x {
            w.write_sample((v.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?;
        }
        w.finalize().map_err(|e| e.to_string())?;
        Ok(STANDARD.encode(bytes.into_inner()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The production's folder, which holds the background sound next to the takes.
fn production_dir(data: &std::path::Path, id: &str) -> Result<std::path::PathBuf> {
    studio::takes_dir(data, id)?.parent().map(|p| p.to_path_buf()).ok_or_else(|| "Unknown production.".to_string())
}

/// Chooses a background sound: the file is copied into the production, so it stays
/// available when the original moves. Returns its stored name and the original name.
#[tauri::command]
async fn studio_choose_bed(app: tauri::AppHandle, id: String, path: Option<String>) -> Result<Option<Value>> {
    let data = data_root(&app)?;
    let dir = production_dir(&data, &id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let picked = match path {
            Some(p) => Some(std::path::PathBuf::from(p)),
            None => rfd::FileDialog::new().set_title("Choose a background sound").add_filter("Audio", &["mp3", "m4a", "wav", "flac", "ogg"]).pick_file(),
        };
        let Some(source) = picked else { return Ok(None) };
        let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if !["mp3", "m4a", "wav", "flac", "ogg"].contains(&ext.as_str()) {
            return Err("Choose an MP3, M4A, WAV, FLAC or OGG file.".into());
        }
        if std::fs::metadata(&source).map(|m| m.len()).unwrap_or(0) > 300 << 20 {
            return Err("The background sound is too large (300 MB at most).".into());
        }
        // A check that it decodes, before it is kept.
        studio_verify::decode_range(&source, 0.0, 5.0)?;
        for e in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            if e.file_name().to_string_lossy().starts_with("bed.") {
                let _ = std::fs::remove_file(e.path());
            }
        }
        let file = format!("bed.{ext}");
        std::fs::copy(&source, dir.join(&file)).map_err(|e| e.to_string())?;
        let name = source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        Ok(Some(serde_json::json!({ "file": file, "name": name })))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn studio_clear_bed(app: tauri::AppHandle, id: String) -> Result<()> {
    let dir = production_dir(&data_root(&app)?, &id)?;
    for e in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        if e.file_name().to_string_lossy().starts_with("bed.") {
            let _ = std::fs::remove_file(e.path());
        }
    }
    Ok(())
}

// --- The voice library: voices not installed yet ------------------------------------
#[tauri::command]
async fn voice_store_list(app: tauri::AppHandle) -> Result<Vec<Value>> {
    tauri::async_runtime::spawn_blocking(move || voice_store::list(&app)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn voice_store_preview(app: tauri::AppHandle, id: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || voice_store::preview(&app, &id).map(|d| STANDARD.encode(d)))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn voice_store_install(app: tauri::AppHandle, id: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || voice_store::install(&app, &id)).await.map_err(|e| e.to_string())?
}
// --- Models added after setup, from Settings -----------------------------------------
#[tauri::command]
async fn model_download(app: tauri::AppHandle, model: String, accept_terms: bool, language: String) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || model_download::download(&app, &model, accept_terms, &language))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn model_download_cancel() -> Result<()> {
    model_download::cancel()
}

/// Pages of the print book as images, for the export dialog's preview.
#[tauri::command]
async fn studio_preview_print(manuscript: Value, print: Value, first: usize, count: usize) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let m: studio_book::Manuscript = serde_json::from_value(manuscript).map_err(|e| format!("The book could not be read: {e}"))?;
        let o: studio_book::PrintOptions = serde_json::from_value(print).map_err(|e| e.to_string())?;
        let (pages, images) = studio_book::preview(&m, &o, first, count.min(6), 80.0)?;
        Ok(serde_json::json!({"pages": pages, "images": images.iter().map(|i| STANDARD.encode(i)).collect::<Vec<_>>()}))
    })
    .await
    .map_err(|e| e.to_string())?
}
// Studio export: one at a time, in the background, with progress events.
#[derive(Default)]
struct ExportJob {
    running: std::sync::atomic::AtomicBool,
    cancel: std::sync::atomic::AtomicBool,
}
/// Where the AudioSeal watermark model is kept (Models/audioseal in the data folder).
fn watermark_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    Ok(data_root(app)?.join("Models").join("audioseal"))
}
#[tauri::command]
fn studio_watermark_ready(app: tauri::AppHandle) -> bool {
    watermark_dir(&app).map(|d| d.join("audioseal_generator_5s.onnx").is_file()).unwrap_or(false) && embed::runtime_available(&app)
}
#[tauri::command]
fn studio_cancel_export(job: State<ExportJob>) {
    job.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
}
#[tauri::command]
fn studio_export(app: tauri::AppHandle, job: State<ExportJob>, id: String, options: Value) -> Result<()> {
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    if job.running.swap(true, Ordering::SeqCst) {
        return Err("An export is already running.".into());
    }
    job.cancel.store(false, Ordering::SeqCst);
    let data = match data_root(&app) {
        Ok(d) => d,
        Err(e) => {
            job.running.store(false, Ordering::SeqCst);
            return Err(e);
        }
    };
    let busy = studio::busy(&id);
    std::thread::spawn(move || {
        let _busy = busy;
        let job = app.state::<ExportJob>();
        let progress = |step: String, value: f64| {
            let _ = app.emit("studio-export-progress", serde_json::json!({"id": id, "step": step, "value": value}));
        };
        let cancelled = || job.cancel.load(Ordering::SeqCst);
        let outcome = (|| -> Result<Value> {
            let folder = std::path::PathBuf::from(options["folder"].as_str().ok_or("Choose a folder first.")?);
            if !folder.is_dir() {
                return Err("The chosen folder is not available.".into());
            }
            let flag = |k: &str| options[k].as_bool().unwrap_or(false);
            let p = studio::read(&data, &id)?;
            let takes_dir = studio::takes_dir(&data, &id)?;
            let meta_in = &options["meta"];
            let text = |v: &Value| v.as_str().unwrap_or_default().to_string();
            let title = text(&meta_in["title"]);
            let mut message = [0u8; 2];
            getrandom::getrandom(&mut message).map_err(|e| e.to_string())?;
            let message = u16::from_be_bytes(message);
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
            let export_id = format!("OS-{message:04X}-{now:x}");
            let cover_raw = options["cover"].as_str().and_then(|c| STANDARD.decode(c).ok());
            // Everything is written in a staging folder and moved beside the reader's
            // files only when the whole export succeeded; dropping it removes it.
            let staging = studio_audio::Staging::new(&folder, &export_id)?;
            let out = staging.dir.clone();
            let mut files: Vec<std::path::PathBuf> = Vec::new();
            let mut report = Vec::new();
            if flag("m4b") || flag("mp3") || flag("readalong") || flag("stems") || flag("sample") {
                let wm_dir = watermark_dir(&app)?;
                if !wm_dir.join("audioseal_generator_5s.onnx").is_file() {
                    return Err("The watermark model is missing, so audio cannot be exported yet.".into());
                }
                let watermark = studio_audio::Watermark::open(&wm_dir, embed::runtime_env(&app)?)?;
                // The chosen take of every unit, chapter by chapter, with the review player's pauses.
                let units = p["units"].as_array().cloned().unwrap_or_default();
                // The spoken credit is never left out: the default one when none came
                // or when it does not name Origami Reader.
                let language = p["info"]["language"].as_str().unwrap_or_default();
                let credit = Some(text(&options["credit"]))
                    .filter(|c| c.contains("Origami Reader"))
                    .unwrap_or_else(|| studio_audio::credit_line(p["info"]["title"].as_str().unwrap_or(&title), p["info"]["author"].as_str().unwrap_or_default(), language));
                let credit_title = Some(text(&options["creditTitle"])).filter(|c| !c.trim().is_empty()).unwrap_or_else(|| studio_audio::credit_title(language));
                let takes: std::collections::HashMap<String, Value> = p["takes"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                    .into_iter()
                    .map(|t| (t["id"].as_str().unwrap_or_default().to_string(), t))
                    .collect();
                let mut plans: Vec<studio_audio::ChapterPlan> = Vec::new();
                let mut current: Option<i64> = None;
                for (i, u) in units.iter().enumerate() {
                    let chapter = u["chapter"].as_i64().unwrap_or(0);
                    if current != Some(chapter) {
                        let name = options["titles"][chapter.to_string()].as_str().map(str::to_string).unwrap_or_else(|| format!("Chapter {}", chapter + 1));
                        plans.push(studio_audio::ChapterPlan { title: name, takes: Vec::new() });
                        current = Some(chapter);
                    }
                    let Some(take) = u["take"].as_str().and_then(|t| takes.get(t)) else { continue };
                    let path = takes_dir.join(take["file"].as_str().unwrap_or_default());
                    if !path.is_file() {
                        continue;
                    }
                    let next = units.get(i + 1).filter(|n| n["chapter"] == u["chapter"]);
                    let base = match next {
                        None => 0.0,
                        Some(n) if u["heading"] == true || n["heading"] == true => 1.2,
                        Some(n) if n["paragraph"] == u["paragraph"] => 0.25,
                        Some(_) => 0.65,
                    };
                    // The reader can make a pause shorter or longer (same rule as the player).
                    let gap = match (next.is_some(), u["pause"].as_str()) {
                        (true, Some("short")) => base * 0.4,
                        (true, Some("long")) => f64::max(1.2, base * 2.5),
                        _ => base,
                    };
                    let narrator = options["speakers"][""].as_str().unwrap_or("Narrator");
                    let speaker = u["speaker"].as_str().and_then(|s| options["speakers"][s].as_str()).unwrap_or(narrator).to_string();
                    plans.last_mut().unwrap().takes.push(studio_audio::TakeRef { path, gap, unit: u["id"].as_str().unwrap_or_default().to_string(), speaker });
                }
                plans.retain(|c| !c.takes.is_empty());
                // Opening credits, spoken by the narrator: title, author, the AI disclosure and the credit.
                // Recorded in the staging folder, so the take goes when the export ends.
                {
                    progress("Recording the opening credits".into(), 0.01);
                    let voice = p["info"]["voice"].as_str().unwrap_or_default().to_string();
                    let item = serde_json::json!([{"id": "credit", "text": credit, "seed": 7, "take": format!("credit-{now}")}]);
                    let speech = app.state::<speech::Speech>();
                    let result = speech.render(app.clone(), voice, item, &out, None)?;
                    let file = result["items"][0]["file"].as_str().ok_or("The opening credits could not be recorded.")?;
                    plans.insert(0, studio_audio::ChapterPlan { title: credit_title, takes: vec![studio_audio::TakeRef { path: out.join(file), gap: 0.0, unit: "credit".into(), speaker: options["speakers"][""].as_str().unwrap_or("Narrator").to_string() }] });
                }
                let cover = match &cover_raw {
                    Some(raw) => studio_audio::square_cover(raw).ok(),
                    None => None,
                };
                // The read-along ebook's chapter audio goes to a folder of its own first.
                let readalong_dir = flag("readalong").then(|| out.join("read-along audio"));
                if let Some(d) = &readalong_dir {
                    std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
                }
                let (written, levels, timings) = studio_audio::export(studio_audio::AudioJob {
                    chapters: plans,
                    meta: studio_audio::Meta {
                        title: title.clone(),
                        author: text(&meta_in["author"]),
                        narrator: text(&meta_in["narrator"]),
                        year: text(&meta_in["year"]),
                        export_id: export_id.clone(),
                    },
                    cover,
                    folder: out.clone(),
                    m4b: flag("m4b"),
                    mp3: flag("mp3"),
                    readalong: readalong_dir.clone(),
                    stems: flag("stems").then(|| studio_audio::free_dir(&out, &format!("{} (stems)", studio_audio::safe_name(&title)))),
                    sample: flag("sample"),
                    bed: match p["info"]["bed"]["file"].as_str().filter(|f| f.starts_with("bed.") && !f.contains(['/', '\\'])) {
                        Some(file) => {
                            progress("Preparing the background sound".into(), 0.02);
                            let (x, rate) = studio_verify::decode_range(&production_dir(&data, &id)?.join(file), 0.0, 3600.0)?;
                            let level = match p["info"]["bed"]["level"].as_str() {
                                Some("medium") => -27.0,
                                Some("low") => -31.0,
                                _ => -36.0,
                            };
                            Some(studio_audio::Bed::new(&x, rate, level)?)
                        }
                        None => None,
                    },
                    comment: format!("{} {}", text(&options["aiLine"]), credit).trim().to_string(),
                    watermark: Some(watermark),
                    message,
                    progress: &|s, v| progress(s, v * 0.85),
                    cancelled: &cancelled,
                })?;
                files.extend(written);
                report = levels;
                if let Some(dir) = readalong_dir {
                    progress("Writing the read-along ebook".into(), 0.86);
                    let by_id: std::collections::HashMap<&str, &Value> = units.iter().map(|u| (u["id"].as_str().unwrap_or_default(), u)).collect();
                    let chapters: Vec<studio_book::ReadChapter> = timings
                        .into_iter()
                        .map(|t| {
                            // Lines of one paragraph share a paragraph; the book's own text is shown.
                            let mut paragraphs: Vec<Vec<studio_book::ReadLine>> = Vec::new();
                            let mut last: Option<i64> = None;
                            for (id, start, end) in t.lines {
                                let (para, shown) = match by_id.get(id.as_str()) {
                                    Some(u) => (
                                        u["paragraph"].as_i64(),
                                        options["shown"][id.as_str()].as_str().or(u["original"].as_str()).or(u["text"].as_str()).unwrap_or_default().to_string(),
                                    ),
                                    None => (None, credit.clone()),
                                };
                                if para.is_none() || para != last || paragraphs.is_empty() {
                                    paragraphs.push(Vec::new());
                                }
                                last = para;
                                paragraphs.last_mut().unwrap().push(studio_book::ReadLine { id, text: shown, start, end });
                            }
                            studio_book::ReadChapter { title: t.title, paragraphs, audio: t.audio, seconds: t.seconds }
                        })
                        .collect();
                    let meta = studio_book::ReadMeta {
                        title: title.clone(),
                        author: text(&meta_in["author"]),
                        lang: p["info"]["language"].as_str().unwrap_or("en").to_string(),
                        narrator: text(&meta_in["narrator"]),
                        ai: text(&options["aiLine"]),
                        rights: options["manuscript"]["rights"].as_array().map(|r| r.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default(),
                        theme: text(&options["manuscript"]["theme"]),
                    };
                    let cover = cover_raw.as_deref().and_then(|c| studio_audio::jpeg(c).ok());
                    let path = studio_audio::free_path(&out, &format!("{} (read-along)", studio_audio::safe_name(&title)), "epub");
                    let made = studio_book::readalong_epub(&meta, &chapters, cover.as_deref(), &export_id, &path);
                    let _ = std::fs::remove_dir_all(&dir);
                    made?;
                    files.push(path);
                }
            }
            if flag("epub") || flag("pdf") || flag("docx") {
                let manuscript: studio_book::Manuscript = serde_json::from_value(options["manuscript"].clone()).map_err(|e| format!("The book could not be read: {e}"))?;
                let stem = studio_audio::safe_name(&title);
                if flag("epub") {
                    progress("Writing the ebook".into(), 0.88);
                    let cover = cover_raw.as_deref().and_then(|c| studio_audio::jpeg(c).ok());
                    let path = studio_audio::free_path(&out, &stem, "epub");
                    studio_book::epub(&manuscript, cover.as_deref(), &export_id, &path)?;
                    files.push(path);
                }
                if cancelled() {
                    return Err("cancelled".into());
                }
                if flag("pdf") {
                    progress("Typesetting the print book".into(), 0.92);
                    let print: studio_book::PrintOptions = serde_json::from_value(options["print"].clone())
                        .unwrap_or(studio_book::PrintOptions { trim: (5.5, 8.5), font: "EB Garamond".into(), bleed: false, large: false });
                    let path = studio_audio::free_path(&out, &format!("{stem} (print)"), "pdf");
                    studio_book::pdf(&manuscript, &print, &path)?;
                    files.push(path);
                }
                if flag("docx") {
                    progress("Writing the Word manuscript".into(), 0.97);
                    let path = studio_audio::free_path(&out, &format!("{stem} (manuscript)"), "docx");
                    studio_book::docx(&manuscript, &export_id, &path)?;
                    files.push(path);
                }
            }
            if cancelled() {
                return Err("cancelled".into());
            }
            let files = staging.finish(&files)?;
            // Kept with the production so "Verify a file" can recognise the watermark later.
            studio::add_export(&data, &id, serde_json::json!({"id": export_id, "message": message, "date": now as f64, "files": files.iter().map(|f| f.to_string_lossy()).collect::<Vec<_>>()}))?;
            Ok(serde_json::json!({"files": files.iter().map(|f| f.to_string_lossy()).collect::<Vec<_>>(), "report": report, "exportId": export_id}))
        })();
        job.running.store(false, Ordering::SeqCst);
        let _ = app.emit("studio-export-done", match outcome {
            Ok(v) => serde_json::json!({"id": id, "ok": true, "result": v}),
            Err(e) if e == "cancelled" => serde_json::json!({"id": id, "ok": false, "cancelled": true}),
            Err(e) => serde_json::json!({"id": id, "ok": false, "message": e}),
        });
    });
    Ok(())
}

#[tauri::command]
fn delete_work(db: State<Database>, ids: Vec<String>) -> Result<()> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .delete_work(&ids)
}
// Writes a folder of text files (a Markdown export) inside a folder the
// reader picks. Paths are relative and may not leave the new folder.
#[tauri::command]
async fn export_folder(name: String, files: Vec<(String, String)>) -> Result<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(parent) = rfd::FileDialog::new().pick_folder() else {
            return Ok(false);
        };
        let clean = |s: &str| {
            s.chars()
                .map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { '-' } else { c })
                .collect::<String>()
                .trim()
                .trim_matches('.')
                .to_owned()
        };
        let mut root = parent.join(clean(&name));
        let mut n = 2;
        while root.exists() {
            root = parent.join(format!("{} ({n})", clean(&name)));
            n += 1;
        }
        for (path, text) in files {
            let mut target = root.clone();
            for part in path.split('/') {
                let part = clean(part);
                if part.is_empty() {
                    return Err("Invalid export path".to_string());
                }
                target.push(part);
            }
            if let Some(dir) = target.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            // Spreadsheets and images arrive as "base64:" text.
            let bytes = match text.strip_prefix("base64:") {
                Some(b64) => {
                    use base64::Engine;
                    base64::engine::general_purpose::STANDARD
                        .decode(b64)
                        .map_err(|_| "Invalid file data".to_string())?
                }
                None => text.into_bytes(),
            };
            std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
        }
        Ok(true)
    })
    .await
    .map_err(|_| "Export failed")?
}
#[tauri::command]
fn list_annotations(db: State<Database>, book_id: Option<String>) -> Result<Vec<Value>> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .annotations(book_id.as_deref())
}
#[tauri::command]
fn save_annotation(db: State<Database>, annotation: Value) -> Result<()> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .save_annotation(annotation)
}
#[tauri::command]
fn delete_annotation(db: State<Database>, id: String) -> Result<()> {
    db.0.lock()
        .map_err(|_| "Database busy")?
        .delete_annotation(&id)
}
#[tauri::command]
fn list_voices(app: tauri::AppHandle, db: State<Database>, model: Option<String>) -> Result<Vec<Value>> {
    let portraits =
        db.0.lock()
            .map_err(|_| "Database busy")?
            .voice_portraits()?;
    let mut voices = speech::voices_for(&app,model.as_deref());
    for voice in &mut voices {
        if let Some(art) = voice["id"].as_str().and_then(|id| portraits.get(id)) {
            for key in ["portrait", "portraitPrompt", "portraitOrigin"] {
                voice[key] = art[key].clone();
            }
        }
    }
    Ok(voices)
}
#[tauri::command]
async fn generate_voice_portrait(
    app: tauri::AppHandle,
    voice: String,
    prompt: String,
    seed: u32,
    model: Option<String>,
    keep_speech: Option<bool>,
) -> Result<String> {
    if !speech::voices(&app).iter().any(|v| v["id"] == voice) {
        return Err("Voice is not installed.".into());
    }
    let epoch = app.state::<covers::Covers>().generation_epoch();
    let options = covers::ArtOptions {
        model,
        keep_speech: keep_speech.unwrap_or(false),
    };
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<covers::Covers>()
            .portrait(app.clone(), prompt, seed, epoch, options)
    })
    .await
    .map_err(|_| "Portrait generation task failed")?
}
#[tauri::command]
fn save_voice_portrait(
    app: tauri::AppHandle,
    db: State<Database>,
    voice: String,
    portrait: String,
    prompt: String,
    origin: String,
) -> Result<()> {
    if !speech::voices(&app).iter().any(|v| v["id"] == voice) {
        return Err("Voice is not installed.".into());
    }
    db.0.lock()
        .map_err(|_| "Database busy")?
        .save_voice_portrait(&voice, &portrait, &prompt, &origin)
}
#[tauri::command]
async fn synthesize(
    app: tauri::AppHandle,
    text: String,
    voice: String,
    model: Option<String>,
    temperature: Option<f64>,
) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<covers::Covers>().cancel()?;
        let state = app.state::<speech::Speech>();
        state.synthesize(app.clone(), text, voice, model, temperature)
    })
    .await
    .map_err(|_| "Speech task failed")?
}
#[tauri::command]
async fn prepare_voice(
    app: tauri::AppHandle,
    voice: String,
    model: Option<String>,
) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<covers::Covers>().cancel()?;
        let state = app.state::<speech::Speech>();
        state.prepare(app.clone(), voice, model)
    })
    .await
    .map_err(|_| "Voice preload task failed")?
}
#[tauri::command]
fn speech_models(app: tauri::AppHandle) -> Value {
    speech::models(&app)
}
#[tauri::command]
async fn system_profile() -> Value {
    tauri::async_runtime::spawn_blocking(hardware::profile)
        .await
        .unwrap_or_else(|_| hardware::fallback())
}
#[tauri::command]
fn cover_engine_status(app: tauri::AppHandle) -> Value {
    covers::status(&app)
}
#[tauri::command]
async fn generate_cover(
    app: tauri::AppHandle,
    prompt: String,
    seed: u32,
    allow_mature: Option<bool>,
    book_id: Option<String>,
    model: Option<String>,
    keep_speech: Option<bool>,
) -> Result<String> {
    let starter = if let Some(id) = book_id {
        covers::starter_cover(
            &app.state::<Database>()
                .0
                .lock()
                .map_err(|_| "Database busy")?
                .metadata(&id)?,
        )
    } else {
        false
    };
    let mature = allow_mature.unwrap_or(false) && !starter;
    let epoch = app.state::<covers::Covers>().generation_epoch();
    let options = covers::ArtOptions {
        model,
        keep_speech: keep_speech.unwrap_or(false),
    };
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<covers::Covers>()
            .generate(app.clone(), prompt, seed, mature, epoch, options)
    })
    .await
    .map_err(|_| "Cover generation task failed")?
}
#[tauri::command]
fn cancel_cover(state: State<covers::Covers>) -> Result<()> {
    state.cancel()
}
#[tauri::command]
fn cancel_speech(state: State<speech::Speech>) -> Result<()> {
    state.cancel()
}
#[tauri::command]
fn interrupt_speech(state: State<speech::Speech>) -> Result<()> {
    state.interrupt()
}
#[tauri::command]
async fn export_text(name: String, text: String) -> Result<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        let filename = std::path::Path::new(&name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("annotations.txt");
        if let Some(path) = rfd::FileDialog::new().set_file_name(filename).save_file() {
            std::fs::write(path, text).map_err(|e| e.to_string())?;
            Ok(true)
        } else {
            Ok(false)
        }
    })
    .await
    .map_err(|_| "Export failed")?
}
// --- Vaults and the parental PIN ----------------------------------------------
// Wrong PINs wait a little longer each time, so guessing is slow.
static PIN_FAILURES: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
fn pin_result<T>(result: Result<T>) -> Result<T> {
    use std::sync::atomic::Ordering;
    match &result {
        Ok(_) => PIN_FAILURES.store(0, Ordering::SeqCst),
        Err(e) if e.contains("PIN is not correct") => {
            let n = PIN_FAILURES.fetch_add(1, Ordering::SeqCst) + 1;
            std::thread::sleep(std::time::Duration::from_secs(u64::from(n.min(10))));
        }
        Err(_) => {}
    }
    result
}
#[tauri::command]
fn delete_voices(
    app: tauri::AppHandle,
    db: State<Database>,
    ids: Vec<String>,
) -> Result<Vec<String>> {
    let removed = speech::delete_voices(&app, &ids)?;
    if let Ok(store) = db.0.lock() {
        for id in &removed {
            let _ = store.delete_voice_portrait(id);
        }
    }
    Ok(removed)
}
#[tauri::command]
fn list_vaults(db: State<Database>) -> Result<Vec<Value>> {
    db.0.lock().map_err(|_| "Database busy")?.vaults()
}
#[tauri::command]
async fn create_vault(db: State<'_, Database>, name: String, pin: String) -> Result<Value> {
    db.0.lock().map_err(|_| "Database busy")?.create_vault(&name, &pin)
}
#[tauri::command]
async fn unlock_vault(db: State<'_, Database>, id: String, pin: String) -> Result<()> {
    let result = db.0.lock().map_err(|_| "Database busy")?.unlock_vault(&id, &pin);
    pin_result(result)
}
#[tauri::command]
fn lock_vault(db: State<Database>, id: Option<String>) -> Result<()> {
    db.0.lock().map_err(|_| "Database busy")?.lock_vault(id.as_deref());
    Ok(())
}
#[tauri::command]
fn rename_vault(db: State<Database>, id: String, name: String) -> Result<()> {
    db.0.lock().map_err(|_| "Database busy")?.rename_vault(&id, &name)
}
#[tauri::command]
async fn change_vault_pin(db: State<'_, Database>, id: String, current: String, pin: String) -> Result<()> {
    let result = db.0.lock().map_err(|_| "Database busy")?.change_vault_pin(&id, &current, &pin);
    pin_result(result)
}
#[tauri::command]
async fn delete_vault(db: State<'_, Database>, id: String, pin: String) -> Result<Vec<String>> {
    let result = db.0.lock().map_err(|_| "Database busy")?.delete_vault(&id, &pin);
    pin_result(result)
}
#[tauri::command]
fn parental_pin_status(db: State<Database>) -> Result<bool> {
    db.0.lock().map_err(|_| "Database busy")?.parental_pin_set()
}
#[tauri::command]
async fn check_parental_pin(db: State<'_, Database>, pin: String) -> Result<()> {
    let result = db.0.lock().map_err(|_| "Database busy")?.check_parental_pin(&pin);
    pin_result(result)
}
#[tauri::command]
async fn set_parental_pin(db: State<'_, Database>, current: String, pin: Option<String>) -> Result<()> {
    let result = db.0.lock().map_err(|_| "Database busy")?.set_parental_pin(&current, pin.as_deref());
    pin_result(result)
}
// --- Plugins -------------------------------------------------------------------
#[tauri::command]
fn list_plugins(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>> {
    Ok(plugins::list(&data_root(&app)?))
}
#[tauri::command]
async fn install_plugin(app: tauri::AppHandle) -> Result<Option<serde_json::Value>> {
    let root = data_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = rfd::FileDialog::new().set_title("Choose a plugin folder").pick_folder() else {
            return Ok(None);
        };
        plugins::install(&root, &folder).map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn install_sample_plugin(app: tauri::AppHandle) -> Result<serde_json::Value> {
    plugins::install_sample(&data_root(&app)?)
}
#[tauri::command]
fn remove_plugin(app: tauri::AppHandle, id: String) -> Result<()> {
    plugins::remove(&data_root(&app)?, &id)
}
#[tauri::command]
fn open_plugins_folder(app: tauri::AppHandle) -> Result<()> {
    let folder = plugins::root(&data_root(&app)?);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    open_in_browser(&folder.to_string_lossy())
}

// --- Handwriting ---------------------------------------------------------------
// Readers: the one built into Windows (every installed handwriting language),
// and Origami's own model (handwriting::ID) once downloaded, on any system.
#[tauri::command]
async fn handwriting_recognizers(app: tauri::AppHandle) -> Result<Vec<String>> {
    let mut names = tauri::async_runtime::spawn_blocking(ink::recognizers).await.map_err(|e| e.to_string())??;
    if app.state::<handwriting::Reader>().is_installed(&app) {
        names.push(handwriting::ID.to_string());
    }
    Ok(names)
}
#[tauri::command]
async fn recognize_handwriting(app: tauri::AppHandle, strokes: Vec<ink::Stroke>, recognizer: Option<String>) -> Result<Vec<ink::Line>> {
    tauri::async_runtime::spawn_blocking(move || {
        let model = app.state::<handwriting::Reader>();
        let own = || model.recognize(&app, &strokes);
        if recognizer.as_deref() == Some(handwriting::ID) {
            return own();
        }
        // The system's reader when there is one, otherwise Origami's model.
        let system = ink::recognizers().unwrap_or_default();
        if system.is_empty() {
            if model.is_installed(&app) || !cfg!(windows) {
                return own();
            }
            return Err("No handwriting reader yet: add a handwriting language in Windows Settings (Time and language, Language), or download the handwriting model in Settings, Work mode.".into());
        }
        ink::recognize(&strokes, recognizer.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn read_handwriting_photo(app: tauri::AppHandle, width: usize, height: usize, gray: String) -> Result<Vec<ink::Line>> {
    let bytes = STANDARD.decode(gray.as_bytes()).map_err(|_| "This image could not be read.")?;
    tauri::async_runtime::spawn_blocking(move || app.state::<handwriting::Reader>().read_image(&app, width, height, &bytes))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn handwriting_model_status(app: tauri::AppHandle, reader: State<handwriting::Reader>) -> Result<serde_json::Value> {
    reader.status(&app)
}
#[tauri::command]
async fn download_handwriting_model(app: tauri::AppHandle) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || app.state::<handwriting::Reader>().download(&app))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_handwriting_download(reader: State<handwriting::Reader>) {
    reader.cancel_download();
}
#[tauri::command]
fn remove_handwriting_model(app: tauri::AppHandle, reader: State<handwriting::Reader>) -> Result<()> {
    reader.remove(&app)
}

// --- Voice notes: Whisper transcription ------------------------------------------
#[tauri::command]
fn voice_model_status(app: tauri::AppHandle, t: State<whisper::Transcriber>) -> Result<serde_json::Value> {
    t.status(&app)
}
#[tauri::command]
async fn download_voice_model(app: tauri::AppHandle, id: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || app.state::<whisper::Transcriber>().download(&app, &id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_voice_download(t: State<whisper::Transcriber>) {
    t.cancel_download();
}
#[tauri::command]
fn remove_voice_model(app: tauri::AppHandle, t: State<whisper::Transcriber>, id: String) -> Result<()> {
    t.remove(&app, &id)
}
/// `samples`: 16 kHz mono, 16-bit little-endian, base64.
#[tauri::command]
async fn transcribe_audio(app: tauri::AppHandle, model: String, language: String, samples: String) -> Result<serde_json::Value> {
    use base64::Engine;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD.decode(samples).map_err(|_| "Invalid audio")?;
        if bytes.len() > 2 * 16_000 * 60 * 60 {
            return Err("Voice notes can be up to an hour long.".into());
        }
        let pcm: Vec<f32> = bytes.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0).collect();
        app.state::<whisper::Transcriber>().transcribe(&app, &model, &pcm, &language)
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- Updates -------------------------------------------------------------------
// The last verified update list; installing only ever uses this one.
#[derive(Default)]
struct PendingUpdate(Mutex<Option<serde_json::Value>>);
#[tauri::command]
fn update_status() -> serde_json::Value {
    update::status()
}
#[tauri::command]
async fn check_updates(pending: State<'_, PendingUpdate>) -> Result<serde_json::Value> {
    let found = tauri::async_runtime::spawn_blocking(update::check).await.map_err(|e| e.to_string())??;
    *pending.0.lock().map_err(|_| "Busy")? = Some(found.clone());
    Ok(found)
}
#[tauri::command]
async fn install_update(app: tauri::AppHandle, pending: State<'_, PendingUpdate>) -> Result<bool> {
    let found = pending.0.lock().map_err(|_| "Busy")?.clone().ok_or("Check for updates first.")?;
    // Workers may be replaced: stop them first (they start again when needed).
    let _ = app.state::<speech::Speech>().shutdown();
    let _ = app.state::<covers::Covers>().shutdown();
    let root = data_root(&app)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || update::install(&handle, &root, &found)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}
pub fn run() {
    tauri::Builder::default()
        // Plugin frames: each plugin's own files, under a strict policy.
        .register_uri_scheme_protocol(plugins::SCHEME, |ctx, request| {
            let origin = if cfg!(windows) { format!("http://{}.localhost", plugins::SCHEME) } else { format!("{}://localhost", plugins::SCHEME) };
            let (status, kind, body, csp) = match data_root(ctx.app_handle()) {
                Ok(root) => plugins::serve(&root, request.uri().path(), &origin),
                Err(_) => (500, "text/plain", Vec::new(), "default-src 'none'".into()),
            };
            tauri::http::Response::builder()
                .status(status)
                .header("Content-Type", kind)
                .header("Content-Security-Policy", csp)
                .header("X-Content-Type-Options", "nosniff")
                .header("Cache-Control", "no-store")
                .body(body)
                .unwrap_or_default()
        })
        .setup(|app| {
            let path = data_root(app.handle()).map_err(std::io::Error::other)?;
            std::fs::create_dir_all(&path)?;
            let db = Store::open(&path.join("origami.sqlite3")).map_err(std::io::Error::other)?;
            app.manage(Database(Mutex::new(db)));
            app.manage(speech::Speech::default());
            app.manage(StudioJob::default());
            app.manage(ExportJob::default());
            app.manage(studio_llm::Analysis::default());
            app.manage(CheckJob::default());
            app.manage(AsrJob::default());
            app.manage(studio_models::Setup::default());
            app.manage(covers::Covers::default());
            app.manage(voice_studio::Studio::default());
            app.manage(embed::Embedder::default());
            app.manage(handwriting::Reader::default());
            app.manage(whisper::Transcriber::default());
            app.manage(PendingUpdate::default());
            update::clean_up();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            voice_studio_state, design_voice, cancel_voice_design, voice_preview_audio, update_voice_preview, delete_voice_preview, save_designed_voice, export_voice_preview,
            list_books,
            list_productions, create_production, read_production, save_production_info, save_production_units, delete_production, studio_render, studio_cancel_render, studio_render_running, studio_take_audio,
            studio_choose_folder, studio_reveal, studio_watermark_ready, studio_cancel_export, studio_export,
            studio_analysis_status, studio_analysis_chat, studio_analysis_stop, studio_replace_units,
            studio_verify_file, studio_check_takes, studio_cancel_check,
            studio_asr_ready, studio_pick_recordings, studio_transcribe, studio_cancel_transcribe, studio_preview_print,
            studio_save_portable, studio_open_portable, studio_recording_clip, studio_choose_bed, studio_clear_bed,
            voice_store_list, voice_store_preview, voice_store_install, model_download, model_download_cancel, studio_recording_readalong,
            studio_setup_status, studio_setup_download, studio_setup_cancel,
            starter_library_installed,
            install_starter_library,
            read_book,
            save_book,
            save_meta,
            delete_trashed_books,
            purge_trash,
            save_spoken_edits,
            read_settings,
            save_settings,
            list_annotations,
            save_annotation,
            delete_annotation,
            list_voices,
            generate_voice_portrait,
            save_voice_portrait,
            synthesize,
            prepare_voice,
            speech_models,
            model_inventory,
            change_model_installation,
            system_profile,
            cancel_speech,
            interrupt_speech,
            cover_engine_status,
            generate_cover,
            cancel_cover,
            export_text,
            export_folder,
            open_url,
            handwriting_recognizers,
            handwriting_model_status,
            read_handwriting_photo,
            voice_model_status,
            download_voice_model,
            cancel_voice_download,
            remove_voice_model,
            transcribe_audio,
            download_handwriting_model,
            cancel_handwriting_download,
            remove_handwriting_model,
            list_plugins,
            install_plugin,
            install_sample_plugin,
            remove_plugin,
            open_plugins_folder,
            recognize_handwriting,
            update_status,
            check_updates,
            install_update,
            restart_app,
            list_work,
            save_work,
            embedding_status,
            download_embedding_model,
            cancel_embedding_download,
            remove_embedding_model,
            embed_texts,
            delete_work,
            note_versions,
            work_item,
            prune_note_versions,
            external_links,
            open_external_link,
            open_licenses_folder,
            save_artwork_copies,
            open_artwork_folder,
            delete_voice_portrait,
            delete_voices,
            list_vaults,
            create_vault,
            unlock_vault,
            lock_vault,
            rename_vault,
            change_vault_pin,
            delete_vault,
            parental_pin_status,
            check_parental_pin,
            set_parental_pin
        ])
        .build(tauri::generate_context!())
        .expect("Could not build Origami")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<voice_studio::Studio>().shutdown();
                let _ = app.state::<speech::Speech>().shutdown();
                let _ = app.state::<covers::Covers>().shutdown();
                app.state::<studio_llm::Analysis>().stop();
            }
        });
}

#[cfg(test)]
mod artwork_tests {
    use super::artwork_file_name;
    #[test]
    fn artwork_names_are_safe_file_names() {
        assert_eq!(artwork_file_name("Dracula", "webp"), "Dracula.webp");
        assert_eq!(artwork_file_name("a/b:c?*", "png"), "a_b_c__.png");
        assert_eq!(artwork_file_name("..", "webp"), "image.webp");
        assert_eq!(artwork_file_name("호수 이야기", "webp"), "호수 이야기.webp");
        assert_eq!(artwork_file_name(&"x".repeat(200), "jpg").len(), 84);
    }
}

#[cfg(test)]
mod studio_check_tests {
    #[test]
    fn heard_share_ignores_case_punctuation_and_numbers() {
        assert_eq!(super::heard_share("It is a truth, universally acknowledged.", "it is a truth universally acknowledged"), 1.0);
        assert!(super::heard_share("Is he married or single?", "Is he married?") < 0.8);
        assert_eq!(super::heard_share("Four or five thousand, 16 in all.", "four or five thousand sixteen in all"), 1.0 - 1.0 / 6.0);
        assert_eq!(super::heard_share("", "anything"), 1.0);
        assert_eq!(super::heard_share("Mr. Bennet replied that he had not.", "Mr. Bennett replied that he had not."), 1.0);
        assert!(super::heard_share("What a fine thing", "What a feeny thing") < 1.0);
    }
}
