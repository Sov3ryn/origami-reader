import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { importDocument } from "../src/documents";
import manifest from "../assets/starter-library/manifest.json";

const directory = join(process.cwd(), "assets", "starter-library", "books");
describe("complete starter-library editions", () => {
  it("the contemporary novel retains its separate noncommercial terms inside the EPUB", () => {
    const item = manifest.books.find((b) => b.id === "starter-little-brother")!;
    expect(item.license).toBe("CC-BY-NC-SA-3.0");
    expect(item.commercialRedistribution).toBe(false);
    expect(manifest.books.some((b) => b.id === "starter-great-gatsby")).toBe(
      false,
    );
    const entries = unzipSync(readFileSync(join(directory, item.filename)));
    const rights = new DOMParser()
      .parseFromString(
        strFromU8(entries["EPUB/content.opf"]),
        "application/xml",
      )
      .getElementsByTagNameNS(
        "http://purl.org/dc/elements/1.1/",
        "rights",
      )[0].textContent!;
    expect(rights).toContain(
      "Creative Commons Attribution-NonCommercial-ShareAlike 3.0",
    );
    expect(rights).toContain("Commercial redistributors must omit it");
    const sourceParagraphs = Object.entries(entries)
      .filter(
        ([path]) =>
          path.startsWith("EPUB/text/") && !path.endsWith("title.xhtml"),
      )
      .flatMap(([, bytes]) =>
        Array.from(
          new DOMParser()
            .parseFromString(strFromU8(bytes), "application/xhtml+xml")
            .querySelectorAll("p"),
        ),
      );
    // Original paragraph headings become h2 elements; the synthetic first heading is excluded.
    const headings = Object.entries(entries)
      .filter(
        ([path]) =>
          path.startsWith("EPUB/text/") && !path.endsWith("title.xhtml"),
      )
      .flatMap(([, bytes]) =>
        Array.from(
          new DOMParser()
            .parseFromString(strFromU8(bytes), "application/xhtml+xml")
            .querySelectorAll("h2"),
        ),
      );
    expect(sourceParagraphs.length + headings.length - 1).toBe(
      item.sourceParagraphCount,
    );
  });
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
