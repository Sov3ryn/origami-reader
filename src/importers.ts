// Readers for document formats besides EPUB and plain text. Each returns
// paragraphs with headings, plus a title and author when the file has them.
// Everything runs locally; nothing is uploaded or converted elsewhere.
import { unzipSync, strFromU8 } from "fflate";
import type { Paragraph } from "./types";
import { currentLanguage } from "./i18n";

export type Block = { text: string; heading?: number; quote?: boolean };
export type Imported = {
  blocks: Block[];
  title?: string;
  author?: string;
  format: string;
};
const MAX_EXPANDED = 64 * 1024 * 1024;

// Blocks to reading paragraphs: ids, chapters and heading levels.
export function toParagraphs(blocks: Block[]): Paragraph[] {
  let chapter = 0;
  const result: Paragraph[] = [];
  for (const block of blocks) {
    const text = block.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const heading =
      block.heading !== undefined && text.split(/\s+/).length <= 30;
    if (heading) chapter++;
    result.push({
      id: "p-" + result.length,
      text,
      kind: heading ? "heading" : "paragraph",
      chapter,
      ...(heading
        ? { headingLevel: Math.min(4, Math.max(1, block.heading!)) }
        : {}),
      ...(block.quote ? { quote: true } : {}),
    });
  }
  return result;
}

// ---- Text encodings ----

// UTF-8 first; then a byte-order mark; then the legacy encodings most often
// used for books in Korean, Japanese, Chinese and Western languages.
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    /* Not UTF-8: try legacy encodings below. */
  }
  const candidates: [string, RegExp][] = [
    ["euc-kr", /[가-힣]/g],
    ["shift_jis", /[぀-ヿ一-鿿]/g],
    ["gb18030", /[一-鿿]/g],
    ["big5", /[一-鿿]/g],
  ];
  let best = { text: "", score: 0 };
  for (const [label, script] of candidates) {
    try {
      const text = new TextDecoder(label, { fatal: true }).decode(bytes);
      const score =
        (text.match(script) || []).length / Math.max(1, text.length);
      if (score > best.score) best = { text, score };
    } catch {
      /* This encoding does not fit the bytes. */
    }
  }
  if (best.score > 0.2) return best.text;
  // Otherwise the usual legacy code page for the interface language.
  const lang = currentLanguage().split("-")[0].toLowerCase();
  const localPage: Record<string, string> = {
    ru: "windows-1251",
    uk: "windows-1251",
    pl: "windows-1250",
    tr: "windows-1254",
    ar: "windows-1256",
    vi: "windows-1258",
    th: "windows-874",
  };
  const fallback = localPage[lang] || "windows-1252";
  // Cyrillic files are common enough to detect outright, but Arabic and Thai
  // code pages also map to Cyrillic letters in windows-1251. This check stays
  // after the CJK candidates, whose bytes also read as mostly Cyrillic.
  if (fallback !== "windows-1256" && fallback !== "windows-874") {
    const cyrillic = new TextDecoder("windows-1251").decode(bytes);
    const letters = (cyrillic.match(/\p{L}/gu) || []).length;
    const cyr = (cyrillic.match(/[Ѐ-ӿ]/g) || []).length;
    if (letters && cyr / letters > 0.5) return cyrillic;
  }
  return new TextDecoder(fallback).decode(bytes);
}

// Web pages: a byte-order mark or valid UTF-8 wins; otherwise the page's own
// meta charset, then the same detection as plain text.
export function decodeHtml(bytes: Uint8Array): string {
  const bom =
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (bom) return decodeText(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    /* Not UTF-8: look for a declared charset below. */
  }
  const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 2048));
  const label = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  if (label) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      /* Unknown label: fall back to detection. */
    }
  }
  return decodeText(bytes);
}

// ---- Zip-based formats ----

function unzip(bytes: Uint8Array, wanted: RegExp, label: string) {
  let expanded = 0;
  return unzipSync(bytes, {
    filter: (info) => {
      expanded += info.originalSize;
      if (expanded > MAX_EXPANDED)
        throw new Error(label + " expands beyond the 64 MB safety limit.");
      return wanted.test(info.name);
    },
  });
}
function parseXml(data: Uint8Array | undefined, label: string) {
  if (!data) throw new Error(label + " is missing its text.");
  const doc = new DOMParser().parseFromString(
    strFromU8(data),
    "application/xml",
  );
  if (doc.querySelector("parsererror"))
    throw new Error(label + " contains invalid XML.");
  return doc;
}
const byLocal = (root: Element | Document, name: string) =>
  Array.from(root.getElementsByTagNameNS("*", name));
