import { bookGenres } from "./bookGenres";
import { shelfOf } from "./libraryShelf";
import type { BookMeta } from "./types";

// Lettering for the title on a book's cover. Each style has its own bundled
// font (public/fonts/cover) and a default ink; the reader can pick both per
// book, or leave Automatic to follow the book's genres.
export const titleStyles = [
  ["classic", "Classic"],
  ["gilded", "Gilded foil"],
  ["storybook", "Old storybook"],
  ["gothic", "Gothic blackletter"],
  ["script", "Romantic script"],
  ["deco", "Art deco"],
  ["thriller", "Bold thriller"],
  ["scifi", "Science fiction"],
  ["leather", "Pressed leather"],
] as const;
export type TitleStyle = (typeof titleStyles)[number][0];

export const titleInks = [
  ["gold", "Gold"],
  ["silver", "Silver"],
  ["copper", "Copper"],
  ["ink", "Dark ink"],
  ["cream", "Cream"],
] as const;
export type TitleInk = (typeof titleInks)[number][0];

const styleInk: Record<TitleStyle, TitleInk> = {
  classic: "cream",
  gilded: "gold",
  storybook: "cream",
  gothic: "silver",
  script: "cream",
  deco: "gold",
  thriller: "cream",
  scifi: "silver",
  leather: "gold",
};

// First match wins, so the more particular genres come first.
const genreStyles: [RegExp, TitleStyle][] = [
  [/horror|gothic|vampire|ghost|occult/i, "gothic"],
  [/romance|love/i, "script"],
  [/science|sci-fi|scifi|space|cyber|dystop/i, "scifi"],
  [/thriller|crime|action|spy|noir/i, "thriller"],
  [/mystery|detective|suspense|jazz|deco/i, "deco"],
  [/fantasy|fairy|myth|legend|folk|children|speculative|magic/i, "storybook"],
  [/poetry|essay|literary|short stor|philosoph/i, "leather"],
  [/classic|histor|adventure|epic|war/i, "gilded"],
];

export function autoTitleStyle(book: BookMeta): TitleStyle {
  // Documents keep the plain lettering; stories get a style from their genres.
  if (shelfOf(book) === "documents") return "classic";
  for (const genre of bookGenres(book))
    for (const [pattern, style] of genreStyles)
      if (pattern.test(genre)) return style;
  return "gilded";
}

export function coverTitleStyle(book: BookMeta): TitleStyle {
  const chosen = titleStyles.find(([id]) => id === book.titleStyle);
  return chosen ? chosen[0] : autoTitleStyle(book);
}

// The light-paper cover would hide pale lettering, so it gets dark ink.
export function coverTitleInk(book: BookMeta, style: TitleStyle): TitleInk {
  const chosen = titleInks.find(([id]) => id === book.titleInk);
  if (chosen) return chosen[0];
  if (!book.coverImage && book.cover === "forest") return "ink";
  if (book.coverImage && styleInk[style] === "ink") return "cream";
  return styleInk[style];
}

// How each style sets type: its size against the cover's base title size,
// an average letter width in ems (wide capitals, narrow scripts) and how many
// lines a title may take.
const styleType: Record<TitleStyle, { scale: number; em: number; lines: number }> = {
  classic: { scale: 1, em: 0.52, lines: 4 },
  gilded: { scale: 0.92, em: 0.82, lines: 3 },
  storybook: { scale: 1.05, em: 0.66, lines: 3 },
  gothic: { scale: 1.3, em: 0.48, lines: 3 },
  script: { scale: 1.45, em: 0.42, lines: 3 },
  deco: { scale: 0.98, em: 0.76, lines: 3 },
  thriller: { scale: 1.7, em: 0.42, lines: 4 },
  scifi: { scale: 0.74, em: 0.95, lines: 4 },
  leather: { scale: 1.15, em: 0.42, lines: 3 },
};

// Long titles and long words shrink so the title keeps whole words within
// its lines. Measured against a 128 px cover; smaller ones scale alike. A
// gilded frame pattern takes 8 px more of the width.
export function titleFit(title: string, style: TitleStyle, framed = false): number {
  const { scale, em, lines } = styleType[style];
  const size = 19 * scale;
  const inner = framed ? 96 : 104;
  const width = style === "leather" ? inner - 0.9 * size : inner;
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length), 1);
  const byWord = (0.95 * width) / (longest * em * size);
  const byLines = (lines * width) / (1.2 * Math.max(title.length, 1) * em * size);
  return Math.max(0.45, Math.min(1, byWord, byLines));
}
