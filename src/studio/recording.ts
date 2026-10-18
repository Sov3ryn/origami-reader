import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../storage";

// Studio, phase 4: a recording becomes a book. Parakeet (src-tauri/src/studio_asr.rs)
// gives words with times; this file turns them into chapters and paragraphs,
// removes the reader's credits, and writes the book as Markdown for the library.

export type HeardWord = [text: string, start: number, end: number, conf: number];
export type HeardFile = { name: string; seconds: number; words: HeardWord[] };
export type AsrProgress = { file: number; files: number; value: number; name?: string };
export type AsrDone = { ok: boolean; files?: HeardFile[]; cancelled?: boolean; message?: string };

export const asrReady = (): Promise<boolean> => (desktop ? invoke("studio_asr_ready") : Promise.resolve(false));
export const pickRecordings = () => invoke<string[]>("studio_pick_recordings");
export const transcribe = (files: string[]) => invoke<void>("studio_transcribe", { files });
export const cancelTranscribe = () => invoke<void>("studio_cancel_transcribe");
/** A moment of a recording as base64 WAV, to hear a word. */
export const recordingClip = (path: string, start: number, end: number) => invoke<string>("studio_recording_clip", { path, start, end });
/** A read-along EPUB from the recording itself: the original audio, each sentence highlighted as it is heard. */
export const recordingReadalong = (files: string[], chapters: Chapter[], meta: { title: string; author: string; language: string }) =>
  invoke<string | null>("studio_recording_readalong", { files, chapters: chapters.map((c) => ({ title: c.title, timed: c.timed })), meta });

type Sentence = { text: string; start: number; end: number; gap: number; conf: number };
// `timed` holds each paragraph's sentences with their place in the recording (file index and seconds).
export type TimedSentence = { text: string; start: number; end: number; file: number };
export type Chapter = { title: string | null; paragraphs: string[]; start: number; timed: TimedSentence[][] };

