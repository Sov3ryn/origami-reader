import type { CastMember } from "./cast";
import type { ProductionUnit } from "./production";

// Studio, phase 2: pronunciations for the whole book. Names and other proper
// nouns are suggested with how often they occur; a "say it as" spelling is
// applied to every line that contains the word, in the spoken text only.

export type Pronunciation = { word: string; sayAs: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Matches the word on its own (not inside another word), with any letter case for the first letter only. */
export function wordPattern(word: string) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, "gu");
}

/** Proper nouns worth checking: the cast's names first, then capitalised words that come
 * back at least twice, once in mid-sentence, and are never written in lower case. */
export function suggestWords(units: ProductionUnit[], cast: CastMember[], done: string[]) {
  // Every capitalised word, and how often it appears in mid-sentence (which shows it is a name).
  const total = new Map<string, number>();
  const middle = new Map<string, number>();
  const lower = new Set<string>();
  for (const u of units) {
    const text = u.original ?? u.text;
    for (const m of text.matchAll(/(\p{Lu}[\p{L}'\u2019-]{2,})/gu)) {
      const w = m[1].replace(/['\u2019]s$/, "");
      total.set(w, (total.get(w) || 0) + 1);
      const before = text.slice(0, m.index).trimEnd();
      if (before && !/[.!?\u2026:;"\u201c\u2018\u00ab(\u2014-]$/.test(before)) middle.set(w, (middle.get(w) || 0) + 1);
    }
    for (const m of text.matchAll(/(?<![\p{L}])(\p{Ll}[\p{L}'\u2019-]{2,})/gu)) lower.add(m[1]);
  }
  const names = new Set(
    cast
      .flatMap((c) => [c.name, ...c.aliases])
      .flatMap((n) => n.split(/\s+/))
      .filter((w) => /^\p{Lu}/u.test(w) && w.length > 2 && !/^(Mr|Mrs|Miss|Lady|Lord|Sir|Dr|Madame|Monsieur)\.?$/.test(w)),
  );
  const skip = new Set(done.map((d) => d.toLowerCase()));
  return [...total.entries()]
    .filter(([w, n]) => !skip.has(w.toLowerCase()) && !lower.has(w.toLowerCase()) && (names.has(w) || (n >= 2 && (middle.get(w) || 0) >= 1)))
    .map(([word, count]) => ({ word, count, name: names.has(word) }))
    .sort((a, b) => Number(b.name) - Number(a.name) || b.count - a.count)
    .slice(0, 60);
}

/** Every unit that contains the word, in reading order. */
export function occurrences(units: ProductionUnit[], word: string) {
  const re = wordPattern(word);
  return units.filter((u) => {
    re.lastIndex = 0;
    return re.test(u.original ?? u.text);
  });
}

/** Units changed by a pronunciation: the spoken text says the word the new way and the
 * book text is kept. Lines that were generated need a new take; approved lines are left alone. */
export function applyPronunciation(units: ProductionUnit[], p: Pronunciation): ProductionUnit[] {
  const re = wordPattern(p.word);
  const out: ProductionUnit[] = [];
  for (const u of units) {
    if (u.status === "approved") continue;
    re.lastIndex = 0;
    if (!re.test(u.text)) continue;
    re.lastIndex = 0;
    const text = u.text.replace(re, p.sayAs);
    if (text === u.text) continue;
    out.push({ ...u, text, original: u.original ?? u.text, status: u.take || u.status !== "pending" ? "pending" : u.status });
  }
  return out;
}

/** A short sentence around the word, for hearing it said. */
export function sampleAround(text: string, word: string, sayAs: string) {
  const re = wordPattern(word);
  const m = re.exec(text);
  if (!m) return sayAs;
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, m.index - 50)));
  const end = Math.min(text.length, text.indexOf(" ", m.index + word.length + 50) + 1 || text.length);
  return text.slice(start, end).replace(wordPattern(word), sayAs).trim();
}
