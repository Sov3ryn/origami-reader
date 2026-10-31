import { t } from "./i18n";
import type { Annotation, Book, BookMeta } from "./types";
export type AnnotationOrder =
  "book-asc" | "book-desc" | "text-asc" | "text-desc" | "newest";
export type AnnotationView = {
  annotation: Annotation;
  title: string;
  paragraph: number;
  chapter: number;
  heading: string;
  line: string;
  context: string;
};
export function annotationViews(
  annotations: Annotation[],
  books: BookMeta[],
  bodies: Record<string, Book>,
  current: Book | null,
): AnnotationView[] {
  const lookup = new Map<
    string,
    Map<
      string,
      { index: number; text: string; chapter: number; heading: string }
    >
  >();
  const metadata = new Map(books.map((b) => [b.id, b]));
  for (const id of new Set(annotations.map((a) => a.bookId))) {
    const book = current?.meta.id === id ? current : bodies[id];
    if (book) {
      let heading = "";
      lookup.set(
        id,
        new Map(
          book.paragraphs.map((p, index) => {
            if (p.kind === "heading") heading = p.text;
            return [p.id, { index, text: p.text, chapter: p.chapter, heading }];
          }),
        ),
      );
    }
  }
  return annotations.map((annotation) => {
    const paragraph = lookup
      .get(annotation.bookId)
      ?.get(annotation.paragraphId);
    const context = paragraph?.text || annotation.quote;
    return {
      annotation,
      title: metadata.get(annotation.bookId)?.title || t("Unavailable book"),
      paragraph: paragraph?.index ?? -1,
      chapter: paragraph?.chapter ?? 0,
      heading: paragraph?.heading || "",
      line: annotation.quote || context || t("Saved reading position"),
      context,
    };
  });
}
export function filterAnnotations(
  views: AnnotationView[],
  query: string,
  kind: string,
  color: string,
  order: AnnotationOrder,
  bookId?: string,
) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return views
    .filter(
      ({ annotation: a, title, line, context }) =>
        (!bookId || a.bookId === bookId) &&
        (kind === "all" || a.kind === kind) &&
        (color === "all" || a.color === color) &&
        words.every((word) =>
          `${title} ${line} ${context} ${a.text} ${a.group}`
            .toLocaleLowerCase()
            .includes(word),
        ),
    )
    .sort((a, b) => {
      if (order === "newest")
        return (
          b.annotation.created - a.annotation.created ||
          a.annotation.id.localeCompare(b.annotation.id)
        );
      if (order.startsWith("text"))
        return (
          (a.annotation.text || a.line).localeCompare(
            b.annotation.text || b.line,
          ) * (order === "text-desc" ? -1 : 1) ||
          a.annotation.created - b.annotation.created
        );
      const title =
        a.title.localeCompare(b.title) ||
        a.annotation.bookId.localeCompare(b.annotation.bookId);
      return (
        title ||
        (a.paragraph - b.paragraph || a.annotation.start - b.annotation.start) *
          (order === "book-desc" ? -1 : 1) ||
        a.annotation.created - b.annotation.created
      );
    });
}
