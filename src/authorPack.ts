// The offline author pack: facts about about 28,000 authors from Wikidata
// (CC0), built by scripts/build-author-pack.py into public/author-pack. The
// app never goes online for it. Notes are written from facts only, so every
// sentence and trivia line is something Wikidata records.
import type { AuthorNote } from "./authors";
import { t } from "./i18n";

type Ref = [number] | [number, number];
export type PackAuthor = {
  id: number;
  g?: "m" | "f";
  b?: number;
  d?: number;
  bp?: number;
  dp?: number;
  c?: number[];
  o?: number[];
  x?: number[];
  w?: Ref[];
  m?: number[];
  ac?: number[];
  ed?: number[];
  aw?: Ref[];
  r?: ["s" | "p" | "b" | "c", number][];
  pn?: string[];
  nn?: number;
  // Genres and the web or self-publishing platforms used.
  ge?: number[];
  pl?: number[];
  s: number;
};
export type PackIndex = {
  names: Record<string, number[]>;
  titles: Record<string, number[]>;
  // A work's own genres by title: [author, genre, ...].
  titleGenres?: Record<string, number[]>;
};
export type PackLabels = {
  names: Record<string, string>;
  descriptions: Record<string, string>;
  labels: Record<string, string>;
};
export type Pack = {
  authors: Map<number, PackAuthor>;
  index: PackIndex;
  // The chosen language, then English for anything it lacks.
  text: PackLabels[];
};

const NOBEL_LITERATURE = 37922;

function fold(text: string) {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}
// Matching keys; must match normalize and title_key in the build script.
export function normalizeName(text: string) {
  const words =
    fold(text)
      .replace(/\([^)]*\)/g, " ")
      .match(/[\p{L}\p{Nl}\p{No}]+/gu) || [];
  return words.sort().join(" ");
}
const titleArticles = new Set(
  "the a an le la les l der die das el los las il lo gli de het een o os as".split(
    " ",
  ),
);
export function titleKey(text: string) {
  const words = fold(text).match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length > 1 && titleArticles.has(words[0]!)) words.shift();
  return words.join(" ");
}

// Book metadata often lists several people, life dates or roles:
// "Dickens, Charles, 1812-1870; Browne, Hablot K. (Illustrator)".
function primaryAuthor(author: string) {
  return author.split(/;|&|\s+and\s+|\s+et\s+|\s+und\s+/i)[0].trim();
}
export function isUnknownAuthor(author: string) {
  return (
    !author.trim() ||
    /^(unknown( author)?|anonymous|anon\.?)$/i.test(author.trim())
  );
}

// The pack entry for a book: by author name, using the title to choose between
// namesakes, or by title alone when the author is unknown.
export function findAuthor(
  pack: Pick<Pack, "authors" | "index">,
  book: { author: string; title: string },
): PackAuthor | null {
  const byTitle = pack.index.titles[titleKey(book.title)] || [];
  if (!isUnknownAuthor(book.author)) {
    const people = pack.index.names[normalizeName(primaryAuthor(book.author))];
    if (!people?.length) return null;
    const id = people.find((p) => byTitle.includes(p)) ?? people[0];
    return pack.authors.get(id) || null;
  }
  // Without an author, only a title that belongs to one known author counts.
  return byTitle.length === 1 ? pack.authors.get(byTitle[0]) || null : null;
}

// Finds a known author named near the start of a book: "Author: Jane Austen"
// in Project Gutenberg headers, or a "by Jane Austen" title-page line.
export function authorFromText(
  pack: Pick<Pack, "authors" | "index">,
  paragraphs: string[],
): { author: PackAuthor; written: string } | null {
  for (const paragraph of paragraphs.slice(0, 60)) {
    const line = paragraph.trim();
    if (line.length > 120) continue;
    const match = line.match(/^(?:author\s*:|by)\s+(.{3,80})$/i);
    if (!match) continue;
    const written = primaryAuthor(match[1])
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/[.,;:]+$/, "");
    const author = pack.authors.get(
      pack.index.names[normalizeName(written)]?.[0] ?? -1,
    );
    if (author) return { author, written };
  }
  return null;
}

