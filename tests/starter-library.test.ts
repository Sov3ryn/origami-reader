import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { importDocument } from "../src/documents";
import manifest from "../assets/starter-library/manifest.json";
import review from "../assets/starter-library/international-review.json";
const directory = join(process.cwd(), "assets", "starter-library", "books");
const hash = (text: string | Uint8Array) =>
  createHash("sha256").update(text).digest("hex");
describe("complete commercial starter-library editions", () => {
  it("uses commercially permitted text and preserves the scoped territorial record", () => {
    expect(manifest.books).toHaveLength(6);
    expect(manifest.globalClearance).toBe(false);
    expect(review.globalClearance).toBe(false);
    for (const book of manifest.books) {
      expect(book.commercialRedistribution).toBe(true);
      expect(book.license).not.toMatch(/(?:^|-)NC(?:-|$)/);
      if (book.sourceKind !== "author-stories") {
        expect(book.published).toBeLessThan(1931);
        expect(book.lastContributorDeath!).toBeLessThan(1925);
      }
    }
    expect(manifest.books.some((b) => b.id === "starter-little-brother")).toBe(
      false,
    );
    expect(review.releaseCountries).not.toContain("SN");
  });
  it("preserves every modern story block and the author's commercial license inside the EPUB", () => {
    const item = manifest.books.find(
      (b) => b.id === "starter-grayson-stories",
    )!;
    expect(item.license).toBe("CC-BY-SA-4.0");
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
    expect(rights).toContain("Commercial redistribution is permitted");
    expect(rights).toContain(
      "Creative Commons Attribution-ShareAlike 4.0 International",
    );
    const credits = strFromU8(entries["EPUB/text/credits.xhtml"]);
    expect(credits).toContain("worldwide");
    expect(credits).toContain("free to request payment");
    for (const file of item.contentFiles) {
      const doc = new DOMParser().parseFromString(
        strFromU8(entries["EPUB/" + file.file]),
        "application/xhtml+xml",
      );
      const blocks = Array.from(
        doc.querySelectorAll("p,h1,h2,h3,blockquote"),
        (p) => p.textContent!.replace(/\s+/g, " ").trim(),
      ).filter(Boolean);
      expect(hash(blocks.join("\n"))).toBe(file.sha256);
    }
    expect(item.contentFiles).toHaveLength(16);
  });
  it("packages only manifest books and fails closed for an unreviewed release destination", () => {
    const script = join(process.cwd(), "scripts/package-starter-library.mjs");
    expect(() =>
      execFileSync(process.execPath, [script, "--release", "--country=SN"], {
        stdio: "pipe",
      }),
    ).toThrow();
    expect(() =>
      execFileSync(process.execPath, [script, "--release"], { stdio: "pipe" }),
    ).toThrow();
    const stale = join(directory, "inactive-test-only.epub");
    writeFileSync(stale, "Inactive book test fixture", { flag: "wx" });
    try {
      execFileSync(process.execPath, [script, "--release", "--country=CA"], {
        stdio: "pipe",
      });
    } finally {
      unlinkSync(stale);
    }
    const entries = unzipSync(
      readFileSync(
        join(process.cwd(), "../outputs/Origami-Starter-Library-CA.zip"),
      ),
    );
    const books = Object.keys(entries).filter((path) => path.endsWith(".epub"));
    expect(
      Object.keys(entries).some((path) => path.includes("inactive-test-only")),
    ).toBe(false);
    expect(books.sort()).toEqual(
      manifest.books
        .map((b) => "Origami-Starter-Library/books/" + b.filename)
        .sort(),
    );
    expect(
      Object.keys(entries).some((path) =>
        /little-brother|time-machine|blue-castle|hound-baskervilles/.test(path),
      ),
    ).toBe(false);
    expect(
      strFromU8(entries["Origami-Starter-Library/DESTINATION.txt"]),
    ).toContain("CA");
    expect(entries["Origami-Starter-Library/CC-BY-SA-4.0.txt"]).toBeDefined();
  });
  for (const item of manifest.books) {
    it(`${item.title} imports with all chapters and final content intact`, async () => {
      const bytes = readFileSync(join(directory, item.filename));
      expect(hash(bytes)).toBe(item.sha256);
      const entries = unzipSync(bytes);
      expect(
        Object.keys(entries).filter((name) =>
          /chapter-\d+(?:-\d+)*\.xhtml$/.test(name),
        ),
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
        strFromU8(entries["EPUB/" + item.finalContentFile]),
        "application/xhtml+xml",
      );
      const finalParagraph = Array.from(
        finalChapter.querySelectorAll("p,li,blockquote"),
      )
        .filter((el) => !el.parentElement?.closest("li,blockquote"))
        .at(-1)!
        .textContent!.replace(/\s+/g, " ")
        .trim();
      expect(book.paragraphs.map((p) => p.text)).toContain(finalParagraph);
      const headings = new Set(
        book.paragraphs
          .filter((p) => p.kind === "heading")
          .map((p) => p.chapter),
      );
      expect(headings.size).toBeGreaterThanOrEqual(item.chapterCount);
      expect(
        new TextEncoder().encode(JSON.stringify(book)).length,
      ).toBeLessThan(64 * 1024 * 1024);
    });
  }
});
