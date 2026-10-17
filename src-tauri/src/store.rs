use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection};
use serde_json::Value;
use crate::vault::{self, Key};
use serde_json::json;
use std::collections::HashMap;
use std::path::Path;
pub type Result<T> = std::result::Result<T, String>;
pub struct Store {
    pub connection: Connection,
    // Keys of unlocked vaults. Only ever in memory; closing the app locks all.
    keys: HashMap<String, Key>,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path).map_err(|e| e.to_string())?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY, meta TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS annotations(id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS annotations_book ON annotations(book_id); CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version=1;").map_err(|e|e.to_string())?;
        connection.execute_batch("CREATE TABLE IF NOT EXISTS voice_portraits(id TEXT PRIMARY KEY, data TEXT NOT NULL);").map_err(|e| e.to_string())?;
        // Overwrite freed pages, so text moved into a vault leaves no readable
        // copy behind in the database file.
        connection.execute_batch("PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS vaults(id TEXT PRIMARY KEY, data TEXT NOT NULL);").map_err(|e| e.to_string())?;
        // Work Mode: subjects, notes, study cards and link batches. Items from a
        // vault book are sealed with that vault's key, like annotations.
        connection.execute_batch("CREATE TABLE IF NOT EXISTS work(id TEXT PRIMARY KEY, kind TEXT NOT NULL, vault TEXT, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS work_kind ON work(kind);").map_err(|e| e.to_string())?;
        Ok(Self { connection, keys: HashMap::new() })
    }
    pub fn list(&self) -> Result<Vec<Value>> {
        let mut q = self
            .connection
            .prepare("SELECT meta FROM books")
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut books = Vec::new();
        for row in rows {
            // Books in locked vaults are left out entirely.
            if let Some(meta) = self.decode_meta(&row.map_err(|e| e.to_string())?)? {
                books.push(meta);
            }
        }
        Ok(books)
    }
    pub fn starter_installed(&self) -> Result<bool> {
        self.connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM settings WHERE id='starter-library-v3-installed')",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())
    }
    pub fn install_starters(&self, books: Vec<Value>) -> Result<()> {
        self.connection
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;
        let result = (|| {
            if self.starter_installed()? {
                return Ok(());
            }
            let manifest: Value =
                serde_json::from_str(include_str!("../../assets/starter-library/manifest.json"))
                    .map_err(|e| e.to_string())?;
            let mut current = self.list()?;
            for book in books {
                let meta = &book["meta"];
                if !manifest["books"].as_array().unwrap().iter().any(|b| {
                    b["sha256"] == meta["sourceHash"]
                        && (b["id"] == meta["id"]
                            || current.iter().any(|existing| {
                                existing["id"] == meta["id"]
                                    && existing["sourceHash"] == meta["sourceHash"]
                            }))
                }) {
                    return Err("Unknown starter edition".into());
                }
                if let Some(found) = current
                    .iter_mut()
                    .find(|b| b["id"] == meta["id"] || b["sourceHash"] == meta["sourceHash"])
                {
                    if found["coverImage"].as_str().unwrap_or("").is_empty()
                        && found["deleted"] != true
                    {
                        for field in ["coverImage", "coverOrigin", "coverText"] {
                            found[field] = meta[field].clone();
                        }
                        self.save_meta(found.clone())?;
                    }
                    continue;
                }
                self.save(book.clone())?;
                current.push(meta.clone());
            }
            // Do not retire demos or mark success if any edition is missing.
            if manifest["books"].as_array().unwrap().iter().any(|edition| {
                !current
                    .iter()
                    .any(|b| b["id"] == edition["id"] || b["sourceHash"] == edition["sha256"])
            }) {
                return Err("Incomplete starter library".into());
            }
            let mut backup = Vec::new();
            for meta in current {
                let id = meta["id"].as_str().unwrap_or("");
                if !matches!(id, "sample-0" | "sample-1" | "sample-2")
                    || meta["format"] != "Sample"
                    || meta["sourceHash"] != id
                {
                    continue;
                }
                let mut book = self.read(id)?;
                book["annotations"] =
                    serde_json::to_value(self.annotations(Some(id))?).map_err(|e| e.to_string())?;
                backup.push(book);
                self.connection
                    .execute("DELETE FROM annotations WHERE book_id=?1", [id])
                    .map_err(|e| e.to_string())?;
                self.connection
                    .execute("DELETE FROM books WHERE id=?1", [id])
                    .map_err(|e| e.to_string())?;
            }
            self.connection
                .execute(
                    "INSERT INTO settings(id,data) VALUES('starter-demo-backup-v3',?1)",
                    [serde_json::to_string(&backup).map_err(|e| e.to_string())?],
                )
                .map_err(|e| e.to_string())?;
            self.connection
                .execute(
                    "INSERT INTO settings(id,data) VALUES('starter-library-v3-installed','true')",
                    [],
                )
                .map_err(|e| e.to_string())?;
            Ok(())
        })();
        match result {
            Ok(()) => self
                .connection
                .execute_batch("COMMIT")
                .map_err(|e| e.to_string()),
            Err(error) => {
                let _ = self.connection.execute_batch("ROLLBACK");
                Err(error)
            }
        }
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
        let before = self.raw_meta(id).ok();
        self.write(id, meta, &body)?;
        if let Some(before) = before {
            self.after_move(id, &before, meta)?;
        }
        Ok(())
    }
    pub fn read(&self, id: &str) -> Result<Value> {
        let meta = self.metadata(id)?;
        let body = self.body(id)?;
        Ok(
            serde_json::json!({"meta":meta,"paragraphs":serde_json::from_str::<Value>(&body).map_err(|e|e.to_string())?}),
        )
    }
    pub fn metadata(&self, id: &str) -> Result<Value> {
        let data: String = self
            .connection
            .query_row("SELECT meta FROM books WHERE id=?1", [id], |r| r.get(0))
            .map_err(|_| "Book not found")?;
        self.decode_meta(&data)?
            .ok_or_else(|| "This book is in a locked vault.".into())
    }
    pub fn save_meta(&self, meta: Value) -> Result<()> {
        let id = valid_id(&meta)?;
        let before = self.raw_meta(id)?;
        let body = self.body(id)?;
        self.write(id, &meta, &body)?;
        self.after_move(id, &before, &meta)
    }

    // --- Vaults ---------------------------------------------------------------
    fn raw_meta(&self, id: &str) -> Result<Value> {
        let data: String = self
            .connection
            .query_row("SELECT meta FROM books WHERE id=?1", [id], |r| r.get(0))
            .map_err(|_| "Book not found")?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    }
    fn key(&self, vault: &str) -> Result<&Key> {
        self.keys.get(vault).ok_or_else(|| "This vault is locked.".into())
    }
    /// Stored metadata, decrypted; None when its vault is locked.
    fn decode_meta(&self, raw: &str) -> Result<Option<Value>> {
        let stored: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
        let Some(sealed) = stored["sealed"].as_str() else {
            return Ok(Some(stored));
        };
        let id = valid_id(&stored)?;
        let vault = stored["vault"].as_str().ok_or("Damaged vault data")?;
        let Some(key) = self.keys.get(vault) else {
            return Ok(None);
        };
        let mut meta: Value =
            serde_json::from_slice(&vault::open(key, &format!("meta:{id}"), sealed)?)
                .map_err(|e| e.to_string())?;
        meta["vault"] = Value::from(vault);
        Ok(Some(meta))
    }
    /// The paragraphs JSON of a book, decrypted when it is in a vault.
    fn body(&self, id: &str) -> Result<String> {
        let (meta, body): (String, String) = self
            .connection
            .query_row("SELECT meta,body FROM books WHERE id=?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(|_| "Book not found".to_string())?;
        let stored: Value = serde_json::from_str(&meta).map_err(|e| e.to_string())?;
        match stored["vault"].as_str().filter(|_| stored["sealed"].is_string()) {
            Some(vault) => String::from_utf8(vault::open(
                self.key(vault)?,
                &format!("body:{id}"),
                &body,
            )?)
            .map_err(|e| e.to_string()),
            None => Ok(body),
        }
    }
    /// Stores a book, sealed with its vault's key when it belongs to one.
    fn write(&self, id: &str, meta: &Value, body: &str) -> Result<()> {
        let (meta, body) = match vault_of(meta) {
            Some(vault) => {
                if !self.vault_exists(vault)? {
                    return Err("That vault does not exist.".into());
                }
                let key = self.key(vault)?;
                let mut plain = meta.clone();
                if let Some(o) = plain.as_object_mut() {
                    o.remove("vault");
                }
                (
                    json!({"id":id,"vault":vault,"sealed":vault::seal(key,&format!("meta:{id}"),plain.to_string().as_bytes())?}).to_string(),
                    vault::seal(key, &format!("body:{id}"), body.as_bytes())?,
                )
            }
            None => (meta.to_string(), body.to_owned()),
        };
        self.connection.execute("INSERT INTO books(id,meta,body) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET meta=excluded.meta,body=excluded.body",params![id,meta,body]).map_err(|e|e.to_string())?;
        Ok(())
    }
    /// After a book moved into, out of or between vaults, its notes follow and
    /// the old readable copies are flushed out of the write-ahead log.
    fn after_move(&self, id: &str, before: &Value, after: &Value) -> Result<()> {
        if vault_of(before) == vault_of(after) {
            return Ok(());
        }
        for note in self.annotations(Some(id))? {
            self.save_annotation(note)?;
        }
        self.scrub()
    }
    fn scrub(&self) -> Result<()> {
        self.connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())
    }
    fn vault_exists(&self, id: &str) -> Result<bool> {
        self.connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM vaults WHERE id=?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())
    }
    fn vault_row(&self, id: &str) -> Result<Value> {
        let data: String = self
            .connection
            .query_row("SELECT data FROM vaults WHERE id=?1", [id], |r| r.get(0))
            .map_err(|_| "That vault does not exist.")?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    }
    fn vault_book_ids(&self, id: &str) -> Result<Vec<String>> {
        let mut q = self
            .connection
            .prepare("SELECT id FROM books WHERE json_extract(meta,'$.vault')=?1")
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|r| r.map_err(|e| e.to_string())).collect()
    }
    pub fn vaults(&self) -> Result<Vec<Value>> {
        let mut q = self
            .connection
            .prepare("SELECT id,data FROM vaults ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let rows: Vec<(String, String)> = q
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<std::result::Result<_, _>>()
            .map_err(|e| e.to_string())?;
        rows.into_iter()
            .map(|(id, data)| {
                let data: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
                Ok(json!({
                    "id": id,
                    "name": data["name"],
                    "unlocked": self.keys.contains_key(&id),
                    "books": self.vault_book_ids(&id)?.len(),
                }))
            })
            .collect()
    }
    pub fn create_vault(&mut self, name: &str, pin: &str) -> Result<Value> {
        let name = vault_name(name)?;
        let (salt, check, key) = vault::create(pin)?;
        let id = format!(
            "vault-{}",
            vault::random::<8>()?
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        );
        self.connection
            .execute(
                "INSERT INTO vaults(id,data) VALUES(?1,?2)",
                params![
                    id,
                    json!({"name":name,"salt":salt,"check":check}).to_string()
                ],
            )
            .map_err(|e| e.to_string())?;
        self.keys.insert(id.clone(), key);
        Ok(json!({"id":id,"name":name,"unlocked":true,"books":0}))
    }
    pub fn unlock_vault(&mut self, id: &str, pin: &str) -> Result<()> {
        let row = self.vault_row(id)?;
        let key = vault::unlock(
            pin,
            row["salt"].as_str().unwrap_or(""),
            row["check"].as_str().unwrap_or(""),
        )?;
        self.keys.insert(id.to_owned(), key);
        Ok(())
    }
    /// Locks one vault, or every vault with None.
    pub fn lock_vault(&mut self, id: Option<&str>) {
        match id {
            Some(id) => {
                self.keys.remove(id);
            }
            None => self.keys.clear(),
        }
    }
    pub fn rename_vault(&self, id: &str, name: &str) -> Result<()> {
        let name = vault_name(name)?;
        self.key(id)?;
        let mut row = self.vault_row(id)?;
        row["name"] = Value::from(name);
        self.connection
            .execute(
                "UPDATE vaults SET data=?1 WHERE id=?2",
                params![row.to_string(), id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    /// Re-encrypts everything in the vault under a key from the new PIN.
    pub fn change_vault_pin(&mut self, id: &str, current: &str, new: &str) -> Result<()> {
        vault::valid_pin(new)?;
        self.unlock_vault(id, current)?;
        let books = self
            .vault_book_ids(id)?
            .into_iter()
            .map(|b| Ok((self.metadata(&b)?, self.body(&b)?, self.annotations(Some(&b))?)))
            .collect::<Result<Vec<_>>>()?;
        let work = self.vault_work(id)?;
        let old = self.keys[id];
        let (salt, check, key) = vault::create(new)?;
        self.connection
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;
        self.keys.insert(id.to_owned(), key);
        let result = (|| {
            let mut row = self.vault_row(id)?;
            row["salt"] = Value::from(salt);
            row["check"] = Value::from(check);
            self.connection
                .execute(
                    "UPDATE vaults SET data=?1 WHERE id=?2",
                    params![row.to_string(), id],
                )
                .map_err(|e| e.to_string())?;
            for (meta, body, notes) in &books {
                self.write(valid_id(meta)?, meta, body)?;
                for note in notes {
                    self.save_annotation(note.clone())?;
                }
            }
            for item in &work {
                self.save_work(item.clone())?;
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.connection
                    .execute_batch("COMMIT")
                    .map_err(|e| e.to_string())?;
                self.scrub()
            }
            Err(e) => {
                let _ = self.connection.execute_batch("ROLLBACK");
                self.keys.insert(id.to_owned(), old);
                Err(e)
            }
        }
    }
    /// Removes a vault. Its books return to the library, readable again.
    pub fn delete_vault(&mut self, id: &str, pin: &str) -> Result<Vec<String>> {
        self.unlock_vault(id, pin)?;
        let ids = self.vault_book_ids(id)?;
        self.connection
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(|e| e.to_string())?;
        let result = (|| {
            for book in &ids {
                let mut meta = self.metadata(book)?;
                if let Some(o) = meta.as_object_mut() {
                    o.remove("vault");
                }
                self.write(book, &meta, &self.body(book)?)?;
                for note in self.annotations(Some(book))? {
                    self.save_annotation(note)?;
                }
            }
            for mut item in self.vault_work(id)? {
                if let Some(o) = item.as_object_mut() {
                    o.remove("vault");
                }
                self.save_work(item)?;
            }
            self.connection
                .execute("DELETE FROM vaults WHERE id=?1", [id])
                .map_err(|e| e.to_string())?;
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.connection
                    .execute_batch("COMMIT")
                    .map_err(|e| e.to_string())?;
                self.keys.remove(id);
                self.scrub()?;
                Ok(ids)
            }
            Err(e) => {
                let _ = self.connection.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    // --- Parental PIN ---------------------------------------------------------
    fn parental(&self) -> Result<Option<Value>> {
        match self.connection.query_row(
            "SELECT data FROM settings WHERE id='parental-pin'",
            [],
            |r| r.get::<_, String>(0),
        ) {
            Ok(s) => Ok(Some(serde_json::from_str(&s).map_err(|e| e.to_string())?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn parental_pin_set(&self) -> Result<bool> {
        Ok(self.parental()?.is_some())
    }
    /// Passes when the PIN matches, or when no parental PIN is set.
    pub fn check_parental_pin(&self, pin: &str) -> Result<()> {
        match self.parental()? {
            None => Ok(()),
            Some(row) => vault::unlock(
                pin,
                row["salt"].as_str().unwrap_or(""),
                row["check"].as_str().unwrap_or(""),
            )
            .map(|_| ()),
        }
    }
    /// Sets or changes the parental PIN, or removes it with None. Changing or
    /// removing one needs the current PIN.
    pub fn set_parental_pin(&self, current: &str, new: Option<&str>) -> Result<()> {
        if self.parental()?.is_some() {
            self.check_parental_pin(current)?;
        }
        match new {
            Some(pin) => {
                let (salt, check, _) = vault::create(pin)?;
                self.connection.execute("INSERT INTO settings(id,data) VALUES('parental-pin',?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",[json!({"salt":salt,"check":check}).to_string()]).map_err(|e|e.to_string())?;
            }
            None => {
                self.connection
                    .execute("DELETE FROM settings WHERE id='parental-pin'", [])
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    pub fn delete_trashed(&self, ids: &[String]) -> Result<()> {
        if ids.is_empty() || ids.len() > 10_000 {
            return Err("Select up to 10,000 books in Trash.".into());
        }
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        for id in ids {
            if self.metadata(id)?["deleted"].as_bool() != Some(true) {
                return Err("Only books in Trash can be permanently deleted.".into());
            }
        }
        for id in ids {
            transaction
                .execute("DELETE FROM annotations WHERE book_id=?1", [id])
                .map_err(|e| e.to_string())?;
            transaction
                .execute("DELETE FROM books WHERE id=?1", [id])
                .map_err(|e| e.to_string())?;
        }
        transaction.commit().map_err(|e| e.to_string())
    }
    pub fn purge_trash(&self, days: Option<u32>, now: u64) -> Result<Vec<String>> {
        if days.is_some_and(|d| d == 0 || d > 3650) {
            return Err("Choose between 1 and 3,650 days.".into());
        }
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let mut removed = Vec::new();
        for mut meta in self.list()? {
            if meta["deleted"] != true {
                continue;
            }
            let Some(stamp) = meta["deletedAt"].as_u64() else {
                meta["deletedAt"] = Value::from(now);
                self.save_meta(meta)?;
                continue;
            };
            if days.is_some_and(|d| now >= stamp && now - stamp >= u64::from(d) * 86_400_000) {
                let id = meta["id"]
                    .as_str()
                    .ok_or("Invalid trashed book")?
                    .to_owned();
                transaction
                    .execute("DELETE FROM annotations WHERE book_id=?1", [&id])
                    .map_err(|e| e.to_string())?;
                transaction
                    .execute("DELETE FROM books WHERE id=?1", [&id])
                    .map_err(|e| e.to_string())?;
                removed.push(id);
            }
        }
        transaction.commit().map_err(|e| e.to_string())?;
        Ok(removed)
    }
    pub fn save_spoken_edits(&mut self, book: &str, paragraph: &str, edits: Value) -> Result<()> {
        let list = edits.as_array().ok_or("Invalid spoken edits")?;
        if list.len() > 1000 || edits.to_string().len() > 1024 * 1024 {
            return Err("Spoken edits are too large".into());
        }
        let meta = self.metadata(book)?;
        let body = self.body(book)?;
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
        self.write(book, &meta, &body)
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
        let mut notes = Vec::new();
        for row in rows {
            let stored: Value = serde_json::from_str(&row.map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            match (stored["sealed"].as_str(), stored["vault"].as_str()) {
                (Some(sealed), Some(vault)) => {
                    // Notes in locked vaults are left out.
                    if let Some(key) = self.keys.get(vault) {
                        let id = valid_id(&stored)?;
                        notes.push(
                            serde_json::from_slice(&vault::open(
                                key,
                                &format!("note:{id}"),
                                sealed,
                            )?)
                            .map_err(|e| e.to_string())?,
                        );
                    }
                }
                _ => notes.push(stored),
            }
        }
        Ok(notes)
    }
    pub fn save_annotation(&self, a: Value) -> Result<()> {
        let id = valid_id(&a)?;
        let book = a["bookId"].as_str().ok_or("Missing book")?;
        if a.to_string().len() > 128 * 1024 {
            return Err("Annotation is too large".into());
        }
        let data = match self.raw_meta(book).ok().as_ref().and_then(vault_of) {
            Some(vault) => json!({"id":id,"bookId":book,"vault":vault,"sealed":vault::seal(self.key(vault)?,&format!("note:{id}"),a.to_string().as_bytes())?}).to_string(),
            None => a.to_string(),
        };
        self.connection.execute("INSERT INTO annotations(id,book_id,data) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![id,book,data]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn delete_annotation(&self, id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM annotations WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    // --- Work Mode -------------------------------------------------------------
    /// Work items, optionally of one kind. Items in locked vaults are left out.
    pub fn work(&self, kind: Option<&str>) -> Result<Vec<Value>> {
        let mut q = self
            .connection
            // Note history and voice recordings are loaded on demand only.
            .prepare("SELECT data FROM work WHERE (?1 IS NULL AND kind NOT IN ('version','audio')) OR kind=?1 ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([kind], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        for row in rows {
            if let Some(item) = self.decode_work(&row.map_err(|e| e.to_string())?)? {
                items.push(item);
            }
        }
        Ok(items)
    }
    /// One item by id (a voice recording, for example), if it is readable.
    pub fn work_item(&self, id: &str) -> Result<Option<Value>> {
        let raw: Option<String> = self
            .connection
            .query_row("SELECT data FROM work WHERE id=?1", [id], |r| r.get(0))
            .ok();
        match raw {
            Some(raw) => self.decode_work(&raw),
            None => Ok(None),
        }
    }
    fn decode_work(&self, raw: &str) -> Result<Option<Value>> {
        let stored: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
        match (stored["sealed"].as_str(), stored["vault"].as_str()) {
            (Some(sealed), Some(vault)) => match self.keys.get(vault) {
                Some(key) => {
                    let id = valid_id(&stored)?;
                    let plain = vault::open(key, &format!("work:{id}"), sealed)?;
                    Ok(Some(serde_json::from_slice(&plain).map_err(|e| e.to_string())?))
                }
                None => Ok(None),
            },
            _ => Ok(Some(stored)),
        }
    }
    /// Every item sealed in one vault, decrypted. The vault must be unlocked.
    fn vault_work(&self, vault: &str) -> Result<Vec<Value>> {
        let mut q = self
            .connection
            .prepare("SELECT data FROM work WHERE vault=?1")
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([vault], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        for row in rows {
            items.extend(self.decode_work(&row.map_err(|e| e.to_string())?)?);
        }
        Ok(items)
    }
    pub fn save_work(&self, item: Value) -> Result<()> {
        let id = valid_id(&item)?;
        let kind = item["kind"].as_str().ok_or("Missing kind")?;
        if !matches!(
            kind,
            "subject" | "note" | "card" | "batch" | "hidden" | "vector" | "log" | "meta" | "sheet" | "chart" | "version" | "board" | "sticky" | "workspace" | "plan" | "picture" | "audio"
        ) {
            return Err("Unknown work item".into());
        }
        // Spreadsheets and boards can hold far more than a note.
        let big = matches!(kind, "sheet" | "board" | "plan" | "picture" | "audio");
        let limit = if big { 48 } else { 4 } * 1024 * 1024;
        if item.to_string().len() > limit {
            return Err(if big {
                "This document is too large to save (48 MB).".into()
            } else {
                "This note is too large".into()
            });
        }
        let vault = vault_of(&item).map(str::to_owned);
        let data = match &vault {
            Some(v) => json!({"id":id,"kind":kind,"vault":v,"sealed":vault::seal(self.key(v)?,&format!("work:{id}"),item.to_string().as_bytes())?}).to_string(),
            None => item.to_string(),
        };
        self.connection
            .execute(
                "INSERT INTO work(id,kind,vault,data) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,vault=excluded.vault,data=excluded.data",
                params![id, kind, vault, data],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    /// Earlier versions of one note, newest first (not loaded with the rest
    /// of Work mode; versions in locked vaults are left out).
    pub fn versions(&self, note: &str) -> Result<Vec<Value>> {
        let mut out: Vec<Value> = self.work(Some("version"))?.into_iter().filter(|v| v["note"] == note).collect();
        out.sort_by(|a, b| b["saved"].as_f64().unwrap_or(0.0).total_cmp(&a["saved"].as_f64().unwrap_or(0.0)));
        Ok(out)
    }
    /// Keeps the newest `keep` versions of a note, or none (the note was deleted).
    /// Versions in locked vaults cannot be read, so they are only removed when
    /// the note itself goes (`keep` 0), by id prefix.
    pub fn prune_versions(&self, note: &str, keep: usize) -> Result<usize> {
        let ids: Vec<String> = if keep == 0 {
            let mut q = self
                .connection
                .prepare("SELECT id FROM work WHERE kind='version' AND id LIKE ?1")
                .map_err(|e| e.to_string())?;
            let rows = q.query_map([format!("v:{note}:%")], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
            rows.collect::<std::result::Result<_, _>>().map_err(|e| e.to_string())?
        } else {
            self.versions(note)?.iter().skip(keep).filter_map(|v| v["id"].as_str().map(str::to_owned)).collect()
        };
        self.delete_work(&ids)?;
        Ok(ids.len())
    }
    pub fn delete_work(&self, ids: &[String]) -> Result<()> {
        for id in ids {
            self.connection
                .execute("DELETE FROM work WHERE id=?1", [id])
                .map_err(|e| e.to_string())?;
        }
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
    pub fn voice_portraits(&self) -> Result<std::collections::HashMap<String, Value>> {
        let mut q = self
            .connection
            .prepare("SELECT id,data FROM voice_portraits")
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            let (id, data) = r.map_err(|e| e.to_string())?;
            Ok((id, serde_json::from_str(&data).map_err(|e| e.to_string())?))
        })
        .collect()
    }
    pub fn save_voice_portrait(
        &self,
        id: &str,
        portrait: &str,
        prompt: &str,
        origin: &str,
    ) -> Result<()> {
        if id.is_empty()
            || id.len() > 128
            || prompt.chars().count() > 1400
            || !matches!(origin, "generated" | "custom")
        {
            return Err("Invalid voice portrait metadata".into());
        }
        if portrait.len() > 512 * 1024 {
            return Err("Voice portrait exceeds image budget".into());
        }
        let data = portrait
            .strip_prefix("data:image/webp;base64,")
            .ok_or("Use a decoded WebP portrait")?;
        let pixels = STANDARD
            .decode(data)
            .map_err(|_| "Invalid portrait encoding")?;
        if pixels.len() < 16 || &pixels[0..4] != b"RIFF" || &pixels[8..12] != b"WEBP" {
            return Err("Invalid portrait image".into());
        }
        let value = serde_json::json!({"portrait":portrait,"portraitPrompt":prompt,"portraitOrigin":origin});
        self.connection.execute("INSERT INTO voice_portraits(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", params![id, value.to_string()]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn delete_voice_portrait(&self, id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM voice_portraits WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
fn vault_of(meta: &Value) -> Option<&str> {
    meta["vault"].as_str().filter(|v| !v.is_empty())
}
fn vault_name(name: &str) -> Result<&str> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 {
        return Err("Use a vault name of 1 to 64 characters.".into());
    }
    Ok(name)
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
    fn timed_purge_keeps_indefinite_active_and_legacy_entries_and_removes_expired_notes() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(&d.path().join("purge.db")).unwrap();
        let now = 100 * 86_400_000u64;
        for (id, deleted, stamp) in [
            ("old", true, Some(now - 7 * 86_400_000)),
            ("recent", true, Some(now - 86_400_000)),
            ("legacy", true, None),
            ("active", false, Some(0)),
            ("future", true, Some(now + 86_400_000)),
        ] {
            let mut meta = serde_json::json!({"id":id,"deleted":deleted});
            if let Some(stamp) = stamp {
                meta["deletedAt"] = Value::from(stamp)
            };
            s.save(serde_json::json!({"meta":meta,"paragraphs":[{"id":"p","text":"Text"}]}))
                .unwrap();
        }
        s.save_annotation(serde_json::json!({"id":"expired-note","bookId":"old"}))
            .unwrap();
        assert!(s.purge_trash(None, now).unwrap().is_empty());
        assert_eq!(s.metadata("legacy").unwrap()["deletedAt"], now);
        assert!(s.purge_trash(Some(0), now).is_err());
        assert_eq!(s.purge_trash(Some(7), now).unwrap(), vec!["old"]);
        assert!(s.annotations(None).unwrap().is_empty());
        for id in ["recent", "legacy", "active", "future"] {
            assert!(s.read(id).is_ok());
        }
    }
    #[test]
    fn permanent_deletion_requires_trash_removes_annotations_and_preserves_exports() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(&d.path().join("delete.db")).unwrap();
        let export = d.path().join("my-audio.wav");
        std::fs::write(&export, b"user-owned export").unwrap();
        for (id, deleted) in [("trash", true), ("active", false)] {
            s.save(serde_json::json!({"meta":{"id":id,"deleted":deleted},"paragraphs":[{"id":"p-0","text":"Text"}]})).unwrap();
        }
        s.save_annotation(serde_json::json!({"id":"note","bookId":"trash","text":"Remove me"}))
            .unwrap();
        assert!(s
            .delete_trashed(&["trash".into(), "active".into()])
            .is_err());
        assert!(s.read("trash").is_ok());
        assert_eq!(s.annotations(None).unwrap().len(), 1);
        s.delete_trashed(&["trash".into()]).unwrap();
        assert!(s.read("trash").is_err());
        assert!(s.annotations(None).unwrap().is_empty());
        assert!(s.read("active").is_ok());
        assert_eq!(std::fs::read(export).unwrap(), b"user-owned export");
    }
    fn starter_fixtures() -> Vec<Value> {
        let manifest: Value =
            serde_json::from_str(include_str!("../../assets/starter-library/manifest.json"))
                .unwrap();
        manifest["books"].as_array().unwrap().iter().map(|b| serde_json::json!({
            "meta":{"id":b["id"],"sourceHash":b["sha256"],"title":b["title"],"coverImage":"bundled-art","deleted":false},
            "paragraphs":[{"id":"p-0","text":"Fixture text"}]
        })).collect()
    }
    #[test]
    fn starter_migration_is_atomic_preserves_user_data_and_does_not_repeat() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("starter.db");
        let s = Store::open(&path).unwrap();
        let demo = serde_json::json!({"meta":{"id":"sample-0","sourceHash":"sample-0","format":"Sample"},"paragraphs":[{"id":"p-0","text":"Demo"}]});
        s.save(demo.clone()).unwrap();
        s.save_annotation(
            serde_json::json!({"id":"note-demo","bookId":"sample-0","text":"Keep in backup"}),
        )
        .unwrap();
        s.save(serde_json::json!({"meta":{"id":"user-book","sourceHash":"user-hash"},"paragraphs":[{"id":"p-0","text":"User text"}]})).unwrap();
        s.save_settings(serde_json::json!({"theme":"forest"}))
            .unwrap();
        let mut invalid = starter_fixtures();
        invalid.last_mut().unwrap()["paragraphs"] = serde_json::json!([]);
        assert!(s.install_starters(invalid).is_err());
        assert!(!s.starter_installed().unwrap());
        assert_eq!(s.list().unwrap().len(), 2);
        assert_eq!(s.read("sample-0").unwrap(), demo);
        let mut existing = starter_fixtures().remove(0);
        existing["meta"]["id"] = Value::from("imported-copy");
        existing["meta"]["coverImage"] = Value::from("my-art");
        existing["meta"]["position"] = Value::from(9);
        s.save(existing.clone()).unwrap();
        s.install_starters(starter_fixtures()).unwrap();
        assert!(s.starter_installed().unwrap());
        assert_eq!(s.list().unwrap().len(), 7);
        assert_eq!(s.read("imported-copy").unwrap(), existing);
        assert!(s.read("user-book").is_ok());
        assert_eq!(s.settings().unwrap()["theme"], "forest");
        let backup: String = s
            .connection
            .query_row(
                "SELECT data FROM settings WHERE id='starter-demo-backup-v3'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let backup: Value = serde_json::from_str(&backup).unwrap();
        assert_eq!(backup[0]["annotations"][0]["text"], "Keep in backup");
        s.connection
            .execute("DELETE FROM books WHERE id='starter-moonstone'", [])
            .unwrap();
        drop(s);
        let s = Store::open(&path).unwrap();
        s.install_starters(starter_fixtures()).unwrap();
        assert!(s.read("starter-moonstone").is_err());
    }
    #[test]
    fn voice_art_is_separate_from_books_persists_and_rejects_active_content() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("art.db");
        let data = format!(
            "data:image/webp;base64,{}",
            STANDARD.encode(b"RIFF\x08\x00\x00\x00WEBPVP8 ")
        );
        {
            let s = Store::open(&path).unwrap();
            s.save_voice_portrait("voice", &data, "Warm portrait", "generated")
                .unwrap();
            for invalid in [
                "https://example.com/portrait.png",
                "data:image/svg+xml;base64,PHN2Zz4=",
                "data:image/webp;base64,bm90IGFuIGltYWdl",
            ] {
                assert!(s
                    .save_voice_portrait("voice", invalid, "", "custom")
                    .is_err());
            }
            assert!(s
                .save_voice_portrait("voice", &"x".repeat(512 * 1024 + 1), "", "custom")
                .is_err());
        }
        let s = Store::open(&path).unwrap();
        assert_eq!(s.voice_portraits().unwrap()["voice"]["portrait"], data);
        assert!(s.list().unwrap().is_empty());
    }
    #[test]
    fn work_items_round_trip_and_vault_cards_stay_sealed() {
        let d = tempfile::tempdir().unwrap();
        let mut s = Store::open(&d.path().join("work.db")).unwrap();
        s.save_work(serde_json::json!({"id":"n1","kind":"note","title":"Cells","body":"Plain"}))
            .unwrap();
        assert!(s.save_work(serde_json::json!({"id":"x","kind":"script"})).is_err());
        let v = s.create_vault("Study", "1234").unwrap();
        let id = v["id"].as_str().unwrap().to_owned();
        s.save_work(serde_json::json!({"id":"c1","kind":"card","vault":id,"front":"Secret question"}))
            .unwrap();
        let raw: String = s
            .connection
            .query_row("SELECT data FROM work WHERE id='c1'", [], |r| r.get(0))
            .unwrap();
        assert!(!raw.contains("Secret"));
        assert_eq!(s.work(Some("card")).unwrap()[0]["front"], "Secret question");
        s.lock_vault(None);
        assert!(s.work(Some("card")).unwrap().is_empty());
        assert_eq!(s.work(None).unwrap().len(), 1);
        assert!(s
            .save_work(serde_json::json!({"id":"c2","kind":"card","vault":id}))
            .is_err());
        s.change_vault_pin(&id, "1234", "5678").unwrap();
        assert_eq!(s.work(Some("card")).unwrap()[0]["front"], "Secret question");
        s.delete_vault(&id, "5678").unwrap();
        let raw: String = s
            .connection
            .query_row("SELECT data FROM work WHERE id='c1'", [], |r| r.get(0))
            .unwrap();
        assert!(raw.contains("Secret question"));
        s.delete_work(&["n1".into(), "c1".into()]).unwrap();
        assert!(s.work(None).unwrap().is_empty());
    }
    #[test]
    fn note_versions_stay_out_of_the_main_list_and_are_pruned() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(&d.path().join("versions.db")).unwrap();
        s.save_work(serde_json::json!({"id":"n1","kind":"note","html":"<p>now</p>"})).unwrap();
        for i in 0..5 {
            s.save_work(serde_json::json!({"id":format!("v:n1:{i}"),"kind":"version","note":"n1","html":format!("<p>{i}</p>"),"saved":i}))
                .unwrap();
        }
        s.save_work(serde_json::json!({"id":"v:n2:0","kind":"version","note":"n2","html":"x","saved":1})).unwrap();
        assert_eq!(s.work(None).unwrap().len(), 1);
        let list = s.versions("n1").unwrap();
        assert_eq!(list.len(), 5);
        assert_eq!(list[0]["saved"], 4);
        assert_eq!(s.prune_versions("n1", 3).unwrap(), 2);
        assert_eq!(s.versions("n1").unwrap().iter().map(|v| v["saved"].as_i64().unwrap()).collect::<Vec<_>>(), vec![4, 3, 2]);
        assert_eq!(s.prune_versions("n1", 0).unwrap(), 3);
        assert_eq!(s.versions("n2").unwrap().len(), 1);
    }
    #[test]
    fn vault_books_are_encrypted_hidden_when_locked_and_released_on_delete() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("vault.db");
        let mut s = Store::open(&path).unwrap();
        s.save(serde_json::json!({"meta":{"id":"b","title":"Private Title","collection":"Unsorted"},"paragraphs":[{"id":"p","text":"Secret words"}]})).unwrap();
        s.save_annotation(serde_json::json!({"id":"n","bookId":"b","text":"Hidden note"}))
            .unwrap();
        let v = s.create_vault("Grown-ups", "1234").unwrap();
        let id = v["id"].as_str().unwrap().to_owned();
        let mut meta = s.metadata("b").unwrap();
        meta["vault"] = Value::from(id.as_str());
        s.save_meta(meta).unwrap();
        let raw: (String, String) = s
            .connection
            .query_row("SELECT meta,body FROM books WHERE id='b'", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        let note: String = s
            .connection
            .query_row("SELECT data FROM annotations WHERE id='n'", [], |r| r.get(0))
            .unwrap();
        for text in [&raw.0, &raw.1, &note] {
            assert!(!text.contains("Private") && !text.contains("Secret") && !text.contains("Hidden"));
        }
        assert_eq!(s.read("b").unwrap()["paragraphs"][0]["text"], "Secret words");
        s.save_spoken_edits("b", "p", serde_json::json!([{"start":0,"end":6,"text":"Quiet"}]))
            .unwrap();
        s.lock_vault(None);
        assert!(s.list().unwrap().is_empty());
        assert!(s.annotations(None).unwrap().is_empty());
        assert!(s.read("b").is_err());
        assert!(s.unlock_vault(&id, "0000").is_err());
        s.change_vault_pin(&id, "1234", "987654").unwrap();
        s.lock_vault(None);
        assert!(s.unlock_vault(&id, "1234").is_err());
        s.unlock_vault(&id, "987654").unwrap();
        assert_eq!(s.annotations(None).unwrap()[0]["text"], "Hidden note");
        assert_eq!(s.delete_vault(&id, "987654").unwrap(), vec!["b"]);
        drop(s);
        let s = Store::open(&path).unwrap();
        let book = s.read("b").unwrap();
        assert_eq!(book["meta"]["title"], "Private Title");
        assert!(book["meta"].get("vault").is_none());
        assert_eq!(book["paragraphs"][0]["spokenEdits"][0]["text"], "Quiet");
        assert!(s.vaults().unwrap().is_empty());
    }
    #[test]
    fn parental_pin_guards_changes() {
        let s = Store::open(Path::new(":memory:")).unwrap();
        assert!(s.check_parental_pin("").is_ok());
        s.set_parental_pin("", Some("4321")).unwrap();
        assert!(s.parental_pin_set().unwrap());
        assert!(s.check_parental_pin("1111").is_err());
        assert!(s.set_parental_pin("1111", None).is_err());
        s.set_parental_pin("4321", None).unwrap();
        assert!(!s.parental_pin_set().unwrap());
    }
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
