// Portable productions: one file (a zip archive) holding a production with its
// takes, its book and the designed voices it uses, so the work can continue on
// another computer. Opening one treats everything in it as data: names are
// checked, sizes are bounded and nothing in it is run.
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

pub type Result<T> = std::result::Result<T, String>;

pub const FORMAT: &str = "origami-production";
pub const EXTENSION: &str = "origami-production";
const VERSION: u64 = 1;
const MAX_JSON: u64 = 256 << 20;
const MAX_AUDIO: u64 = 512 << 20;

/// A designed voice the production uses: its id, its profile and its reference audio.
pub struct VoiceFile {
    pub id: String,
    pub profile: Value,
    pub audio: PathBuf,
}

fn take_name_ok(name: &str) -> bool {
    (name.ends_with(".flac") || name.ends_with(".wav")) && !name.contains(['/', '\\', ':']) && !name.contains("..") && name.len() < 200
}

fn bed_name_ok(name: &str) -> bool {
    ["bed.mp3", "bed.m4a", "bed.wav", "bed.flac", "bed.ogg"].contains(&name)
}

pub fn voice_id_ok(id: &str) -> bool {
    id.starts_with("designed-vd-") && id.len() < 100 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}

/// Writes the archive next to its final name, then moves it into place.
pub fn write(out: &Path, production: &Value, book: Option<&Value>, voices: &[VoiceFile], takes_dir: &Path, progress: &dyn Fn(f64)) -> Result<()> {
    let part = out.with_extension("part");
    let result = (|| -> Result<()> {
        let file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let deflated = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).large_file(true);
        let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored).large_file(true);
        let put = |zip: &mut zip::ZipWriter<std::fs::File>, name: &str, data: &[u8]| -> Result<()> {
            zip.start_file(name, deflated).map_err(|e| e.to_string())?;
            zip.write_all(data).map_err(|e| e.to_string())
        };
        let created = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        let manifest = json!({ "format": FORMAT, "version": VERSION, "created": created, "app": env!("CARGO_PKG_VERSION") });
        put(&mut zip, "manifest.json", manifest.to_string().as_bytes())?;
        put(&mut zip, "production.json", production.to_string().as_bytes())?;
        if let Some(b) = book {
            put(&mut zip, "book.json", b.to_string().as_bytes())?;
        }
        for v in voices {
            // The reference path is this computer's; the importer sets its own.
            let mut profile = v.profile.clone();
            if let Some(o) = profile.as_object_mut() {
                o.remove("reference");
            }
            put(&mut zip, &format!("voices/{}.json", v.id), profile.to_string().as_bytes())?;
            zip.start_file(format!("voices/{}.wav", v.id), stored).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&v.audio).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        }
        let files: Vec<String> = production["takes"]
            .as_array()
            .map(|a| a.iter().filter_map(|t| t["file"].as_str()).filter(|f| take_name_ok(f)).map(str::to_string).collect())
            .unwrap_or_default();
        // The background sound sits next to the takes folder.
        if let Some(bed) = production["info"]["bed"]["file"].as_str().filter(|f| bed_name_ok(f)) {
            if let Some(Ok(mut f)) = takes_dir.parent().map(|d| std::fs::File::open(d.join(bed))) {
                zip.start_file(format!("bed/{bed}"), stored).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
            }
        }
        let total = files.len().max(1) as f64;
        for (i, name) in files.iter().enumerate() {
            let path = takes_dir.join(name);
            let Ok(mut f) = std::fs::File::open(&path) else { continue };
            zip.start_file(format!("takes/{name}"), stored).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
            if i % 50 == 0 {
                progress(i as f64 / total);
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    })();
    match result {
        Ok(()) => {
            if out.exists() {
                std::fs::remove_file(out).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&part, out).map_err(|e| e.to_string())
        }
        Err(e) => {
            let _ = std::fs::remove_file(&part);
            Err(e)
        }
    }
}

