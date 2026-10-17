// PDF text import. A PDF stores where words sit on each printed page, not
// paragraphs, so the text is rebuilt: lines from positions, paragraphs from
// spacing and indents, repeated headers, footers and page numbers removed,
// hyphenated words rejoined, and headings recognized by their larger type.
// Scanned PDFs (page images without a text layer) cannot be read.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Block, Imported } from "./importers";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Line = {
  text: string;
  x: number;
  y: number;
  size: number;
  right: number;
  page: number;
};

// Chinese and Japanese are written without spaces, so their lines join
// directly. Korean separates words with spaces, so its lines join with one.
const unspaced = /[\u3040-\u30ff\u3400-\u9fff]/;
const endsSentence = /[.!?…:;"”’)\]»。！？」』]$/;

// Lines of one page in reading order.
function pageLines(items: unknown[], page: number): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  for (const raw of items) {
    const item = raw as {
      str?: string;
      transform?: number[];
      width?: number;
      hasEOL?: boolean;
    };
    if (typeof item.str !== "string" || !item.transform) continue;
    const [a, b, , d, x, y] = item.transform;
    const size = Math.hypot(a, b) || Math.abs(d) || 10;
    const sameLine =
      current && Math.abs(current.y - y) < size * 0.5 && x >= current.x - size;
    if (!current || !sameLine) {
      if (current?.text.trim()) lines.push(current);
      current = { text: "", x, y, size, right: x, page };
    }
    const gap = x - current.right;
    // A visible gap between two runs on the same line is a space.
    if (
      current.text &&
      gap > size * 0.15 &&
      !current.text.endsWith(" ") &&
      !item.str.startsWith(" ")
    )
      current.text += " ";
    current.text += item.str;
    current.right = Math.max(current.right, x + (item.width || 0));
    current.size = Math.max(current.size, size);
    if (item.hasEOL) {
      if (current.text.trim()) lines.push(current);
      current = null;
    }
  }
  if (current?.text.trim()) lines.push(current);
  return lines;
}

const normalize = (text: string) =>
  text.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
const pageNumber =
  /^(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:\/|of)\s*\d{1,4})?$/i;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

export function pdfBlocks(pages: Line[][]): Block[] {
  // Running headers, footers and page numbers sit apart from the body text
  // (a wider gap than between lines), are never in larger type, and the
  // headers and footers repeat on many pages.
  const bodySize = median(pages.flat().map((l) => l.size)) || 10;
  const isEdge = (lines: Line[], i: number) => {
    const line = lines[i];
    if (line.size > bodySize * 1.15) return false;
    const apart = (other: Line | undefined) =>
      !other || Math.abs(other.y - line.y) > line.size * 2.2;
    if (i === 0 || (i === 1 && isEdge(lines, 0))) return apart(lines[i + 1]);
    if (
      i === lines.length - 1 ||
      (i === lines.length - 2 && isEdge(lines, lines.length - 1))
    )
      return apart(lines[i - 1]);
    return false;
  };
  const edges = new Map<string, number>();
  for (const lines of pages)
    lines.forEach((line, i) => {
      if (!isEdge(lines, i)) return;
      const key = normalize(line.text);
      edges.set(key, (edges.get(key) || 0) + 1);
    });
  const repeated = new Set(
    [...edges]
      .filter(
        ([, n]) => pages.length >= 3 && n >= Math.max(3, pages.length * 0.3),
      )
      .map(([key]) => key),
  );
  const kept = pages.map((lines) =>
    lines.filter(
      (line, i) =>
        !isEdge(lines, i) ||
        (!repeated.has(normalize(line.text)) &&
          !pageNumber.test(line.text.trim())),
    ),
  );
  const all = kept.flat();
  const body = median(all.map((l) => l.size)) || 10;
  const left = median(all.map((l) => l.x));
  const right = median(all.map((l) => l.right));
  const blocks: Block[] = [];
  let paragraph = "";
  let previous: Line | null = null;
  const flush = () => {
    if (paragraph.trim()) blocks.push({ text: paragraph });
    paragraph = "";
  };
  for (const line of all) {
    const text = line.text.replace(/\s+/g, " ").trim();
    const big = line.size >= body * 1.25 && text.split(/\s+/).length <= 15;
    if (big) {
      flush();
      const last = blocks.at(-1);
      // A heading split over two lines stays one heading.
      if (
        last?.heading !== undefined &&
        previous &&
        previous.size === line.size &&
        previous.page === line.page
      )
        last.text += " " + text;
      else blocks.push({ text, heading: line.size >= body * 1.7 ? 1 : 2 });
      previous = line;
      continue;
    }
    if (previous && paragraph) {
      const samePage = previous.page === line.page;
      const gap = samePage ? previous.y - line.y : 0;
      const indented = line.x > left + body * 1.2;
      const shortLine = previous.right < right - body * 3;
      const newParagraph =
        (samePage && gap > previous.size * 1.9) ||
        indented ||
        (shortLine && endsSentence.test(paragraph.trim()));
      if (newParagraph) flush();
    }
    if (!paragraph) paragraph = text;
    else if (/[A-Za-zÀ-ÿ]-$/.test(paragraph) && /^[a-zà-ÿ]/.test(text))
      paragraph = paragraph.slice(0, -1) + text;
    else if (unspaced.test(paragraph.slice(-1)) && unspaced.test(text[0]))
      paragraph += text;
    else paragraph += " " + text;
    previous = line;
  }
  flush();
  return blocks;
}

export async function readPdf(bytes: Uint8Array): Promise<Imported> {
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    disableFontFace: true,
  });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (e) {
    void task.destroy();
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException")
      throw new Error(
        "This PDF is password-protected. Remove the password, then import it again.",
      );
    throw new Error("This PDF could not be opened. It may be damaged.");
  }
  try {
    const pages: Line[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(pageLines(content.items, n));
      page.cleanup();
    }
    const blocks = pdfBlocks(pages);
    if (!blocks.some((b) => b.text.trim().length > 20))
      throw new Error(
        "This PDF has no text layer. It is probably scanned page images, and text recognition is not available yet.",
      );
    const info = ((await pdf.getMetadata().catch(() => null))?.info || {}) as {
      Title?: string;
      Author?: string;
    };
    return {
      blocks,
      title: info.Title?.trim() || undefined,
      author: info.Author?.trim() || undefined,
      format: "PDF",
    };
  } finally {
    void task.destroy();
  }
}
