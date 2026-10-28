import { describe, expect, it } from "vitest";
import { bookmarkDesigns, bookmarkLocation, bookmarkSentence } from "../src/bookmarks";
import { bookUnits } from "../src/usePlayer";
import { defaultPreferences, type Book, type Annotation } from "../src/types";
import { emptyReadingStats } from "../src/places";
import { freeBookmarks, isOpen, requirementOf, unlockedAll } from "../src/rewards";

const text = "The house was silent when she arrived. A small cat slept beside the fire. Outside, the rain had stopped.";
const start = text.indexOf("A small");
const book = { meta: { id: "book", language: "en" }, paragraphs: [
  { id: "p", text, chapter: 0, kind: "paragraph" },
  { id: "q", text: "She took off her coat and sat down to read.", chapter: 0, kind: "paragraph" },
] } as Book;

describe("physical bookmark anchors", () => {
  it("restores the sentence containing the saved selection, including legacy markers", () => {
    expect(bookmarkSentence(text, start + 12)).toEqual({ start, end: text.indexOf(" Outside") });
    expect(bookmarkSentence(text).start).toBe(0);
    expect(bookmarkSentence(text, Infinity).start).toBe(0);
    expect(bookmarkLocation(book, { bookId: "other", paragraphId: "p", start } as Annotation)).toBeNull();
    expect(bookmarkLocation(book, { bookId: "book", paragraphId: "missing", start } as Annotation)).toBeNull();
  });
  it("reads from the marked sentence and continues through following paragraphs", () => {
    const units = bookUnits(book, 0, defaultPreferences, start + 12);
    expect(units[0].text).toMatch(/^A small cat/);
    expect(units.map((u) => u.text).join(" ")).not.toContain("The house");
    expect(units[0].range?.start).toBe(start);
    expect(units.at(-1)?.paragraph).toBe(1);
  });
  it("keeps spoken replacements when starting at a bookmark", () => {
    const edited = { ...book, paragraphs: [{ ...book.paragraphs[0], spokenEdits: [{ start, end: text.indexOf(" Outside"), text: "A little dog rested by the hearth." }] }, book.paragraphs[1]] };
    expect(bookUnits(edited, 0, defaultPreferences, start)[0].text).toMatch(/^A little dog/);
  });
  it("gives every design but the free default an attainable goal and the same supporter shortcut", () => {
    for (const [id] of bookmarkDesigns) {
      const free = freeBookmarks.includes(id);
      expect(Boolean(requirementOf("bookmark", id))).toBe(!free);
      expect(isOpen("bookmark", id, emptyReadingStats, false)).toBe(free);
      expect(isOpen("bookmark", id, emptyReadingStats, true)).toBe(true);
    }
    const unlocked = unlockedAll({ ...emptyReadingStats, activeSeconds: 60 * 3600, readingDays: 20 }, 6);
    for (const [id] of bookmarkDesigns)
      if (!freeBookmarks.includes(id)) expect(unlocked).toContain("bookmark:" + id);
  });
});
