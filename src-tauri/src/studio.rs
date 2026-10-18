// Studio productions: one folder each under the data folder, holding a small
// database (manuscript snapshot, render units, takes) and the take audio files.
// Exports are written wherever the reader chooses and are never touched here.
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub type Result<T> = std::result::Result<T, String>;

pub fn root(data: &Path) -> PathBuf {
    data.join("Studio")
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() < 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn folder(data: &Path, id: &str) -> Result<PathBuf> {
    if !valid_id(id) {
        return Err("Unknown production.".into());
    }
    Ok(root(data).join(id))
}

fn open(dir: &Path) -> Result<Connection> {
    let db = Connection::open(dir.join("production.sqlite")).map_err(|e| e.to_string())?;
    db.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS info(key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS units(id TEXT PRIMARY KEY, ord INTEGER NOT NULL, chapter INTEGER NOT NULL, data TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS takes(id TEXT PRIMARY KEY, unit TEXT NOT NULL, data TEXT NOT NULL);
         CREATE INDEX IF NOT EXISTS takes_unit ON takes(unit);",
    )
    .map_err(|e| e.to_string())?;
    Ok(db)
}

fn read_info(db: &Connection) -> Result<Value> {
    let raw: String = db
        .query_row("SELECT value FROM info WHERE key='production'", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

/// Every production's summary, newest first. Damaged folders are skipped.
pub fn list(data: &Path) -> Result<Vec<Value>> {
    let dir = root(data);
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(out) };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.join("production.sqlite").is_file() {
            continue;
        }
        let Ok(db) = open(&path) else { continue };
        if let Ok(mut info) = read_info(&db) {
            let units: i64 = db.query_row("SELECT COUNT(*) FROM units", [], |r| r.get(0)).unwrap_or(0);
            let rendered: i64 = db
                .query_row("SELECT COUNT(DISTINCT unit) FROM takes", [], |r| r.get(0))
                .unwrap_or(0);
            info["units"] = json!(units);
            info["rendered"] = json!(rendered);
            out.push(info);
        }
    }
    out.sort_by(|a, b| b["updated"].as_f64().unwrap_or(0.0).total_cmp(&a["updated"].as_f64().unwrap_or(0.0)));
    Ok(out)
}

/// Creates a production from a manuscript snapshot and its render units.
pub fn create(data: &Path, info: Value, units: Vec<Value>) -> Result<Value> {
    let id = info["id"].as_str().unwrap_or_default().to_string();
    let dir = folder(data, &id)?;
    if dir.exists() {
        return Err("A production with this id already exists.".into());
    }
    std::fs::create_dir_all(dir.join("takes")).map_err(|e| e.to_string())?;
    let mut db = open(&dir)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO info(key, value) VALUES('production', ?1)", params![info.to_string()])
        .map_err(|e| e.to_string())?;
    for (ord, unit) in units.iter().enumerate() {
        tx.execute(
            "INSERT INTO units(id, ord, chapter, data) VALUES(?1, ?2, ?3, ?4)",
            params![unit["id"].as_str().unwrap_or_default(), ord as i64, unit["chapter"].as_i64().unwrap_or(0), unit.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(info)
}

/// True when a production with this id is already here.
pub fn exists(data: &Path, id: &str) -> bool {
    folder(data, id).map(|d| d.exists()).unwrap_or(false)
}

/// Recreates a production from a portable copy: its details, its units as they
/// were (chosen takes and statuses kept) and its takes.
pub fn restore(data: &Path, info: Value, units: Vec<Value>, takes: &[Value]) -> Result<PathBuf> {
    let id = info["id"].as_str().unwrap_or_default().to_string();
    create(data, info, units)?;
    let dir = folder(data, &id)?;
    let mut db = open(&dir)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for take in takes {
        tx.execute(
            "INSERT OR REPLACE INTO takes(id, unit, data) VALUES(?1, ?2, ?3)",
            params![take["id"].as_str().unwrap_or_default(), take["unit"].as_str().unwrap_or_default(), take.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(dir.join("takes"))
}

/// The production with all its units and takes.
pub fn read(data: &Path, id: &str) -> Result<Value> {
    let db = open(&folder(data, id)?)?;
    let info = read_info(&db)?;
    let units = rows(&db, "SELECT data FROM units ORDER BY ord")?;
    let takes = rows(&db, "SELECT data FROM takes")?;
    Ok(json!({ "info": info, "units": units, "takes": takes }))
}

fn rows(db: &Connection, sql: &str) -> Result<Vec<Value>> {
    let mut q = db.prepare(sql).map_err(|e| e.to_string())?;
    let found = q
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(|s| serde_json::from_str(&s).ok())
        .collect();
    Ok(found)
}

/// Updates the production's details (title, narrator voice, settings). The
/// export records are kept from the saved copy: an editor that loaded the
/// production before an export must not erase them ("Verify a file" needs them).
pub fn save_info(data: &Path, mut info: Value) -> Result<()> {
    let id = info["id"].as_str().unwrap_or_default().to_string();
    let db = open(&folder(data, &id)?)?;
    let saved = read_info(&db)?;
    let mut exports = saved["exports"].as_array().cloned().unwrap_or_default();
    for e in info["exports"].as_array().cloned().unwrap_or_default() {
        if !exports.iter().any(|x| x["id"] == e["id"]) {
            exports.push(e);
        }
    }
    info["exports"] = Value::Array(exports);
    db.execute("UPDATE info SET value=?1 WHERE key='production'", params![info.to_string()])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Adds an export record to the production as it is saved now (not as the
/// export found it when it started, which could undo edits made meanwhile).
pub fn add_export(data: &Path, id: &str, record: Value) -> Result<()> {
    let db = open(&folder(data, id)?)?;
    let mut info = read_info(&db)?;
    let mut exports = info["exports"].as_array().cloned().unwrap_or_default();
    exports.push(record);
    info["exports"] = Value::Array(exports);
    db.execute("UPDATE info SET value=?1 WHERE key='production'", params![info.to_string()])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Saves changed fields of units (spoken text, status, chosen take). Each entry
/// holds the unit's id and only the fields the reader changed, merged into the
/// unit as saved now: a render that finished meanwhile keeps its take. A null
/// field is removed.
pub fn save_units(data: &Path, id: &str, units: Vec<Value>) -> Result<()> {
    let mut db = open(&folder(data, id)?)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for patch in units {
        let unit_id = patch["id"].as_str().unwrap_or_default();
        let raw: Option<String> = tx
            .query_row("SELECT data FROM units WHERE id=?1", params![unit_id], |r| r.get(0))
            .ok();
        // A unit cut away meanwhile (a new analysis) is not brought back.
        let Some(raw) = raw else { continue };
        let mut unit: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if let (Some(u), Some(fields)) = (unit.as_object_mut(), patch.as_object()) {
            for (k, v) in fields {
                if v.is_null() {
                    u.remove(k);
                } else {
                    u.insert(k.clone(), v.clone());
                }
            }
        }
        tx.execute("UPDATE units SET data=?2 WHERE id=?1", params![unit_id, unit.to_string()])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Replaces every unit (a new cut of the manuscript, such as speech split from
/// narration). Takes are kept; units that keep their id keep their takes.
pub fn replace_units(data: &Path, id: &str, units: Vec<Value>) -> Result<()> {
    let mut db = open(&folder(data, id)?)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM units", []).map_err(|e| e.to_string())?;
    for (ord, unit) in units.iter().enumerate() {
        tx.execute(
            "INSERT INTO units(id, ord, chapter, data) VALUES(?1, ?2, ?3, ?4)",
            params![unit["id"].as_str().unwrap_or_default(), ord as i64, unit["chapter"].as_i64().unwrap_or(0), unit.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// The folder for take audio files.
pub fn takes_dir(data: &Path, id: &str) -> Result<PathBuf> {
    Ok(folder(data, id)?.join("takes"))
}

/// Records new takes and marks their units rendered, in one transaction. The
/// units are read as saved now, since the reader may have changed them while
/// the take was made: an approved unit keeps its approved take (the new one is
/// kept as another take), and a unit whose spoken text or voice changed stays
/// pending without the take, which says the old words or uses the old voice.
pub fn add_takes(data: &Path, id: &str, takes: &[Value]) -> Result<()> {
    let mut db = open(&folder(data, id)?)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let mut info = read_info(&tx)?;
    let narrator = info["voice"].as_str().unwrap_or_default().to_string();
    for take in takes {
        let unit = take["unit"].as_str().unwrap_or_default();
        tx.execute("INSERT OR REPLACE INTO takes(id, unit, data) VALUES(?1, ?2, ?3)", params![take["id"].as_str().unwrap_or_default(), unit, take.to_string()])
            .map_err(|e| e.to_string())?;
        let raw: Option<String> = tx.query_row("SELECT data FROM units WHERE id=?1", params![unit], |r| r.get(0)).ok();
        // A unit cut away meanwhile (a new analysis) keeps nothing but the take.
        let Some(raw) = raw else { continue };
        let mut u: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if u["status"] == "approved" {
            continue;
        }
        let voice = u["voice"].as_str().filter(|v| !v.is_empty()).unwrap_or(&narrator);
        if u["text"] != take["text"] || take["voice"].as_str().is_some_and(|v| v != voice) {
            u["status"] = json!("pending");
        } else {
            u["status"] = json!(if take["ended"].as_bool() == Some(false) { "failed" } else { "rendered" });
            u["take"] = take["id"].clone();
        }
        tx.execute("UPDATE units SET data=?2 WHERE id=?1", params![unit, u.to_string()]).map_err(|e| e.to_string())?;
    }
    info["updated"] = json!(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0));
    tx.execute("UPDATE info SET value=?1 WHERE key='production'", params![info.to_string()]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

/// Saves changed takes (measurements added later, such as a transcription check).
pub fn update_takes(data: &Path, id: &str, takes: &[Value]) -> Result<()> {
    let mut db = open(&folder(data, id)?)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for take in takes {
        tx.execute("UPDATE takes SET data=?2 WHERE id=?1", params![take["id"].as_str().unwrap_or_default(), take.to_string()])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// A take's audio file, read for playback.
pub fn take_audio(data: &Path, id: &str, file: &str) -> Result<Vec<u8>> {
    if !(file.ends_with(".wav") || file.ends_with(".flac")) || file.contains(['/', '\\']) || file.contains("..") {
        return Err("Unknown take.".into());
    }
    std::fs::read(takes_dir(data, id)?.join(file)).map_err(|e| e.to_string())
}

// Productions with a job running on them (a render, a check, an export), so
// none is deleted while a job still reads or writes it.
static BUSY: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// Marks a production busy until the returned value is dropped.
pub struct Busy(String);

pub fn busy(id: &str) -> Busy {
    if let Ok(mut b) = BUSY.lock() {
        b.push(id.to_string());
    }
    Busy(id.to_string())
}

impl Drop for Busy {
    fn drop(&mut self) {
        if let Ok(mut b) = BUSY.lock() {
            if let Some(i) = b.iter().position(|x| *x == self.0) {
                b.remove(i);
            }
        }
    }
}

fn is_busy(id: &str) -> bool {
    BUSY.lock().map(|b| b.iter().any(|x| x == id)).unwrap_or(true)
}

/// Removes a production folder (its takes included). Exports live elsewhere.
pub fn delete(data: &Path, id: &str) -> Result<()> {
    if is_busy(id) {
        return Err("Stop rendering, checking or exporting this production before deleting it.".into());
    }
    let dir = folder(data, id)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_list_read_delete() {
        let data = std::env::temp_dir().join(format!("origami-studio-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data);
        let info = json!({ "id": "prod-1", "title": "Test", "updated": 1.0 });
        let units = vec![json!({ "id": "c0-u0", "chapter": 0, "text": "Hello." }), json!({ "id": "c1-u0", "chapter": 1, "text": "Bye." })];
        create(&data, info.clone(), units).unwrap();
        assert!(create(&data, info, vec![]).is_err());
        let all = list(&data).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["units"], 2);
        let p = read(&data, "prod-1").unwrap();
        assert_eq!(p["units"][1]["text"], "Bye.");
        save_units(&data, "prod-1", vec![json!({ "id": "c1-u0", "chapter": 1, "text": "Goodbye." })]).unwrap();
        assert_eq!(read(&data, "prod-1").unwrap()["units"][1]["text"], "Goodbye.");
        assert!(read(&data, "../x").is_err());
        delete(&data, "prod-1").unwrap();
        assert!(list(&data).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn edits_made_while_rendering_are_kept() {
        let data = std::env::temp_dir().join(format!("origami-studio-race-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data);
        let info = json!({ "id": "prod-2", "title": "Test", "voice": "nar", "updated": 1.0 });
        let units = vec![
            json!({ "id": "a", "chapter": 0, "text": "One.", "status": "pending" }),
            json!({ "id": "b", "chapter": 0, "text": "Two.", "status": "pending", "take": "b-0" }),
            json!({ "id": "c", "chapter": 0, "text": "Three.", "status": "pending" }),
        ];
        create(&data, info, units).unwrap();
        // While the batch renders, the reader edits "a" and approves "b".
        save_units(&data, "prod-2", vec![json!({ "id": "a", "text": "One!", "original": "One." })]).unwrap();
        save_units(&data, "prod-2", vec![json!({ "id": "b", "status": "approved" })]).unwrap();
        let take = |unit: &str, text: &str| json!({ "id": format!("{unit}-1"), "unit": unit, "text": text, "voice": "nar", "ended": true });
        add_takes(&data, "prod-2", &[take("a", "One."), take("b", "Two."), take("c", "Three."), take("gone", "x")]).unwrap();
        let p = read(&data, "prod-2").unwrap();
        let unit = |id: &str| p["units"].as_array().unwrap().iter().find(|u| u["id"] == id).unwrap().clone();
        assert_eq!(unit("a")["status"], "pending");
        assert!(unit("a")["take"].is_null());
        assert_eq!(unit("b")["status"], "approved");
        assert_eq!(unit("b")["take"], "b-0");
        assert_eq!(unit("c")["status"], "rendered");
        assert_eq!(unit("c")["take"], "c-1");
        // A patch merges: the take chosen by the render stays, a null field goes.
        save_units(&data, "prod-2", vec![json!({ "id": "c", "pause": "long" }), json!({ "id": "a", "original": null })]).unwrap();
        let p = read(&data, "prod-2").unwrap();
        let unit = |id: &str| p["units"].as_array().unwrap().iter().find(|u| u["id"] == id).unwrap().clone();
        assert_eq!(unit("c")["take"], "c-1");
        assert_eq!(unit("c")["pause"], "long");
        assert!(unit("a").get("original").is_none());
        // Not deleted while a job runs on it.
        let job = busy("prod-2");
        assert!(delete(&data, "prod-2").is_err());
        drop(job);
        delete(&data, "prod-2").unwrap();
        let _ = std::fs::remove_dir_all(&data);
    }
}
