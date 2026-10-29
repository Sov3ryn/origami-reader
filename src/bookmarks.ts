import { sentenceRanges } from "./contents";
import type { Annotation, Book } from "./types";

export const bookmarkDesigns = [
  ["plum-crane-ribbon", "Plum crane"],
  ["midnight-moth-ribbon", "Midnight moth"],
  ["silver-fox-ribbon", "Silver fox"],
  ["lavender-botanical-paper", "Lavender garden"],
  ["pressed-wildflowers-paper", "Pressed wildflowers"],
  ["autumn-herbarium-paper", "Autumn herbarium"],
  ["midnight-moon-leather", "Midnight moon"],
  ["gilded-stag-leather", "Gilded stag"],
  ["ember-dragon-leather", "Ember dragon"],
  ["forest-gold-pennant", "Forest gold"],
  ["twilight-wisteria-pennant", "Twilight wisteria"],
  ["sunlit-orchard-pennant", "Sunlit orchard"],
  ["origami-crane-blossoms", "Crane and blossoms"],
  ["origami-fox-maple", "Fox and maple"],
  ["origami-koi-lotus", "Koi and lotus"],
  ["sleeping-cat-stars", "Sleeping cat"],
  ["moonlit-wolf", "Moonlit wolf"],
  ["woodland-owl", "Woodland owl"],
  ["gothic-castle-window", "Gothic window"],
  ["moonlit-abbey-window", "Moonlit abbey"],
  ["ember-citadel-window", "Ember citadel"],
  ["sage-lily-leaf", "Lily leaf"],
  ["copper-ginkgo-leaf", "Copper ginkgo"],
  ["midnight-lotus-leaf", "Midnight lotus"],
  ["brass-feather", "Brass feather"],
  ["moonlit-raven-feather", "Moonlit raven"],
  ["peacock-plume-feather", "Peacock plume"],
  ["crane-charm-hook", "Crane charm"],
  ["moonwatch-owl-hook", "Moonwatch owl"],
  ["fox-key-hook", "Fox and key"],
  ["silver-celestial-sword", "Celestial sword"],
  ["gilded-thorn-dagger", "Gilded thorn"],
  ["moonveil-spear", "Moonveil spear"],
  ["gold-ivy-moon-filigree", "Ivy and moon"],
  ["silver-wisteria-moon-filigree", "Wisteria moon"],
  ["copper-oak-sun-filigree", "Oak and sun"],
  ["library-earth-globe", "Library Earth"],
  ["selenograph-moon-globe", "Lunar atlas"],
  ["observatory-mars-globe", "Martian observatory"],
  ["sands-of-time", "Sands of time"],
  ["measure-of-time", "Measure of time"],
  ["wandering-blue-box", "Wandering blue box"],
] as const;

export function bookmarkArt(id?: string) {
  if (id === "measure-of-time") return "/bookmarks/measure-of-time.svg";
  if (id === "sleeping-cat-stars") return "/bookmarks/sleeping-cat-stars-v2.png";
  return bookmarkDesigns.some(([key]) => key === id) ? `/bookmarks/${id}.png` : undefined;
}

// Visible alpha bounds, including a small edge allowance. Keep the original PNGs intact.
const artBounds: Record<string, [number, number, number, number, number, number]> = {
  "moonwatch-owl-hook": [1024, 1536, 294, 24, 420, 1490],
  "fox-key-hook": [1024, 1536, 306, 17, 445, 1502],
  "silver-wisteria-moon-filigree": [1024, 1536, 379, 8, 266, 1504],
  "copper-oak-sun-filigree": [1024, 1536, 365, 8, 294, 1520],
  "sands-of-time": [1024, 1536, 373, 4, 278, 1513],
  "measure-of-time": [1024, 1536, 299, 2, 426, 1520],
  "wandering-blue-box": [1024, 1536, 357, 8, 310, 1513],
  "library-earth-globe": [1024, 1536, 277, 5, 471, 1521],
  "selenograph-moon-globe": [1024, 1536, 279, 6, 466, 1513],
  "observatory-mars-globe": [1024, 1536, 277, 5, 470, 1519],
  "brass-feather": [1024, 1536, 342, 30, 303, 1461],
  "crane-charm-hook": [1024, 1536, 236, 32, 417, 1451],
  "forest-gold-pennant": [1024, 1536, 350, 12, 323, 1513],
  "twilight-wisteria-pennant": [1024, 1536, 95, 9, 594, 1487],
  "sunlit-orchard-pennant": [1024, 1536, 130, 15, 540, 1495],
  "gold-ivy-moon-filigree": [1024, 1536, 382, 22, 259, 1481],
  "gothic-castle-window": [944, 1666, 250, 16, 445, 1637],
  "moonlit-abbey-window": [1024, 1536, 302, 8, 420, 1511],
  "ember-citadel-window": [1043, 1508, 315, 7, 413, 1483],
  "lavender-botanical-paper": [1024, 1536, 136, 20, 577, 1495],
  "pressed-wildflowers-paper": [1024, 1536, 107, 15, 614, 1502],
  "autumn-herbarium-paper": [1024, 1536, 69, 18, 651, 1493],
  "midnight-moon-leather": [1024, 1536, 342, 32, 339, 1441],
  "gilded-stag-leather": [1024, 1536, 346, 21, 331, 1470],
  "ember-dragon-leather": [1024, 1536, 336, 12, 352, 1492],
  "origami-crane-blossoms": [1024, 1536, 248, 18, 569, 1459],
  "origami-fox-maple": [1024, 1536, 211, 6, 499, 1488],
  "origami-koi-lotus": [1024, 1536, 122, 3, 724, 1522],
  "plum-crane-ribbon": [1024, 1536, 384, 56, 257, 1407],
  "midnight-moth-ribbon": [1024, 1536, 384, 54, 260, 1415],
  "silver-fox-ribbon": [1024, 1536, 365, 26, 293, 1484],
  "sage-lily-leaf": [1024, 1536, 322, 22, 397, 1449],
  "copper-ginkgo-leaf": [1024, 1536, 108, 14, 809, 1500],
  "midnight-lotus-leaf": [1054, 1492, 260, 31, 529, 1426],
  "moonlit-raven-feather": [1024, 1536, 353, 19, 323, 1500],
  "peacock-plume-feather": [1024, 1536, 322, 5, 404, 1524],
  "silver-celestial-sword": [1024, 1536, 344, 22, 337, 1459],
  "gilded-thorn-dagger": [1024, 1536, 316, 21, 392, 1481],
  "moonveil-spear": [1024, 1536, 430, 12, 162, 1492],
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
