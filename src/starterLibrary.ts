import manifest from "../assets/starter-library/manifest.json";
import { importDocument } from "./documents";
import type { Book, BookMeta } from "./types";

export const starterMigration = "starter-library-v3-installed";
const editions = import.meta.glob("../assets/starter-library/books/*.epub", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
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
) {
  const books = [];
  for (const edition of manifest.books) {
    // Preserve imported copies, reading positions, custom art and deleted entries.
    const found = existing.find(
      (b) => b.id === edition.id || b.sourceHash === edition.sha256,
    );
    if (found?.coverImage || found?.deleted) continue;
    const book = found
      ? await readExisting(found.id)
      : await importDocument(
          new File(
            [
              await localAsset(
                editions[`../assets/starter-library/books/${edition.filename}`],
              ),
            ],
            edition.filename,
          ),
        );
    if (book.meta.sourceHash !== edition.sha256)
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