const firstText = (root: Document, name: string) =>
  byLocal(root, name)[0]?.textContent?.trim() || undefined;

// Word (.docx): paragraphs, headings by style or outline level, table cells.
export function readDocx(bytes: Uint8Array): Imported {
  const files = unzip(
    bytes,
    /^(word\/document\.xml|word\/styles\.xml|docProps\/core\.xml)$/,
    "Word document",
  );
  const doc = parseXml(files["word/document.xml"], "Word document");
  // Heading styles may be named "Heading 1" or defined with an outline level.
  // Outline levels 0-8 are heading levels; 9 means body text.
  const outlineLevel = (value: string | null | undefined) => {
    if (value === null || value === undefined) return undefined;
    const o = Number(value);
    return Number.isInteger(o) && o >= 0 && o <= 8 ? o + 1 : undefined;
  };
  const child = (el: Element | undefined, name: string) =>
    el && Array.from(el.children).find((c) => c.localName === name);
  const levels = new Map<string, number>();
  if (files["word/styles.xml"]) {
    const styles = parseXml(files["word/styles.xml"], "Word styles");
    for (const style of byLocal(styles, "style")) {
      const id = style.getAttribute("w:styleId") || "";
      const name = byLocal(style, "name")[0]?.getAttribute("w:val") || "";
      const outline = outlineLevel(
        child(child(style, "pPr"), "outlineLvl")?.getAttribute("w:val"),
      );
      const match = /^(?:heading|titre|überschrift|título|제목)\s*(\d)/i.exec(
        name,
      );
      if (/^title$/i.test(name)) levels.set(id, 1);
      else if (match) levels.set(id, Number(match[1]));
      else if (outline !== undefined) levels.set(id, outline);
    }
  }
  // Word writes each text box twice (mc:Choice and mc:Fallback). Its
  // paragraphs are read once, from the Choice copy, as their own blocks.
  const inFallback = (el: Element) => {
    for (let a = el.parentElement; a; a = a.parentElement)
      if (a.localName === "Fallback") return true;
    return false;
  };
  const textOf = (el: Element): string => {
    let text = "";
    for (const node of Array.from(el.children)) {
      const name = node.localName;
      if (name === "t") text += node.textContent || "";
      else if (name === "tab") text += " ";
      else if (name === "br" || name === "cr") text += "\n";
      else if (name !== "txbxContent" && name !== "Fallback")
        text += textOf(node);
    }
    return text;
  };
  const blocks: Block[] = [];
  for (const p of byLocal(doc, "p")) {
    if (inFallback(p)) continue;
    const text = textOf(p);
    // Direct paragraph properties only, so tracked-change history is ignored.
    const pPr = child(p, "pPr");
    const style = child(pPr, "pStyle")?.getAttribute("w:val") || "";
    const outline = child(pPr, "outlineLvl")?.getAttribute("w:val");
    // Direct formatting wins over the style; outline level 9 is body text.
    const level =
      outline !== null && outline !== undefined && Number(outline) === 9
        ? undefined
        : (outlineLevel(outline) ??
          levels.get(style) ??
          (/^heading(\d)$/i.test(style) ? Number(style.slice(7)) : undefined));
    blocks.push({
      text,
      ...(level !== undefined ? { heading: level } : {}),
      ...(/quote/i.test(style) ? { quote: true } : {}),
    });
  }
  const core = files["docProps/core.xml"]
    ? parseXml(files["docProps/core.xml"], "Word properties")
    : null;
  return {
    blocks,
    title: core ? firstText(core, "title") : undefined,
    author: core ? firstText(core, "creator") : undefined,
    format: "DOCX",
  };
}