fn read_json(zip: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Result<Option<Value>> {
    let Ok(entry) = zip.by_name(name) else { return Ok(None) };
    if entry.size() > MAX_JSON {
        return Err("This portable production is damaged.".into());
    }
    let mut text = String::new();
    entry.take(MAX_JSON).read_to_string(&mut text).map_err(|_| "This portable production is damaged.")?;
    serde_json::from_str(&text).map(Some).map_err(|_| "This portable production is damaged.".into())
}

/// What an archive holds, read and checked before anything is written.
pub struct Opened {
    pub zip: zip::ZipArchive<std::fs::File>,
    pub production: Value,
    pub book: Option<Value>,
}

pub fn open(path: &Path) -> Result<Opened> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "This is not a portable production.")?;
    let manifest = read_json(&mut zip, "manifest.json")?.ok_or("This is not a portable production.")?;
    if manifest["format"] != FORMAT {
        return Err("This is not a portable production.".into());
    }
    if manifest["version"].as_u64().unwrap_or(0) > VERSION {
        return Err("This portable production was made by a newer Origami. Update Origami to open it.".into());
    }
    let production = read_json(&mut zip, "production.json")?.ok_or("This portable production is damaged.")?;
    if !production["info"].is_object() || !production["units"].is_array() {
        return Err("This portable production is damaged.".into());
    }
    let book = read_json(&mut zip, "book.json")?.filter(|b| b["id"].is_string());
    Ok(Opened { zip, production, book })
}

/// Copies the take files into a production's takes folder. Only plain take names
/// are accepted; anything else in the archive is ignored.
pub fn extract_takes(zip: &mut zip::ZipArchive<std::fs::File>, takes_dir: &Path, progress: &dyn Fn(f64)) -> Result<usize> {
    std::fs::create_dir_all(takes_dir).map_err(|e| e.to_string())?;
    let total = zip.len().max(1) as f64;
    let mut count = 0;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        // The background sound goes next to the takes folder.
        if let Some(bed) = entry.name().strip_prefix("bed/").map(str::to_string) {
            if bed_name_ok(&bed) && entry.size() <= MAX_AUDIO {
                if let Some(dir) = takes_dir.parent() {
                    let mut out = std::fs::File::create(dir.join(&bed)).map_err(|e| e.to_string())?;
                    std::io::copy(&mut (&mut entry).take(MAX_AUDIO), &mut out).map_err(|e| e.to_string())?;
                }
            }
            continue;
        }
        let Some(name) = entry.name().strip_prefix("takes/").map(str::to_string) else { continue };
        if !take_name_ok(&name) || entry.size() > MAX_AUDIO {
            continue;
        }
        let mut out = std::fs::File::create(takes_dir.join(&name)).map_err(|e| e.to_string())?;
        std::io::copy(&mut (&mut entry).take(MAX_AUDIO), &mut out).map_err(|e| e.to_string())?;
        count += 1;
        if i % 50 == 0 {
            progress(i as f64 / total);
        }
    }
    Ok(count)
}

