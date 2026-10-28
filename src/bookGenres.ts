import manifest from "../assets/starter-library/manifest.json";
import { t } from "./i18n";
import type { BookMeta } from "./types";
const starterGenres: Record<string, string[]> = {
  "starter-dracula": ["Gothic horror", "Suspense"],
  "starter-journey-center-earth": ["Science fiction", "Adventure"],
  "starter-moonstone": ["Mystery", "Suspense"],
  "starter-pride-prejudice": ["Romance", "Classic"],
  "starter-grayson-stories": ["Short stories", "Speculative fiction"],
  "starter-count-monte-cristo": ["Historical", "Adventure"],
};
// The starter tags are stored in English and shown in the interface
// language. Tags someone types are shown exactly as written.
function starterGenreLabels(): Record<string, string> {
  return {
    "Gothic horror": t("Gothic horror"),
    "Suspense": t("Suspense"),
    "Science fiction": t("Science fiction"),
    "Adventure": t("Adventure"),
    "Mystery": t("Mystery"),
    "Romance": t("Romance"),
    "Classic": t("Classic"),
    "Short stories": t("Short stories"),
    "Speculative fiction": t("Speculative fiction"),
    "Historical": t("Historical"),
  };
}
export function genreLabel(genre: string): string {
  return starterGenreLabels()[genre] ?? genre;
}
export function bookGenres(book: BookMeta): string[] {
  if (book.genres) return book.genres;
  const edition = manifest.books.find(
    (b) => b.id === book.id || b.sha256 === book.sourceHash,
  );
  return edition ? starterGenres[edition.id] || [edition.category] : [];
}
// Twelve clearly different hues. Common genres have fixed colors; any other
// tag always gets the same color from its name.
const genreHues: [RegExp, number][] = [
  [/romance|love/i, 0],
  [/horror|gothic/i, 1],
  [/thriller|crime/i, 2],
  [/adventure|action/i, 3],
  [/classic|literary/i, 4],
  [/short stor|poetry|essay/i, 5],
  [/mystery|detective/i, 6],
  [/science|sci-fi/i, 7],
  [/histor/i, 8],
  [/suspense/i, 9],
  [/speculative|fantasy/i, 10],
  [/humou?r|comedy|children/i, 11],
];
export function genreColor(genre: string) {
  const known = genreHues.find(([pattern]) => pattern.test(genre));
  if (known) return "hue-" + known[1];
  let hash = 0;
  for (const c of genre.toLocaleLowerCase())
    hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return "hue-" + (hash % 12);
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
