import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { authorNote, initials } from "../src/authors";
import manifest from "../assets/starter-library/manifest.json";
import type { BookMeta } from "../src/types";

const meta = (id: string, sourceHash = "") =>
  ({ id, sourceHash }) as BookMeta;

describe("author notes", () => {
  it("covers every starter edition, with bundled portraits that exist", () => {
    for (const book of manifest.books) {
      const note = authorNote(meta(book.id));
      expect(note?.name).toBe(book.author);
      expect(note?.bio.length).toBeGreaterThan(20);
      expect(note?.facts.length).toBeGreaterThan(0);
      if (note?.portrait)
        expect(existsSync("public" + note.portrait)).toBe(true);
    }
  });

  it("finds a re-imported starter file by its hash and skips other books", () => {
    const dracula = manifest.books.find((b) => b.id === "starter-dracula")!;
    expect(authorNote(meta("imported", dracula.sha256))?.name).toBe(
      "Bram Stoker",
    );
    expect(authorNote(meta("my-own-book", "abc"))).toBeNull();
  });

  it("uses first and last initials for authors without a portrait", () => {
    expect(initials("Grayson Bray Morris")).toBe("GM");
    expect(initials("Colette")).toBe("C");
  });
});
