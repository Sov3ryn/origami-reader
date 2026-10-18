import { describe, expect, it } from "vitest";
import { alignBook, bookSentences, matchWords } from "../src/studio/align";
import type { HeardFile } from "../src/studio/recording";
import type { Book } from "../src/types";

const book = (paras: [number, string, ("heading" | "paragraph")?][]): Book =>
  ({
    meta: { id: "b", title: "T", author: "A" },
    paragraphs: paras.map(([chapter, text, kind], i) => ({ id: "p-" + i, text, chapter, kind: kind || "paragraph" })),
  }) as unknown as Book;

// Heard words, one every 0.4 s, optionally with a word misheard.
const heard = (text: string, swap: Record<string, string> = {}, file = 0): HeardFile[] => [
  { name: "a.mp3", seconds: 600, words: text.split(" ").map((w, i) => [swap[w] || w, i * 0.4, i * 0.4 + 0.3, 0.9] as [string, number, number, number]) },
];

describe("alignment of a book with its recording", () => {
  it("splits sentences but not after titles", () => {
    expect(bookSentences("Mr. Bennet was silent. \u201cWhy?\u201d she asked. Then nothing")).toEqual(["Mr. Bennet was silent.", "\u201cWhy?\u201d she asked.", "Then nothing"]);
  });
  it("matches words through anchors and fills the gaps between them", () => {
    const b = "it is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife".split(" ");
    const h = [...b];
    h[8] = "mann"; // misheard
    h.splice(12, 0, "um"); // an extra word
    const m = matchWords(b, h);
    expect(m[0]).toBe(0);
    expect(m[8]).toBe(-1);
    expect(m[12]).toBe(13);
    expect(m.filter((x) => x >= 0).length).toBe(b.length - 1);
  });
  it("times every narrated sentence and leaves out what was not read", () => {
    const text = "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is well fixed.";
    const b = book([
      [0, "Contents"],
      [0, "Chapter One, Chapter Two, Chapter Three", "paragraph"],
      [1, "Chapter I", "heading"],
      [1, text],
    ]);
    const spoken = "chapter i " + text.replace(/[,.]/g, "").toLowerCase();
    const a = alignBook(b, heard(spoken, { fortune: "fortun" }));
    expect(a.chapters).toHaveLength(1);
    expect(a.chapters[0].title).toBe("Chapter I");
    const [first, second] = a.chapters[0].timed[0];
    expect(first.text.startsWith("It is a truth")).toBe(true);
    expect(first.start).toBeCloseTo(0.8, 5);
    expect(second.start).toBeGreaterThan(first.end - 0.01);
    expect(a.skipped).toBe(2);
    expect(a.matched / a.words).toBeGreaterThan(0.8);
  });
});
