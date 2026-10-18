// Studio book exports: an EPUB 3 ebook and a print PDF typeset by Typst
// (embedded as a library, docs/STUDIO-PHASE0.md section 6). The manuscript
// arrives as data and is only ever placed as text: the Typst template reads
// it with json() and never evaluates it, and EPUB text is XML-escaped.
// Both carry the "Made with Origami Studio" mark on the copyright page.
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;

pub type Result<T> = std::result::Result<T, String>;

/// The current UTC date and time as (year, month, day, hour, minute, second).
fn civil_now() -> (i32, u8, u8, u8, u8, u8) {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let z = (secs / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u8;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u8;
    let y = (yoe + era * 400 + if m <= 2 { 1 } else { 0 }) as i32;
    (y, m, d, ((secs % 86_400) / 3600) as u8, ((secs % 3600) / 60) as u8, (secs % 60) as u8)
}

// --- The manuscript, as sent by the page ---------------------------------------------------

#[derive(Deserialize, Clone, Debug)]
pub struct Manuscript {
    pub title: String,
    pub author: String,
    pub lang: String,
    pub chapters: Vec<ChapterIn>,
    #[serde(default)]
    pub rights: Vec<String>,
    // The AI narration line, when the book also has an audiobook.
    #[serde(default)]
    pub ai: String,
    #[serde(default)]
    pub first_published: String,
    // Front and back matter, all optional.
    #[serde(default)]
    pub dedication: String,
    #[serde(default)]
    pub epigraph: String,
    #[serde(default)]
    pub epigraph_by: String,
    #[serde(default)]
    pub acknowledgements: String,
    #[serde(default)]
    pub about: String,
    #[serde(default)]
    pub also_by: Vec<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct ChapterIn {
    pub title: Option<String>,
    pub blocks: Vec<BlockIn>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct BlockIn {
    pub text: String,
    #[serde(default)]
    pub quote: bool,
    #[serde(default)]
    pub center: bool,
}

/// A scene break written as a line of asterisks or similar marks.
fn is_scene_break(t: &str) -> bool {
    let t = t.trim();
    !t.is_empty() && t.chars().count() <= 12 && t.chars().all(|c| matches!(c, '*' | '#' | '~' | '-' | '\u{2022}' | '\u{2042}' | ' ' | '\u{a0}'))
}

// --- French typography (before Typst and EPUB) ------------------------------------------------

const NNBSP: char = '\u{202F}';
const NBSP: char = '\u{00A0}';

fn is_space(c: char) -> bool {
    matches!(c, ' ' | NBSP | NNBSP | '\u{2009}' | '\u{2007}')
}

/// No-break spaces before ; ! ? : and inside guillemets, a tied dialogue dash,
/// tied honorifics and the oe ligature words. `narrow` picks U+202F for the
/// thin spaces (print) or U+00A0 (ebooks, whose fonts may lack U+202F).
pub fn french(text: &str, narrow: bool) -> String {
    let thin = if narrow { NNBSP } else { NBSP };
    let src: Vec<char> = text.chars().collect();
    let mut out: Vec<char> = Vec::with_capacity(src.len() + 16);
    for i in 0..src.len() {
        let c = src[i];
        match c {
            ';' | '!' | '?' => {
                while out.last().is_some_and(|&p| is_space(p)) {
                    out.pop();
                }
                if out.last().is_some_and(|&p| !matches!(p, '!' | '?' | '(' | '[' | '\u{AB}')) {
                    out.push(thin);
                }
                out.push(c);
            }
            ':' => {
                let digits = i > 0 && src[i - 1].is_ascii_digit() && src.get(i + 1).is_some_and(|n| n.is_ascii_digit());
                let url = src.get(i + 1) == Some(&'/');
                if digits || url {
                    out.push(c);
                    continue;
                }
                while out.last().is_some_and(|&p| is_space(p)) {
                    out.pop();
                }
                if out.last().is_some_and(|&p| p != '(') {
                    out.push(NBSP);
                }
                out.push(c);
            }
            '\u{BB}' => {
                while out.last().is_some_and(|&p| is_space(p)) {
                    out.pop();
                }
                if out.last().is_some_and(|&p| p != '\u{AB}') {
                    out.push(thin);
                }
                out.push(c);
            }
            _ if is_space(c) => {
                if out.last().is_some_and(|&p| p == '\u{AB}' || is_space(p)) {
                    continue;
                }
                out.push(c);
            }
            '\u{AB}' => {
                out.push(c);
                if src[i + 1..].iter().find(|&&n| !is_space(n)).is_some_and(|&n| n != '\u{BB}') {
                    out.push(thin);
                }
            }
            _ => out.push(c),
        }
    }
    if out.len() > 2 && matches!(out[0], '\u{2014}' | '\u{2013}') && is_space(out[1]) {
        out[1] = NBSP;
    }
    for a in ["M.", "MM.", "Mme", "Mmes", "Mlle", "Mlles", "Mgr"] {
        let a: Vec<char> = a.chars().collect();
        for i in a.len()..out.len() {
            if out[i] == ' ' && out[i - a.len()..i] == a[..] && (i == a.len() || !out[i - a.len() - 1].is_alphanumeric()) && out.get(i + 1).is_some_and(|c| c.is_alphanumeric()) {
                out[i] = NBSP;
            }
        }
    }
    let s: String = out.into_iter().collect();
    if !s.contains("oe") && !s.contains("Oe") {
        return s;
    }
    s.replace("oeu", "\u{153}u").replace("oeil", "\u{153}il").replace("Oeu", "\u{152}u").replace("Oeil", "\u{152}il")
}

fn prepare(m: &Manuscript, narrow: bool) -> Manuscript {
    let fr = m.lang.to_lowercase().starts_with("fr");
    let fix = |t: &str| {
        let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
        if fr { french(&t, narrow) } else { t }
    };
    Manuscript {
        title: m.title.clone(),
        author: m.author.clone(),
        lang: m.lang.clone(),
        rights: m.rights.clone(),
        ai: m.ai.clone(),
        first_published: m.first_published.clone(),
        dedication: fix(&m.dedication),
        epigraph: fix(&m.epigraph),
        epigraph_by: fix(&m.epigraph_by),
        // Paragraph breaks matter here, so lines are fixed one by one.
        acknowledgements: m.acknowledgements.lines().map(fix).collect::<Vec<_>>().join("\n"),
        about: m.about.lines().map(fix).collect::<Vec<_>>().join("\n"),
        also_by: m.also_by.iter().map(|b| fix(b)).filter(|b| !b.is_empty()).collect(),
        chapters: m
            .chapters
            .iter()
            .map(|c| ChapterIn {
                title: c.title.as_deref().map(fix).filter(|t| !t.is_empty()),
                blocks: c.blocks.iter().map(|b| BlockIn { text: fix(&b.text), ..b.clone() }).filter(|b| !b.text.is_empty()).collect(),
            })
            .filter(|c| !c.blocks.is_empty() || c.title.is_some())
            .collect(),
    }
}

/// The scripts the bundled fonts cover (Latin, Greek, Cyrillic). Others would print as boxes.
pub fn unsupported_script(m: &Manuscript) -> bool {
    let sample = m.chapters.iter().flat_map(|c| c.blocks.iter()).take(400);
    let mut letters = 0usize;
    let mut other = 0usize;
    for b in sample {
        for c in b.text.chars().filter(|c| c.is_alphabetic()) {
            letters += 1;
            let u = c as u32;
            let covered = u < 0x0250 || (0x0370..0x0530).contains(&u) || (0x1E00..0x2000).contains(&u);
            if !covered {
                other += 1;
            }
        }
    }
    letters > 0 && other * 20 > letters
}

// --- Typst ------------------------------------------------------------------------------------

macro_rules! embedded {
    ($($path:literal),* $(,)?) => {
        &[$(($path, include_bytes!(concat!("../studio/template/", $path)) as &[u8])),*]
    };
}
const TEMPLATE: &[(&str, &[u8])] = embedded![
    "book.typ",
    "assets/crane-print.svg",
    "assets/crane-screen.png",
    "vendor/droplet-0.3.1/src/lib.typ",
    "vendor/droplet-0.3.1/src/droplet.typ",
    "vendor/droplet-0.3.1/src/extract.typ",
    "vendor/droplet-0.3.1/src/split.typ",
    "vendor/droplet-0.3.1/src/util.typ",
];
const FONTS: &[&[u8]] = &[
    include_bytes!("../studio/fonts/ebgaramond/EBGaramond[wght].ttf"),
    include_bytes!("../studio/fonts/ebgaramond/EBGaramond-Italic[wght].ttf"),
    include_bytes!("../studio/fonts/literata/Literata[opsz,wght].ttf"),
    include_bytes!("../studio/fonts/literata/Literata-Italic[opsz,wght].ttf"),
];
pub const CRANE_PNG: &[u8] = include_bytes!("../studio/template/assets/crane-screen.png");

mod world {
    use super::*;
    use typst::diag::{FileError, FileResult};
    use typst::foundations::{Bytes, Datetime, Duration};
    use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
    use typst::text::{Font, FontBook};
    use typst::utils::LazyHash;
    use typst::{Library, LibraryExt, World};

    /// A sandboxed world: every file is in memory (template, fonts, book data).
    /// Packages and system fonts are refused, so nothing is read from disk or the network.
    pub struct BookWorld {
        library: LazyHash<Library>,
        book: LazyHash<FontBook>,
        fonts: Vec<Font>,
        files: HashMap<FileId, Bytes>,
        sources: Mutex<HashMap<FileId, Source>>,
    }

    pub fn file_id(path: &str) -> FileId {
        RootedPath::new(VirtualRoot::Project, VirtualPath::new(path).expect("valid path")).intern()
    }

    impl BookWorld {
        pub fn new() -> Self {
            let fonts: Vec<Font> = FONTS.iter().flat_map(|f| Font::iter(Bytes::new(f.to_vec()))).collect();
            let files = TEMPLATE.iter().map(|(p, b)| (file_id(&format!("/{p}")), Bytes::new(b.to_vec()))).collect();
            Self {
                library: LazyHash::new(Library::builder().build()),
                book: LazyHash::new(FontBook::from_fonts(fonts.iter())),
                fonts,
                files,
                sources: Mutex::new(HashMap::new()),
            }
        }
        pub fn set(&mut self, path: &str, data: Vec<u8>) {
            self.files.insert(file_id(path), Bytes::new(data));
        }
    }

    impl World for BookWorld {
        fn library(&self) -> &LazyHash<Library> {
            &self.library
        }
        fn book(&self) -> &LazyHash<FontBook> {
            &self.book
        }
        fn main(&self) -> FileId {
            file_id("/book.typ")
        }
        fn source(&self, id: FileId) -> FileResult<Source> {
            let mut cache = self.sources.lock().unwrap();
            if let Some(s) = cache.get(&id) {
                return Ok(s.clone());
            }
            let bytes = self.file(id)?;
            let text = std::str::from_utf8(bytes.as_slice()).map_err(|_| FileError::InvalidUtf8)?.to_string();
            let src = Source::new(id, text);
            cache.insert(id, src.clone());
            Ok(src)
        }
        fn file(&self, id: FileId) -> FileResult<Bytes> {
            if !matches!(id.root(), VirtualRoot::Project) {
                return Err(FileError::AccessDenied);
            }
            self.files.get(&id).cloned().ok_or(FileError::AccessDenied)
        }
        fn font(&self, index: usize) -> Option<Font> {
            self.fonts.get(index).cloned()
        }
        fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
            let (y, m, d, ..) = civil_now();
            Datetime::from_ymd(y, m, d)
        }
    }
}

/// KDP's inside margin (gutter) by page count, in inches.
pub fn kdp_gutter(pages: usize) -> f64 {
    match pages {
        0..=150 => 0.375,
        151..=300 => 0.5,
        301..=500 => 0.625,
        501..=700 => 0.75,
        _ => 0.875,
    }
}

#[derive(Deserialize, Clone, Debug)]
pub struct PrintOptions {
    #[serde(default = "default_trim")]
    pub trim: (f64, f64),
    #[serde(default = "default_font")]
    pub font: String,
    #[serde(default)]
    pub bleed: bool,
    #[serde(default)]
    pub large: bool,
}
fn default_trim() -> (f64, f64) {
    (5.5, 8.5)
}
fn default_font() -> String {
    "EB Garamond".into()
}

fn typst_book(m: &Manuscript) -> Vec<u8> {
    let chapters: Vec<Value> = m
        .chapters
        .iter()
        .map(|c| {
            let mut blocks: Vec<Value> = Vec::new();
            for b in &c.blocks {
                let block = if is_scene_break(&b.text) {
                    json!({ "k": "hr" })
                } else if b.center {
                    json!({ "k": "p", "r": [b.text], "role": "center" })
                } else {
                    json!({ "k": "p", "r": [b.text] })
                };
                // Consecutive quoted paragraphs share one quote block.
                if b.quote && block["k"] == "p" {
                    if let Some(last) = blocks.last_mut().filter(|l| l["k"] == "q") {
                        last["b"].as_array_mut().unwrap().push(block);
                        continue;
                    }
                    blocks.push(json!({ "k": "q", "b": [block] }));
                } else {
                    blocks.push(block);
                }
            }
            json!({ "kind": "chapter", "title": c.title, "blocks": blocks })
        })
        .collect();
    let lang = m.lang.split(['-', '_']).next().unwrap_or("en").to_lowercase();
    serde_json::to_vec(&json!({
        "meta": {
            "title": m.title, "author": m.author, "lang": lang, "rights": m.rights, "ai": m.ai, "first_published": m.first_published,
            "dedication": m.dedication, "epigraph": m.epigraph, "epigraph_by": m.epigraph_by,
            "acknowledgements": m.acknowledgements, "about": m.about, "also_by": m.also_by,
        },
        "chapters": chapters,
    }))
    .unwrap_or_default()
}

fn layout(o: &PrintOptions, inside: f64, safe: u8) -> Vec<u8> {
    let (size, lead) = if o.large { (16.0, 20.0) } else { (11.0, 14.0) };
    serde_json::to_vec(&json!({
        "trim_w": o.trim.0, "trim_h": o.trim.1,
        "inside": inside, "outside": 0.6, "top": 0.75, "bottom": 0.8,
        "bleed": o.bleed, "font": o.font, "size": size, "lead": lead, "mark": "svg",
        // Fallbacks after a layout failure: 1 drops the drop caps, 2 also the widow rules.
        "dropcap": safe == 0, "costs": safe < 2,
    }))
    .unwrap_or_default()
}

/// Typesets the book once, with the gutter settled on the real page count.
fn typeset(m: &Manuscript, o: &PrintOptions) -> Result<typst_layout::PagedDocument> {
    use typst_layout::PagedDocument;
    if unsupported_script(m) {
        return Err("Print PDFs support books in Latin, Greek and Cyrillic scripts for now.".into());
    }
    let m = prepare(m, true);
    let words: usize = m.chapters.iter().flat_map(|c| c.blocks.iter()).map(|b| b.text.split_whitespace().count()).sum();
    let mut world = world::BookWorld::new();
    world.set("/book.json", typst_book(&m));
    let per_page = if o.large { 150.0 } else { 260.0 } * (o.trim.0 * o.trim.1) / (5.5 * 8.5);
    let mut gutter = kdp_gutter((words as f64 / per_page) as usize + 12);
    let mut doc: Option<PagedDocument> = None;
    // Typst can stop on rare page arrangements (a panic in its line breaker, seen with
    // drop caps on a whole novel); the book is then set again with fewer refinements.
    let mut safe = 0u8;
    let mut tries = 0;
    while tries < 8 {
        tries += 1;
        world.set("/layout.json", layout(o, gutter + 0.125, safe));
        let compiled = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| typst::compile::<PagedDocument>(&world).output));
        let result: PagedDocument = match compiled {
            Ok(r) => r.map_err(|errs| errs.iter().map(|e| e.message.to_string()).collect::<Vec<_>>().join("; "))?,
            Err(_) if safe < 2 => {
                safe += 1;
                continue;
            }
            Err(_) => return Err("The book could not be typeset.".into()),
        };
        let need = kdp_gutter(result.pages().len());
        doc = Some(result);
        if (need - gutter).abs() < 1e-9 {
            break;
        }
        gutter = need;
    }
    doc.ok_or_else(|| "The book could not be typeset.".into())
}

