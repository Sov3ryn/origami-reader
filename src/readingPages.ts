import type { Paragraph } from "./types";

export type ReadingPage = { start: number; end: number };

// Stable text-based pages keep annotation and speech offsets in the original
// paragraphs. An unusually long paragraph gets its own scrollable page.
export function readingPages(paragraphs: Paragraph[]): ReadingPage[] {
  const pages: ReadingPage[] = [];
  const budget = 1800;
  let start = 0;
  let used = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const weight = p.text.length + (p.kind === "heading" ? 220 : 110);
    const following =
      p.kind === "heading" && i + 1 < paragraphs.length
        ? Math.min(900, paragraphs[i + 1].text.length + 110)
        : 0;
    if (
      i > start &&
      paragraphs[i - 1].kind !== "heading" &&
      (used + weight + following > budget || i - start >= 12)
    ) {
      pages.push({ start, end: i });
      start = i;
      used = 0;
    }
    used += weight;
  }
  if (start < paragraphs.length) pages.push({ start, end: paragraphs.length });
  return pages;
}

export function pageForParagraph(
  pages: ReadingPage[],
  paragraph: number,
): number {
  if (!pages.length) return 0;
  let lo = 0,
    hi = pages.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (pages[mid].start <= paragraph) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Long books render only the pages around the reading position in continuous
// and snap modes. Spacers stand in for the rest, so the scroll bar still
// reflects the whole book. Short documents render every page as before.
export const VIRTUAL_MIN_PAGES = 150;
const BEFORE = 3;
const AFTER = 6;
export type PageWindow = { start: number; end: number };
export function readingWindow(
  total: number,
  current: number,
  paged: boolean,
): PageWindow {
  if (!total) return { start: 0, end: 0 };
  const page = Math.max(0, Math.min(total - 1, current));
  if (paged) return { start: page, end: page + 1 };
  if (total <= VIRTUAL_MIN_PAGES) return { start: 0, end: total };
  return {
    start: Math.max(0, page - BEFORE),
    end: Math.min(total, page + AFTER + 1),
  };
}
// Heights for the spacers above and below the rendered window. The pages are
// laid out in a flex column with `gap`, and each spacer takes one gap itself.
export function spacerHeights(
  total: number,
  window: PageWindow,
  height: (page: number) => number,
  gap: number,
) {
  let top = 0;
  for (let i = 0; i < window.start; i++) top += height(i) + gap;
  let bottom = 0;
  for (let i = window.end; i < total; i++) bottom += height(i) + gap;
  return {
    top: window.start ? top - gap : 0,
    bottom: window.end < total ? bottom - gap : 0,
  };
}
// The page found at `offset` pixels from the top of the pages column.
export function pageAtOffset(
  total: number,
  offset: number,
  height: (page: number) => number,
  gap: number,
) {
  let y = 0;
  for (let i = 0; i < total; i++) {
    y += height(i) + gap;
    if (y > offset) return i;
  }
  return Math.max(0, total - 1);
}
