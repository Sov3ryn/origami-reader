// Book mode pagination. Each section (a chapter, or part of a very long one)
// flows into CSS columns exactly as wide and tall as a page's text block, so
// every column is one printed page. Sections are measured once per layout,
// which gives exact page numbers for the whole book.
import type { Paragraph } from "./types";

// The narrowest reading area that fits two book pages side by side.
export const BOOK_MIN_WIDTH = 900;
// And the shortest: below it a page would be under 360 px tall (BookView), so
// the book could never be set; the reader falls back to pages.
export const BOOK_MIN_HEIGHT = 480;

export type BookSection = {
  start: number;
  end: number;
  // First section of its chapter: starts lower on the page with a drop cap.
  opener: boolean;
  // Running head for the pages of this section.
  title: string;
};
export type SectionMeasure = {
  pages: number;
  // Page within the section where each paragraph begins.
  starts: number[];
  // How far down that page it begins, in pixels.
  tops: number[];
};

// Very long chapters are split so no single flow grows too large to copy
// onto the pages being shown.
const SECTION_CHARS = 30_000;

export function bookSections(paragraphs: Paragraph[]): BookSection[] {
  const sections: BookSection[] = [];
  let start = 0;
  let chars = 0;
  let title = "";
  const close = (end: number) => {
    const first = paragraphs[start];
    const opener =
      start === 0 || paragraphs[start - 1].chapter !== first.chapter;
    if (opener) title = first.kind === "heading" ? first.text : title;
    sections.push({ start, end, opener, title });
  };
  for (let i = 1; i <= paragraphs.length; i++) {
    chars += paragraphs[i - 1].text.length;
    if (i === paragraphs.length) break;
    const p = paragraphs[i];
    const chapter = p.chapter !== paragraphs[i - 1].chapter;
    const long =
      chars >= SECTION_CHARS &&
      p.kind !== "heading" &&
      paragraphs[i - 1].kind !== "heading";
    if (chapter || long) {
      close(i);
      start = i;
      chars = 0;
    }
  }
  if (paragraphs.length) close(paragraphs.length);
  return sections;
}

// The page sequence of the printed book: the endpaper inside the front
// cover, the title page and the colophon, then the text, then a closing
// page. Spreads pair them: spread k shows pages 2k (left) and 2k + 1 (right).
export const FRONT_PAGES = 3;
export type PageKind =
  | { kind: "endpaper" }
  | { kind: "title" }
  | { kind: "colophon" }
  | { kind: "content"; index: number; section: number; local: number }
  | { kind: "end" }
  | { kind: "blank" };

export class BookPagination {
  readonly sections: BookSection[];
  readonly measures: SectionMeasure[];
  // First content page of each section.
  private readonly offsets: number[];
  readonly contentPages: number;
  constructor(sections: BookSection[], measures: SectionMeasure[]) {
    this.sections = sections;
    this.measures = measures;
    this.offsets = [];
    let total = 0;
    for (const m of measures) {
      this.offsets.push(total);
      total += Math.max(1, m.pages);
    }
    this.contentPages = total;
  }
  get totalPages() {
    return FRONT_PAGES + this.contentPages + 1;
  }
  get spreads() {
    return Math.ceil(this.totalPages / 2);
  }
  page(index: number): PageKind {
    if (index === 0) return { kind: "endpaper" };
    if (index === 1) return { kind: "title" };
    if (index === 2) return { kind: "colophon" };
    const content = index - FRONT_PAGES;
    if (content < this.contentPages) {
      const section = this.sectionOfPage(content);
      return {
        kind: "content",
        index: content,
        section,
        local: content - this.offsets[section],
      };
    }
    if (content === this.contentPages) return { kind: "end" };
    return { kind: "blank" };
  }
  private sectionOfPage(content: number) {
    let lo = 0,
      hi = this.offsets.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.offsets[mid] <= content) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  sectionOfParagraph(paragraph: number) {
    let lo = 0,
      hi = this.sections.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.sections[mid].start <= paragraph) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  // The content page where a paragraph begins.
  contentPageOf(paragraph: number) {
    const s = this.sectionOfParagraph(paragraph);
    const local =
      this.measures[s]?.starts[paragraph - this.sections[s].start] ?? 0;
    return this.offsets[s] + local;
  }
  spreadOfParagraph(paragraph: number) {
    return Math.floor((this.contentPageOf(paragraph) + FRONT_PAGES) / 2);
  }
  // The paragraph at the top of a content page: one that begins right at
  // the top, or else the one continuing from the page before.
  paragraphAtPage(content: number) {
    const slice = this.slice(content);
    return slice.from;
  }
  // What a content page shows: the paragraphs from the one at its top to the
  // last one that begins on it. A page renders just these, offset so lines
  // and breaks match the measured flow exactly.
  slice(content: number) {
    const s = this.sectionOfPage(content);
    const local = content - this.offsets[s];
    const section = this.sections[s];
    const m = this.measures[s];
    const starts = m?.starts || [];
    const tops = m?.tops || [];
    let last = 0;
    let firstHere = -1;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] > local) break;
      last = i;
      if (starts[i] === local && firstHere < 0) firstHere = i;
    }
    let top = last;
    if (firstHere >= 0 && tops[firstHere] <= 1) top = firstHere;
    else if (firstHere > 0) top = firstHere - 1;
    else if (firstHere < 0) top = last;
    return {
      section: s,
      local,
      from: section.start + top,
      to: section.start + last,
      // Columns between the top paragraph's start and this page.
      shift: local - (starts[top] ?? 0),
      offset: tops[top] ?? 0,
    };
  }
  // The first paragraph that begins on a content page, if any.
  private firstStartingOn(content: number): number | null {
    const s = this.sectionOfPage(content);
    const local = content - this.offsets[s];
    const starts = this.measures[s]?.starts || [];
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] === local) return this.sections[s].start + i;
      if (starts[i] > local) break;
    }
    return null;
  }
  // The reading position a spread stands for: the first paragraph that
  // begins on it, so reopening lands on the same spread. Only when one long
  // paragraph fills the whole spread is it the one continuing onto it.
  paragraphAtSpread(spread: number) {
    let fallback: number | null = null;
    for (const index of [spread * 2, spread * 2 + 1]) {
      const page = this.page(index);
      if (page.kind !== "content") continue;
      const first = this.firstStartingOn(page.index);
      if (first !== null) return first;
      fallback ??= this.paragraphAtPage(page.index);
    }
    if (fallback !== null) return fallback;
    const before = spread * 2 - FRONT_PAGES;
    if (before >= this.contentPages && this.contentPages)
      return this.paragraphAtPage(this.contentPages - 1);
    return this.sections[0]?.start ?? 0;
  }
}

