import { describe, it, expect } from "vitest";
import {
  pageAtOffset,
  pageForParagraph,
  readingPages,
  readingWindow,
  spacerHeights,
  VIRTUAL_MIN_PAGES,
} from "../src/readingPages";
import { paragraphsFromText } from "../src/documents";

describe("reading pages", () => {
  it("keeps every source paragraph and offset, including oversized passages", () => {
    const paragraphs = paragraphsFromText(
      Array.from(
        { length: 75 },
        (_, i) => `Passage ${i}. ` + "Text. ".repeat(i === 40 ? 1000 : 30),
      ).join("\n\n"),
    );
    const before = JSON.stringify(paragraphs);
    const pages = readingPages(paragraphs);
    expect(pages.length).toBeGreaterThan(5);
    expect(pages.flatMap((p) => paragraphs.slice(p.start, p.end))).toEqual(
      paragraphs,
    );
    expect(JSON.stringify(paragraphs)).toBe(before);
    for (let i = 0; i < paragraphs.length; i++) {
      const page = pages[pageForParagraph(pages, i)];
      expect(i).toBeGreaterThanOrEqual(page.start);
      expect(i).toBeLessThan(page.end);
    }
    const long = pages[pageForParagraph(pages, 40)];
    expect(long).toEqual({ start: 40, end: 41 });
  });
  it("keeps headings with following text and handles empty documents and edge positions", () => {
    const paragraphs = paragraphsFromText(
      "Long text ".repeat(160) + "\n\n# A heading\n\nIts first paragraph.",
    );
    const pages = readingPages(paragraphs);
    expect(pages).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
    ]);
    expect(pageForParagraph(pages, -1)).toBe(0);
    expect(pageForParagraph(pages, 999)).toBe(1);
    expect(readingPages([])).toEqual([]);
    expect(pageForParagraph([], 0)).toBe(0);
  });
});

describe("long-book page window", () => {
  it("renders every page of short documents and a window for long books", () => {
    expect(readingWindow(40, 10, false)).toEqual({ start: 0, end: 40 });
    expect(readingWindow(40, 10, true)).toEqual({ start: 10, end: 11 });
    const total = VIRTUAL_MIN_PAGES + 500;
    expect(readingWindow(total, 0, false)).toEqual({ start: 0, end: 7 });
    expect(readingWindow(total, 300, false)).toEqual({ start: 297, end: 307 });
    expect(readingWindow(total, total + 5, false).end).toBe(total);
  });
  it("sizes spacers so the window sits where the full book would", () => {
    const height = () => 100;
    expect(spacerHeights(10, { start: 3, end: 6 }, height, 20)).toEqual({
      top: 3 * 120 - 20,
      bottom: 4 * 120 - 20,
    });
    expect(spacerHeights(10, { start: 0, end: 10 }, height, 20)).toEqual({
      top: 0,
      bottom: 0,
    });
    expect(pageAtOffset(10, 0, height, 20)).toBe(0);
    expect(pageAtOffset(10, 125, height, 20)).toBe(1);
    expect(pageAtOffset(10, 99999, height, 20)).toBe(9);
  });
});
