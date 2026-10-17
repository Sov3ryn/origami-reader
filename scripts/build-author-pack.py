"""Builds the offline author pack from Wikidata (CC0).

Collects every Project Gutenberg author on Wikidata plus widely known writers,
then writes compact JSON into public/author-pack/: a language-neutral core,
a name and title index, and one label file per app language. The app never
contacts Wikidata; this script runs only when the pack is rebuilt.

  python scripts/build-author-pack.py [--cache DIR]

Responses are cached by query, so an interrupted run resumes where it stopped.
"""

import argparse
import hashlib
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "OrigamiReader-author-pack/0.1 (offline e-reader data build)"

# App language codes and the Wikidata label languages tried for each, in order.
LANGUAGES = {
    "en": ["en", "mul"],
    "zh-CN": ["zh-hans", "zh-cn", "zh"],
    "hi": ["hi"],
    "es": ["es"],
    "fr": ["fr"],
    "ar": ["ar"],
    "bn": ["bn"],
    "pt-BR": ["pt-br", "pt"],
    "ru": ["ru"],
    "ja": ["ja"],
    "de": ["de"],
    "ko": ["ko"],
    "tr": ["tr"],
    "vi": ["vi"],
    "it": ["it"],
    "id": ["id"],
    "pl": ["pl"],
    "uk": ["uk"],
    "nl": ["nl"],
    "th": ["th"],
}
WIKI_LANGS = sorted({code for codes in LANGUAGES.values() for code in codes})
LANG_FILTER = ", ".join(f'"{code}"' for code in WIKI_LANGS)

# Occupations that select well-known writers beyond Project Gutenberg.
WRITER_OCCUPATIONS = {
    "Q36180": 25,  # writer
    "Q6625963": 20,  # novelist
    "Q49757": 25,  # poet
    "Q214917": 25,  # playwright
    "Q11774202": 25,  # essayist
    "Q4853732": 15,  # children's writer
    "Q18844224": 15,  # science fiction writer
    "Q15949613": 20,  # short story writer
    "Q12144794": 25,  # prose writer
    "Q15980158": 25,  # non-fiction writer
    "Q4964182": 40,  # philosopher
    "Q201788": 40,  # historian
}
# A second group: modern genre writers at a much lower fame threshold, and
# web-fiction, light novel and self-published authors.
GENRE_OCCUPATIONS = [
    "Q5434338",  # fantasy author
    "Q18844224",  # science fiction writer
    "Q131322486",  # romance writer
    "Q62083492",  # young adult author
    "Q140310684",  # horror writer
    "Q10297252",  # crime fiction writer
    "Q4853732",  # children's writer
]
WEB_OCCUPATIONS = ["Q8010650", "Q11236655"]  # online writer, light novelist
WEB_GENRES = [
    "Q2552040",  # web fiction
    "Q136441690",  # web novels in China
    "Q137169253",  # web novels in Japan
    "Q104902491",  # web novels in South Korea
    "Q747381",  # light novel
    "Q104213567",  # light novel series
    "Q25493967",  # LitRPG
    "Q134506726",  # progression fantasy
    "Q53911753",  # isekai
    "Q24907097",  # xianxia
    "Q754803",  # wuxia
    "Q135525442",  # cultivation novels
]
PLATFORMS = [
    "Q141493322",  # Royal Road
    "Q7664857",  # Wattpad
    "Q137166233",  # Scribble Hub
    "Q130223530",  # WebNovel
    "Q24872561",  # Kakuyomu
    "Q3281156",  # Shosetsuka ni Naro
    "Q15912179",  # Qidian
    "Q21463262",  # KakaoPage
    "Q137597841",  # Naver Series
    "Q109546030",  # Munpia
    "Q11089373",  # Jinjiang Literature City
    "Q15823534",  # Kindle Direct Publishing
    "Q15861362",  # Patreon
]
# Profile identifiers that show where an author publishes.
PLATFORM_IDS = {"P11637": 7664857, "P11441": 3281156, "P14775": 15912179, "P4175": 15861362}