// OpenDocument text (.odt, from LibreOffice and OpenOffice).
export function readOdt(bytes: Uint8Array): Imported {
  const files = unzip(bytes, /^(content\.xml|meta\.xml)$/, "OpenDocument file");
  const doc = parseXml(files["content.xml"], "OpenDocument file");
  const blocks: Block[] = [];
  const textOf = (el: Element): string => {
    let text = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) text += node.textContent;
      else if (node.nodeType === 1) {
        const child = node as Element;
        const name = child.localName;
        if (name === "s")
          text += " ".repeat(Number(child.getAttribute("text:c") || 1));
        else if (name === "tab") text += " ";
        else if (name === "line-break") text += "\n";
        else if (name !== "note" && name !== "annotation")
          text += textOf(child);
      }
    }
    return text;
  };
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const name = child.localName;
      if (name === "h")
        blocks.push({
          text: textOf(child),
          heading: Number(child.getAttribute("text:outline-level") || 1),
        });
      else if (name === "p") blocks.push({ text: textOf(child) });
      else if (name !== "tracked-changes" && name !== "sequence-decls")
        walk(child);
    }
  };
  const body = byLocal(doc, "text").find(
    (e) => e.parentElement?.localName === "body",
  );
  if (body) walk(body);
  const meta = files["meta.xml"]
    ? parseXml(files["meta.xml"], "OpenDocument properties")
    : null;
  return {
    blocks,
    title: meta ? firstText(meta, "title") : undefined,
    author: meta
      ? firstText(meta, "initial-creator") || firstText(meta, "creator")
      : undefined,
    format: "ODT",
  };
}

// ---- Markup formats ----

// FictionBook (.fb2), common for e-books in Eastern Europe.
export function readFb2(bytes: Uint8Array): Imported {
  // The XML declaration names the encoding; fall back to detection.
  const head = strFromU8(bytes.slice(0, 200));
  const declared = /encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  let source: string;
  try {
    source = declared
      ? new TextDecoder(declared).decode(bytes)
      : decodeText(bytes);
  } catch {
    source = decodeText(bytes);
  }
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("This FB2 book contains invalid XML.");
  const blocks: Block[] = [];
  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      const name = child.localName;
      if (name === "title")
        blocks.push({
          text:
            byLocal(child, "p")
              .map((p) => p.textContent)
              .join(". ") ||
            child.textContent ||
            "",
          heading: Math.min(4, depth),
        });
      else if (name === "p" || name === "v" || name === "subtitle")
        blocks.push({
          text: child.textContent || "",
          ...(child.closest("epigraph,cite,poem") ? { quote: true } : {}),
        });
      else if (name === "binary" || name === "description") continue;
      else walk(child, name === "section" ? depth + 1 : depth);
    }
  };
  for (const body of byLocal(doc, "body"))
    if (body.getAttribute("name") !== "notes") walk(body, 0);
  const info = byLocal(doc, "title-info")[0];
  const author = info ? byLocal(info, "author")[0] : undefined;
  return {
    blocks,
    title: info
      ? byLocal(info, "book-title")[0]?.textContent?.trim()
      : undefined,
    author: author
      ? ["first-name", "middle-name", "last-name"]
          .map((n) => byLocal(author, n)[0]?.textContent?.trim())
          .filter(Boolean)
          .join(" ") || undefined
      : undefined,
    format: "FB2",
  };
}
export function readFb2Zip(bytes: Uint8Array): Imported {
  const files = unzip(bytes, /\.fb2$/i, "FB2 archive");
  const first = Object.values(files)[0];
  if (!first) throw new Error("This archive has no FB2 book inside.");
  return readFb2(first);
}

// Web pages and saved articles (.html, .htm, .xhtml).
export function readHtml(
  bytes: Uint8Array,
  paragraphs: (doc: Document) => Paragraph[],
): { paragraphs: Paragraph[]; title?: string; author?: string } {
  const doc = new DOMParser().parseFromString(decodeHtml(bytes), "text/html");
  // Ruby readings (rt, rp, rtc) would repeat every annotated word.
  doc
    .querySelectorAll(
      "script,style,nav,header,footer,aside,noscript,template,rt,rp,rtc",
    )
    .forEach((el) => el.remove());
  return {
    paragraphs: paragraphs(doc),
    title: doc.querySelector("title")?.textContent?.trim() || undefined,
    author:
      doc
        .querySelector('meta[name="author"]')
        ?.getAttribute("content")
        ?.trim() || undefined,
  };
}

