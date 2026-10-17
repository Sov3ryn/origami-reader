import { t } from "./i18n";
import type { Paragraph } from "./types";
import { romanValue } from "./spokenText";

// label is the full text ("I · Marseilles, The Arrival"); number and title
// are its parts for the contents list ("I" and "Marseilles, The Arrival").
export type ContentsEntry = {
  index: number;
  label: string;
  level: number;
  number?: string;
  title: string;
};

// "Chapter XII." becomes "XII"; text that is not a bare number gives "".
const numberPart = (text: string) => {
  const t = text
    .trim()
    .replace(
      /^(chapter|part|book|section|chapitre|kapitel|cap[ií]tulo)\s+/i,
      "",
    )
    .replace(/[.:]$/, "");
  return /^\d{1,4}$/.test(t) || romanValue(t) !== null ? t : "";
};
const bareNumber = (text: string) => Boolean(numberPart(text));
// A subtitle line: short, and not a sentence of body text.
const subtitle = (p: Paragraph | undefined) =>
  Boolean(
    p &&
    p.text.length <= 90 &&
    (p.kind === "heading" || !/[.!?…]["”’)]*$/.test(p.text)),
  );

// Chapter list for the sidebar. "I" followed by "Marseilles, The Arrival"
// becomes one entry, so numbered editions show their chapter titles.
export function contentsEntries(paragraphs: Paragraph[]): ContentsEntry[] {
  const entries: ContentsEntry[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.kind !== "heading") continue;
    const next = paragraphs[i + 1];
    if (
      bareNumber(p.text) &&
      subtitle(next) &&
      !(next!.kind === "heading" && bareNumber(next!.text))
    ) {
      entries.push({
        index: i,
        label: p.text + " · " + next!.text,
        level: p.headingLevel || 2,
        number: numberPart(p.text),
        title: next!.text,
      });
      if (next!.kind === "heading") i++;
      continue;
    }
    const number = numberPart(p.text);
    entries.push({
      index: i,
      label: p.text,
      level: p.headingLevel || 2,
      ...(number ? { number, title: "" } : { title: p.text }),
    });
  }
  return entries;
}
export function currentEntry(entries: ContentsEntry[], position: number) {
  let found: ContentsEntry | undefined;
  for (const entry of entries) {
    if (entry.index > position) break;
    found = entry;
  }
  return found;
}

// Typical narration pace at 1x, in words per minute.
export const WORDS_PER_MINUTE = 155;
export function listeningMinutes(words: number, speed = 1) {
  return words / (WORDS_PER_MINUTE * Math.max(0.25, speed));
}
export function formatDuration(minutes: number) {
  if (minutes < 1) return t("under a minute");
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return t("{m} min", { m });
  return m ? t("{h} h {m} min", { h, m }) : t("{h} h", { h });
}
const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;
// Words from `position` to the end of its chapter.
export function wordsLeftInChapter(paragraphs: Paragraph[], position: number) {
  const chapter = paragraphs[position]?.chapter;
  let words = 0;
  for (let i = Math.max(0, position); i < paragraphs.length; i++) {
    if (paragraphs[i].chapter !== chapter) break;
    words += wordsIn(paragraphs[i].text);
  }
  return words;
}

export function searchSnippet(text: string, query: string, radius = 48) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0)
    return { before: text.slice(0, radius * 2), match: "", after: "" };
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + query.length + radius);
  return {
    before: (start > 0 ? "…" : "") + text.slice(start, at),
    match: text.slice(at, at + query.length),
    after: text.slice(at + query.length, end) + (end < text.length ? "…" : ""),
  };
}

const segmenter = () => new Intl.Segmenter("en", { granularity: "sentence" });
export function sentenceRanges(text: string) {
  return Array.from(segmenter().segment(text))
    .filter((s) => s.segment.trim())
    .map((s) => ({
      start: s.index,
      end: s.index + s.segment.trimEnd().length,
    }));
}
// Maps spoken sentence indexes back to the book text. When cleaning or edits
// changed the sentence count, the mapping is unknown and null is returned.
export function spokenSentenceRange(
  original: string,
  spokenSentenceCount: number,
  first: number,
  last: number,
) {
  const ranges = sentenceRanges(original);
  if (ranges.length !== spokenSentenceCount || !ranges[first] || !ranges[last])
    return null;
  return { start: ranges[first].start, end: ranges[last].end };
}
