// The word being read aloud. Speech comes one sentence at a time with only its
// duration, so the word is estimated from how far the clip has played: each
// word weighs its letters, and punctuation adds the pause that follows it.
// The highlight is painted with the CSS Custom Highlight API, so it moves
// through the text without re-rendering the page.

export type WordSpan = { start: number; end: number };
type Weighted = WordSpan & { weight: number };

const LETTER = /[\p{L}\p{N}]/u;

/** The words of text[start, end), with their offsets in text and a speaking weight. */
export function wordSpans(text: string, start: number, end: number): Weighted[] {
  const out: Weighted[] = [];
  const part = text.slice(start, end);
  for (const m of part.matchAll(/\S+/g)) {
    const word = m[0];
    const letters = [...word].filter((c) => LETTER.test(c)).length;
    if (!letters) {
      // A lone dash or ellipsis: only its pause counts, on the word before.
      if (out.length) out[out.length - 1].weight += 2;
      continue;
    }
    const tail = word.replace(/[\p{L}\p{N}'\u2019]+/gu, "");
    let weight = letters + 1;
    if (/[.!?\u2026]/.test(tail)) weight += 5;
    else if (/[,;:)\u2013\u2014]/.test(tail)) weight += 3;
    const at = start + (m.index ?? 0);
    out.push({ start: at, end: at + word.length, weight });
  }
  return out;
}

/** The word at `fraction` (0 to 1) of the way through text[start, end). */
export function wordAt(text: string, start: number, end: number, fraction: number): WordSpan | null {
  const words = wordSpans(text, start, end);
  if (!words.length) return null;
  const total = words.reduce((n, w) => n + w.weight, 0);
  let goal = Math.max(0, Math.min(1, fraction)) * total;
  for (const w of words) {
    if (goal < w.weight) return { start: w.start, end: w.end };
    goal -= w.weight;
  }
  const last = words[words.length - 1];
  return { start: last.start, end: last.end };
}

/** How far a clip has played, ignoring the short silences voices leave at both ends. */
export function playedFraction(time: number, duration: number) {
  if (!(duration > 0)) return 0;
  const lead = Math.min(0.12, duration * 0.05);
  const tail = Math.min(0.3, duration * 0.1);
  return (time - lead) / Math.max(0.05, duration - lead - tail);
}

/** Ranges over one span of a paragraph, in every place it is shown (a book page
 * repeats a paragraph that runs across pages). The hidden measuring copy is left out. */
export function rangesFor(paragraphId: string, span: WordSpan): Range[] {
  const out: Range[] = [];
  const els = document.querySelectorAll<HTMLElement>(`[data-paragraph="${CSS.escape(paragraphId)}"]`);
  for (const el of els) {
    if (el.closest(".book-measure")) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let at = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const len = node.data.length;
      if (!startNode && span.start < at + len) {
        startNode = node;
        startOffset = span.start - at;
      }
      if (startNode && span.end <= at + len) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(node, span.end - at);
        out.push(range);
        break;
      }
      at += len;
    }
  }
  return out;
}

const NAME = "spoken-word";
/** Shows the spoken word (or clears it with null). Without highlight support, nothing is painted. */
export function paintWord(ranges: Range[] | null) {
  const registry = (globalThis.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights;
  const Make = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!registry || !Make) return;
  if (!ranges || !ranges.length) registry.delete(NAME);
  else registry.set(NAME, new Make(...ranges));
}
