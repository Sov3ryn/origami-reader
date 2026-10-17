// Text helpers for notes. Notes are HTML written by the editor's schema, so
// their shape is known: links to notes are <a data-note="Title">, links to a
// book passage are <a data-book=".." data-paragraph="..">.

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};
export function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (entities[e]) return entities[e];
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}
export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Plain text of a note: block ends become line breaks.
export function noteText(html: string, { links = true } = {}) {
  let s = html;
  if (!links) s = s.replace(/<a\b[^>]*\bdata-note="[^"]*"[^>]*>[\s\S]*?<\/a>/g, " ");
  // Handwriting counts as the text read from it.
  s = s.replace(/<div\b[^>]*\bdata-ink=[^>]*>\s*<\/div>/g, (m) => {
    const text = /\bdata-ink-text="([^"]*)"/.exec(m)?.[1];
    return text ? `<p>${text}</p>` : " ";
  });
  // Formulas count as their LaTeX, written the way cards show them.
  s = s.replace(/<(span|div)\b[^>]*\bdata-latex="([^"]*)"[^>]*>\s*<\/(?:span|div)>/g, (_m, tag: string, latex: string) =>
    tag === "div" ? `$$${latex}$$\n` : `$$${latex}$$`,
  );
  s = s
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|tr|div)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "");
  return decode(s)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function noteLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\bdata-note="([^"]*)"/g)) {
    const title = decode(m[1]).trim();
    if (title && !out.some((t) => same(t, title))) out.push(title);
  }
  return out;
}
export type PassageLink = { bookId: string; paragraphId: string; label: string };
export function passageLinks(html: string): PassageLink[] {
  const out: PassageLink[] = [];
  for (const m of html.matchAll(/<a\b([^>]*\bdata-book="[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)) {
    const book = /\bdata-book="([^"]*)"/.exec(m[1])?.[1];
    const paragraph = /\bdata-paragraph="([^"]*)"/.exec(m[1])?.[1] || "";
    if (book)
      out.push({
        bookId: decode(book),
        paragraphId: decode(paragraph),
        label: noteText(m[2]),
      });
  }
  return out;
}