/// Pages of the print book as PNG images, for the preview: the total page count and
/// `count` pages from `first` (0-based) at `ppi` pixels per inch.
pub fn preview(m: &Manuscript, o: &PrintOptions, first: usize, count: usize, ppi: f32) -> Result<(usize, Vec<Vec<u8>>)> {
    // The last typeset book is kept, so turning the preview's pages does not set it again.
    static LAST: Mutex<Option<(u64, typst_layout::PagedDocument)>> = Mutex::new(None);
    let key = {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        format!("{m:?}{o:?}").hash(&mut h);
        h.finish()
    };
    let cached = LAST.lock().ok().and_then(|g| g.as_ref().filter(|(k, _)| *k == key).map(|(_, d)| d.clone()));
    let doc = match cached {
        Some(d) => d,
        None => {
            let d = typeset(m, o)?;
            if let Ok(mut g) = LAST.lock() {
                *g = Some((key, d.clone()));
            }
            d
        }
    };
    let opts = typst_render::RenderOptions { pixel_per_pt: typst::utils::Scalar::new((ppi / 72.0) as f64), render_bleed: o.bleed };
    let pages = doc.pages();
    let images = pages
        .iter()
        .skip(first)
        .take(count)
        .map(|p| typst_render::render(p, &opts).encode_png().map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>>>()?;
    Ok((pages.len(), images))
}

/// Typesets the book and writes a print PDF. Returns the page count.
pub fn pdf(m: &Manuscript, o: &PrintOptions, out: &Path) -> Result<usize> {
    use typst_pdf::{PdfOptions, Timestamp};
    let doc = typeset(m, o)?;
    let (y, mo, d, h, mi, se) = civil_now();
    let ts = typst::foundations::Datetime::from_ymd_hms(y, mo, d, h, mi, se);
    let opts = PdfOptions {
        creator: typst::foundations::Smart::Custom(Some("Origami Studio".into())),
        timestamp: ts.map(Timestamp::new_utc),
        ..PdfOptions::default()
    };
    let bytes = typst_pdf::pdf(&doc, &opts).map_err(|errs| errs.iter().map(|e| e.message.to_string()).collect::<Vec<_>>().join("; "))?;
    std::fs::write(out, bytes).map_err(|e| e.to_string())?;
    Ok(doc.pages().len())
}

// --- EPUB 3 -------------------------------------------------------------------------------------

fn xml(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            // Control characters are not allowed in XML.
            c if (c as u32) < 0x20 && !matches!(c, '\n' | '\t') => {}
            c => out.push(c),
        }
    }
    out
}

