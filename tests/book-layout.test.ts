import { describe, expect, it } from "vitest";
import {
  BookPagination,
  bookSections,
  dropCap,
  FRONT_PAGES,
} from "../src/bookLayout";
import type { Paragraph } from "../src/types";

const para = (
  id: string,
  chapter: number,
  text: string,
  kind: Paragraph["kind"] = "paragraph",
): Paragraph => ({ id, chapter, text, kind });

const book: Paragraph[] = [
  para("h1", 1, "Chapter One", "heading"),
  para("a", 1, "First paragraph."),
  para("b", 1, "Second paragraph."),
  para("c", 1, "Third paragraph."),
  para("h2", 2, "Chapter Two", "heading"),
  para("d", 2, "Fourth paragraph."),
  para("e", 2, "Fifth paragraph."),
];

describe("book sections", () => {
  it("starts a section at every chapter and names it after the heading", () => {
    const sections = bookSections(book);
    expect(sections).toEqual([
      { start: 0, end: 4, opener: true, title: "Chapter One" },
      { start: 4, end: 7, opener: true, title: "Chapter Two" },
    ]);
  });

  it("splits very long chapters between paragraphs, keeping the title", () => {
    const long = [
      para("h", 1, "Long Chapter", "heading"),
      ...Array.from({ length: 8 }, (_, i) =>
        para("p" + i, 1, "x".repeat(9000)),
      ),
    ];
    const sections = bookSections(long);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections[1].opener).toBe(false);
    expect(sections[1].title).toBe("Long Chapter");
    expect(sections.at(-1)!.end).toBe(long.length);
  });

  it("gives only the first real paragraph of a chapter its drop cap", () => {
    const long =
      "It was a bright cold day in April, and the clocks were striking a quiet hour in town.";
    const opening = [
      para("h", 1, "Chapter One", "heading"),
      para("s", 1, "The Professor and His Family"),
      para("a", 1, long),
      para("b", 1, long),
    ];
    const [first] = bookSections(opening);
    expect(dropCap(opening, 1, first)).toBe(false);
    expect(dropCap(opening, 2, first)).toBe(true);
    expect(dropCap(opening, 3, first)).toBe(false);
    expect(dropCap(opening, 0, first)).toBe(false);
  });
});

describe("pagination", () => {
  // Chapter one fills pages 0-2 of its section; chapter two pages 0-1.
  const sections = bookSections(book);
  const pages = new BookPagination(sections, [
    { pages: 3, starts: [0, 0, 1, 2], tops: [0, 120, 300, 0] },
    { pages: 2, starts: [0, 0, 1], tops: [0, 90, 40] },
  ]);

  it("counts front matter, text and the closing page", () => {
    expect(pages.contentPages).toBe(5);
    expect(pages.totalPages).toBe(FRONT_PAGES + 5 + 1);
    expect(pages.spreads).toBe(5);
    expect(pages.page(0)).toEqual({ kind: "endpaper" });
    expect(pages.page(1)).toEqual({ kind: "title" });
    expect(pages.page(3)).toEqual({
      kind: "content",
      index: 0,
      section: 0,
      local: 0,
    });
    expect(pages.page(6)).toEqual({
      kind: "content",
      index: 3,
      section: 1,
      local: 0,
    });
    expect(pages.page(8)).toEqual({ kind: "end" });
    expect(pages.page(9)).toEqual({ kind: "blank" });
  });

  it("maps paragraphs to pages and spreads", () => {
    expect(pages.contentPageOf(2)).toBe(1);
    expect(pages.contentPageOf(5)).toBe(3);
    // Content page 0 is the right page of spread 1.
    expect(pages.spreadOfParagraph(0)).toBe(1);
    expect(pages.spreadOfParagraph(3)).toBe(2);
  });

  it("slices a page from the paragraph at its top", () => {
    // Page 1 begins with paragraph a continuing, then b starts lower down.
    expect(pages.slice(1)).toMatchObject({
      from: 1,
      to: 2,
      shift: 1,
      offset: 120,
    });
    // Page 2: c starts right at the top.
    expect(pages.slice(2)).toMatchObject({
      from: 3,
      to: 3,
      shift: 0,
      offset: 0,
    });
    // Chapter two, page 1: e starts there, below d continuing from page 0.
    expect(pages.slice(4)).toMatchObject({
      from: 5,
      to: 6,
      shift: 1,
      offset: 90,
    });
  });

  it("round-trips the reading position through a spread", () => {
    for (let n = 0; n < book.length; n++) {
      const spread = pages.spreadOfParagraph(n);
      expect(pages.spreadOfParagraph(pages.paragraphAtSpread(spread))).toBe(
        spread,
      );
    }
  });
});