export const same = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentionPattern = (title: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(title)}(?![\\p{L}\\p{N}])`, "giu");

// How often each other note's title appears in this note without a link.
export function unlinkedMentions(
  html: string,
  titles: string[],
): { title: string; count: number }[] {
  const linked = noteLinks(html);
  const text = noteText(html.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/g, " "), { links: false });
  const out: { title: string; count: number }[] = [];
  for (const title of titles) {
    const t = title.trim();
    if (t.length < 3 || linked.some((l) => same(l, t))) continue;
    const count = text.match(mentionPattern(t))?.length || 0;
    if (count) out.push({ title: t, count });
  }
  return out.sort((a, b) => b.count - a.count);
}

export function noteLinkHtml(title: string, label = title) {
  const t = escapeHtml(title);
  return `<a data-note="${t}" class="note-link">${escapeHtml(label)}</a>`;
}

// Turns plain-text mentions of `title` into note links. Text inside links,
// code and headings' tags is left alone.
export function linkMentions(html: string, title: string) {
  const pattern = mentionPattern(title);
  let inside = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<(a|code|pre)\b/i.test(part)) inside++;
        else if (/^<\/(a|code|pre)>/i.test(part)) inside = Math.max(0, inside - 1);
        return part;
      }
      if (inside) return part;
      return part.replace(pattern, (m) => noteLinkHtml(title, decode(m)));
    })
    .join("");
}

export function renameLinks(html: string, before: string, after: string) {
  return html.replace(/<a\b[^>]*\bdata-note="([^"]*)"[^>]*>[\s\S]*?<\/a>/g, (m, title: string) =>
    same(decode(title), before) ? noteLinkHtml(after) : m,
  );
}

// The "Related" list at the end of a note, where accepted links go.
const relatedBlock = (heading: string) =>
  new RegExp(
    `<h2>${escapeRegex(escapeHtml(heading))}</h2><ul>([\\s\\S]*?)</ul>`,
  );
const relatedItem = (title: string) =>
  `<li><p>${noteLinkHtml(title)}</p></li>`;

export function addRelated(html: string, titles: string[], heading: string) {
  const linked = noteLinks(html);
  const fresh = titles.filter((t) => !linked.some((l) => same(l, t)));
  if (!fresh.length) return html;
  const items = fresh.map(relatedItem).join("");
  const block = relatedBlock(heading);
  if (block.test(html))
    return html.replace(block, (m, inner) =>
      m.replace(inner + "</ul>", inner + items + "</ul>"),
    );
  return `${html}<h2>${escapeHtml(heading)}</h2><ul>${items}</ul>`;
}

export function removeRelated(html: string, titles: string[], heading: string) {
  const block = relatedBlock(heading);
  const m = block.exec(html);
  if (!m) return html;
  let inner = m[1];
  for (const t of titles) inner = inner.split(relatedItem(t)).join("");
  return html.replace(
    block,
    inner.trim() ? `<h2>${escapeHtml(heading)}</h2><ul>${inner}</ul>` : "",
  );
}

// "Question :: Answer" lines in a note become study cards.
export function noteCardLines(html: string): { front: string; back: string }[] {
  const out: { front: string; back: string }[] = [];
  // The editor wraps list items in paragraphs too, so paragraphs are lines.
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
    const line = noteText(m[1]);
    const at = line.indexOf("::");
    if (at < 0) continue;
    const front = line.slice(0, at).trim();
    const back = line.slice(at + 2).trim();
    if (front && back) out.push({ front, back });
  }
  return out;
}

// --- Related notes without a model -----------------------------------------
// A light TF-IDF over notes and highlights. The local embedding model replaces
// the scores later; the panel and the review flow stay the same.

const stop = new Set(
  (
    "the and for are but not you all any can had her was one our out has have " +
    "this that with from they will would there their what about which when " +
    "your into than then them these some could other more also just like over " +
    "such only very been were where while each most must shall should " +
    "les des une est pas que qui dans pour par sur avec son ses aux mais " +
    "nous vous ils elles leur leurs cette ces sont ont été être avoir fait " +
    "comme plus tout tous toute toutes elle lui sans sous entre aussi donc car " +
    "dont même encore très peu bien alors ainsi"
  ).split(" "),
);
function fold(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}
export function terms(text: string): { term: string; surface: string }[] {
  const out: { term: string; surface: string }[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)) {
    const surface = m[0].replace(/['’-]+$/, "");
    let term = fold(surface).replace(/^(l|d|j|qu|n|s|c|m|t)['’]/, "");
    if (term.length < 3 || stop.has(term) || /^\d+$/.test(term)) continue;
    // Plurals in English and French share a term.
    if (term.length > 4 && /[sx]$/.test(term) && !/ss$/.test(term))
      term = term.slice(0, -1);
    out.push({ term, surface });
  }
  return out;
}

export type RelatedDoc = { id: string; title: string; text: string };
export type Match = {
  id: string;
  score: number;
  shared: string[];
  strength: "strong" | "likely" | "weak";
  // Found by the embedding model (similar meaning), not only shared words.
  semantic?: boolean;
};

export type RelatedIndex = {
  vectors: Map<string, Map<string, number>>;
  surfaces: Map<string, string>;
};
export function relatedIndex(docs: RelatedDoc[]): RelatedIndex {
  const counts = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  const surfaces = new Map<string, string>();
  for (const d of docs) {
    const tf = new Map<string, number>();
    const words = [...terms(d.title), ...terms(d.title), ...terms(d.text)];
    for (const { term, surface } of words) {
      tf.set(term, (tf.get(term) || 0) + 1);
      if (!surfaces.has(term)) surfaces.set(term, surface.toLowerCase());
    }
    for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1);
    counts.set(d.id, tf);
  }
  const n = docs.length + 1;
  const vectors = new Map<string, Map<string, number>>();
  for (const [id, tf] of counts) {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [term, c] of tf) {
      const w = (1 + Math.log(c)) * Math.log(n / (df.get(term) || 1));
      if (w <= 0) continue;
      v.set(term, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [term, w] of v) v.set(term, w / norm);
    vectors.set(id, v);
  }
  return { vectors, surfaces };
}
export function strengthOf(score: number): Match["strength"] {
  return score >= 0.25 ? "strong" : score >= 0.12 ? "likely" : "weak";
}
export function related(
  index: RelatedIndex,
  id: string,
  { min = 0.07, limit = 12, among }: { min?: number; limit?: number; among?: (id: string) => boolean } = {},
): Match[] {
  const a = index.vectors.get(id);
  if (!a?.size) return [];
  const out: Match[] = [];
  for (const [other, b] of index.vectors) {
    if (other === id || (among && !among(other))) continue;
    let score = 0;
    const shared: [string, number][] = [];
    const [small, large] = a.size < b.size ? [a, b] : [b, a];
    for (const [term, w] of small) {
      const x = large.get(term);
      if (x) {
        score += w * x;
        shared.push([term, w * x]);
      }
    }
    if (score < min) continue;
    out.push({
      id: other,
      score,
      strength: strengthOf(score),
      shared: shared
        .sort((p, q) => q[1] - p[1])
        .slice(0, 3)
        .map(([t]) => index.surfaces.get(t) || t),
    });
  }
  return out.sort((p, q) => q.score - p.score).slice(0, limit);
}

export const pairId = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