// The \title group holds raw RTF: hex bytes, \uN characters and escapes.
// The \uN replacement assumes the default \uc1 fallback, as Word writes it.
function decodeRtfTitle(raw: string, decoder: TextDecoder) {
  return raw
    .replace(/\\u(-?\d+) ?(?:\\'[0-9a-fA-F]{2}|\?)?/g, (_, n: string) => {
      const code = Number(n);
      return String.fromCharCode(code < 0 ? code + 65536 : code);
    })
    .replace(/(?:\\'[0-9a-fA-F]{2})+/g, (run) =>
      decoder.decode(
        new Uint8Array(
          (run.match(/[0-9a-fA-F]{2}/g) || []).map((h) => parseInt(h, 16)),
        ),
      ),
    )
    .replace(/\\[a-z]+-?\d* ?/g, "")
    .replace(/\\([\\{}])/g, "$1")
    .replace(/\\~/g, " ")
    .replace(/\\-/g, "")
    .replace(/\\_/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Rich Text Format (.rtf): text, paragraphs and the document title.
export function readRtf(bytes: Uint8Array): Imported {
  const source = strFromU8(bytes, true);
  if (!source.startsWith("{\\rtf"))
    throw new Error("This file is not a valid RTF document.");
  const codepage = Number(/\\ansicpg(\d+)/.exec(source)?.[1] || 1252);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder("windows-" + codepage);
  } catch {
    decoder = new TextDecoder("windows-1252");
  }
  const skipped = new Set([
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "header",
    "footer",
    "headerl",
    "headerr",
    "footerl",
    "footerr",
    "footnote",
    "listtable",
    "listoverridetable",
    "rsidtbl",
    "generator",
    "xmlnstbl",
    "themedata",
    "colorschememapping",
    "datastore",
    "latentstyles",
    "object",
    "fldinst",
  ]);
  const blocks: Block[] = [];
  let text = "";
  let bytesRun: number[] = [];
  const flushBytes = () => {
    if (bytesRun.length) text += decoder.decode(new Uint8Array(bytesRun));
    bytesRun = [];
  };
  const stack: { skip: boolean; uc: number }[] = [];
  let skip = false;
  let uc = 1;
  let pendingSkip = 0;
  let title: string | undefined;
  const titleMatch = /\{\\title\s+([^}]*)\}/.exec(source);
  if (titleMatch) title = decodeRtfTitle(titleMatch[1], decoder) || undefined;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "{") {
      flushBytes();
      stack.push({ skip, uc });
      if (source.startsWith("{\\*", i)) skip = true;
    } else if (c === "}") {
      flushBytes();
      ({ skip, uc } = stack.pop() || { skip: false, uc: 1 });
    } else if (c === "\\") {
      const next = source[i + 1];
      if (next === "'") {
        const hex = source.slice(i + 2, i + 4);
        i += 3;
        if (pendingSkip > 0) {
          pendingSkip--;
          continue;
        }
        if (!skip) bytesRun.push(parseInt(hex, 16));
        continue;
      }
      if (next === "\\" || next === "{" || next === "}") {
        flushBytes();
        if (!skip) text += next;
        i++;
        continue;
      }
      if (next === "~") {
        flushBytes();
        if (!skip) text += " ";
        i++;
        continue;
      }
      // Optional hyphen: shown only at a line end, so left out.
      if (next === "-") {
        i++;
        continue;
      }
      // Non-breaking hyphen.
      if (next === "_") {
        flushBytes();
        if (!skip) text += "‑";
        i++;
        continue;
      }
      // A backslash before a line break is a paragraph break.
      if (next === "\n" || next === "\r") {
        flushBytes();
        if (!skip) {
          blocks.push({ text });
          text = "";
        }
        i++;
        continue;
      }
      const word = /^\\([a-z]+)(-?\d+)? ?/.exec(source.slice(i, i + 40));
      // Any other control symbol is skipped with its character.
      if (!word) {
        i++;
        continue;
      }
      i += word[0].length - 1;
      flushBytes();
      const [, name, arg] = word;
      if (skipped.has(name)) skip = true;
      else if (name === "uc") uc = Number(arg || 1);
      else if (name === "u" && !skip) {
        const code = Number(arg);
        text += String.fromCharCode(code < 0 ? code + 65536 : code);
        pendingSkip = uc;
      } else if (
        (name === "par" || name === "sect" || name === "page") &&
        !skip
      ) {
        blocks.push({ text });
        text = "";
      } else if ((name === "line" || name === "tab") && !skip) text += " ";
    } else if (c === "\r" || c === "\n") continue;
    else {
      if (pendingSkip > 0) {
        pendingSkip--;
        continue;
      }
      flushBytes();
      if (!skip) text += c;
    }
  }
  flushBytes();
  if (text.trim()) blocks.push({ text });
  return { blocks, title, format: "RTF" };
}

