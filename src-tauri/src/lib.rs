mod covers;
mod speech;
mod store;
use serde_json::Value;
use std::sync::Mutex;
use store::Store;
use tauri::{Manager, State};
type Result<T> = std::result::Result<T, String>;
struct Database(Mutex<Store>);
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
fn list_voices(app: tauri::AppHandle, db: State<Database>) -> Result<Vec<Value>> {
    let portraits =
        db.0.lock()
            .map_err(|_| "Database busy")?
            .voice_portraits()?;
    let mut voices = speech::voices(&app);
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
) -> Result<String> {
    if !speech::voices(&app).iter().any(|v| v["id"] == voice) {
        return Err("Voice is not installed.".into());
    }
    let epoch = app.state::<covers::Covers>().generation_epoch();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<covers::Covers>()
            .portrait(app.clone(), prompt, seed, epoch)
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
async fn synthesize(app: tauri::AppHandle, text: String, voice: String) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<covers::Covers>().cancel()?;
        let state = app.state::<speech::Speech>();
        state.synthesize(app.clone(), text, voice)
    })
    .await
    .map_err(|_| "Speech task failed")?
}
#[tauri::command]
async fn prepare_voice(app: tauri::AppHandle, voice: String) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<covers::Covers>().cancel()?;
        let state = app.state::<speech::Speech>();
        state.prepare(app.clone(), voice)
    })
    .await
    .map_err(|_| "Voice preload task failed")?
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
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<covers::Covers>()
            .generate(app.clone(), prompt, seed, mature, epoch)
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
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = std::env::var_os("ORIGAMI_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            std::fs::create_dir_all(&path)?;
            let db = Store::open(&path.join("origami.sqlite3")).map_err(std::io::Error::other)?;
            app.manage(Database(Mutex::new(db)));
            app.manage(speech::Speech::default());
            app.manage(covers::Covers::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_books,
            starter_library_installed,
            install_starter_library,
            read_book,
            save_book,
            save_meta,
            delete_trashed_books,
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
            cancel_speech,
            cover_engine_status,
            generate_cover,
            cancel_cover,
            export_text
        ])
        .build(tauri::generate_context!())
        .expect("Could not build Origami")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let _ = app.state::<speech::Speech>().shutdown();
                let _ = app.state::<covers::Covers>().shutdown();
            }
        });
}
