import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { importDocument } from "../src/documents";
import manifest from "../assets/starter-library/manifest.json";

const directory = join(process.cwd(), "assets", "starter-library", "books");
describe("complete starter-library editions", () => {
  for (const item of manifest.books) {
    it(`${item.title} imports with every chapter and its ending intact`, async () => {
      const bytes = readFileSync(join(directory, item.filename));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        item.sha256,
      );
      const entries = unzipSync(bytes);
      expect(
        Object.keys(entries).filter((name) => /chapter-\d+\.xhtml$/.test(name)),
      ).toHaveLength(item.chapterCount);
      expect(
        Object.keys(entries).some((name) =>
          /\.(png|jpg|svg|woff|ttf)$/i.test(name),
        ),
      ).toBe(false);
      expect(strFromU8(entries.mimetype)).toBe("application/epub+zip");
      const file = {
        name: item.filename,
        size: bytes.length,
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      } as File;
      const book = await importDocument(file);
      expect(book.meta.title).toBe(item.title);
      expect(book.meta.author).toBe(item.author);
      expect(book.meta.coverImage).toBeUndefined();
      expect(book.meta.wordCount).toBeGreaterThan(item.wordCount * 0.98);
      const finalChapter = new DOMParser().parseFromString(
        strFromU8(entries[`EPUB/text/chapter-${item.chapterCount}.xhtml`]),
        "application/xhtml+xml",
      );
      const finalParagraph = Array.from(finalChapter.querySelectorAll("p"))
        .at(-1)!
        .textContent!.replace(/\s+/g, " ")
        .trim();
      expect(book.paragraphs.map((p) => p.text)).toContain(finalParagraph);
      const renderedChapters = new Set(
        book.paragraphs
          .filter((p) => p.kind === "heading")
          .map((p) => p.chapter),
      );
      expect(renderedChapters.size).toBeGreaterThanOrEqual(item.chapterCount);
      // Imported novel bodies must fit the native backend's persistence limit.
      expect(
        new TextEncoder().encode(JSON.stringify(book)).length,
      ).toBeLessThan(64 * 1024 * 1024);
    });
  }
});