/// Adds the archive's designed voices that this computer does not have yet.
/// Returns the ids added.
pub fn extract_voices(zip: &mut zip::ZipArchive<std::fs::File>, root: &Path) -> Result<Vec<String>> {
    let ids: Vec<String> = zip
        .file_names()
        .filter_map(|n| n.strip_prefix("voices/").and_then(|n| n.strip_suffix(".json")))
        .filter(|id| voice_id_ok(id))
        .map(str::to_string)
        .collect();
    let mut added = Vec::new();
    for id in ids {
        if root.join(format!("{id}.json")).exists() {
            continue;
        }
        let Some(mut profile) = read_json(zip, &format!("voices/{id}.json"))? else { continue };
        let mut audio = Vec::new();
        {
            let Ok(entry) = zip.by_name(&format!("voices/{id}.wav")) else { continue };
            if entry.size() > 16 << 20 {
                continue;
            }
            entry.take(16 << 20).read_to_end(&mut audio).map_err(|e| e.to_string())?;
        }
        if audio.get(..4) != Some(b"RIFF") || audio.get(8..12) != Some(b"WAVE") || !profile.is_object() {
            continue;
        }
        std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
        let wav = root.join(format!("{id}.wav"));
        std::fs::write(&wav, &audio).map_err(|e| e.to_string())?;
        profile["reference"] = json!(wav);
        std::fs::write(root.join(format!("{id}.json")), serde_json::to_vec_pretty(&profile).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        added.push(id);
    }
    Ok(added)
}

/// Every voice id a production uses: the narrator, each line's and each character's.
pub fn voices_used(production: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut add = |v: Option<&str>| {
        if let Some(v) = v.filter(|v| !v.is_empty()) {
            if !out.iter().any(|x| x == v) {
                out.push(v.to_string());
            }
        }
    };
    add(production["info"]["voice"].as_str());
    for c in production["info"]["cast"].as_array().into_iter().flatten() {
        add(c["voice"].as_str());
    }
    for u in production["units"].as_array().into_iter().flatten() {
        add(u["voice"].as_str());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_production_travels_and_stays_in_its_folders() {
        let dir = std::env::temp_dir().join(format!("origami-archive-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let takes = dir.join("takes");
        std::fs::create_dir_all(&takes).unwrap();
        std::fs::write(takes.join("t1.flac"), b"fLaC audio").unwrap();
        std::fs::write(dir.join("bed.mp3"), b"ID3 rain").unwrap();
        let voices = dir.join("voices-src");
        std::fs::create_dir_all(&voices).unwrap();
        std::fs::write(voices.join("v.wav"), b"RIFF0000WAVEdata").unwrap();
        let production = json!({
            "info": { "id": "prod-1", "voice": "designed-vd-abc", "cast": [{ "voice": "kit-amber" }], "bed": { "file": "bed.mp3" } },
            "units": [{ "id": "u1", "take": "t1", "voice": "designed-vd-abc" }],
            "takes": [{ "id": "t1", "unit": "u1", "file": "t1.flac" }, { "id": "t2", "unit": "u1", "file": "../evil.flac" }],
        });
        let book = json!({ "id": "book-1", "paragraphs": [] });
        let archive = dir.join("p.origami-production");
        let v = VoiceFile { id: "designed-vd-abc".into(), profile: json!({ "name": "Amber", "reference": "C:/somewhere/v.wav" }), audio: voices.join("v.wav") };
        write(&archive, &production, Some(&book), &[v], &takes, &|_| {}).unwrap();
        assert_eq!(voices_used(&production), vec!["designed-vd-abc", "kit-amber"]);

        let mut opened = open(&archive).unwrap();
        assert_eq!(opened.production["info"]["id"], "prod-1");
        assert_eq!(opened.book.as_ref().unwrap()["id"], "book-1");
        let out = dir.join("restored").join("takes");
        assert_eq!(extract_takes(&mut opened.zip, &out, &|_| {}).unwrap(), 1);
        assert_eq!(std::fs::read(dir.join("restored").join("bed.mp3")).unwrap(), b"ID3 rain");
        assert_eq!(std::fs::read(out.join("t1.flac")).unwrap(), b"fLaC audio");
        let root = dir.join("CreatedVoices");
        assert_eq!(extract_voices(&mut opened.zip, &root).unwrap(), vec!["designed-vd-abc"]);
        let profile: Value = serde_json::from_slice(&std::fs::read(root.join("designed-vd-abc.json")).unwrap()).unwrap();
        assert_eq!(profile["name"], "Amber");
        assert!(profile["reference"].as_str().unwrap().ends_with("designed-vd-abc.wav"));
        // A second open adds nothing new.
        assert!(extract_voices(&mut open(&archive).unwrap().zip, &root).unwrap().is_empty());
        assert!(!dir.join("evil.flac").exists());

        std::fs::write(dir.join("other.zip"), b"PK not really").unwrap();
        assert!(open(&dir.join("other.zip")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
