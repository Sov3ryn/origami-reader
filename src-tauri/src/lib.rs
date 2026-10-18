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
    for item in items {
        store.save_work(item)?;
    }
    Ok(())
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
            list_productions, create_production, read_production, save_production_info, save_production_units, delete_production,
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