const END = /[.!?…]["”’»)]*$/;
// What volunteers and publishers say around the text, not part of the book.
const CREDIT =
  /(librivox|public domain|domaine public|this recording is|cet enregistrement|for more information|pour plus d'information|volunteer|b[ée]n[ée]vole|read by|recorded by|lu par|enregistr[ée] par|end of (?:the )?(?:chapter|section|book)|fin du (?:chapitre|livre)|www\.|\.org)/i;
const HEADING = /^(?:(?:chapter|chapitre|cap[ií]tulo|kapitel|capitolo|part|partie|book|livre|section)\b|(?:[IVXLC]+|\d+)[.:]?$)/i;

/** Words to sentences, each with its times, the pause after it and its lowest word confidence. */
export function sentences(heard: HeardWord[]): Sentence[] {
  // A word cleared in the review is removed.
  const words = heard.filter((w) => w[0].trim());
  const out: Sentence[] = [];
  let cur: HeardWord[] = [];
  const close = (next?: HeardWord) => {
    if (!cur.length) return;
    out.push({
      text: cur.map((w) => w[0]).join(" ").replace(/\s+([,.;:!?])/g, "$1"),
      start: cur[0][1],
      end: cur[cur.length - 1][2],
      gap: next ? Math.max(0, next[1] - cur[cur.length - 1][2]) : 0,
      conf: Math.min(...cur.map((w) => w[3])),
    });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    if (END.test(w[0]) && !TITLE.test(w[0])) close(words[i + 1]);
  });
  close();
  return out;
}

// "Mr." and "Mrs." do not end a sentence.
const TITLE = /^(?:Mr|Mrs|Ms|Dr|St|Mme|Mlle|M|Messrs|Capt|Col|Gen|Rev|Prof)\.$/;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const isHeading = (s: Sentence) => words(s.text) <= 8 && HEADING.test(s.text.replace(/[.!]+$/, "").trim());

// "Chapter Sixteen As no objection...": a heading run into the first sentence.
const HEADING_LEAD = /^((?:chapter|chapitre|cap[ií]tulo|kapitel|capitolo|part|partie|book|livre)\s+(?:[IVXLC]+|\d+|[\p{L}-]+))[.:,]?\s+(?=\p{Lu})/iu;
const tidy = (title: string) => title.replace(/^[A-Z]+\b/, (w) => (w.length > 1 && w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w));

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** One file (or a whole recording) to chapters and paragraphs. A new paragraph starts at
 * the narrator's longer pauses; a short "Chapter ..." sentence after a long pause starts a chapter. */
export function structure(files: HeardFile[], meta: { title?: string; author?: string } = {}): Chapter[] {
  const chapters: Chapter[] = [];
  const fold = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const names = [meta.title, meta.author].filter((x): x is string => Boolean(x && x.trim().length > 3)).map(fold);
  // "Pride and Prejudice, by Jane Austen.": the reader announcing the book.
  const announces = (text: string) => names.some((n) => fold(text).includes(n)) && text.split(/\s+/).length <= 16;
  files.forEach((file, fileIndex) => {
    let list = sentences(file.words);
    // Credits sit in the first and last few sentences.
    while (list.length && list.slice(0, 1).some((s) => CREDIT.test(s.text))) list = list.slice(1);
    for (let i = 0; i < Math.min(4, list.length); i++) if (CREDIT.test(list[i].text)) list = list.slice(0, i).concat(list.slice(i + 1));
    while (list.length && CREDIT.test(list[list.length - 1].text)) list = list.slice(0, -1);
    while (list.length && announces(list[0].text) && !HEADING_LEAD.test(list[0].text)) list = list.slice(1);
    if (!list.length) return;
    const gaps = list.map((s) => s.gap).filter((g) => g > 0);
    // A paragraph pause is clearly longer than the narrator's usual pause between sentences.
    const breakAt = Math.min(2.0, Math.max(0.9, percentile(gaps, 0.5) * 1.8));
    let chapter: Chapter | null = null;
    let paragraph: string[] = [];
    let timed: TimedSentence[] = [];
    const flush = () => {
      if (paragraph.length && chapter) {
        chapter.paragraphs.push(paragraph.join(" "));
        chapter.timed.push(timed);
      }
      paragraph = [];
      timed = [];
    };
    list.forEach((sentence, i) => {
      let s = sentence;
      const before = i > 0 ? list[i - 1].gap : Infinity;
      const lead = (i <= 2 || before >= 1.2) && s.text.match(HEADING_LEAD);
      if (lead) {
        flush();
        chapter = { title: tidy(lead[1]), paragraphs: [], start: s.start, timed: [] };
        chapters.push(chapter);
        s = { ...s, text: s.text.slice(lead[0].length) };
      } else if (isHeading(s) && (i === 0 || before >= 1.2)) {
        flush();
        chapter = { title: tidy(s.text.replace(/[.]+$/, "")), paragraphs: [], start: s.start, timed: [] };
        chapters.push(chapter);
        return;
      }
      if (!chapter) {
        chapter = { title: files.length > 1 ? prettyName(file.name) : null, paragraphs: [], start: s.start, timed: [] };
        chapters.push(chapter);
      }
      paragraph.push(s.text);
      timed.push({ text: s.text, start: s.start, end: s.end, file: fileIndex });
      // Very long paragraphs break at the next ordinary pause.
      const long = paragraph.join(" ").split(/\s+/).length > 220 && s.gap >= percentile(gaps, 0.5);
      if (s.gap >= breakAt || long) flush();
    });
    flush();
  });
  return chapters.filter((c) => c.paragraphs.length || c.title);
}

/** "03_pride_and_prejudice_ch03" to "Pride and prejudice ch03", without the leading number. */
export function prettyName(name: string) {
  const s = name.replace(/[_-]+/g, " ").replace(/^\s*\d+\s*/, "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : name;
}

/** The book as Markdown, for the library's importer. */
export function bookMarkdown(title: string, author: string, chapters: Chapter[]) {
  const head = `# ${title}\n\n${author ? author + "\n\n" : ""}`;
  return (
    head +
    chapters
      .map((c, i) => `## ${c.title || "Chapter " + (i + 1)}\n\n` + c.paragraphs.join("\n\n"))
      .join("\n\n") +
    "\n"
  );
}

/** The language of a transcript among the common European ones, from frequent short words. */
export function guessLanguage(text: string) {
  const words = text.toLowerCase().split(/[^\p{L}']+/u);
  const common: Record<string, string[]> = {
    en: ["the", "and", "of", "to", "was", "he", "she", "that"],
    fr: ["le", "la", "les", "et", "des", "est", "une", "que"],
    de: ["der", "die", "und", "das", "ist", "nicht", "ein", "sie"],
    es: ["el", "los", "las", "que", "una", "por", "con", "del"],
    it: ["il", "che", "di", "non", "per", "una", "gli", "della"],
    pt: ["o", "os", "que", "uma", "com", "do", "da", "não"],
  };
  let best = "en";
  let most = 0;
  for (const [code, list] of Object.entries(common)) {
    const n = words.filter((w) => list.includes(w)).length;
    if (n > most) {
      most = n;
      best = code;
    }
  }
  return best;
}

/** Words the model was unsure of (confidence under 0.6), for a review list. */
export function doubtful(files: HeardFile[]) {
  return files.flatMap((f, fi) => f.words.map((w, wi) => ({ file: fi, index: wi, word: w[0], at: w[1], conf: w[3] })).filter((x) => x.conf < 0.6));
}
