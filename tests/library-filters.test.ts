import { expect, it } from "vitest";
import {
  bookFinished,
  matchesLibraryFilters,
  sortLibrary,
} from "../src/libraryFilters";
import { defaultPreferences, type BookMeta } from "../src/types";
import { hasCoverText } from "../src/components/Primitives";
import { normalizeGenres } from "../src/bookGenres";
const base = {
  id: "b",
  title: "Book",
  author: "Writer",
  format: "EPUB",
  added: 1,
  opened: 0,
  paragraphCount: 10,
  position: 0,
} as BookMeta;
it("filters imported genre tags case-insensitively alongside other filters", () => {
  expect(
    matchesLibraryFilters(
      { ...base, genres: ["Romance", "Suspense"] },
      { author: "Writer", type: "Books", status: "unread", genre: "romance" },
    ),
  ).toBe(true);
  expect(
    matchesLibraryFilters(
      { ...base, genres: [] },
      { author: "all", type: "all", status: "all", genre: "Romance" },
    ),
  ).toBe(false);
  expect(normalizeGenres(" Romance, romance,  Space   opera, ")).toEqual([
    "Romance",
    "Space opera",
  ]);
  expect(normalizeGenres("")).toEqual([]);
  expect(() => normalizeGenres("x".repeat(49))).toThrow();
});
it("combines author, type and reading state without changing library data", () => {
  expect(
    matchesLibraryFilters(base, {
      author: "Writer",
      type: "Books",
      status: "unread",
    }),
  ).toBe(true);
  expect(
    matchesLibraryFilters(base, {
      author: "Other",
      type: "all",
      status: "all",
    }),
  ).toBe(false);
  expect(
    matchesLibraryFilters(base, {
      author: "all",
      type: "PDF",
      status: "all",
    }),
  ).toBe(false);
  expect(
    matchesLibraryFilters(
      { ...base, opened: 10 },
      { author: "all", type: "EPUB", status: "reading" },
    ),
  ).toBe(true);
  expect(
    matchesLibraryFilters(
      { ...base, finished: true },
      { author: "all", type: "EPUB", status: "finished" },
    ),
  ).toBe(true);
  expect(bookFinished({ ...base, position: 9 })).toBe(true);
  expect(bookFinished({ ...base, position: 9, finished: false })).toBe(false);
  expect(bookFinished({ ...base, paragraphCount: 1 })).toBe(false);
});
it("last read order is reversible and does not mutate the input", () => {
  const books = [
    { ...base, id: "older", opened: 20 },
    { ...base, id: "newer", opened: 100 },
    { ...base, id: "unread", opened: 0 },
  ];
  expect(sortLibrary(books, "recent").map((b) => b.id)).toEqual([
    "newer",
    "older",
    "unread",
  ]);
  expect(sortLibrary(books, "oldest-read").map((b) => b.id)).toEqual([
    "unread",
    "older",
    "newer",
  ]);
  expect(books[0].id).toBe("older");
});
it("cover overlays default to generated art and obey both global and document switches", () => {
  const imported = {
    ...base,
    coverImage: "art",
    coverOrigin: "imported" as const,
  };
  expect(defaultPreferences.showCoverText).toBe(true);
  expect(hasCoverText(imported, true)).toBe(false);
  expect(hasCoverText({ ...imported, coverText: "show" }, true)).toBe(true);
  expect(hasCoverText({ ...imported, coverText: "show" }, false)).toBe(false);
  expect(hasCoverText({ ...imported, coverOrigin: "generated" }, true)).toBe(
    true,
  );
  expect(hasCoverText({ ...base, coverText: "hide" }, true)).toBe(false);
});
