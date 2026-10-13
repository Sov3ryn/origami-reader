import manifest from "../assets/starter-library/manifest.json";
import type { BookMeta } from "./types";
const starterGenres: Record<string, string[]> = {
  "starter-dracula": ["Gothic horror", "Suspense"],
  "starter-journey-center-earth": ["Science fiction", "Adventure"],
  "starter-moonstone": ["Mystery", "Suspense"],
  "starter-pride-prejudice": ["Romance", "Classic"],
  "starter-grayson-stories": ["Short stories", "Speculative fiction"],
  "starter-count-monte-cristo": ["Historical", "Adventure"],
};
export function bookGenres(book: BookMeta): string[] {
  if (book.genres) return book.genres;
  const edition = manifest.books.find(
    (b) => b.id === book.id || b.sha256 === book.sourceHash,
  );
  return edition ? starterGenres[edition.id] || [edition.category] : [];
}
export function genreColor(genre: string) {
  if (/romance/i.test(genre)) return "rose";
  if (/horror|suspense/i.test(genre)) return "violet";
  if (/science|speculative/i.test(genre)) return "blue";
  if (/mystery/i.test(genre)) return "teal";
  if (/adventure|historical/i.test(genre)) return "amber";
  return "neutral";
}
export function normalizeGenres(text: string): string[] {
  const genres = text
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (genres.length > 12) throw new Error("Use up to 12 genre tags.");
  if (genres.some((s) => s.length > 48 || /[\u0000-\u001f]/.test(s)))
    throw new Error(
      "Each genre tag must be at most 48 characters without control characters.",
    );
  const unique = new Map<string, string>();
  for (const genre of genres)
    if (!unique.has(genre.toLocaleLowerCase()))
      unique.set(genre.toLocaleLowerCase(), genre);
  return [...unique.values()];
}
