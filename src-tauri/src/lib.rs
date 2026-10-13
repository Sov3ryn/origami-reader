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
fn list_voices(app: tauri::AppHandle) -> Vec<Value> {
    speech::voices(&app)
}
#[tauri::command]
async fn synthesize(app: tauri::AppHandle, text: String, voice: String) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<speech::Speech>();
        state.synthesize(app.clone(), text, voice)
    })
    .await
    .map_err(|_| "Speech task failed")?
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
            let path = app.path().app_data_dir()?;
            std::fs::create_dir_all(&path)?;
            let db = Store::open(&path.join("origami.sqlite3")).map_err(std::io::Error::other)?;
            app.manage(Database(Mutex::new(db)));
            app.manage(speech::Speech::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_books,
            read_book,
            save_book,
            save_meta,
            read_settings,
            save_settings,
            list_annotations,
            save_annotation,
            delete_annotation,
            list_voices,
            synthesize,
            cancel_speech,
            export_text
        ])
        .build(tauri::generate_context!())
        .expect("Could not build Origami")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let _ = app.state::<speech::Speech>().cancel();
            }
        });
}
