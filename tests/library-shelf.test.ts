import { describe, expect, it } from "vitest";
import { guessShelf, shelfOf } from "../src/libraryShelf";

describe("the two libraries", () => {
  it("guess from the format, the genres and Work mode", () => {
    expect(guessShelf({ format: "EPUB" })).toBe("stories");
    expect(guessShelf({ format: "PDF" })).toBe("documents");
    expect(guessShelf({ format: "PDF", genres: ["Gothic horror"] })).toBe("stories");
    expect(guessShelf({ format: "EPUB", work: true })).toBe("documents");
    expect(guessShelf({ format: "Markdown", genres: ["Short stories"] })).toBe("stories");
  });
  it("keep the library a book was put in", () => {
    expect(shelfOf({ format: "EPUB", shelf: "documents" })).toBe("documents");
    expect(shelfOf({ format: "PDF", shelf: "stories" })).toBe("stories");
  });
});