// Builds a section's text the way the page shows it, without annotations
// (underlines and highlights never change where lines break), and measures
// where every paragraph begins.
export function measureSection(
  host: HTMLElement,
  paragraphs: Paragraph[],
  section: BookSection,
  stride: number,
  anchor?: { paragraph: number; offset: number; onPage: (page: number) => void },
): SectionMeasure {
  const flow = document.createElement("div");
  flow.className = "book-flow" + (section.opener ? " opener" : "");
  for (let i = section.start; i < section.end; i++) {
    const p = paragraphs[i];
    const passage = document.createElement("div");
    passage.className = "passage";
    const el = document.createElement(p.kind === "heading" ? "h2" : "p");
    el.textContent = p.text;
    if (p.kind === "heading")
      el.dataset.headingLevel = String(p.headingLevel || 2);
    if (p.quote) el.dataset.quote = "true";
    if (p.align) el.dataset.align = p.align;
    if (firstAfterHeading(paragraphs, i, section.start))
      el.dataset.first = "true";
    if (dropCap(paragraphs, i, section)) el.dataset.dropcap = "true";
    if (i === section.start) passage.dataset.sectionStart = "true";
    passage.appendChild(el);
    flow.appendChild(passage);
  }
  host.replaceChildren(flow);
  const box = flow.getBoundingClientRect();
  const origin = box.left;
  const starts: number[] = [];
  const tops: number[] = [];
  let pages = 1;
  for (const passage of Array.from(flow.children)) {
    const rects = passage.getClientRects();
    const first = rects[0];
    const last = rects[rects.length - 1];
    starts.push(
      first
        ? Math.max(0, Math.floor((first.left - origin + 1) / stride))
        : pages - 1,
    );
    tops.push(first ? Math.max(0, first.top - box.top) : 0);
    if (last)
      pages = Math.max(
        pages,
        Math.floor((last.left - origin + 1) / stride) + 1,
      );
  }
  if (anchor) {
    const text = flow.children[anchor.paragraph - section.start]?.firstChild?.firstChild;
    if (text?.nodeType === Node.TEXT_NODE && text.textContent?.length) {
      const range = document.createRange();
      const at = Math.max(0, Math.min(text.textContent.length - 1, anchor.offset));
      range.setStart(text, at);
      range.setEnd(text, at + 1);
      const rect = range.getClientRects()[0];
      if (rect) anchor.onPage(Math.max(0, Math.floor((rect.left - origin + 1) / stride)));
    }
  }
  host.replaceChildren();
  return { pages, starts, tops };
}

// The first real paragraph of a chapter opening gets the drop cap; short
// lines before it (subtitles, datelines, epigraph credits) do not.
const DROP_CAP_MIN = 80;
export function dropCap(
  paragraphs: Paragraph[],
  index: number,
  section: BookSection,
) {
  const p = paragraphs[index];
  if (!section.opener || p.kind === "heading" || p.text.length < DROP_CAP_MIN)
    return false;
  for (let i = section.start; i < index; i++) {
    const q = paragraphs[i];
    if (q.kind !== "heading" && q.text.length >= DROP_CAP_MIN) return false;
  }
  return true;
}

// The paragraph that opens a passage: the first of a section, or the first
// after a heading. Printed books do not indent it.
export function firstAfterHeading(
  paragraphs: Paragraph[],
  index: number,
  sectionStart: number,
) {
  const p = paragraphs[index];
  if (p.kind === "heading") return false;
  return index === sectionStart || paragraphs[index - 1]?.kind === "heading";
}