# Occupations that count as writing, for "Besides writing" facts.
WRITING_ROOTS = ["Q36180", "Q482980", "Q1930187", "Q333634", "Q1607826", "Q4263842", "Q28389"]
NOBEL_LITERATURE = 37922

FACT_PROPS = {
    "P31": "is",
    "P21": "gender",
    "P19": "birthPlace",
    "P20": "deathPlace",
    "P27": "country",
    "P106": "occupations",
    "P800": "notable",
    "P742": "penNames",
    "P135": "movements",
    "P463": "memberOf",
    "P69": "educated",
    "P26": "spouse",
    "P22": "father",
    "P25": "mother",
    "P3373": "sibling",
    "P40": "child",
    "P1938": "gutenberg",
}


class Wikidata:
    def __init__(self, cache: Path):
        self.cache = cache
        cache.mkdir(parents=True, exist_ok=True)
        self.calls = 0
        self.bytes = 0

    def query(self, sparql: str) -> list[dict]:
        key = hashlib.sha1(sparql.encode()).hexdigest()
        path = self.cache / f"{key}.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        data = urllib.parse.urlencode({"query": sparql}).encode()
        for attempt in range(6):
            request = urllib.request.Request(
                ENDPOINT,
                data=data,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/sparql-results+json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=70) as response:
                    body = response.read()
                rows = json.loads(body)["results"]["bindings"]
                self.calls += 1
                self.bytes += len(body)
                path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
                time.sleep(0.4)
                return rows
            except urllib.error.HTTPError as error:
                if error.code == 429:
                    wait = int(error.headers.get("Retry-After") or 30)
                    print(f"  rate limited, waiting {wait}s", flush=True)
                    time.sleep(wait)
                    continue
                if error.code in (500, 502, 503, 504):
                    raise TimeoutError(f"HTTP {error.code}") from error
                raise
            except (TimeoutError, json.JSONDecodeError) as error:
                # The service stops queries at 60 seconds; a smaller batch is
                # the fix, so the caller splits it instead of retrying.
                raise TimeoutError(str(error)) from error
            except urllib.error.URLError as error:
                if attempt >= 2:
                    raise TimeoutError(str(error)) from error
                time.sleep(5 * (attempt + 1))
        raise TimeoutError("too many retries")

    def batched(self, ids: list[int], template: str, size: int) -> list[dict]:
        """Runs a VALUES query over ids, halving batches that time out."""
        rows: list[dict] = []
        pending = [ids[i : i + size] for i in range(0, len(ids), size)]
        done = 0
        retries: dict[int, int] = {}
        while pending:
            batch = pending.pop(0)
            values = " ".join(f"wd:Q{i}" for i in batch)
            try:
                rows.extend(self.query(template.replace("%VALUES%", values)))
                done += len(batch)
                if done % (size * 10) < len(batch):
                    print(f"    {done}/{len(ids)}", flush=True)
            except TimeoutError:
                if len(batch) == 1:
                    retries[batch[0]] = retries.get(batch[0], 0) + 1
                    if retries[batch[0]] < 2:
                        time.sleep(5)
                        pending.append(batch)
                    else:
                        print(f"    skipped Q{batch[0]} (timeout)", flush=True)
                    continue
                half = len(batch) // 2
                pending[:0] = [batch[:half], batch[half:]]
        return rows

    def groups(self, groups: list[list[int]], template: str, size: int) -> list[dict]:
        """Batches each group separately, so adding a group leaves the cached
        batches of the others valid."""
        return [row for group in groups for row in self.batched(group, template, size)]


def qid(binding: dict) -> int | None:
    value = binding.get("value", "")
    match = re.search(r"/entity/Q(\d+)$", value)
    return int(match.group(1)) if match else None


