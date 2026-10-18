import type { Book } from "../types";
import type { HeardFile, TimedSentence } from "./recording";

// Studio, phase 6: an ebook and its audiobook become a read-along edition. The
// recording is transcribed with word times (Parakeet), then the book's own words
// are aligned to the heard words: unique four-word phrases found in both, kept in
// order, anchor the alignment; the words between two anchors are matched one to
// one where they agree; any other word takes a time between its neighbours.

type BookWord = { w: string; para: number; sent: number };
type HeardWord = { w: string; file: number; start: number; end: number };
export type AlignedChapter = { title: string | null; timed: TimedSentence[][] };
export type Alignment = { chapters: AlignedChapter[]; matched: number; words: number; skipped: number };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
const tokens = (s: string) => s.split(/\s+/).map(fold).filter(Boolean);

// "Mr." and "Mrs." do not end a sentence.
const TITLE = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Mme|Mlle|M|Messrs|Capt|Col|Gen|Rev|Prof)\.$/;
/** A paragraph's sentences, split after . ! ? or an ellipsis followed by a space. */
export function bookSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?…]["”’»)]*\s+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    // A title ("Mr.") or a lowercase word after the mark ("Why?" she asked) continues the sentence.
    if (TITLE.test(text.slice(start, m.index + 1)) || /^\p{Ll}/u.test(text.slice(end))) continue;
    out.push(text.slice(start, end).trim());
    start = end;
  }
  if (start < text.length && text.slice(start).trim()) out.push(text.slice(start).trim());
  return out;
}

// Longest increasing subsequence of `values` (indexes into it), O(n log n).
function increasing(values: number[]): number[] {
  const tails: number[] = [];
  const prev = new Array<number>(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < values[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out: number[] = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(k);
  return out.reverse();
}

/** For each book word, the index of the heard word it matches, or -1. */
export function matchWords(book: string[], heard: string[], n = 4): number[] {
  const match = new Array<number>(book.length).fill(-1);
  const grams = (list: string[]) => {
    const seen = new Map<string, number>();
    for (let i = 0; i + n <= list.length; i++) {
      const key = list.slice(i, i + n).join(" ");
      seen.set(key, seen.has(key) ? -1 : i);
    }
    return seen;
  };
  const inBook = grams(book);
  const inHeard = grams(heard);
  const pairs: [number, number][] = [];
  for (const [key, b] of inBook) {
    const h = inHeard.get(key);
    if (b >= 0 && h !== undefined && h >= 0) pairs.push([b, h]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const kept = increasing(pairs.map((p) => p[1])).map((i) => pairs[i]);
  let lastB = -1;
  let lastH = -1;
  const fill = (b0: number, b1: number, h0: number, h1: number) => {
    // Words between two anchors, matched where they agree (longest common subsequence).
    const nb = b1 - b0;
    const nh = h1 - h0;
    if (nb <= 0 || nh <= 0 || nb * nh > 400_000) return;
    const dp = new Array<Uint16Array>(nb + 1);
    for (let i = 0; i <= nb; i++) dp[i] = new Uint16Array(nh + 1);
    for (let i = nb - 1; i >= 0; i--)
      for (let j = nh - 1; j >= 0; j--)
        dp[i][j] = book[b0 + i] === heard[h0 + j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < nb && j < nh) {
      if (book[b0 + i] === heard[h0 + j]) {
        match[b0 + i] = h0 + j;
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
  };
  for (const [b, h] of kept) {
    if (b <= lastB || h <= lastH) continue;
    fill(lastB + 1, b, lastH + 1, h);
    for (let k = 0; k < n; k++) match[b + k] = h + k;
    lastB = b + n - 1;
    lastH = h + n - 1;
  }
  if (lastB >= 0) fill(lastB + 1, book.length, lastH + 1, heard.length);
  return match;
}

/** The book's chapters with every narrated sentence timed in the recording. */
export function alignBook(book: Book, heard: HeardFile[]): Alignment {
  const bookWords: BookWord[] = [];
  const sentences: string[][] = [];
  book.paragraphs.forEach((p, para) => {
    const list = bookSentences(p.text);
    sentences[para] = list;
    list.forEach((s, sent) => tokens(s).forEach((w) => bookWords.push({ w, para, sent })));
  });
  const heardWords: HeardWord[] = heard.flatMap((f, file) =>
    f.words.flatMap(([text, start, end]) => tokens(text).map((w) => ({ w, file, start, end }))),
  );
  const match = matchWords(
    bookWords.map((b) => b.w),
    heardWords.map((h) => h.w),
  );
  const matched = match.filter((m) => m >= 0).length;
  // Each book word gets a time: its own match, or a share of the time between neighbours in the same file.
  type Time = { file: number; start: number; end: number } | null;
  const times: Time[] = new Array(bookWords.length).fill(null);
  let prev = -1;
  for (let i = 0; i <= bookWords.length; i++) {
    if (i < bookWords.length && match[i] < 0) continue;
    if (i < bookWords.length) times[i] = heardWords[match[i]];
    if (prev >= 0 && i < bookWords.length && i - prev > 1) {
      const a = heardWords[match[prev]];
      const b = heardWords[match[i]];
      for (let k = prev + 1; k < i; k++) {
        if (a.file !== b.file) times[k] = { file: a.file, start: a.end, end: a.end };
        else {
          const t = a.end + ((b.start - a.end) * (k - prev)) / (i - prev);
          times[k] = { file: a.file, start: t, end: t };
        }
      }
    }
    prev = i;
  }
  // Sentences, grouped into paragraphs and chapters. A paragraph with no matched
  // word (contents, a title page) is left out; a chapter is split where the file changes.
  const matchedIn = new Map<number, number>();
  bookWords.forEach((b, i) => match[i] >= 0 && matchedIn.set(b.para, (matchedIn.get(b.para) || 0) + 1));
  const span = new Map<string, { first: number; last: number }>();
  bookWords.forEach((b, i) => {
    const key = b.para + ":" + b.sent;
    const s = span.get(key);
    if (s) s.last = i;
    else span.set(key, { first: i, last: i });
  });
  const chapters: AlignedChapter[] = [];
  let current: { chapter: number; file: number; out: AlignedChapter } | null = null;
  let title: string | null = null;
  let titleChapter = -1;
  let skipped = 0;
  let lastEnd = 0;
  book.paragraphs.forEach((p, para) => {
    if (p.chapter !== titleChapter) {
      titleChapter = p.chapter;
      title = null;
    }
    if (p.kind === "heading" && title === null) title = p.text;
    if (!matchedIn.get(para)) {
      if (p.kind !== "heading") skipped++;
      return;
    }
    if (p.kind === "heading") return;
    const timed: TimedSentence[] = [];
    sentences[para].forEach((text, sent) => {
      const s = span.get(para + ":" + sent);
      if (!s) return;
      const a = times[s.first];
      const b = times[s.last];
      if (!a || !b) return;
      if (!current || current.chapter !== p.chapter || current.file !== a.file) {
        const out: AlignedChapter = { title: current && current.chapter === p.chapter ? title && title + " (2)" : title, timed: [] };
        chapters.push(out);
        current = { chapter: p.chapter, file: a.file, out };
        lastEnd = 0;
      }
      const start = Math.max(a.start, lastEnd);
      const end = Math.max(start + 0.05, b.file === a.file ? b.end : a.end);
      lastEnd = end;
      timed.push({ text, start, end, file: a.file });
    });
    if (timed.length && current) (current as { out: AlignedChapter }).out.timed.push(timed);
  });
  return { chapters: chapters.filter((c) => c.timed.length), matched, words: bookWords.length, skipped };
}
