import { unzipSync, strFromU8 } from "fflate";
import type { Book, BookMeta, Paragraph } from "./types";
import { coverImage } from "./covers";
import { detectBookLanguage } from "./bookLanguage";
import {
  decodeText,
  readDocx,
  readFb2,
  readFb2Zip,
  readHtml,
  readMobi,
  readOdt,
  readRtf,
  toParagraphs,
  type Imported,
} from "./importers";
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
// PDFs often carry page images; only their text is kept.
export const MAX_PDF_BYTES = 200 * 1024 * 1024;
// File types the importer reads, for file pickers and folder drops.
export const IMPORT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "epub",
  "pdf",
  "docx",
  "odt",
  "rtf",
  "html",
  "htm",
  "xhtml",
  "fb2",
  "mobi",
  "azw",
  "azw3",
  "prc",
];
const MAX_EXPANDED = 64 * 1024 * 1024;
export function paragraphsFromText(text: string): Paragraph[] {
  let chapter = 0;
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw, i) => {
      const heading =
        /^#{1,6}\s/.test(raw) || /^(chapter|part)\s+[\divxlc]+\b/i.test(raw);
      if (heading) chapter++;
      return {
        id: "p-" + i,
        text: heading ? raw.replace(/^#{1,6}\s+/, "") : raw,
        kind: heading ? "heading" : "paragraph",
        chapter,
      };
    });
}
export function cleanSpokenText(text: string, skipMarkup = true): string {
  if (!skipMarkup) return text.trim();
  return text
    .replace(
      /<(heartbeat|automation|system-reminder|tool_call)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(
      /<(script|style|pre|code|automationid|decision)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/\uE200[^\uE201]*\uE201/g, " ")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(
      /(?:https?:\/\/|www\.)[^\s<>]+/gi,
      (url) => url.match(/[.!?,;:]+$/)?.[0] || " ",
    )
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/::[a-z][\w-]*(?:\{[^}]*\})?/gi, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|\n)\s*(?:[-*+]>?|>+)\s+/g, "$1")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
    .replace(/(^|\n)\s*[-_=*#~|]{2,}\s*(?=\n|$)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}
const ones = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const tens = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
// English words for 0 to 9999, used for bare chapter numbers.
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
  if (n < 20) return ones[n];
  if (n < 100)
    return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
  if (n < 1000)
    return (
      ones[Math.floor(n / 100)] +
      " hundred" +
      (n % 100 ? " and " + numberWords(n % 100) : "")
    );
  return (
    numberWords(Math.floor(n / 1000)) +
    " thousand" +
    (n % 1000 ? (n % 1000 < 100 ? " and " : " ") + numberWords(n % 1000) : "")
  );
}
// Sino-Korean numbers (일, 이, 삼...) for 1 to 9999.
export function koreanNumber(n: number): string {
  const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const units = ["", "십", "백", "천"];
  if (!Number.isInteger(n) || n < 1 || n > 9999) return String(n);
  return String(n)
    .split("")
    .reverse()
    .map((d, i) => {
      const v = Number(d);
      if (!v) return "";
      // 10, 100 and 1000 are read 십, 백 and 천, not 일십.
      return (v === 1 && i > 0 ? "" : digits[v]) + units[i];
    })
    .reverse()
    .join("");
}
// Chinese and Japanese numerals (一, 二, 三...) for 1 to 9999.
export function hanNumber(n: number): string {
  const digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const units = ["", "十", "百", "千"];
  if (!Number.isInteger(n) || n < 1 || n > 9999) return String(n);
  return String(n)
    .split("")
    .reverse()
    .map((d, i) => {
      const v = Number(d);
      if (!v) return "";
      return (v === 1 && i > 0 ? "" : digits[v]) + units[i];
    })
    .reverse()
    .join("");
}
export type TextLanguage = "en" | "ko" | "ja" | "zh" | "other";
const englishWords = new Set([
  "the",
  "and",
  "of",
  "to",
  "a",
  "in",
  "that",
  "it",
  "was",
  "he",
  "she",
  "i",
  "you",
  "with",
  "for",
  "his",
  "her",
  "is",
  "had",
  "not",
]);
// The main language of a book, from its script and, for Latin text, common
// English words. Used to read bare numbers in the right language.
export function textLanguage(text: string): TextLanguage {
  let hangul = 0,
    kana = 0,
    han = 0,
    letters = 0;
  for (const c of text) {
    if (/[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f]/.test(c)) hangul++;
    else if (/[\u3040-\u30ff]/.test(c)) kana++;
    else if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(c)) han++;
    if (/\p{L}/u.test(c)) letters++;
  }
  if (!letters) return "other";
  if (hangul / letters > 0.3) return "ko";
  if (kana && (kana + han) / letters > 0.3) return "ja";
  if (han / letters > 0.3) return "zh";
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  const common = words.filter((w) => englishWords.has(w)).length;
  return words.length && common / words.length > 0.08 ? "en" : "other";
}
// "1" or "12." alone becomes a complete word ("One.", "일.", "一。") so the
// voice reads it reliably. Other languages keep the number with a full stop.
export function spellBareNumber(text: string, language: TextLanguage = "en") {
  const match = /^\s*(\d{1,4})\s*[.:]?\s*$/.exec(text);
  if (!match) return text;
  const n = Number(match[1]);
  if (language === "ko") return koreanNumber(n) + ".";
  if (language === "ja" || language === "zh") return hanNumber(n) + "。";
  if (language !== "en") return n + ".";
  const words = numberWords(n);
  return words[0].toUpperCase() + words.slice(1) + ".";
}
// Korean and Japanese syllables and Chinese characters take two or three
// times longer to say than a Latin letter, so passages in those scripts are
// measured by how long they take to read, not by character count.
export function speechWeight(text: string) {
  let wide = 0;
  for (const c of text)
    if (/[\uac00-\ud7a3\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(c))
      wide++;
  return text.length + wide * 1.5;
}
// Speech models can fail to finish a lone word or number ("1", "Oh!", "Dr.").
export function isShortSpeech(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const letters = text.replace(/[^\p{L}\p{N}]/gu, "").length;
  return words.length < 2 || letters < 6;
}
export function sentences(text: string): string[] {
  return Array.from(
    new Intl.Segmenter("en", { granularity: "sentence" }).segment(text),
    (s) => s.segment,
  ).filter((s) => s.trim());
}
// A speech unit covers sentences first..last of the cleaned text.
export type SpeechUnit = { text: string; first: number; last: number };
export function speechUnits(
  text: string,
  limit = 400,
  skipMarkup = true,
): SpeechUnit[] {
  if (limit < 16) throw new Error("Speech unit limit is too small.");
  const parts = sentences(cleanSpokenText(text, skipMarkup)).map((s) =>
    s.trim(),
  );
  const result: SpeechUnit[] = [];
  let carry: { text: string; first: number } | null = null;
  parts.forEach((s, index) => {
    const joined = carry ? carry.text + " " + s : s;
    const first = carry ? carry.first : index;
    if (isShortSpeech(joined) && index < parts.length - 1) {
      carry = { text: joined, first };
      return;
    }
    carry = null;
    const previous = result.at(-1);
    if (
      isShortSpeech(joined) &&
      previous &&
      speechWeight(previous.text) + speechWeight(joined) + 1 <= limit
    ) {
      previous.text += " " + joined;
      previous.last = index;
      return;
    }
    const words = joined.split(/\s+/).flatMap((word) => {
      // Text without spaces (Chinese, Japanese) is cut into pieces that fit.
      const size = Math.max(
        1,
        Math.floor((limit * word.length) / Math.max(1, speechWeight(word))),
      );
      return speechWeight(word) > limit
        ? Array.from({ length: Math.ceil(word.length / size) }, (_, i) =>
            word.slice(i * size, (i + 1) * size),
          )
        : [word];
    });
    let chunk = "";
    for (const word of words) {
      if (chunk && speechWeight(chunk) + speechWeight(word) + 1 > limit) {
        result.push({ text: chunk, first, last: index });
        chunk = "";
      }
      chunk += (chunk ? " " : "") + word;
    }
    if (chunk) result.push({ text: chunk, first, last: index });
  });
  return result.filter((unit) => unit.text);
}
export function splitSpeech(
  text: string,
  limit = 400,
  skipMarkup = true,
): string[] {
  return speechUnits(text, limit, skipMarkup).map((unit) => unit.text);
}
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function createBook(
  title: string,
  paragraphs: Paragraph[],
  format = "TXT",
  sourceHash = "",
): Book {
  const meta: BookMeta = {
    id: crypto.randomUUID(),
    title,
    author: "Unknown author",
    format,
    added: Date.now(),
    opened: 0,
    position: 0,
    paragraphCount: paragraphs.length,
    wordCount: paragraphs.reduce((n, p) => n + p.text.split(/\s+/).length, 0),
    collection: "Unsorted",
    favorite: false,
    deleted: false,
    cover: "lake",
    voice: "",
    sourceHash,
    language: detectBookLanguage(paragraphs),
  };
  return { meta, paragraphs };
}
function xml(data: Uint8Array | undefined, label: string): Document {
  if (!data) throw new Error("EPUB is missing " + label);
  const doc = new DOMParser().parseFromString(
    strFromU8(data),
    "application/xml",
  );
  if (doc.querySelector("parsererror"))
    throw new Error("EPUB contains invalid " + label);
  return doc;
}
// Read structural blocks without collapsing diaries or duplicating nested lists.
export function epubParagraphs(
  doc: Document,
  chapter: number,
  start = 0,
): Paragraph[] {
  const result: Paragraph[] = [];
  const selector = "h1,h2,h3,h4,p,li,blockquote";
  const emit = (el: Element, raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) return;
    // Some source editions mark a whole prefatory paragraph as a heading.
    const heading =
      /^h[1-4]$/i.test(el.localName) && text.split(/\s+/).length <= 30;
    const type = [el, el.closest("section"), el.closest("article")]
      .map((node) => node?.getAttribute("epub:type") || "")
      .join(" ");
    result.push({
      id: "p-" + (start + result.length),
      text,
      chapter,
      kind: heading ? "heading" : "paragraph",
      ...(heading ? { headingLevel: Number(el.localName.slice(1)) } : {}),
      ...(el.closest("blockquote") ? { quote: true } : {}),
      ...(/(?:dateline|signature)/.test(type)
        ? { align: "right" as const }
        : /(?:dedication|titlepage)/.test(type) || (chapter === 1 && heading)
          ? { align: "center" as const }
          : {}),
    });
  };
  const walk = (el: Element) => {
    if (el.matches(selector) && !el.querySelector(selector)) {
      emit(el, el.textContent || "");
      return;
    }
    let buffer = "";
    const flush = () => {
      if (el.matches(selector)) emit(el, buffer);
      buffer = "";
    };
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 1) {
        const child = node as Element;
        if (child.matches(selector) || child.querySelector(selector)) {
          flush();
          walk(child);
        } else buffer += child.textContent || "";
      } else if (node.nodeType === 3) buffer += node.textContent || "";
    }
    flush();
  };
  walk(doc.querySelector("body") || doc.documentElement);
  return result;
}
function fromImported(
  imported: Imported,
  name: string,
  sourceHash: string,
): Book {
  const paragraphs = toParagraphs(imported.blocks);
  if (!paragraphs.length)
    throw new Error("No readable text was found in this file.");
  const book = createBook(
    imported.title || name,
    paragraphs,
    imported.format,
    sourceHash,
  );
  if (imported.author) book.meta.author = imported.author;
  return book;
}
export async function importDocument(file: File): Promise<Book> {
  const lower = file.name.toLowerCase();
  const ext = lower.endsWith(".fb2.zip") ? "fb2.zip" : lower.split(".").pop();
  if (ext === "pdf" && file.size > MAX_PDF_BYTES)
    throw new Error(
      "PDF files up to 200 MB can be imported. No content was imported.",
    );
  if (ext !== "pdf" && file.size > MAX_IMPORT_BYTES)
    throw new Error(
      "Files up to 32 MB can be imported. No content was imported.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sourceHash = await hashBytes(bytes);
  const name = file.name.replace(/(\.fb2)?\.[^.]+$/i, "");
  if (ext === "pdf") {
    // Loaded only when needed; the PDF engine is large.
    const { readPdf } = await import("./pdfImport");
    return fromImported(await readPdf(bytes), name, sourceHash);
  }
  if (ext === "docx") return fromImported(readDocx(bytes), name, sourceHash);
  if (ext === "odt") return fromImported(readOdt(bytes), name, sourceHash);
  if (ext === "rtf") return fromImported(readRtf(bytes), name, sourceHash);
  if (ext === "fb2") return fromImported(readFb2(bytes), name, sourceHash);
  if (ext === "fb2.zip")
    return fromImported(readFb2Zip(bytes), name, sourceHash);
  if (ext === "html" || ext === "htm" || ext === "xhtml") {
    const page = readHtml(bytes, (doc) => epubParagraphs(doc, 1));
    if (!page.paragraphs.length)
      throw new Error("No readable text was found in this page.");
    const book = createBook(
      page.title || name,
      page.paragraphs,
      "HTML",
      sourceHash,
    );
    if (page.author) book.meta.author = page.author;
    return book;
  }
  if (ext === "mobi" || ext === "azw" || ext === "azw3" || ext === "prc") {
    const kindle = readMobi(bytes);
    const doc = new DOMParser().parseFromString(kindle.html, "text/html");
    doc.querySelectorAll("script,style").forEach((el) => el.remove());
    const paragraphs = epubParagraphs(doc, 1);
    if (!paragraphs.length)
      throw new Error("No readable text was found in this Kindle book.");
    const book = createBook(
      kindle.title || name,
      paragraphs,
      ext === "azw3" ? "AZW3" : "MOBI",
      sourceHash,
    );
    if (kindle.author) book.meta.author = kindle.author;
    return book;
  }
  if (ext === "doc")
    throw new Error(
      "Older Word files (.doc) cannot be read. Save the file as .docx in Word or LibreOffice, then import it.",
    );
  if (ext === "kfx")
    throw new Error(
      "Kindle KFX books cannot be read. Use an EPUB, MOBI or AZW3 version of the book.",
    );
  if (ext === "epub") {
    let expanded = 0;
    const entries = unzipSync(bytes, {
      filter: (info) => {
        expanded += info.originalSize;
        if (expanded > MAX_EXPANDED)
          throw new Error("EPUB expands beyond the 64 MB safety limit.");
        return /\.(xml|opf|xhtml|html|htm)$/i.test(info.name);
      },
    });
    const container = xml(entries["META-INF/container.xml"], "container");
    const path = container
      .getElementsByTagName("rootfile")[0]
      ?.getAttribute("full-path");
    if (!path || path.startsWith("/") || path.includes(".."))
      throw new Error("EPUB package path is not supported.");
    const pkg = xml(entries[path], "package");
    const base = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/") + 1)
      : "";
    const manifest = new Map(
      Array.from(pkg.getElementsByTagName("item")).map((e) => [
        e.getAttribute("id"),
        e.getAttribute("href"),
      ]),
    );
    const pieces: Paragraph[] = [];
    let chapter = 0;
    for (const item of Array.from(pkg.getElementsByTagName("itemref"))) {
      const href = manifest.get(item.getAttribute("idref"));
      if (!href) throw new Error("EPUB spine references missing content.");
      const resolved = new URL(href, "https://book.invalid/" + base);
      if (resolved.origin !== "https://book.invalid")
        throw new Error("Remote EPUB content is not supported.");
      const content = entries[decodeURIComponent(resolved.pathname.slice(1))];
      const doc = xml(content, "chapter");
      doc.querySelectorAll("script,style,nav").forEach((el) => el.remove());
      chapter++;
      pieces.push(...epubParagraphs(doc, chapter, pieces.length));
    }
    if (!pieces.length)
      throw new Error(
        "No readable text found in this EPUB. Protected and image-only books are not supported.",
      );
    const book = createBook(
      pkg.getElementsByTagNameNS("*", "title")[0]?.textContent || name,
      pieces,
      "EPUB",
      sourceHash,
    );
    book.meta.author =
      pkg.getElementsByTagNameNS("*", "creator")[0]?.textContent ||
      "Unknown author";
    book.meta.genres = Array.from(
      pkg.getElementsByTagNameNS("*", "subject"),
      (el) => el.textContent?.trim() || "",
    )
      .filter(Boolean)
      .slice(0, 8)
      .map((subject) => subject.slice(0, 80));
    if (!book.meta.genres.length) delete book.meta.genres;
    // The declared language, when the text alone could not tell.
    book.meta.language ||= (
      pkg.getElementsByTagNameNS("*", "language")[0]?.textContent || ""
    )
      .trim()
      .toLowerCase()
      .split(/[-_]/)[0]
      .slice(0, 3);
    const items = Array.from(pkg.getElementsByTagName("item"));
    const coverId = Array.from(pkg.getElementsByTagName("meta"))
      .find((m) => m.getAttribute("name") === "cover")
      ?.getAttribute("content");
    const cover =
      items.find((item) =>
        item.getAttribute("properties")?.split(/\s+/).includes("cover-image"),
      ) || items.find((item) => coverId && item.getAttribute("id") === coverId);
    const coverHref = cover?.getAttribute("href");
    if (coverHref) {
      const resolved = new URL(coverHref, "https://book.invalid/" + base);
      if (resolved.origin === "https://book.invalid") {
        const coverPath = decodeURIComponent(resolved.pathname.slice(1));
        const art = unzipSync(bytes, {
          filter: (entry) =>
            entry.name === coverPath && entry.originalSize <= 10 * 1024 * 1024,
        })[coverPath];
        if (art) {
          try {
            book.meta.coverImage = await coverImage(
              new Blob([art.slice().buffer]),
            );
            book.meta.coverOrigin = "imported";
          } catch {
            /* Unreadable artwork leaves the normal placeholder available. */
          }
        }
      }
    }
    return book;
  }
  if (!["txt", "md", "markdown"].includes(ext || ""))
    throw new Error(
      "This file type cannot be imported. Supported: EPUB, PDF, MOBI, AZW3, FB2, DOCX, ODT, RTF, HTML, TXT and Markdown.",
    );
  const text = decodeText(bytes);
  const gutenberg = unwrapGutenberg(text);
  const paragraphs = paragraphsFromText(gutenberg?.body ?? text);
  if (!paragraphs.length) throw new Error("This file has no readable text.");
  const book = createBook(
    gutenberg?.title || name,
    paragraphs,
    ext === "txt" ? "TXT" : "Markdown",
    sourceHash,
  );
  if (gutenberg?.author) book.meta.author = gutenberg.author;
  return book;
}

// Project Gutenberg plain-text files wrap the book in a license header and
// footer. The book is read without them, and the header lines supply its
// title and author.
export function unwrapGutenberg(text: string) {
  const start = text.match(
    /^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*$/im,
  );
  if (!start || start.index === undefined) return null;
  const header = text.slice(0, start.index);
  const rest = text.slice(start.index + start[0].length);
  const end = rest.search(
    /^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK/im,
  );
  const field = (name: string) =>
    header
      .match(
        new RegExp(`^${name}:[ \\t]*(.+(?:\\r?\\n[ \\t]+\\S.*)*)`, "im"),
      )?.[1]
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || "";
  return {
    body: end >= 0 ? rest.slice(0, end) : rest,
    title: field("Title"),
    author: field("Author"),
  };
}
export function selectionFromRange(range: Range, element: HTMLElement) {
  if (
    !element.contains(range.startContainer) ||
    !element.contains(range.endContainer)
  )
    return null;
  const before = document.createRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return {
    start,
    end: start + range.toString().length,
    text: range.toString(),
  };
}
