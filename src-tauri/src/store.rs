use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;
pub type Result<T> = std::result::Result<T, String>;
pub struct Store {
    pub connection: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path).map_err(|e| e.to_string())?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY, meta TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS annotations(id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS annotations_book ON annotations(book_id); CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version=1;").map_err(|e|e.to_string())?;
        Ok(Self { connection })
    }
    pub fn list(&self) -> Result<Vec<Value>> {
        let mut q = self
            .connection
            .prepare("SELECT meta FROM books")
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            serde_json::from_str(&r.map_err(|e| e.to_string())?).map_err(|e| e.to_string())
        })
        .collect()
    }
    pub fn save(&self, book: Value) -> Result<()> {
        let meta = &book["meta"];
        let id = valid_id(meta)?;
        let paragraphs = book["paragraphs"].as_array().ok_or("Missing paragraphs")?;
        if paragraphs.is_empty() || paragraphs.len() > 200_000 {
            return Err("Invalid document size".into());
        }
        let body = serde_json::to_string(paragraphs).map_err(|e| e.to_string())?;
        if body.len() > 64 * 1024 * 1024 {
            return Err("Document exceeds import budget".into());
        }
        for p in paragraphs {
            if p["text"].as_str().is_none() || p["id"].as_str().is_none() {
                return Err("Invalid paragraph".into());
            }
        }
        self.connection.execute("INSERT INTO books(id,meta,body) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET meta=excluded.meta,body=excluded.body",params![id,meta.to_string(),body]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn read(&self, id: &str) -> Result<Value> {
        let (meta, body): (String, String) = self
            .connection
            .query_row("SELECT meta,body FROM books WHERE id=?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(|_| "Book not found".to_string())?;
        Ok(
            serde_json::json!({"meta":serde_json::from_str::<Value>(&meta).map_err(|e|e.to_string())?,"paragraphs":serde_json::from_str::<Value>(&body).map_err(|e|e.to_string())?}),
        )
    }
    pub fn save_meta(&self, meta: Value) -> Result<()> {
        let id = valid_id(&meta)?;
        let n = self
            .connection
            .execute(
                "UPDATE books SET meta=?1 WHERE id=?2",
                params![meta.to_string(), id],
            )
            .map_err(|e| e.to_string())?;
        if n != 1 {
            return Err("Book not found".into());
        }
        Ok(())
    }
    pub fn annotations(&self, book: Option<&str>) -> Result<Vec<Value>> {
        let mut q = self
            .connection
            .prepare(
                "SELECT data FROM annotations WHERE (?1 IS NULL OR book_id=?1) ORDER BY rowid DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([book], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            serde_json::from_str(&r.map_err(|e| e.to_string())?).map_err(|e| e.to_string())
        })
        .collect()
    }
    pub fn save_annotation(&self, a: Value) -> Result<()> {
        let id = valid_id(&a)?;
        let book = a["bookId"].as_str().ok_or("Missing book")?;
        if a.to_string().len() > 128 * 1024 {
            return Err("Annotation is too large".into());
        }
        self.connection.execute("INSERT INTO annotations(id,book_id,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![id,book,a.to_string()]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn delete_annotation(&self, id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM annotations WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn settings(&self) -> Result<Value> {
        match self.connection.query_row(
            "SELECT data FROM settings WHERE id='preferences'",
            [],
            |r| r.get::<_, String>(0),
        ) {
            Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::json!({})),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn save_settings(&self, v: Value) -> Result<()> {
        if !v.is_object() || v.to_string().len() > 64 * 1024 {
            return Err("Invalid settings".into());
        }
        self.connection.execute("INSERT INTO settings(id,data) VALUES('preferences',?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",[v.to_string()]).map_err(|e|e.to_string())?;
        Ok(())
    }
}
fn valid_id(v: &Value) -> Result<&str> {
    let id = v["id"].as_str().ok_or("Missing ID")?;
    if id.is_empty() || id.len() > 128 {
        return Err("Invalid ID".into());
    }
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trip_and_metadata_update_preserve_body() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("test.db");
        {
            let s = Store::open(&path).unwrap();
            s.save(serde_json::json!({"meta":{"id":"book","title":"First"},"paragraphs":[{"id":"p-0","text":"Hello"}]})).unwrap();
            s.save_meta(serde_json::json!({"id":"book","title":"Updated","deleted":true}))
                .unwrap();
        }
        let s = Store::open(&path).unwrap();
        assert_eq!(s.read("book").unwrap()["paragraphs"][0]["text"], "Hello");
        assert_eq!(s.list().unwrap()[0]["title"], "Updated");
    }
    #[test]
    fn annotations_require_book_and_persist() {
        let s = Store::open(Path::new(":memory:")).unwrap();
        let a = serde_json::json!({"id":"a","bookId":"b","text":"Note"});
        assert!(s.save_annotation(a.clone()).is_err());
        s.save(serde_json::json!({"meta":{"id":"b"},"paragraphs":[{"id":"p","text":"Text"}]}))
            .unwrap();
        s.save_annotation(a).unwrap();
        assert_eq!(s.annotations(Some("b")).unwrap().len(), 1);
        s.delete_annotation("a").unwrap();
        assert!(s.annotations(None).unwrap().is_empty());
    }
    #[test]
    fn invalid_save_does_not_replace_document() {
        let s = Store::open(Path::new(":memory:")).unwrap();
        s.save(serde_json::json!({"meta":{"id":"b"},"paragraphs":[{"id":"p","text":"Keep"}]}))
            .unwrap();
        assert!(s
            .save(serde_json::json!({"meta":{"id":"b"},"paragraphs":[]}))
            .is_err());
        assert_eq!(s.read("b").unwrap()["paragraphs"][0]["text"], "Keep");
    }
}
