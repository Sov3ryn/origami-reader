import { unzipSync, strFromU8 } from "fflate";
import type { Book, BookMeta, Paragraph } from "./types";
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
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
export function cleanSpokenText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}
export function splitSpeech(text: string, limit = 400): string[] {
  if (limit < 16) throw new Error("Speech unit limit is too small.");
  const sentences = Array.from(
    new Intl.Segmenter("en", { granularity: "sentence" }).segment(
      cleanSpokenText(text),
    ),
    (s) => s.segment,
  );
  const result: string[] = [];
  for (const s of sentences) {
    const words = s
      .trim()
      .split(/\s+/)
      .flatMap((word) =>
        word.length > limit
          ? Array.from({ length: Math.ceil(word.length / limit) }, (_, i) =>
              word.slice(i * limit, (i + 1) * limit),
            )
          : [word],
      );
    let chunk = "";
    for (const word of words) {
      if (chunk && chunk.length + word.length + 1 > limit) {
        result.push(chunk);
        chunk = "";
      }
      chunk += (chunk ? " " : "") + word;
    }
    if (chunk) result.push(chunk);
  }
  return result.filter(Boolean);
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
export async function importDocument(file: File): Promise<Book> {
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error(
      "This early build supports files up to 32 MB. No content was imported.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sourceHash = await hashBytes(bytes);
  const ext = file.name.split(".").pop()?.toLowerCase();
  const name = file.name.replace(/\.[^.]+$/, "");
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
      const blocks = Array.from(
        doc.querySelectorAll("h1,h2,h3,h4,p,li,blockquote"),
      ).filter((el) => !el.parentElement?.closest("li,blockquote"));
      chapter++;
      for (const el of blocks) {
        const text = el.textContent?.replace(/\s+/g, " ").trim();
        if (text)
          pieces.push({
            id: "p-" + pieces.length,
            text,
            kind: /^h[1-4]$/i.test(el.localName) ? "heading" : "paragraph",
            chapter,
          });
      }
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
    return book;
  }
  if (!["txt", "md", "markdown"].includes(ext || ""))
    throw new Error(
      "Import TXT, Markdown or EPUB in this build. PDF and DOCX are planned.",
    );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const paragraphs = paragraphsFromText(text);
  if (!paragraphs.length) throw new Error("This file has no readable text.");
  return createBook(
    name,
    paragraphs,
    ext === "txt" ? "TXT" : "Markdown",
    sourceHash,
  );
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
