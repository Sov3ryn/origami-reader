import { sentenceRanges } from "./contents";
import type { Annotation, Book } from "./types";

export const bookmarkDesigns = [
  ["plum-crane-ribbon", "Plum crane"],
  ["lavender-botanical-paper", "Lavender garden"],
  ["midnight-moon-leather", "Midnight moon"],
  ["forest-gold-pennant", "Forest gold"],
  ["origami-crane-blossoms", "Crane and blossoms"],
  ["sleeping-cat-stars", "Sleeping cat"],
  ["moonlit-wolf", "Moonlit wolf"],
  ["woodland-owl", "Woodland owl"],
  ["gothic-castle-window", "Gothic window"],
  ["sage-lily-leaf", "Lily leaf"],
  ["brass-feather", "Brass feather"],
  ["crane-charm-hook", "Crane charm"],
  ["silver-celestial-sword", "Celestial sword"],
  ["gold-ivy-moon-filigree", "Ivy and moon"],
] as const;

export function bookmarkArt(id?: string) {
  if (id === "sleeping-cat-stars") return "/bookmarks/sleeping-cat-stars-v2.png";
  return bookmarkDesigns.some(([key]) => key === id) ? `/bookmarks/${id}.png` : undefined;
}

// Visible alpha bounds, including a small edge allowance. Keep the original PNGs intact.
const artBounds: Record<string, [number, number, number, number, number, number]> = {
  "brass-feather": [1024, 1536, 342, 30, 303, 1461],
  "crane-charm-hook": [1024, 1536, 236, 32, 417, 1451],
  "forest-gold-pennant": [1024, 1536, 350, 12, 323, 1513],
  "gold-ivy-moon-filigree": [1024, 1536, 382, 22, 259, 1481],
  "gothic-castle-window": [944, 1666, 250, 16, 445, 1637],
  "lavender-botanical-paper": [1024, 1536, 136, 20, 577, 1495],
  "midnight-moon-leather": [1024, 1536, 342, 32, 339, 1441],
  "origami-crane-blossoms": [1024, 1536, 248, 18, 569, 1459],
  "plum-crane-ribbon": [1024, 1536, 384, 56, 257, 1407],
  "sage-lily-leaf": [1024, 1536, 322, 22, 397, 1449],
  "silver-celestial-sword": [1024, 1536, 344, 22, 337, 1459],
  "sleeping-cat-stars": [1024, 1536, 286, 26, 573, 1483],
  "moonlit-wolf": [1024, 1536, 240, 7, 638, 1505],
  "woodland-owl": [1024, 1536, 317, 12, 407, 1501],
};

export function bookmarkGeometry(id?: string) {
  const [width, height, x, y, w, h] = artBounds[id || ""] ?? [1, 10, 0, 0, 1, 10];
  return { ratio: w / h, left: -x / w * 100, top: -y / h * 100, width: width / w * 100, height: height / h * 100 };
}

export function bookmarkCanvas(id: string) {
  const [width, height, x, y, w, h] = artBounds[id] ?? [1, 10, 0, 0, 1, 10];
  return { width, height, viewBox: `${x} ${y} ${w} ${h}` };
}

// Old bookmarks with no character offset still resolve to the first sentence.
export function bookmarkSentence(text: string, offset = 0) {
  const at = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? offset : 0));
  const ranges = sentenceRanges(text);
  return ranges.find((r) => r.end > at) ?? ranges.at(-1) ?? { start: 0, end: text.length };
}

export function bookmarkLocation(book: Book, mark: Annotation) {
  if (mark.bookId !== book.meta.id) return null;
  const paragraph = book.paragraphs.findIndex((p) => p.id === mark.paragraphId);
  return paragraph < 0 ? null : { paragraph, ...bookmarkSentence(book.paragraphs[paragraph].text, mark.start) };
}
