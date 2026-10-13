import type { BookMeta, LibraryFilters } from "./types";

export function bookFinished(book: BookMeta): boolean {
  return (
    book.finished ??
    (book.paragraphCount > 1 && book.position >= book.paragraphCount - 1)
  );
}
export function matchesLibraryFilters(
  book: BookMeta,
  filters: LibraryFilters,
): boolean {
  if (filters.author !== "all" && book.author !== filters.author) return false;
  const isBook = ["EPUB", "Sample"].includes(book.format);
  if (
    filters.type !== "all" &&
    (filters.type === "Books"
      ? !isBook
      : filters.type === "Documents"
        ? isBook
        : book.format !== filters.type)
  )
    return false;
  const finished = bookFinished(book);
  return (
    filters.status === "all" ||
    (filters.status === "finished" && finished) ||
    (filters.status === "unfinished" && !finished) ||
    (filters.status === "unread" && !book.opened && !finished) ||
    (filters.status === "reading" && book.opened > 0 && !finished)
  );
}
export function sortLibrary(books: BookMeta[], order: string): BookMeta[] {
  return [...books].sort((a, b) => {
    const title = a.title.localeCompare(b.title);
    switch (order) {
      case "title":
        return title;
      case "title-desc":
        return -title;
      case "author":
        return a.author.localeCompare(b.author) || title;
      case "added":
        return b.added - a.added || title;
      case "oldest-added":
        return a.added - b.added || title;
      case "oldest-read":
        return a.opened - b.opened || a.added - b.added || title;
      default:
        return b.opened - a.opened || b.added - a.added;
    }
  });
}
