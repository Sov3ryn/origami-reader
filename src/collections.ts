import { t } from "./i18n";
import type { BookMeta } from "./types";

export const builtInCollections = [
  "All books",
  "Favorites",
  "Unsorted",
  "Trash",
];
// The collection the app gives its starter books. Stored in English.
export const starterCollection = "Starter library";
// The name shown for a collection: built-in and app-made names are
// translated, names the reader chose are shown as typed.
export function collectionLabel(name: string): string {
  return builtInCollections.includes(name) || name === starterCollection
    ? t(name)
    : name;
}
export function collectionNames(saved: string[], books: BookMeta[]): string[] {
  return [...new Set([...saved, ...books.map((b) => b.collection)])].filter(
    (name) => name && !builtInCollections.includes(name),
  );
}
export function checkedCollectionName(raw: string, existing: string[]): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Enter a collection name.");
  if (name.length > 64)
    throw new Error("Use a name of 64 characters or fewer.");
  if (
    [...builtInCollections, ...existing].some(
      (n) => n.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  ) {
    throw new Error("That collection name is already in use.");
  }
  return name;
}