struct Labels {
    contents: &'static str,
    made: &'static str,
    chapter: &'static str,
    typeset: &'static str,
}
fn labels(lang: &str) -> Labels {
    if lang.to_lowercase().starts_with("fr") {
        Labels { contents: "Table des mati\u{e8}res", made: "R\u{e9}alis\u{e9} avec Origami Studio", chapter: "Chapitre", typeset: "Mise en page\u{a0}: Origami Studio." }
    } else {
        Labels { contents: "Contents", made: "Made with Origami Studio", chapter: "Chapter", typeset: "Prepared with Origami Studio." }
    }
}

fn page(lang: &str, title: &str, body: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" xml:lang=\"{l}\" lang=\"{l}\">\n<head><meta charset=\"utf-8\"/><title>{t}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/></head>\n<body>\n{body}\n</body>\n</html>\n",
        l = xml(lang),
        t = xml(title)
    )
}

const EPUB_CSS: &str = "body { margin: 0 5%; line-height: 1.5; }
h1 { font-size: 1.4em; text-align: center; margin: 3em 0 2em; font-weight: normal; letter-spacing: 0.05em; }
p { margin: 0; text-indent: 1.3em; text-align: justify; hyphens: auto; -epub-hyphens: auto; }
h1 + p, p.first, hr + p { text-indent: 0; }
p.center { text-align: center; text-indent: 0; margin: 1em 0; }
blockquote { margin: 1em 1.5em; }
hr.scene { border: 0; text-align: center; margin: 1.2em 0; }
hr.scene::after { content: \"*\\2009*\\2009*\"; letter-spacing: 0.6em; }
.title { text-align: center; margin-top: 30%; }
.title h1 { font-size: 2em; margin: 0 0 1em; }
.title .author { font-style: italic; font-size: 1.2em; }
.copyright { margin-top: 40%; font-size: 0.8em; }
.copyright p, .colophon p { text-indent: 0; text-align: left; margin: 0 0 0.6em; }
.mark { text-align: right; margin-top: 2em; }
.mark img { height: 1.6em; width: auto; vertical-align: middle; margin-right: 0.4em; }
.mark span { font-size: 0.75em; vertical-align: middle; }
.colophon { margin-top: 50%; }
.dedication { margin-top: 35%; text-align: center; font-style: italic; }
.dedication p { text-indent: 0; text-align: center; }
.epigraph { margin-top: 30%; }
.epigraph blockquote { margin: 0 0 0 30%; font-style: italic; }
.epigraph p { text-indent: 0; text-align: left; }
.epigraph .by { text-align: right; font-style: normal; font-variant: small-caps; margin-top: 0.6em; }
nav ol { list-style: none; padding: 0; }
nav li { margin: 0.4em 0; }
";

fn mark(l: &Labels) -> String {
    format!("<p class=\"mark\"><img src=\"crane.png\" alt=\"Origami crane\"/><span>{}</span></p>", xml(l.made))
}

/// Writes an EPUB 3 ebook (with an EPUB 2 table of contents for older readers).
pub fn epub(m: &Manuscript, cover_jpeg: Option<&[u8]>, export_id: &str, out: &Path) -> Result<()> {
    use zip::write::SimpleFileOptions;
    let m = prepare(m, false);
    let lang = if m.lang.is_empty() { "en".to_string() } else { m.lang.clone() };
    let l = labels(&lang);
    let file = std::fs::File::create(out).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let put = |zip: &mut zip::ZipWriter<std::fs::File>, name: &str, data: &[u8], opt: SimpleFileOptions| -> Result<()> {
        zip.start_file(name, opt).map_err(|e| e.to_string())?;
        zip.write_all(data).map_err(|e| e.to_string())
    };
    put(&mut zip, "mimetype", b"application/epub+zip", stored)?;
    put(
        &mut zip,
        "META-INF/container.xml",
        b"<?xml version=\"1.0\"?>\n<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>\n",
        deflated,
    )?;
    put(&mut zip, "OEBPS/style.css", EPUB_CSS.as_bytes(), deflated)?;
    put(&mut zip, "OEBPS/crane.png", CRANE_PNG, stored)?;
    let mut manifest = vec![
        r#"<item id="css" href="style.css" media-type="text/css"/>"#.to_string(),
        r#"<item id="crane" href="crane.png" media-type="image/png"/>"#.to_string(),
        r#"<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>"#.to_string(),
        r#"<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>"#.to_string(),
    ];
    let mut spine = Vec::new();
    if let Some(c) = cover_jpeg {
        put(&mut zip, "OEBPS/cover.jpg", c, stored)?;
        put(&mut zip, "OEBPS/cover.xhtml", page(&lang, &m.title, "<div style=\"text-align:center\"><img src=\"cover.jpg\" alt=\"\" style=\"max-width:100%;max-height:100%\"/></div>").as_bytes(), deflated)?;
        manifest.push(r#"<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>"#.into());
        manifest.push(r#"<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>"#.into());
        spine.push("cover".to_string());
    }
    let title_page = format!("<section class=\"title\" epub:type=\"titlepage\"><h1>{}</h1><p class=\"author\">{}</p></section>", xml(&m.title), xml(&m.author));
    put(&mut zip, "OEBPS/title.xhtml", page(&lang, &m.title, &title_page).as_bytes(), deflated)?;
    manifest.push(r#"<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>"#.into());
    spine.push("title".into());
    let mut rights = String::new();
    rights.push_str(&format!("<p>{}<br/>{}</p>", xml(&m.title), xml(&m.author)));
    for r in &m.rights {
        rights.push_str(&format!("<p>{}</p>", xml(r)));
    }
    if !m.ai.is_empty() {
        rights.push_str(&format!("<p>{}</p>", xml(&m.ai)));
    }
    rights.push_str(&format!("<p>{}</p>", xml(l.typeset)));
    let copyright = format!("<section class=\"copyright\" epub:type=\"copyright-page\">{rights}{}</section>", mark(&l));
    put(&mut zip, "OEBPS/copyright.xhtml", page(&lang, "Copyright", &copyright).as_bytes(), deflated)?;
    manifest.push(r#"<item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>"#.into());
    spine.push("copyright".into());
    if !m.dedication.is_empty() {
        let body = format!("<section class=\"dedication\" epub:type=\"dedication\"><p>{}</p></section>", xml(&m.dedication));
        put(&mut zip, "OEBPS/dedication.xhtml", page(&lang, "Dedication", &body).as_bytes(), deflated)?;
        manifest.push(r#"<item id="dedication" href="dedication.xhtml" media-type="application/xhtml+xml"/>"#.into());
        spine.push("dedication".into());
    }
    if !m.epigraph.is_empty() {
        let by = if m.epigraph_by.is_empty() { String::new() } else { format!("<p class=\"by\">{}</p>", xml(&m.epigraph_by)) };
        let body = format!("<section class=\"epigraph\" epub:type=\"epigraph\"><blockquote><p>{}</p>{by}</blockquote></section>", xml(&m.epigraph));
        put(&mut zip, "OEBPS/epigraph.xhtml", page(&lang, "Epigraph", &body).as_bytes(), deflated)?;
        manifest.push(r#"<item id="epigraph" href="epigraph.xhtml" media-type="application/xhtml+xml"/>"#.into());
        spine.push("epigraph".into());
    }
    spine.push("nav".into());
    let mut toc = Vec::new();
    for (i, c) in m.chapters.iter().enumerate() {
        let name = c.title.clone().unwrap_or_else(|| format!("{} {}", l.chapter, i + 1));
        let mut body = format!("<section epub:type=\"chapter\"><h1>{}</h1>\n", xml(&name));
        let mut in_quote = false;
        for b in &c.blocks {
            if b.quote != in_quote {
                body.push_str(if b.quote { "<blockquote>" } else { "</blockquote>" });
                in_quote = b.quote;
            }
            if is_scene_break(&b.text) {
                body.push_str("<hr class=\"scene\"/>\n");
            } else if b.center {
                body.push_str(&format!("<p class=\"center\">{}</p>\n", xml(&b.text)));
            } else {
                body.push_str(&format!("<p>{}</p>\n", xml(&b.text)));
            }
        }
        if in_quote {
            body.push_str("</blockquote>");
        }
        body.push_str("</section>");
        let href = format!("chapter-{:03}.xhtml", i + 1);
        put(&mut zip, &format!("OEBPS/{href}"), page(&lang, &name, &body).as_bytes(), deflated)?;
        manifest.push(format!(r#"<item id="c{i}" href="{href}" media-type="application/xhtml+xml"/>"#));
        spine.push(format!("c{i}"));
        toc.push((name, href));
    }
    // Back matter, each part on its own page.
    let fr = lang.to_lowercase().starts_with("fr");
    let back: [(&str, &str, String); 3] = [
        ("acknowledgements", if fr { "Remerciements" } else { "Acknowledgements" }, m.acknowledgements.clone()),
        ("about", if fr { "\u{c0} propos de l'auteur" } else { "About the Author" }, m.about.clone()),
        ("also-by", if fr { "Du m\u{ea}me auteur" } else { "Also by the Author" }, m.also_by.join("\n")),
    ];
    for (id, heading, text) in back.iter().filter(|b| !b.2.trim().is_empty()) {
        let paras: String = text.lines().filter(|l| !l.trim().is_empty()).map(|l| format!("<p>{}</p>", xml(l.trim()))).collect();
        let kind = match *id { "acknowledgements" => "acknowledgments", "about" => "contributors", _ => "other-credits" };
        let body = format!("<section epub:type=\"{kind}\"><h1>{}</h1>{paras}</section>", xml(heading));
        put(&mut zip, &format!("OEBPS/{id}.xhtml"), page(&lang, heading, &body).as_bytes(), deflated)?;
        manifest.push(format!(r#"<item id="{id}" href="{id}.xhtml" media-type="application/xhtml+xml"/>"#));
        spine.push(id.to_string());
        toc.push((heading.to_string(), format!("{id}.xhtml")));
    }
    let colophon = format!("<section class=\"colophon\" epub:type=\"colophon\"><p>{}</p>{}</section>", xml(l.typeset), mark(&l));
    put(&mut zip, "OEBPS/colophon.xhtml", page(&lang, "Colophon", &colophon).as_bytes(), deflated)?;
    manifest.push(r#"<item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>"#.into());
    spine.push("colophon".into());
    let items: String = toc.iter().map(|(n, h)| format!("<li><a href=\"{h}\">{}</a></li>", xml(n))).collect();
    let nav = format!("<nav epub:type=\"toc\" id=\"toc\"><h1>{}</h1><ol>{items}</ol></nav>", xml(l.contents));
    put(&mut zip, "OEBPS/nav.xhtml", page(&lang, l.contents, &nav).as_bytes(), deflated)?;
    let points: String = toc
        .iter()
        .enumerate()
        .map(|(i, (n, h))| format!("<navPoint id=\"p{i}\" playOrder=\"{}\"><navLabel><text>{}</text></navLabel><content src=\"{h}\"/></navPoint>", i + 1, xml(n)))
        .collect();
    let uid = format!("urn:origami:{}", xml(export_id));
    let ncx = format!("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\"><head><meta name=\"dtb:uid\" content=\"{uid}\"/></head><docTitle><text>{}</text></docTitle><navMap>{points}</navMap></ncx>\n", xml(&m.title));
    put(&mut zip, "OEBPS/toc.ncx", ncx.as_bytes(), deflated)?;
    let modified = {
        let (y, mo, d, h, mi, s) = civil_now();
        format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
    };
    let cover_meta = if cover_jpeg.is_some() { "<meta name=\"cover\" content=\"cover-image\"/>" } else { "" };
    let ai_meta = if m.ai.is_empty() { String::new() } else { format!("<meta property=\"origami:ai-disclosure\">{}</meta>", xml(&m.ai)) };
    let opf = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"uid\" xml:lang=\"{lang}\" prefix=\"origami: https://origami.app/ns#\">\n<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n<dc:identifier id=\"uid\">{uid}</dc:identifier>\n<dc:title>{title}</dc:title>\n<dc:creator>{author}</dc:creator>\n<dc:language>{lang}</dc:language>\n<dc:contributor id=\"producer\">Origami Studio</dc:contributor>\n<meta refines=\"#producer\" property=\"role\" scheme=\"marc:relators\">bkp</meta>\n<meta property=\"dcterms:modified\">{modified}</meta>\n<meta name=\"generator\" content=\"Origami Studio\"/>\n<meta property=\"origami:export-id\">{id}</meta>\n{ai_meta}\n{cover_meta}\n</metadata>\n<manifest>\n{manifest}\n</manifest>\n<spine toc=\"ncx\">\n{spine}\n</spine>\n</package>\n",
        lang = xml(&lang),
        title = xml(&m.title),
        author = xml(&m.author),
        id = xml(export_id),
        manifest = manifest.join("\n"),
        spine = spine.iter().map(|s| format!("<itemref idref=\"{s}\"/>")).collect::<Vec<_>>().join("\n"),
    );
    put(&mut zip, "OEBPS/content.opf", opf.as_bytes(), deflated)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

// --- Read-along EPUB (EPUB 3 Media Overlays) -----------------------------------------------------

/// One line of a read-along chapter: its id (the production unit) and the book's text.
pub struct ReadLine {
    pub id: String,
    pub text: String,
    pub start: f64,
    pub end: f64,
}

/// A chapter of the read-along ebook: its paragraphs of timed lines and its audio file.
pub struct ReadChapter {
    pub title: String,
    pub paragraphs: Vec<Vec<ReadLine>>,
    pub audio: std::path::PathBuf,
    pub seconds: f64,
}

pub struct ReadMeta {
    pub title: String,
    pub author: String,
    pub lang: String,
    pub narrator: String,
    pub ai: String,
    pub rights: Vec<String>,
}

/// A media clock value, "h:mm:ss.fff".
fn clock_value(s: f64) -> String {
    let ms = (s.max(0.0) * 1000.0).round() as u64;
    format!("{}:{:02}:{:02}.{:03}", ms / 3_600_000, (ms / 60_000) % 60, (ms / 1000) % 60, ms % 1000)
}

/// An ebook that plays Origami's narration and highlights each line as it is read
/// (EPUB 3 Media Overlays: one SMIL file and one MP3 per chapter).
pub fn readalong_epub(meta: &ReadMeta, chapters: &[ReadChapter], cover_jpeg: Option<&[u8]>, export_id: &str, out: &Path) -> Result<()> {
    use zip::write::SimpleFileOptions;
    let lang = if meta.lang.is_empty() { "en".to_string() } else { meta.lang.clone() };
    let fr = lang.to_lowercase().starts_with("fr");
    let l = labels(&lang);
    let fix = |t: &str| {
        let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
        if fr { french(&t, false) } else { t }
    };
    let file = std::fs::File::create(out).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let put = |zip: &mut zip::ZipWriter<std::fs::File>, name: &str, data: &[u8], opt: SimpleFileOptions| -> Result<()> {
        zip.start_file(name, opt).map_err(|e| e.to_string())?;
        zip.write_all(data).map_err(|e| e.to_string())
    };
    put(&mut zip, "mimetype", b"application/epub+zip", stored)?;
    put(
        &mut zip,
        "META-INF/container.xml",
        b"<?xml version=\"1.0\"?>\n<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>\n",
        deflated,
    )?;
    let css = format!("{EPUB_CSS}.-epub-media-overlay-active {{ background: rgba(255, 214, 102, 0.45); border-radius: 3px; }}\n");
    put(&mut zip, "OEBPS/style.css", css.as_bytes(), deflated)?;
    put(&mut zip, "OEBPS/crane.png", CRANE_PNG, stored)?;
    let mut manifest = vec![
        r#"<item id="css" href="style.css" media-type="text/css"/>"#.to_string(),
        r#"<item id="crane" href="crane.png" media-type="image/png"/>"#.to_string(),
        r#"<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>"#.to_string(),
    ];
    let mut spine = Vec::new();
    let mut durations = Vec::new();
    if let Some(c) = cover_jpeg {
        put(&mut zip, "OEBPS/cover.jpg", c, stored)?;
        put(&mut zip, "OEBPS/cover.xhtml", page(&lang, &meta.title, "<div style=\"text-align:center\"><img src=\"cover.jpg\" alt=\"\" style=\"max-width:100%;max-height:100%\"/></div>").as_bytes(), deflated)?;
        manifest.push(r#"<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>"#.into());
        manifest.push(r#"<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>"#.into());
        spine.push("cover".to_string());
    }
    let title_page = format!("<section class=\"title\" epub:type=\"titlepage\"><h1>{}</h1><p class=\"author\">{}</p></section>", xml(&meta.title), xml(&meta.author));
    put(&mut zip, "OEBPS/title.xhtml", page(&lang, &meta.title, &title_page).as_bytes(), deflated)?;
    manifest.push(r#"<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>"#.into());
    spine.push("title".into());
    let mut rights = format!("<p>{}<br/>{}</p>", xml(&meta.title), xml(&meta.author));
    for r in &meta.rights {
        rights.push_str(&format!("<p>{}</p>", xml(r)));
    }
    rights.push_str(&format!("<p>{}</p><p>{}</p>", xml(&meta.ai), xml(l.typeset)));
    put(&mut zip, "OEBPS/copyright.xhtml", page(&lang, "Copyright", &format!("<section class=\"copyright\" epub:type=\"copyright-page\">{rights}{}</section>", mark(&l))).as_bytes(), deflated)?;
    manifest.push(r#"<item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>"#.into());
    spine.push("copyright".into());
    spine.push("nav".into());
    let mut toc = Vec::new();
    let mut total = 0.0;
    // Each audio file goes in once, even when several chapters play from one long recording.
    let mut audio_names: Vec<(std::path::PathBuf, String)> = Vec::new();
    for c in chapters {
        if audio_names.iter().any(|(p, _)| p == &c.audio) {
            continue;
        }
        let ext = c.audio.extension().and_then(|e| e.to_str()).unwrap_or("mp3").to_lowercase();
        let (ext, media) = match ext.as_str() {
            "m4a" | "m4b" | "mp4" | "aac" => ("m4a", "audio/mp4"),
            _ => ("mp3", "audio/mpeg"),
        };
        let name = format!("audio/{:03}.{ext}", audio_names.len() + 1);
        put(&mut zip, &format!("OEBPS/{name}"), &std::fs::read(&c.audio).map_err(|e| e.to_string())?, stored)?;
        manifest.push(format!(r#"<item id="a{}" href="{name}" media-type="{media}"/>"#, audio_names.len() + 1));
        audio_names.push((c.audio.clone(), name));
    }
    for (i, c) in chapters.iter().enumerate() {
        let n = i + 1;
        let href = format!("chapter-{n:03}.xhtml");
        let audio = audio_names.iter().find(|(p, _)| p == &c.audio).map(|(_, n)| n.clone()).unwrap_or_default();
        // When the chapter opens with its own heading line, that line is the title.
        let heading_first = c.paragraphs.first().is_some_and(|p| p.len() == 1 && p[0].text.trim() == c.title.trim());
        let mut body = if heading_first {
            "<section epub:type=\"chapter\">\n".to_string()
        } else {
            format!("<section epub:type=\"chapter\"><h1>{}</h1>\n", xml(&fix(&c.title)))
        };
        let mut pars = String::new();
        for (pi, para) in c.paragraphs.iter().enumerate() {
            let tag = if pi == 0 && heading_first { "h1" } else { "p" };
            body.push_str(&format!("<{tag}>"));
            for (k, line) in para.iter().enumerate() {
                let id = format!("l{}", xml(&line.id));
                if k > 0 {
                    body.push(' ');
                }
                body.push_str(&format!("<span id=\"{id}\">{}</span>", xml(&fix(&line.text))));
                pars.push_str(&format!(
                    "<par id=\"p-{id}\"><text src=\"{href}#{id}\"/><audio src=\"{audio}\" clipBegin=\"{}\" clipEnd=\"{}\"/></par>\n",
                    clock_value(line.start),
                    clock_value(line.end)
                ));
            }
            body.push_str(&format!("</{tag}>\n"));
        }
        body.push_str("</section>");
        put(&mut zip, &format!("OEBPS/{href}"), page(&lang, &c.title, &body).as_bytes(), deflated)?;
        let smil = format!(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<smil xmlns=\"http://www.w3.org/ns/SMIL\" xmlns:epub=\"http://www.idpf.org/2007/ops\" version=\"3.0\">\n<body>\n<seq id=\"seq{n}\" epub:textref=\"{href}\" epub:type=\"chapter\">\n{pars}</seq>\n</body>\n</smil>\n"
        );
        put(&mut zip, &format!("OEBPS/chapter-{n:03}.smil"), smil.as_bytes(), deflated)?;
        manifest.push(format!(r#"<item id="c{n}" href="{href}" media-type="application/xhtml+xml" media-overlay="mo{n}"/>"#));
        manifest.push(format!(r#"<item id="mo{n}" href="chapter-{n:03}.smil" media-type="application/smil+xml"/>"#));
        spine.push(format!("c{n}"));
        durations.push(format!("<meta property=\"media:duration\" refines=\"#mo{n}\">{}</meta>", clock_value(c.seconds)));
        total += c.seconds;
        toc.push((c.title.clone(), href));
    }
    let colophon = format!("<section class=\"colophon\" epub:type=\"colophon\"><p>{}</p><p>{}</p>{}</section>", xml(&meta.ai), xml(l.typeset), mark(&l));
    put(&mut zip, "OEBPS/colophon.xhtml", page(&lang, "Colophon", &colophon).as_bytes(), deflated)?;
    manifest.push(r#"<item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>"#.into());
    spine.push("colophon".into());
    let items: String = toc.iter().map(|(n, h)| format!("<li><a href=\"{h}\">{}</a></li>", xml(n))).collect();
    put(&mut zip, "OEBPS/nav.xhtml", page(&lang, l.contents, &format!("<nav epub:type=\"toc\" id=\"toc\"><h1>{}</h1><ol>{items}</ol></nav>", xml(l.contents))).as_bytes(), deflated)?;
    let (y, mo, d, h, mi, s) = civil_now();
    let cover_meta = if cover_jpeg.is_some() { "<meta name=\"cover\" content=\"cover-image\"/>" } else { "" };
    let opf = format!(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"uid\" xml:lang=\"{lang}\" prefix=\"origami: https://origami.app/ns#\">\n<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n<dc:identifier id=\"uid\">urn:origami:{id}-readalong</dc:identifier>\n<dc:title>{title}</dc:title>\n<dc:creator>{author}</dc:creator>\n<dc:language>{lang}</dc:language>\n<dc:contributor id=\"producer\">Origami Studio</dc:contributor>\n<meta refines=\"#producer\" property=\"role\" scheme=\"marc:relators\">bkp</meta>\n<meta property=\"dcterms:modified\">{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z</meta>\n<meta name=\"generator\" content=\"Origami Studio\"/>\n<meta property=\"origami:export-id\">{id}</meta>\n<meta property=\"origami:ai-disclosure\">{ai}</meta>\n<meta property=\"media:duration\">{total}</meta>\n{durations}\n{narrator}<meta property=\"media:active-class\">-epub-media-overlay-active</meta>\n{cover_meta}\n</metadata>\n<manifest>\n{manifest}\n</manifest>\n<spine>\n{spine}\n</spine>\n</package>\n",
        lang = xml(&lang),
        id = xml(export_id),
        title = xml(&meta.title),
        author = xml(&meta.author),
        ai = xml(&meta.ai),
        total = clock_value(total),
        durations = durations.join("\n"),
        narrator = if meta.narrator.is_empty() { String::new() } else { format!("<meta property=\"media:narrator\">{}</meta>\n", xml(&meta.narrator)) },
        manifest = manifest.join("\n"),
        spine = spine.iter().map(|s| format!("<itemref idref=\"{s}\"/>")).collect::<Vec<_>>().join("\n"),
    );
    put(&mut zip, "OEBPS/content.opf", opf.as_bytes(), deflated)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn book(lang: &str) -> Manuscript {
        Manuscript {
            title: "A <Test> & Book".into(),
            author: "Ann Author".into(),
            lang: lang.into(),
            rights: vec!["Public domain.".into()],
            ai: "".into(),
            first_published: "".into(),
            dedication: "For Ann.".into(),
            epigraph: "All the world's a stage.".into(),
            epigraph_by: "Shakespeare".into(),
            acknowledgements: "Thanks to everyone.".into(),
            about: "Ann writes books.".into(),
            also_by: vec!["Another Book".into()],
            chapters: (0..3)
                .map(|i| ChapterIn {
                    title: Some(format!("Chapter {}", i + 1)),
                    blocks: (0..40)
                        .map(|j| BlockIn { text: if j == 20 { "* * *".into() } else { format!("Paragraph {j} of a chapter, long enough to wrap over a few lines when it is set in a book page of normal size. It goes on.") }, quote: j == 5, center: false })
                        .collect(),
                })
                .collect(),
        }
    }

    #[test]
    fn french_spacing() {
        assert_eq!(french("Quoi? Non!", true), "Quoi\u{202F}? Non\u{202F}!");
        assert_eq!(french("\u{AB}Bonjour\u{BB}", false), "\u{AB}\u{a0}Bonjour\u{a0}\u{BB}");
        assert_eq!(french("\u{2014} Oui", true), "\u{2014}\u{a0}Oui");
        assert_eq!(french("10:30 et http://x", true), "10:30 et http://x");
        assert_eq!(french("M. Dupont, un coeur", true), "M.\u{a0}Dupont, un c\u{153}ur");
    }

    #[test]
    fn epub_is_well_formed() {
        let dir = std::env::temp_dir().join(format!("origami-epub-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("b.epub");
        epub(&book("en"), None, "test-1", &out).unwrap();
        let mut z = zip::ZipArchive::new(std::fs::File::open(&out).unwrap()).unwrap();
        assert_eq!(z.by_index(0).unwrap().name(), "mimetype");
        let mut opf = String::new();
        std::io::Read::read_to_string(&mut z.by_name("OEBPS/content.opf").unwrap(), &mut opf).unwrap();
        assert!(opf.contains("A &lt;Test&gt; &amp; Book"));
        assert!(opf.contains("Origami Studio"));
        let mut c = String::new();
        std::io::Read::read_to_string(&mut z.by_name("OEBPS/copyright.xhtml").unwrap(), &mut c).unwrap();
        assert!(c.contains("Made with Origami Studio") && c.contains("crane.png"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn readalong_epub_has_overlays() {
        let dir = std::env::temp_dir().join(format!("origami-ra-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("001.mp3");
        std::fs::write(&audio, b"ID3").unwrap();
        let chapters = vec![ReadChapter {
            title: "One".into(),
            audio,
            seconds: 4.0,
            paragraphs: vec![vec![ReadLine { id: "p1-u0".into(), text: "Hello & bye.".into(), start: 1.0, end: 2.5 }]],
        }];
        let meta = ReadMeta { title: "T".into(), author: "A".into(), lang: "en".into(), narrator: "Digital voices".into(), ai: "Narrated by AI voices.".into(), rights: vec![] };
        let out = dir.join("r.epub");
        readalong_epub(&meta, &chapters, None, "OS-1", &out).unwrap();
        let mut z = zip::ZipArchive::new(std::fs::File::open(&out).unwrap()).unwrap();
        let mut smil = String::new();
        std::io::Read::read_to_string(&mut z.by_name("OEBPS/chapter-001.smil").unwrap(), &mut smil).unwrap();
        assert!(smil.contains("clipBegin=\"0:00:01.000\"") && smil.contains("#lp1-u0"));
        let mut opf = String::new();
        std::io::Read::read_to_string(&mut z.by_name("OEBPS/content.opf").unwrap(), &mut opf).unwrap();
        assert!(opf.contains("media-overlay=\"mo1\"") && opf.contains("media:active-class"));
        let mut x = String::new();
        std::io::Read::read_to_string(&mut z.by_name("OEBPS/chapter-001.xhtml").unwrap(), &mut x).unwrap();
        assert!(x.contains("<span id=\"lp1-u0\">Hello &amp; bye.</span>"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pdf_typesets_with_the_mark() {
        let dir = std::env::temp_dir().join(format!("origami-pdf-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("b.pdf");
        let pages = pdf(&book("fr"), &PrintOptions { trim: (5.5, 8.5), font: "EB Garamond".into(), bleed: false, large: false }, &out).unwrap();
        assert!(pages > 8, "{pages}");
        let bytes = std::fs::read(&out).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn preview_renders_pages_and_matter_is_in_the_ebook() {
        let (pages, images) = preview(&book("en"), &PrintOptions { trim: (5.5, 8.5), font: "Literata".into(), bleed: false, large: false }, 0, 3, 40.0).unwrap();
        assert!(pages > 10 && images.len() == 3 && images[0].starts_with(&[0x89, b'P', b'N', b'G']));
        let dir = std::env::temp_dir().join(format!("origami-matter-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("m.epub");
        epub(&book("en"), None, "x", &out).unwrap();
        let z = zip::ZipArchive::new(std::fs::File::open(&out).unwrap()).unwrap();
        for f in ["OEBPS/dedication.xhtml", "OEBPS/epigraph.xhtml", "OEBPS/acknowledgements.xhtml", "OEBPS/about.xhtml", "OEBPS/also-by.xhtml"] {
            assert!(z.file_names().any(|n| n == f), "{f}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn other_scripts_are_refused_for_print() {
        let mut b = book("ja");
        for c in &mut b.chapters {
            for bl in &mut c.blocks {
                bl.text = "\u{3053}\u{308c}\u{306f}\u{65e5}\u{672c}\u{8a9e}\u{3067}\u{3059}".into();
            }
        }
        assert!(unsupported_script(&b));
        assert!(!unsupported_script(&book("en")));
    }
}
