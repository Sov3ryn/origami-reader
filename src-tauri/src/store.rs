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
    pub fn save_spoken_edits(&mut self, book: &str, paragraph: &str, edits: Value) -> Result<()> {
        let list = edits.as_array().ok_or("Invalid spoken edits")?;
        if list.len() > 1000 || edits.to_string().len() > 1024 * 1024 {
            return Err("Spoken edits are too large".into());
        }
        let transaction = self
            .connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let body: String = transaction
            .query_row("SELECT body FROM books WHERE id=?1", [book], |r| r.get(0))
            .map_err(|_| "Book not found")?;
        let mut paragraphs: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
        let p = paragraphs
            .as_array_mut()
            .ok_or("Invalid document")?
            .iter_mut()
            .find(|p| p["id"].as_str() == Some(paragraph))
            .ok_or("Passage not found")?;
        let text = p["text"].as_str().ok_or("Invalid paragraph")?;
        let mut offset = 0u64;
        let mut boundaries = std::collections::HashSet::from([0u64]);
        for c in text.chars() {
            offset += c.len_utf16() as u64;
            boundaries.insert(offset);
        }
        let mut previous_end = 0;
        for edit in list {
            let start = edit["start"].as_u64().ok_or("Invalid spoken range")?;
            let end = edit["end"].as_u64().ok_or("Invalid spoken range")?;
            if start < previous_end
                || end <= start
                || !boundaries.contains(&start)
                || !boundaries.contains(&end)
                || edit["text"].as_str().is_none()
            {
                return Err("Invalid spoken range".into());
            }
            previous_end = end;
        }
        let p = p.as_object_mut().ok_or("Invalid paragraph")?;
        if list.is_empty() {
            p.remove("spokenEdits");
        } else {
            p.insert("spokenEdits".into(), edits);
        }
        let body = paragraphs.to_string();
        if body.len() > 64 * 1024 * 1024 {
            return Err("Document exceeds import budget".into());
        }
        transaction
            .execute("UPDATE books SET body=?1 WHERE id=?2", params![body, book])
            .map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())?;
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
    #[test]
    fn spoken_edits_preserve_source_metadata_and_annotations_after_reopening() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("speech.db");
        {
            let mut s = Store::open(&path).unwrap();
            s.save(serde_json::json!({"meta":{"id":"b","position":9,"coverImage":"art"},"paragraphs":[{"id":"p","text":"Read this 😀."}]})).unwrap();
            s.save_annotation(
                serde_json::json!({"id":"a","bookId":"b","paragraphId":"p","text":"Keep note"}),
            )
            .unwrap();
            s.save_spoken_edits("b", "p", serde_json::json!([{"start":5,"end":9,"text":"that"},{"start":10,"end":12,"text":""}])).unwrap();
        }
        let mut s = Store::open(&path).unwrap();
        let book = s.read("b").unwrap();
        assert_eq!(book["paragraphs"][0]["text"], "Read this 😀.");
        assert_eq!(book["paragraphs"][0]["spokenEdits"][0]["text"], "that");
        assert_eq!(book["meta"]["position"], 9);
        assert_eq!(book["meta"]["coverImage"], "art");
        assert_eq!(s.annotations(Some("b")).unwrap().len(), 1);
        for edits in [
            serde_json::json!([{"start":11,"end":12,"text":"broken surrogate"}]),
            serde_json::json!([{"start":0,"end":9,"text":"a"},{"start":5,"end":10,"text":"b"}]),
            serde_json::json!([{"start":0,"end":500,"text":"too far"}]),
            serde_json::json!([{"start":0,"end":1,"text":null}]),
        ] {
            assert!(s.save_spoken_edits("b", "p", edits).is_err());
        }
        assert_eq!(
            s.read("b").unwrap()["paragraphs"][0]["spokenEdits"],
            book["paragraphs"][0]["spokenEdits"]
        );
        s.save_spoken_edits("b", "p", serde_json::json!([]))
            .unwrap();
        assert!(s.read("b").unwrap()["paragraphs"][0]
            .get("spokenEdits")
            .is_none());
    }
}