def year_of(time_value: str, precision: int) -> int | None:
    # Wikidata times look like +1812-02-07T00:00:00Z; years before 1 are negative.
    match = re.match(r"([+-]?)(\d+)-", time_value)
    if not match or precision < 7:
        return None
    year = int(match.group(2))
    return -year if match.group(1) == "-" else year


# Both keys must match normalizeName and titleKey in src/authorPack.ts.
def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower().replace("ß", "ss"))
    return "".join(c for c in text if not unicodedata.category(c).startswith("M"))


def normalize(text: str) -> str:
    """Matching key for names: case, accents, punctuation, dates and word
    order are ignored, so "Dickens, Charles" matches "Charles Dickens"."""
    text = re.sub(r"\([^)]*\)", " ", _fold(text))
    return " ".join(sorted(re.findall(r"[^\W\d_]+", text)))


TITLE_ARTICLES = {"the", "a", "an", "le", "la", "les", "l", "der", "die", "das", "el", "los", "las", "il", "lo", "gli", "de", "het", "een", "o", "os", "as"}


def title_key(text: str) -> str:
    words = re.findall(r"[^\W_]+", _fold(text))
    if len(words) > 1 and words[0] in TITLE_ARTICLES:
        words = words[1:]
    return " ".join(words)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cache",
        type=Path,
        default=ROOT.parent / "work" / "author-pack" / "cache",
    )
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "author-pack")
    args = parser.parse_args()
    wd = Wikidata(args.cache)

    print("Selecting authors", flush=True)
    candidates: set[int] = set()
    for row in wd.query("SELECT ?a WHERE { ?a wdt:P1938 ?g . }"):
        if (i := qid(row["a"])) is not None:
            candidates.add(i)
    print(f"  Project Gutenberg: {len(candidates)}", flush=True)
    for occupation, minimum in WRITER_OCCUPATIONS.items():
        ranges = [(minimum, 10_000)]
        while ranges:
            low, high = ranges.pop()
            sparql = (
                f"SELECT ?a WHERE {{ ?a wdt:P106 wd:{occupation}; wikibase:sitelinks ?s . "
                f"FILTER(?s >= {low} && ?s < {high}) }}"
            )
            try:
                found = [qid(r["a"]) for r in wd.query(sparql)]
            except TimeoutError:
                middle = low + max(1, (min(high, 400) - low) // 2)
                ranges += [(low, middle), (middle, high)]
                continue
            candidates.update(i for i in found if i is not None)
        print(f"  after {occupation}: {len(candidates)}", flush=True)
    classic = sorted(candidates)

    extra: set[int] = set()
    web: set[int] = set()

    def select(sparql: str, into: set[int]) -> None:
        try:
            into.update(i for i in (qid(r["a"]) for r in wd.query(sparql)) if i is not None)
        except TimeoutError:
            print("  a selection query timed out", flush=True)

    for occupation in GENRE_OCCUPATIONS:
        select(
            f"SELECT ?a WHERE {{ ?a wdt:P106 wd:{occupation}; wikibase:sitelinks ?s . FILTER(?s >= 2) }}",
            extra,
        )
    select(
        """SELECT ?a WHERE { ?a wdt:P106 wd:Q6625963 ; wikibase:sitelinks ?s ; wdt:P569 ?b .
        FILTER(?s >= 6 && ?s < 20) FILTER(YEAR(?b) >= 1950) }""",
        extra,
    )
    occupations = " ".join(f"wd:{o}" for o in WEB_OCCUPATIONS)
    select(f"SELECT DISTINCT ?a WHERE {{ VALUES ?o {{ {occupations} }} ?a wdt:P106 ?o . }}", web)
    id_props = " ".join(f"wdt:{p}" for p in PLATFORM_IDS if p != "P4175")
    select(
        f"SELECT DISTINCT ?a WHERE {{ VALUES ?p {{ {id_props} }} ?a ?p ?v . ?a wdt:P31 wd:Q5 . }}",
        web,
    )
    genres = " ".join(f"wd:{g}" for g in WEB_GENRES)
    select(
        f"""SELECT DISTINCT ?a WHERE {{ VALUES ?g {{ {genres} }}
        {{ ?w wdt:P136 ?g }} UNION {{ ?w wdt:P31 ?g }} ?w wdt:P50 ?a . ?a wdt:P31 wd:Q5 . }}""",
        web,
    )
    platforms = " ".join(f"wd:{p}" for p in PLATFORMS)
    select(
        f"""SELECT DISTINCT ?a WHERE {{ VALUES ?pl {{ {platforms} }}
        VALUES ?p {{ wdt:P123 wdt:P1433 wdt:P750 }} ?w ?p ?pl . ?w wdt:P50 ?a . }}""",
        web,
    )
    select(
        """SELECT DISTINCT ?a WHERE { ?a wdt:P4175 ?v ; wdt:P106 ?o .
        VALUES ?o { wd:Q36180 wd:Q6625963 wd:Q18844224 wd:Q15949613 wd:Q4853732 wd:Q49757 } }""",
        web,
    )
    select(
        """SELECT DISTINCT ?a WHERE { ?a wdt:P4862 ?v ; wdt:P106 wd:Q6625963 ; wdt:P569 ?b .
        FILTER(YEAR(?b) >= 1940) }""",
        web,
    )
    second = sorted((extra | web) - candidates)
    print(f"  genre, modern and web writers: {len(second)} more ({len(web)} web or indie)", flush=True)
    groups = [classic, second]
    ids = classic + second

    print("Facts", flush=True)
    props = " ".join(f"wdt:{p}" for p in FACT_PROPS)
    facts: dict[int, dict] = defaultdict(lambda: defaultdict(list))
    for row in wd.groups(
        groups,
        f"SELECT ?a ?p ?v WHERE {{ VALUES ?a {{ %VALUES% }} VALUES ?p {{ {props} }} ?a ?p ?v . }}",
        300,
    ):
        a = qid(row["a"])
        prop = row["p"]["value"].rsplit("/", 1)[-1]
        value = row["v"]
        key = FACT_PROPS.get(prop)
        if a is None or not key:
            continue
        if value["type"] == "uri":
            target = qid(value)
            if target is not None:
                facts[a][key].append(target)
        else:
            facts[a][key].append(value["value"])
    for row in wd.groups(
        groups,
        "SELECT ?a ?s WHERE { VALUES ?a { %VALUES% } ?a wikibase:sitelinks ?s . }",
        600,
    ):
        facts[qid(row["a"])]["sitelinks"] = [int(row["s"]["value"])]

    # Only people continue: Project Gutenberg also credits countries and
    # organizations, whose huge entries make later queries time out.
    groups = [[a for a in g if 5 in facts[a].get("is", [])] for g in groups]
    print(f"  people: {sum(len(g) for g in groups)}", flush=True)

    print("Dates", flush=True)
    for row in wd.groups(
        groups,
        # A UNION here makes the query planner time out; a VALUES pair of
        # properties answers in under a second.
        """SELECT ?a ?p ?t ?prec WHERE { VALUES ?a { %VALUES% }
        VALUES (?p ?ps) { (p:P569 psv:P569) (p:P570 psv:P570) }
        ?a ?p ?st . ?st ?ps ?n . ?n wikibase:timeValue ?t ; wikibase:timePrecision ?prec .
        ?st wikibase:rank ?r . FILTER(?r != wikibase:DeprecatedRank) }""",
        300,
    ):
        year = year_of(row["t"]["value"], int(row["prec"]["value"]))
        if year is not None:
            kind = "born" if row["p"]["value"].endswith("P569") else "died"
            facts[qid(row["a"])][kind].append(year)

    print("Awards and Nobel nominations", flush=True)
    for row in wd.groups(
        groups,
        """SELECT ?a ?aw ?when WHERE { VALUES ?a { %VALUES% }
        ?a p:P166 ?st . ?st ps:P166 ?aw . OPTIONAL { ?st pq:P585 ?when } }""",
        300,
    ):
        when = row.get("when", {}).get("value", "")
        found = re.match(r"\+?(\d{4})-", when)
        year = int(found.group(1)) if found else None
        facts[qid(row["a"])]["awards"].append((qid(row["aw"]), year))
    for row in wd.groups(
        groups,
        f"""SELECT ?a (COUNT(?st) AS ?n) WHERE {{ VALUES ?a {{ %VALUES% }}
        ?a p:P1411 ?st . ?st ps:P1411 wd:Q{NOBEL_LITERATURE} . }} GROUP BY ?a""",
        300,
    ):
        facts[qid(row["a"])]["nobelNominations"] = [int(row["n"]["value"])]

    # Keep people only, with something worth showing.
    def keep(a: int) -> bool:
        f = facts[a]
        return 5 in f.get("is", []) and bool(
            f.get("born") or f.get("occupations") or f.get("notable") or a in web
        )

    people_groups = [[a for a in g if keep(a)] for g in groups]
    people = [a for g in people_groups for a in g]
    print(f"  people kept: {len(people)} of {len(ids)}", flush=True)

    print("Works by each author", flush=True)
    works_by: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for row in wd.groups(
        people_groups,
        """SELECT ?a ?w ?s WHERE { VALUES ?a { %VALUES% }
        ?w wdt:P50 ?a ; wikibase:sitelinks ?s . FILTER(?s >= 3) }""",
        200,
    ):
        works_by[qid(row["a"])].append((qid(row["w"]), int(row["s"]["value"])))

    print("Genres, portraits and platforms", flush=True)
    extra_props = " ".join(f"wdt:{p}" for p in ["P136", "P18", *PLATFORM_IDS])
    for row in wd.groups(
        people_groups,
        f"SELECT ?a ?p ?v WHERE {{ VALUES ?a {{ %VALUES% }} VALUES ?p {{ {extra_props} }} ?a ?p ?v . }}",
        300,
    ):
        a = qid(row["a"])
        prop = row["p"]["value"].rsplit("/", 1)[-1]
        if prop == "P136":
            if (g := qid(row["v"])) is not None:
                facts[a]["genres"].append(g)
        elif prop == "P18":
            name = urllib.parse.unquote(row["v"]["value"].rsplit("/", 1)[-1])
            facts[a]["image"].append(name)
        elif prop in PLATFORM_IDS:
            facts[a]["platforms"].append(PLATFORM_IDS[prop])
    web_people = sorted(a for a in people if a in web)
    web_works: dict[int, list[int]] = defaultdict(list)
    for row in wd.batched(
        web_people,
        """SELECT ?a ?w (SAMPLE(?n) AS ?s) WHERE { VALUES ?a { %VALUES% } ?w wdt:P50 ?a .
        OPTIONAL { ?w wikibase:sitelinks ?n } } GROUP BY ?a ?w""",
        100,
    ):
        a, w = qid(row["a"]), qid(row["w"])
        web_works[w].append(a)
        if all(x != w for x, _ in works_by[a]):
            works_by[a].append((w, int(row.get("s", {}).get("value", 0))))
    platform_set = {int(p[1:]) for p in PLATFORMS}
    for row in wd.batched(
        sorted(web_works),
        """SELECT ?w ?p ?v WHERE { VALUES ?w { %VALUES% }
        VALUES ?p { wdt:P136 wdt:P123 wdt:P1433 wdt:P750 } ?w ?p ?v . }""",
        300,
    ):
        w, v = qid(row["w"]), qid(row["v"])
        if v is None:
            continue
        for a in web_works[w]:
            if row["p"]["value"].endswith("P136"):
                facts[a]["workGenres"].append(v)
            elif v in platform_set:
                facts[a]["platforms"].append(v)

    print("Author names and descriptions", flush=True)
    names: dict[int, dict[str, str]] = defaultdict(dict)
    descriptions: dict[int, dict[str, str]] = defaultdict(dict)
    aliases: dict[int, set[str]] = defaultdict(set)
    for row in wd.groups(
        people_groups,
        f"""SELECT ?a ?k ?l WHERE {{ VALUES ?a {{ %VALUES% }}
        {{ ?a rdfs:label ?l . BIND("l" AS ?k) }} UNION
        {{ ?a schema:description ?l . BIND("d" AS ?k) }} UNION
        {{ ?a skos:altLabel ?l . BIND("a" AS ?k) }}
        FILTER(LANG(?l) IN ({LANG_FILTER})) }}""",
        200,
    ):
        a = qid(row["a"])
        lang = row["l"].get("xml:lang", "")
        text = row["l"]["value"].strip()
        kind = row["k"]["value"]
        if kind == "l":
            names[a][lang] = text
            aliases[a].add(text)
        elif kind == "d":
            descriptions[a][lang] = text
        else:
            aliases[a].add(text)

    # Notable works: P800 first, then the author's most linked works.
    notable: dict[int, list[int]] = {}
    for a in people:
        listed = list(dict.fromkeys(facts[a].get("notable", [])))
        ranked = [w for w, _ in sorted(works_by.get(a, []), key=lambda x: -x[1])]
        notable[a] = list(dict.fromkeys(listed + ranked))[:4]

    print("Labels and types of referenced items", flush=True)
    person_set = set(people)
    referenced: set[int] = set()
    for a in people:
        f = facts[a]
        for key in ("birthPlace", "deathPlace", "country", "occupations", "movements",
                    "memberOf", "educated", "genres", "workGenres", "platforms"):
            referenced.update(x for x in f.get(key, []) if isinstance(x, int))
        referenced.update(aw for aw, _ in f.get("awards", []) if aw)
        referenced.update(notable[a])
    title_works = {
        w for a in people for w, s in works_by.get(a, []) if s >= 5 or a in web
    }
    referenced |= title_works
    referenced -= person_set
    refs = sorted(referenced)
    labels: dict[int, dict[str, str]] = defaultdict(dict)
    for row in wd.batched(
        refs,
        f"""SELECT ?i ?l WHERE {{ VALUES ?i {{ %VALUES% }} ?i rdfs:label ?l .
        FILTER(LANG(?l) IN ({LANG_FILTER})) }}""",
        400,
    ):
        labels[qid(row["i"])][row["l"]["xml:lang"]] = row["l"]["value"].strip()

    # Genres of individual works, so a book can be tagged by its own genres
    # rather than its author's. Fetched separately to keep earlier batches.
    print("Genres of works", flush=True)
    genre_works = sorted(title_works | {w for a in people for w in notable[a]})
    work_genres: dict[int, list[int]] = defaultdict(list)
    for row in wd.batched(
        genre_works,
        "SELECT ?i ?g WHERE { VALUES ?i { %VALUES% } ?i wdt:P136 ?g . }",
        300,
    ):
        w, g = qid(row["i"]), qid(row["g"])
        if w is not None and g is not None and g not in work_genres[w]:
            work_genres[w].append(g)
    new_genres = sorted({g for gs in work_genres.values() for g in gs} - set(labels))
    for row in wd.batched(
        new_genres,
        f"""SELECT ?i ?l WHERE {{ VALUES ?i {{ %VALUES% }} ?i rdfs:label ?l .
        FILTER(LANG(?l) IN ({LANG_FILTER})) }}""",
        400,
    ):
        labels[qid(row["i"])][row["l"]["xml:lang"]] = row["l"]["value"].strip()

    occupations = sorted({o for a in people for o in facts[a].get("occupations", [])})
    writing: set[int] = set()
    roots = " ".join(f"wd:{r}" for r in WRITING_ROOTS)
    for row in wd.batched(
        occupations,
        f"SELECT DISTINCT ?i WHERE {{ VALUES ?i {{ %VALUES% }} VALUES ?r {{ {roots} }} ?i wdt:P279* ?r . }}",
        200,
    ):
        writing.add(qid(row["i"]))
    writing.update(int(r[1:]) for r in WRITING_ROOTS)

    awards = sorted({aw for a in people for aw, _ in facts[a].get("awards", []) if aw})
    literary: set[int] = {NOBEL_LITERATURE}
    for row in wd.batched(
        awards,
        """SELECT DISTINCT ?i WHERE { VALUES ?i { %VALUES% }
        { ?i wdt:P31/wdt:P279* wd:Q378427 } UNION { ?i wdt:P279+ wd:Q378427 } }""",
        200,
    ):
        literary.add(qid(row["i"]))

    orgs = sorted({o for a in people for o in facts[a].get("memberOf", [])})
    academies: set[int] = set()
    for row in wd.batched(
        orgs,
        """SELECT DISTINCT ?i WHERE { VALUES ?i { %VALUES% }
        VALUES ?c { wd:Q162633 wd:Q955824 } ?i wdt:P31/wdt:P279* ?c . }""",
        200,
    ):
        academies.add(qid(row["i"]))

    work_years: dict[int, int] = {}
    work_ids = sorted({w for a in people for w in notable[a]})
    for row in wd.batched(
        work_ids,
        "SELECT ?i (MIN(?d) AS ?y) WHERE { VALUES ?i { %VALUES% } ?i wdt:P577 ?d . } GROUP BY ?i",
        400,
    ):
        match = re.match(r"(-?)(\d{4})", row["y"]["value"])
        if match:
            work_years[qid(row["i"])] = int(match.group(0))

    print("Writing the pack", flush=True)
    write_pack(
        args.out, people, facts, names, descriptions, aliases, notable, works_by,
        labels, writing, literary, academies, work_years, web, work_genres,
    )
    # Portrait file names for scripts/build-author-portraits.py.
    images = {a: facts[a]["image"][0] for a in people if facts[a].get("image")}
    (args.cache.parent / "images.json").write_text(json.dumps(images), encoding="utf-8")
    print(f"  {len(images)} authors have a Commons portrait", flush=True)
    print(f"Done: {wd.calls} new queries, {wd.bytes / 1e6:.1f} MB downloaded", flush=True)


def pick(values: dict[str, str], lang: str) -> str:
    for code in LANGUAGES[lang]:
        if values.get(code):
            return values[code]
    return ""


def write_pack(out, people, facts, names, descriptions, aliases, notable, works_by,
               labels, writing, literary, academies, work_years, web, work_genres) -> None:
    out.mkdir(parents=True, exist_ok=True)
    person_set = set(people)
    authors = []
    used: set[int] = set()
    for a in people:
        f = facts[a]
        gender = {6581097: "m", 6581072: "f"}.get((f.get("gender") or [0])[0], "")
        born = min(f["born"]) if f.get("born") else None
        died = max(f["died"]) if f.get("died") else None
        others = [o for o in dict.fromkeys(f.get("occupations", [])) if o not in writing][:3]
        awards = []
        for aw, year in f.get("awards", []):
            if aw in literary and all(x[0] != aw for x in awards):
                awards.append([aw, year] if year else [aw])
        # The Nobel Prize first, then the rest in Wikidata's order.
        awards.sort(key=lambda x: x[0] != NOBEL_LITERATURE)
        awards = awards[:4]
        relatives = []
        for key, code in (("spouse", "s"), ("father", "p"), ("mother", "p"), ("sibling", "b"), ("child", "c")):
            for r in dict.fromkeys(f.get(key, [])):
                if r in person_set and r != a:
                    relatives.append([code, r])
        entry = {"id": a}
        if gender:
            entry["g"] = gender
        if born is not None:
            entry["b"] = born
        if died is not None:
            entry["d"] = died
        for key, value in (
            ("bp", (f.get("birthPlace") or [None])[0]),
            ("dp", (f.get("deathPlace") or [None])[0]),
        ):
            if value:
                entry[key] = value
        lists = {
            "c": list(dict.fromkeys(f.get("country", [])))[:2],
            "o": list(dict.fromkeys(f.get("occupations", [])))[:4],
            "x": others,
            "w": [[w, work_years[w]] if w in work_years else [w] for w in notable.get(a, [])],
            "m": list(dict.fromkeys(f.get("movements", [])))[:2],
            "ac": [o for o in dict.fromkeys(f.get("memberOf", [])) if o in academies][:2],
            "ed": list(dict.fromkeys(f.get("educated", [])))[:2],
            "aw": awards,
            "r": relatives[:4],
            "pn": [p for p in dict.fromkeys(f.get("penNames", [])) if p not in names[a].values()][:3],
            "ge": [g for g, _ in sorted(
                Counter(f.get("genres", []) * 3 + f.get("workGenres", [])).items(),
                key=lambda x: -x[1],
            )][:3],
            "pl": list(dict.fromkeys(f.get("platforms", [])))[:3],
        }
        for key, value in lists.items():
            if value:
                entry[key] = value
        if f.get("nobelNominations"):
            entry["nn"] = f["nobelNominations"][0]
        entry["s"] = (f.get("sitelinks") or [0])[0]
        for key in ("bp", "dp"):
            if key in entry:
                used.add(entry[key])
        for key in ("c", "o", "x", "m", "ac", "ed", "ge", "pl"):
            used.update(entry.get(key, []))
        used.update(x[0] for x in entry.get("w", []))
        used.update(x[0] for x in entry.get("aw", []))
        authors.append(entry)

    # Name index: every label and alias of each author, most linked first.
    by_fame = sorted(people, key=lambda a: -((facts[a].get("sitelinks") or [0])[0]))
    name_index: dict[str, list[int]] = defaultdict(list)
    for a in by_fame:
        for alias in aliases.get(a, ()):
            key = normalize(alias)
            if len(key) >= 3 and a not in name_index[key]:
                name_index[key].append(a)
    # Title index for books that arrive without an author: titles of works
    # with at least five Wikipedia articles, in every app language.
    title_index: dict[str, list[int]] = defaultdict(list)
    for a in by_fame:
        for w, s in works_by.get(a, []):
            if s < 5 and a not in web:
                continue
            for title in labels.get(w, {}).values():
                key = title_key(title)
                if len(key) >= (4 if s >= 5 else 6) and a not in title_index[key]:
                    title_index[key].append(a)

    meta = {
        "version": time.strftime("%Y-%m-%d"),
        "source": "Wikidata (CC0 1.0)",
        "count": len(authors),
    }
    write(out / "authors.json", {**meta, "authors": authors})
    # A work's own genres by title, with its author first: [author, genre...].
    title_genres: dict[str, list[int]] = {}
    for a in by_fame:
        for w, s in works_by.get(a, []):
            genres = work_genres.get(w)
            if not genres or (s < 5 and a not in web):
                continue
            for title in labels.get(w, {}).values():
                key = title_key(title)
                if len(key) >= 4 and key not in title_genres:
                    title_genres[key] = [a, *genres[:4]]
                    used.update(genres[:4])
    write(out / "index.json", {
        **meta,
        "names": {k: v[:5] for k, v in name_index.items()},
        "titles": {k: v[:3] for k, v in title_index.items()},
        "titleGenres": title_genres,
    })
    for lang in LANGUAGES:
        english = lang == "en"
        data = {"names": {}, "descriptions": {}, "labels": {}}
        for a in people:
            name = pick(names[a], lang)
            if name and (english or name != pick(names[a], "en")):
                data["names"][a] = name
            description = pick(descriptions[a], lang)
            if description:
                data["descriptions"][a] = description
        for item in sorted(used):
            label = pick(labels.get(item, {}), lang)
            if label and (english or label != pick(labels.get(item, {}), "en")):
                data["labels"][item] = label
        write(out / f"{lang}.json", data)


def write(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  {path.name}: {path.stat().st_size / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    sys.exit(main())