// ---- Kindle (MOBI, AZW, AZW3, PRC) ----

// PalmDOC (LZ77-style) decompression used by MOBI text records.
export function palmDoc(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length;) {
    const c = data[i++];
    if (c === 0 || (c >= 9 && c <= 0x7f)) out.push(c);
    else if (c >= 1 && c <= 8)
      for (let n = 0; n < c && i < data.length; n++) out.push(data[i++]);
    else if (c >= 0xc0) out.push(0x20, c ^ 0x80);
    else {
      const pair = ((c << 8) | data[i++]) & 0x3fff;
      const distance = pair >> 3;
      const length = (pair & 7) + 3;
      for (let n = 0; n < length; n++) out.push(out[out.length - distance]);
    }
  }
  return new Uint8Array(out);
}
// Records can end with index data; its size is encoded backwards at the end.
function trailingSize(data: Uint8Array, flags: number) {
  const entry = (end: number) => {
    let result = 0;
    let shift = 0;
    for (let i = end - 1; i >= 0 && shift < 28; i--) {
      const v = data[i];
      result |= (v & 0x7f) << shift;
      shift += 7;
      if (v & 0x80) break;
    }
    return result;
  };
  let size = 0;
  for (let f = flags >> 1; f; f >>= 1)
    if (f & 1) size += entry(data.length - size);
  if (flags & 1) size += (data[data.length - size - 1] & 3) + 1;
  return size;
}
export function readMobi(bytes: Uint8Array): {
  html: string;
  title?: string;
  author?: string;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(76);
  const offsets = Array.from({ length: count }, (_, i) =>
    view.getUint32(78 + i * 8),
  );
  offsets.push(bytes.length);
  const record = (n: number) => bytes.subarray(offsets[n], offsets[n + 1]);
  const header = record(0);
  const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const compression = hv.getUint16(0);
  const textRecords = hv.getUint16(8);
  const encryption = hv.getUint16(12);
  if (encryption !== 0)
    throw new Error(
      "This Kindle book is protected (DRM) and cannot be opened. Only DRM-free books can be imported.",
    );
  if (compression !== 1 && compression !== 2)
    throw new Error(
      "This Kindle book uses a compression Origami cannot read yet. Try an EPUB version of the book.",
    );
  const isMobi = strFromU8(header.subarray(16, 20)) === "MOBI";
  const headerLength = isMobi ? hv.getUint32(20) : 0;
  const encoding = isMobi ? hv.getUint32(28) : 1252;
  const extraFlags =
    isMobi && headerLength >= 0xe4 && header.length >= 0xf4
      ? hv.getUint16(0xf2)
      : 0;
  let title: string | undefined;
  let author: string | undefined;
  const decoder = new TextDecoder(
    encoding === 65001 ? "utf-8" : "windows-1252",
  );
  if (isMobi) {
    const nameOffset = hv.getUint32(84);
    const nameLength = hv.getUint32(88);
    title =
      decoder
        .decode(header.subarray(nameOffset, nameOffset + nameLength))
        .trim() || undefined;
    const exthStart = 16 + headerLength;
    if (
      hv.getUint32(128) & 0x40 &&
      strFromU8(header.subarray(exthStart, exthStart + 4)) === "EXTH"
    ) {
      const records = hv.getUint32(exthStart + 8);
      let at = exthStart + 12;
      for (let n = 0; n < records && at + 8 <= header.length; n++) {
        const type = hv.getUint32(at);
        const length = hv.getUint32(at + 4);
        const value = decoder
          .decode(header.subarray(at + 8, at + length))
          .trim();
        if (type === 100 && !author) author = value;
        if (type === 503 && value) title = value;
        at += length;
      }
    }
  }
  const parts: Uint8Array[] = [];
  for (let n = 1; n <= textRecords && n < count; n++) {
    let data = record(n);
    if (extraFlags)
      data = data.subarray(0, data.length - trailingSize(data, extraFlags));
    parts.push(compression === 2 ? palmDoc(data) : data);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total > MAX_EXPANDED)
    throw new Error("Kindle book expands beyond the 64 MB safety limit.");
  const joined = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    joined.set(p, at);
    at += p.length;
  }
  return { html: decoder.decode(joined), title, author };
}
