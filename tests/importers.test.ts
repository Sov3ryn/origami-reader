import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  decodeText,
  readDocx,
  readFb2,
  palmDoc,
  readMobi,
  readOdt,
  readRtf,
  toParagraphs,
} from "../src/importers";
import { pdfBlocks } from "../src/pdfImport";

const texts = (blocks: { text: string }[]) =>
  blocks.map((b) => b.text.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("document formats", () => {
  it("reads Word documents with headings and metadata", () => {
    const w =
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const docx = zipSync({
      "word/document.xml": strToU8(
        `<w:document ${w}><w:body>` +
          `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t xml:space="preserve">It was a </w:t></w:r><w:r><w:t>quiet night.</w:t></w:r></w:p>` +
          `<w:p><w:pPr><w:pStyle w:val="MyTitle"/></w:pPr><w:r><w:t>Part Two</w:t></w:r></w:p>` +
          `</w:body></w:document>`,
      ),
      "word/styles.xml": strToU8(
        `<w:styles ${w}><w:style w:styleId="MyTitle"><w:name w:val="heading 2"/></w:style></w:styles>`,
      ),
      "docProps/core.xml": strToU8(
        '<cp:coreProperties xmlns:cp="c" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>My Story</dc:title><dc:creator>Ada Writer</dc:creator></cp:coreProperties>',
      ),
    });
    const doc = readDocx(docx);
    expect(doc.title).toBe("My Story");
    expect(doc.author).toBe("Ada Writer");
    const paragraphs = toParagraphs(doc.blocks);
    expect(paragraphs.map((p) => [p.kind, p.text])).toEqual([
      ["heading", "Chapter One"],
      ["paragraph", "It was a quiet night."],
      ["heading", "Part Two"],
    ]);
    expect(paragraphs[2].headingLevel).toBe(2);
  });

  it("reads OpenDocument text from LibreOffice and OpenOffice", () => {
    const ns =
      'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';
    const odt = zipSync({
      "content.xml": strToU8(
        `<office:document-content ${ns}><office:body><office:text>` +
          `<text:h text:outline-level="1">Beginnings</text:h>` +
          `<text:p>Two<text:s text:c="2"/>spaces and a<text:tab/>tab.</text:p>` +
          `<text:list><text:list-item><text:p>A listed line.</text:p></text:list-item></text:list>` +
          `</office:text></office:body></office:document-content>`,
      ),
      "meta.xml": strToU8(
        '<office:document-meta xmlns:office="o" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="m"><office:meta><dc:title>Notebook</dc:title><meta:initial-creator>Lee</meta:initial-creator></office:meta></office:document-meta>',
      ),
    });
    const doc = readOdt(odt);
    expect(doc.title).toBe("Notebook");
    expect(doc.author).toBe("Lee");
    expect(texts(doc.blocks)).toEqual([
      "Beginnings",
      "Two spaces and a tab.",
      "A listed line.",
    ]);
    expect(doc.blocks[0].heading).toBe(1);
  });

  it("reads RTF text, escapes and Unicode, skipping font tables", () => {
    const rtf = strToU8(
      "{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0 Times;}}{\\info{\\title Letters}}" +
        "\\f0 Caf\\'e9 au lait.\\par Second \\u8212? line with {\\b bold} text.\\par}",
    );
    const doc = readRtf(rtf);
    expect(doc.title).toBe("Letters");
    expect(texts(doc.blocks)).toEqual([
      "Café au lait.",
      "Second — line with bold text.",
    ]);
  });

  it("reads FictionBook sections, titles and poems", () => {
    const fb2 = strToU8(
      '<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><author><first-name>Anna</first-name><last-name>Ivanova</last-name></author><book-title>Winter Tales</book-title></title-info></description>' +
        "<body><section><title><p>First Tale</p></title><p>Snow fell.</p><poem><stanza><v>A quiet verse</v></stanza></poem></section></body>" +
        '<body name="notes"><section><p>A footnote.</p></section></body></FictionBook>',
    );
    const doc = readFb2(fb2);
    expect(doc.title).toBe("Winter Tales");
    expect(doc.author).toBe("Anna Ivanova");
    expect(texts(doc.blocks)).toEqual([
      "First Tale",
      "Snow fell.",
      "A quiet verse",
    ]);
    expect(doc.blocks[2].quote).toBe(true);
  });

  it("reads DRM-free Kindle files, including compressed text", () => {
    const html =
      "<html><body><h1>Chapter</h1><p>Kindle text.</p></body></html>";
    const body = strToU8(html);
    // Plain ASCII is stored as-is in PalmDOC text.
    const compressed = new Uint8Array([...body]);
    const record0 = new Uint8Array(16 + 232);
    const r0 = new DataView(record0.buffer);
    r0.setUint16(0, 2); // PalmDOC compression
    r0.setUint32(4, body.length);
    r0.setUint16(8, 1); // one text record
    record0.set(strToU8("MOBI"), 16);
    r0.setUint32(20, 232); // header length
    r0.setUint32(28, 65001); // UTF-8
    r0.setUint32(84, 0);
    r0.setUint32(88, 0);
    const records = [record0, compressed];
    const headerSize = 78 + records.length * 8 + 2;
    const pdb = new Uint8Array(
      headerSize + records.reduce((n, r) => n + r.length, 0),
    );
    const v = new DataView(pdb.buffer);
    pdb.set(strToU8("Test Book"), 0);
    v.setUint16(76, records.length);
    let at = headerSize;
    records.forEach((r, i) => {
      v.setUint32(78 + i * 8, at);
      pdb.set(r, at);
      at += r.length;
    });
    const book = readMobi(pdb);
    expect(book.html).toBe(html);
    const locked = pdb.slice();
    new DataView(locked.buffer).setUint16(headerSize + 12, 2);
    expect(() => readMobi(locked)).toThrow(/protected/);
  });

  it("expands PalmDOC back-references and space pairs", () => {
    // "abc", then copy 3 bytes from 3 back, then 0xE1 = space + "a".
    const out = palmDoc(new Uint8Array([0x61, 0x62, 0x63, 0x80, 0x18, 0xe1]));
    expect(new TextDecoder().decode(out)).toBe("abcabc a");
  });

  it("decodes Korean text files saved in EUC-KR", () => {
    // "안녕하세요" in EUC-KR.
    const bytes = new Uint8Array([
      0xbe, 0xc8, 0xb3, 0xe7, 0xc7, 0xcf, 0xbc, 0xbc, 0xbf, 0xe4,
    ]);
    expect(decodeText(bytes)).toBe("안녕하세요");
    expect(decodeText(strToU8("plain text"))).toBe("plain text");
  });
});

describe("PDF layout to paragraphs", () => {
  const line = (text: string, y: number, page: number, extra: object = {}) => ({
    text,
    x: 72,
    y,
    size: 11,
    right: 520,
    page,
    ...extra,
  });
  it("drops running headers and page numbers, joins lines and hyphens", () => {
    const pages = [1, 2, 3, 4].map((page) => [
      line("THE QUIET LAKE", 760, page),
      ...(page === 1
        ? [
            line("Chapter One", 700, page, { size: 20, right: 300 }),
            line("The mist rose over the wa-", 660, page),
            line("ter as the sun came up over the hills.", 646, page, {
              right: 400,
            }),
            line("A new paragraph begins with an indent.", 620, page, {
              x: 90,
            }),
          ]
        : [
            line(
              `Page ${page} body text that continues the story here.`,
              700,
              page,
            ),
          ]),
      line(String(page), 40, page),
    ]);
    const blocks = pdfBlocks(pages);
    expect(blocks[0]).toEqual({ text: "Chapter One", heading: 1 });
    expect(blocks[1].text).toBe(
      "The mist rose over the water as the sun came up over the hills.",
    );
    expect(blocks.some((b) => /THE QUIET LAKE/.test(b.text))).toBe(false);
    expect(blocks.some((b) => /^\d$/.test(b.text))).toBe(false);
  });
  it("keeps the space between Korean words across lines, none in Chinese", () => {
    const korean = pdfBlocks([
      [line("그날 저녁 삼촌은", 700, 1), line("갑자기 책을 펼쳤다.", 686, 1)],
    ]);
    expect(korean[0].text).toBe("그날 저녁 삼촌은 갑자기 책을 펼쳤다.");
    const chinese = pdfBlocks([
      [line("我们明天去北京看看", 700, 1), line("长城然后回家。", 686, 1)],
    ]);
    expect(chinese[0].text).toBe("我们明天去北京看看长城然后回家。");
  });
});
