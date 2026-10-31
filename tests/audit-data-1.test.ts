import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  countWords,
  createBook,
  epubParagraphs,
  importDocument,
  MAX_PARAGRAPHS,
} from "../src/documents";
import {
  decodeHtml,
  decodeText,
  readDocx,
  readRtf,
  toParagraphs,
} from "../src/importers";
import type { Paragraph } from "../src/types";

const xhtml = (body: string) =>
  new DOMParser().parseFromString(
    `<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`,
    "application/xhtml+xml",
  );

describe("web page and EPUB text", () => {
  it("keeps div, pre, cell and loose body text, with spaces for line breaks", () => {
    const doc = xhtml(
      '<div class="stanza"><span>Line one<br/></span><span>Line two</span></div><div>Plain div</div><pre>Code</pre><table><tr><td>Cell</td></tr></table><h5>Small heading</h5><p>day?<br/>Thou art</p>Loose text',
    );
    expect(epubParagraphs(doc, 1).map((p) => p.text)).toEqual([
      "Line one Line two",
      "Plain div",
      "Code",
      "Cell",
      "Small heading",
      "day? Thou art",
      "Loose text",
    ]);
  });
  it("keeps a div with paragraphs and loose text apart", () => {
    const doc = xhtml("<div>Intro<p>Inside</p></div>");
    expect(epubParagraphs(doc, 1).map((p) => p.text)).toEqual([
      "Intro",
      "Inside",
    ]);
  });
});

describe("EPUB import", () => {
  const container =
    '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>';
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>
      The   Book
    </dc:title><dc:creator>
      Ada  Writer </dc:creator></metadata><manifest><item id="cover" href="cover.svg" media-type="image/svg+xml"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="cover"/><itemref idref="c1"/></spine></package>`;
  const chapter =
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><p><ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>です。</p></body></html>';
  it("skips SVG spine pages, trims metadata and drops ruby readings", async () => {
    const epub = zipSync({
      "META-INF/container.xml": strToU8(container),
      "OEBPS/content.opf": strToU8(opf),
      "OEBPS/cover.svg": strToU8("<svg/>"),
      "OEBPS/c1.xhtml": strToU8(chapter),
    });
    const book = await importDocument(new File([epub], "book.epub"));
    expect(book.meta.title).toBe("The Book");
    expect(book.meta.author).toBe("Ada Writer");
    expect(book.paragraphs.map((p) => p.text)).toEqual(["漢字です。"]);
  });
  it("reports a damaged file in plain words", async () => {
    await expect(
      importDocument(new File([strToU8("not a zip")], "broken.epub")),
    ).rejects.toThrow(/could not be read/);
  });
});

describe("Word documents", () => {
  const w =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="w" xmlns:v="v"';
  it("reads a text box once and keeps outline level 9 as body text", () => {
    const box = (wrap: string, end: string) =>
      `${wrap}<w:txbxContent><w:p><w:r><w:t>Box text</w:t></w:r></w:p></w:txbxContent>${end}`;
    const docx = zipSync({
      "word/document.xml": strToU8(
        `<w:document ${w}><w:body>` +
          `<w:p><w:r><w:t>Anchor</w:t></w:r><w:r><mc:AlternateContent><mc:Choice>${box("<wps:txbx>", "</wps:txbx>")}</mc:Choice><mc:Fallback>${box("<v:textbox>", "</v:textbox>")}</mc:Fallback></mc:AlternateContent></w:r></w:p>` +
          `<w:p><w:pPr><w:pStyle w:val="Outlined"/><w:outlineLvl w:val="9"/></w:pPr><w:r><w:t>Body text</w:t></w:r></w:p>` +
          `<w:p><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>Section</w:t></w:r></w:p>` +
          `</w:body></w:document>`,
      ),
      "word/styles.xml": strToU8(
        `<w:styles ${w}><w:style w:styleId="Outlined"><w:name w:val="Outlined"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:styleId="Body"><w:name w:val="Body"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style></w:styles>`,
      ),
    });
    const paragraphs = toParagraphs(readDocx(docx).blocks);
    expect(paragraphs.map((p) => [p.kind, p.text])).toEqual([
      ["paragraph", "Anchor"],
      ["paragraph", "Box text"],
      ["paragraph", "Body text"],
      ["heading", "Section"],
    ]);
    expect(paragraphs[3].headingLevel).toBe(2);
  });
});

describe("RTF", () => {
  it("decodes the title and handles hyphen control symbols", () => {
    const rtf = strToU8(
      "{\\rtf1\\ansi\\ansicpg1252{\\info{\\title Caf\\'e9 \\u1046?}}" +
        "in\\-ter\\_est\\par Two\\\nThree\\par}",
    );
    const doc = readRtf(rtf);
    expect(doc.title).toBe("Café Ж");
    expect(doc.blocks.map((b) => b.text)).toEqual([
      "inter‑est",
      "Two",
      "Three",
    ]);
  });
});

describe("text encodings", () => {
  // "Привет и мир" in windows-1251.
  const cp1251 = new Uint8Array([
    0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x20, 0xe8, 0x20, 0xec, 0xe8, 0xf0,
  ]);
  it("reads Cyrillic text saved in windows-1251", () => {
    expect(decodeText(cp1251)).toBe("Привет и мир");
  });
  it("uses a web page's meta charset when it is not UTF-8", () => {
    const head = strToU8('<html><head><meta charset="windows-1251"></head><body>');
    const page = new Uint8Array([...head, ...cp1251]);
    expect(decodeHtml(page)).toContain("Привет и мир");
    const utf8 = strToU8('<meta charset="iso-8859-1"><p>Привет</p>');
    expect(decodeHtml(utf8)).toContain("Привет");
  });
});

describe("word counts", () => {
  it("counts words in scripts without spaces", () => {
    expect(countWords("one two  three")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(countWords("我们明天去北京看看长城")).toBeGreaterThan(3);
    expect(countWords("今日は良い天気です")).toBeGreaterThan(2);
  });
  it("refuses more paragraphs than one book can hold", () => {
    const many = { length: MAX_PARAGRAPHS + 1 } as unknown as Paragraph[];
    expect(() => createBook("Big", many)).toThrow(/200,000 paragraphs/);
  });
});