// A title still showing a file name ("pg84", "my_book-v2") or the Quick Read
// placeholder, which the text may be able to replace.
export function looksUntitled(title: string) {
  const t = title.trim();
  return (
    !t || t === "Untitled text" || (!/\s/.test(t) && /[\d_-]|^\p{Ll}/u.test(t))
  );
}
function titleCase(text: string) {
  return text === text.toUpperCase() && /\p{Lu}/u.test(text)
    ? text
        .toLowerCase()
        .replace(/(^|[\s(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    : text;
}
function cleanTitle(text: string) {
  return titleCase(
    text
      .replace(/\s+/g, " ")
      .replace(/[\s;,:.]+$/, "")
      .trim(),
  );
}
// The title from the opening of a book: the short lines above a "by ..."
// line, or an opening line that is the title of a known work.
export function titleFromText(
  pack: Pick<Pack, "index">,
  paragraphs: string[],
): string {
  const opening = paragraphs.slice(0, 40).map((p) => p.trim());
  const byLine = opening.findIndex(
    (p) => p.length <= 120 && /^by\s+\S/i.test(p),
  );
  if (byLine > 0) {
    const lines: string[] = [];
    for (let i = byLine - 1; i >= 0 && lines.length < 3; i--) {
      const line = opening[i];
      if (
        !line ||
        line.length > 80 ||
        /^(contents|chapter|preface)\b/i.test(line)
      )
        break;
      lines.unshift(line);
    }
    const title = cleanTitle(lines.map(titleCase).join(" "));
    if (title.length >= 2 && title.length <= 150) return title;
  }
  for (const line of opening.slice(0, 15))
    if (line.length <= 80 && pack.index.titles[titleKey(line)])
      return cleanTitle(line);
  return "";
}
// Genre tags for a book from its author's usual genres, in English like the
// rest of the library's tags.
// Genres that describe an author's other writing rather than a novel.
const notBookGenres =
  /travel|essay|biograph|non-?fiction|letter|diar|journalis|memoir|poetry|speech|textbook|criticism/i;
// Genres too general to say anything about a book.
const plainGenres =
  /^(novel|fiction|literature|prose|literary work|narrative|book|story|written work)$/i;
function genreTags(pack: Pack, ids: number[], limit: number) {
  const english = pack.text.at(-1)!;
  return ids
    .map((g) => english.labels[g] || "")
    .filter(
      (g) =>
        g && g.length <= 30 && !notBookGenres.test(g) && !plainGenres.test(g),
    )
    .map((g) => g[0].toUpperCase() + g.slice(1))
    .filter((g, i, all) => all.indexOf(g) === i)
    .slice(0, limit);
}
export function authorGenres(pack: Pack, a: PackAuthor) {
  return genreTags(pack, a.ge || [], 2);
}
// A book's own genres when its title is a known work by this author (or by
// anyone, when the author is unknown). Subtitles after ";" or ":" are tried
// without as well: "Frankenstein; or, the Modern Prometheus".
export function workGenres(
  pack: Pack,
  title: string,
  author: PackAuthor | null,
): string[] {
  const titles = pack.index.titleGenres;
  if (!titles) return [];
  for (const candidate of [title, title.split(/[;:]/)[0]]) {
    const entry = titles[titleKey(candidate)];
    if (entry && (!author || entry[0] === author.id))
      return genreTags(pack, entry.slice(1), 3);
  }
  return [];
}
// Fills what a book arrived without: its author (from a by-line, a Project
// Gutenberg header line or a known title), its title (from the opening
// lines) and genre tags (from the author's usual genres).
export function fillBookDetails(
  pack: Pack,
  book: {
    meta: { title: string; author: string; genres?: string[] };
    paragraphs: { text: string }[];
  },
) {
  const texts = book.paragraphs.map((p) => p.text);
  const meta = book.meta;
  if (looksUntitled(meta.title)) {
    const title = titleFromText(pack, texts);
    if (title) meta.title = title;
  }
  let author: PackAuthor | null = null;
  if (isUnknownAuthor(meta.author)) {
    const fromText = authorFromText(pack, texts);
    if (fromText) {
      author = fromText.author;
      meta.author = fromText.written;
    } else {
      author = findAuthor(pack, meta);
      const name = author && authorName(pack, author.id);
      if (name) meta.author = name;
    }
  } else author = findAuthor(pack, meta);
  if (!meta.genres?.length) {
    const own = workGenres(pack, meta.title, author);
    const genres = own.length ? own : author ? authorGenres(pack, author) : [];
    if (genres.length) meta.genres = genres;
  }
}

function label(pack: Pack, id: number) {
  for (const text of pack.text) if (text.labels[id]) return text.labels[id];
  return "";
}
export function authorName(pack: Pack, id: number) {
  for (const text of pack.text) if (text.names[id]) return text.names[id];
  return "";
}
function list(items: string[], language: string) {
  const shown = items.filter(Boolean);
  try {
    return new Intl.ListFormat(language, { type: "conjunction" }).format(shown);
  } catch {
    return shown.join(", ");
  }
}
function capitalize(text: string) {
  return text ? text[0].toLocaleUpperCase() + text.slice(1) : text;
}
function sentence(text: string) {
  const trimmed = capitalize(text.trim());
  return /[.!?。！？]$/.test(trimmed) ? trimmed : trimmed + ".";
}
function year(value: number) {
  return value < 0 ? t("{year} BC", { year: -value }) : String(value);
}
export function lifeYears(a: PackAuthor) {
  if (a.b !== undefined && a.d !== undefined)
    return `${year(a.b)}-${year(a.d)}`;
  if (a.b !== undefined) return t("Born {year}", { year: year(a.b) });
  if (a.d !== undefined) return t("Died {year}", { year: year(a.d) });
  return "";
}

// A short paragraph and trivia lines in the interface language.
export function packNote(
  pack: Pack,
  a: PackAuthor,
  language: string,
  fallbackName: string,
): AuthorNote {
  const g = a.g;
  const bio: string[] = [];
  const own = pack.text[0].descriptions[a.id];
  const english = pack.text.at(-1)!.descriptions[a.id];
  // A description only when it is in the chosen language; otherwise the
  // occupations and country, which have labels in many more languages.
  // Life dates already show beside the name.
  if (own) bio.push(sentence(own.replace(/\s*\([^)]*\d{3,4}[^)]*\)\s*$/, "")));
  else {
    const jobs = list(
      (a.o || []).map((o) => label(pack, o)),
      language,
    );
    const country = (a.c || []).map((c) => label(pack, c))[0];
    if (jobs) bio.push(sentence(country ? `${jobs} (${country})` : jobs));
    else if (english && language === "en") bio.push(sentence(english));
  }
  const genres = (a.ge || []).map((x) => label(pack, x)).filter(Boolean);
  if (genres.length)
    bio.push(t("Genres: {genres}.", { genres: list(genres, language) }));
  const birth = a.bp ? label(pack, a.bp) : "";
  const death = a.dp && a.dp !== a.bp ? label(pack, a.dp) : "";
  if (birth && death)
    bio.push(
      g === "m"
        ? t("He was born in {birth} and died in {death}.", { birth, death })
        : g === "f"
          ? t("She was born in {birth} and died in {death}.", { birth, death })
          : t("Born in {birth}; died in {death}.", { birth, death }),
    );
  else if (birth)
    bio.push(
      g === "m"
        ? t("He was born in {birth}.", { birth })
        : g === "f"
          ? t("She was born in {birth}.", { birth })
          : t("Born in {birth}.", { birth }),
    );
  else if (death)
    bio.push(
      g === "m"
        ? t("He died in {death}.", { death })
        : g === "f"
          ? t("She died in {death}.", { death })
          : t("Died in {death}.", { death }),
    );
  const works = (a.w || [])
    .map(([w, y]) => {
      const title = label(pack, w);
      return title && y ? `${title} (${year(y)})` : title;
    })
    // The same title can be a novel and its adaptation; list it once.
    .filter((w, i, all) => w && all.indexOf(w) === i)
    .slice(0, 3);
  if (works.length)
    bio.push(t("Best known for {works}.", { works: list(works, language) }));
  const movements = (a.m || []).map((m) => label(pack, m)).filter(Boolean);
  if (movements.length)
    bio.push(
      t("Associated with {movements}.", {
        movements: list(movements, language),
      }),
    );

  const facts: string[] = [];
  const platforms = (a.pl || []).map((x) => label(pack, x)).filter(Boolean);
  if (platforms.length)
    facts.push(
      t("Published on {platforms}.", {
        platforms: list(platforms, language),
      }),
    );
  for (const [award, when] of a.aw || []) {
    if (award === NOBEL_LITERATURE)
      facts.push(
        when
          ? t("Won the Nobel Prize in Literature in {year}.", { year: when })
          : t("Won the Nobel Prize in Literature."),
      );
    else {
      const name = label(pack, award);
      if (name)
        facts.push(
          when
            ? t("Won the {award} in {year}.", { award: name, year: when })
            : t("Won the {award}.", { award: name }),
        );
    }
  }
  const nobel = (a.aw || []).some(([award]) => award === NOBEL_LITERATURE);
  if (a.nn && a.nn > 1)
    facts.push(
      t("Nominated for the Nobel Prize in Literature {count} times.", {
        count: a.nn,
      }),
    );
  else if (a.nn && !nobel)
    facts.push(t("Nominated for the Nobel Prize in Literature."));
  if (a.pn?.length)
    facts.push(t("Also wrote as {names}.", { names: list(a.pn, language) }));
  for (const [kind, other] of a.r || []) {
    const name = authorName(pack, other);
    if (!name) continue;
    facts.push(
      kind === "s"
        ? t("Married to fellow writer {name}.", { name })
        : kind === "p"
          ? g === "m"
            ? t("Son of writer {name}.", { name })
            : g === "f"
              ? t("Daughter of writer {name}.", { name })
              : t("Child of writer {name}.", { name })
          : kind === "b"
            ? g === "m"
              ? t("Brother of writer {name}.", { name })
              : g === "f"
                ? t("Sister of writer {name}.", { name })
                : t("Sibling of writer {name}.", { name })
            : g === "m"
              ? t("Father of writer {name}.", { name })
              : g === "f"
                ? t("Mother of writer {name}.", { name })
                : t("Parent of writer {name}.", { name }),
    );
  }
  for (const org of a.ac || []) {
    const name = label(pack, org);
    if (name) facts.push(t("Member of the {org}.", { org: name }));
  }
  const other = (a.x || []).map((o) => label(pack, o)).filter(Boolean);
  if (other.length)
    facts.push(
      t("Besides writing, also worked as: {list}.", {
        list: list(other, language),
      }),
    );
  const schools = (a.ed || []).map((e) => label(pack, e)).filter(Boolean);
  if (schools.length)
    facts.push(
      t("Studied at {schools}.", { schools: list(schools, language) }),
    );
  // A name ending in a period ("M. W. S.") must not end a sentence twice.
  const tidy = (text: string) => text.replace(/([.!?])\.$/, "$1");
  return {
    name: authorName(pack, a.id) || fallbackName,
    years: lifeYears(a),
    bio: bio.map(tidy).join(" "),
    facts: facts.map(tidy),
    source: t("From Wikidata"),
  };
}

// Portraits: 80 px WebP squares from Wikimedia Commons, packed into shard
// files by scripts/build-author-portraits.py. Each entry is [shard, offset,
// length]; credits are [file, artist, license].
type Portraits = {
  index: Record<string, [number, number, number]>;
  credits: Record<string, [string, string, string]>;
};
let portraits: Promise<Portraits | null> | null = null;
const shards = new Map<number, Promise<ArrayBuffer>>();
const portraitUrls = new Map<number, Promise<string | null>>();
export function portraitCredit(artist: string, license: string) {
  return /public domain|^pd|cc0/i.test(license) || !artist
    ? t("Portrait from Wikimedia Commons")
    : t("Portrait: {artist} ({license}), Wikimedia Commons", {
        artist: artist.length > 60 ? artist.slice(0, 57) + "..." : artist,
        license,
      });
}
export async function loadPortrait(
  id: number,
): Promise<{ url: string; credit: string; file: string } | null> {
  portraits ??= json<Portraits>("portraits").catch(() => null);
  const data = await portraits;
  const entry = data?.index[id];
  const credit = data?.credits[id];
  if (!entry || !credit) return null;
  let url = portraitUrls.get(id);
  if (!url) {
    const [shard, offset, length] = entry;
    let bytes = shards.get(shard);
    if (!bytes) {
      bytes = fetch(`/author-pack/portraits-${shard}.bin`).then((r) => {
        if (!r.ok) throw new Error("Portrait file missing.");
        return r.arrayBuffer();
      });
      shards.set(shard, bytes);
    }
    url = bytes
      .then((all) =>
        URL.createObjectURL(
          new Blob([all.slice(offset, offset + length)], {
            type: "image/webp",
          }),
        ),
      )
      .catch(() => null);
    portraitUrls.set(id, url);
  }
  const found = await url;
  return found
    ? {
        url: found,
        credit: portraitCredit(credit[1], credit[2]),
        file: credit[0],
      }
    : null;
}

// Loaded once on first use; each language file loads when chosen.
let core: Promise<Pick<Pack, "authors" | "index">> | null = null;
const languageFiles = new Map<string, Promise<PackLabels>>();
async function json<T>(name: string): Promise<T> {
  const response = await fetch(`/author-pack/${name}.json`);
  if (!response.ok) throw new Error(`Author pack file ${name} is missing.`);
  return response.json() as Promise<T>;
}
function loadText(language: string) {
  let file = languageFiles.get(language);
  if (!file) {
    file = json<PackLabels>(language);
    languageFiles.set(language, file);
  }
  return file;
}
export async function loadPack(language: string): Promise<Pack> {
  core ??= Promise.all([
    json<{ authors: PackAuthor[] }>("authors"),
    json<PackIndex>("index"),
  ]).then(([data, index]) => ({
    authors: new Map(data.authors.map((a) => [a.id, a])),
    index,
  }));
  const [base, own, english] = await Promise.all([
    core,
    loadText(language).catch(() => loadText("en")),
    loadText("en"),
  ]);
  return { ...base, text: language === "en" ? [english] : [own, english] };
}
