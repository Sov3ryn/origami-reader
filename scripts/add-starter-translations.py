"""Copies the finished AI translations of the starter books into assets/starter-library/translations.

usage: python scripts/add-starter-translations.py <translations project outputs folder>

Only editions marked "packaged" (every section translated and assembled) are taken; anything
still translating is left out. Writes translations.json: per book and app language code, the
file, its SHA-256 and its title.
"""
import hashlib, json, re, shutil, sys, zipfile
from pathlib import Path

SRC = Path(sys.argv[1])
REPO = Path(__file__).resolve().parents[1]
DEST = REPO / "assets/starter-library/translations"
# Translation folders use full locales; the app uses these codes.
CODE = {"ar": "ar", "bn-BD": "bn", "de-DE": "de", "es-ES": "es", "fr-FR": "fr", "hi-IN": "hi", "id-ID": "id", "it-IT": "it",
        "ja-JP": "ja", "ko-KR": "ko", "nl-NL": "nl", "pl-PL": "pl", "pt-BR": "pt-BR", "ru-RU": "ru", "th-TH": "th", "tr-TR": "tr",
        "uk-UA": "uk", "vi-VN": "vi", "zh-CN": "zh-CN"}


def title_of(epub: Path):
    with zipfile.ZipFile(epub) as z:
        opf = next(n for n in z.namelist() if n.endswith(".opf"))
        m = re.search(r"<dc:title[^>]*>(.*?)</dc:title>", z.read(opf).decode("utf-8"), re.S)
        return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def packaged(progress: Path):
    data = json.loads(progress.read_text(encoding="utf-8"))
    books = data["books"] if isinstance(data.get("books"), list) else [data]
    out = {}
    for b in books:
        for loc in b.get("locales", []):
            if (loc.get("state") or loc.get("status")) == "packaged":
                out.setdefault(b.get("book", "dracula"), set()).add(loc["locale"])
    return out


found = []
plan = packaged(SRC / "starter-library-translations/progress.json")
for book, locales in plan.items():
    for loc in sorted(locales):
        f = SRC / "starter-library-translations" / book / loc / f"{book}-{loc}.epub"
        if f.is_file():
            found.append((book, loc, f))
drac = packaged(SRC / "dracula-multilingual/progress.json").get("dracula", set())
for d in sorted((SRC / "dracula-multilingual").iterdir()):
    if d.is_dir() and d.name in CODE and (d.name in drac or not drac):
        f = d / f"dracula-{d.name}.epub"
        if f.is_file() and d.name != "fr-FR":
            found.append(("dracula", d.name, f))
found.append(("dracula", "fr-FR", SRC / "dracula-fr-complet/dracula-fr.epub"))

if DEST.exists():
    shutil.rmtree(DEST)
index = {}
for book, loc, f in found:
    code = CODE[loc]
    target = DEST / code / f"{book}.epub"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(f, target)
    index.setdefault(f"starter-{book}", {})[code] = {
        "file": f"{code}/{book}.epub", "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "title": title_of(target),
        "translation": "AI translation from the English starter edition, first edition; independent review pending",
    }
(DEST.parent / "translations.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
total = sum(len(v) for v in index.values())
print(total, "editions;", {k: len(v) for k, v in index.items()}, f"{sum(p.stat().st_size for p in DEST.rglob('*.epub')) / 1e6:.1f} MB")
