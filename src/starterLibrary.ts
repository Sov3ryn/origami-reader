import manifest from "../assets/starter-library/manifest.json";
import translations from "../assets/starter-library/translations.json";
import { importDocument } from "./documents";
import type { Book, BookMeta } from "./types";

export const starterMigration = "starter-library-v3-installed";
const editions = import.meta.glob("../assets/starter-library/books/*.epub", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
// AI translations of the starter editions, chosen in setup (starterLanguage).
const translated = import.meta.glob("../assets/starter-library/translations/*/*.epub", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
type Translation = { file: string; sha256: string; title: string; translation: string };
const translationIndex = translations as Record<string, Record<string, Translation>>;
/** Interface languages that have at least one translated starter book. */
export const starterLanguages = [...new Set(Object.values(translationIndex).flatMap((t) => Object.keys(t)))].sort();
/** The edition of a starter book in a language, or undefined for the English original. */
export function starterTranslation(id: string, language: string | undefined) {
  if (!language) return undefined;
  const byLanguage = translationIndex[id] || {};
  return byLanguage[language] || byLanguage[language.split("-")[0]];
}
const covers = import.meta.glob("../assets/starter-library/covers/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
export const starterNotices = import.meta.glob(
  [
    "../assets/starter-library/RIGHTS.txt",
    "../assets/starter-library/CC*.txt",
    "../assets/starter-library/sources/*.txt",
  ],
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

export function isLegacyDemo(meta: BookMeta) {
  return (
    ["sample-0", "sample-1", "sample-2"].includes(meta.id) &&
    meta.sourceHash === meta.id &&
    meta.format === "Sample"
  );
}

async function localAsset(url: string | undefined) {
  if (!url) throw new Error("Missing bundled starter-library asset.");
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("Could not load bundled starter-library asset.");
  return response.blob();
}

export async function prepareStarterBooks(
  existing: BookMeta[],
  readExisting: (id: string) => Promise<Book>,
  language?: string,
) {
  const books = [];
  for (const edition of manifest.books) {
    // Preserve imported copies, reading positions, custom art and deleted entries.
    const version = starterTranslation(edition.id, language);
    const sha256 = version?.sha256 || edition.sha256;
    const found = existing.find(
      (b) => b.id === edition.id || b.sourceHash === sha256,
    );
    if (found?.coverImage || found?.deleted) continue;
    const book = found
      ? await readExisting(found.id)
      : await importDocument(
          new File(
            [
              await localAsset(
                version
                  ? translated[`../assets/starter-library/translations/${version.file}`]
                  : editions[`../assets/starter-library/books/${edition.filename}`],
              ),
            ],
            version ? version.file.split("/").pop()! : edition.filename,
          ),
        );
    if (book.meta.sourceHash !== sha256)
      throw new Error("Bundled starter edition failed its integrity check.");
    const artwork = await localAsset(
      covers[
        `../assets/starter-library/covers/${edition.filename.replace(".epub", ".webp")}`
      ],
    );
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not load starter cover."));
      reader.readAsDataURL(artwork);
    });
    Object.assign(book.meta, {
      id: found?.id || edition.id,
      collection: found?.collection || "Starter library",
      coverImage: image,
      coverOrigin: "generated",
      coverText: "show",
    });
    books.push(book);
  }
  return books;
}
