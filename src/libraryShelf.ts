import type { BookMeta } from "./types";

// Two libraries: stories (novels, tales, plays) and documents (papers, notes,
// course material). A book keeps the library it was put in; before that its
// format and genres decide, and Work mode sources count as documents.
export type Shelf = "stories" | "documents";

const BOOK_FORMATS = ["EPUB", "Sample", "MOBI", "AZW3", "FB2"];
const STORY_GENRES = /fiction|novel|stor(y|ies)|tale|fantasy|romance|mystery|thriller|horror|adventure|poetry|drama|play|fable|myth|suspense|gothic|historical|science fiction|crime/i;

export function guessShelf(meta: Pick<BookMeta, "format" | "genres" | "work">): Shelf {
  if (meta.work) return "documents";
  if ((meta.genres || []).some((g) => STORY_GENRES.test(g))) return "stories";
  return BOOK_FORMATS.includes(meta.format) ? "stories" : "documents";
}

export function shelfOf(meta: Pick<BookMeta, "format" | "genres" | "work" | "shelf">): Shelf {
  return meta.shelf || guessShelf(meta);
}
