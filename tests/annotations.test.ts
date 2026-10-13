import { describe, expect, it } from "vitest";
import { annotationViews, filterAnnotations } from "../src/annotations";
import { createBook, paragraphsFromText } from "../src/documents";
import type { Annotation } from "../src/types";
const book = createBook(
  "A book",
  paragraphsFromText(
    "# Chapter I\n\nAn early paragraph with hidden context.\n\nA later paragraph.",
  ),
);
const mark = (
  id: string,
  paragraph: string,
  text: string,
  color: string,
  quote = "marked words",
): Annotation => ({
  id,
  bookId: book.meta.id,
  paragraphId: paragraph,
  start: 0,
  end: 1,
  quote,
  kind: "note",
  color,
  text,
  group: "Research",
  created: Number(id),
});
const marks = [
  mark("1", "p-2", "Alpha", "blue"),
  mark("2", "p-1", "Zulu", "amber"),
  mark("3", "p-1", "Beta", "blue", ""),
];
const views = annotationViews(marks, [book.meta], {}, book);
describe("annotation navigation lists", () => {
  it("searches note wording, source context, book names and groups together", () => {
    expect(
      filterAnnotations(views, "hidden Research", "all", "all", "book-asc").map(
        (v) => v.annotation.id,
      ),
    ).toEqual(["2", "3"]);
    expect(
      filterAnnotations(views, "A book", "all", "blue", "book-asc").map(
        (v) => v.annotation.id,
      ),
    ).toEqual(["3", "1"]);
    expect(views[2].line).toBe("An early paragraph with hidden context.");
    expect(views[2].heading).toBe("Chapter I");
  });
  it("sorts by source position rather than creation time, and reverses book order", () => {
    expect(
      filterAnnotations(views, "", "all", "all", "book-asc").map(
        (v) => v.annotation.id,
      ),
    ).toEqual(["2", "3", "1"]);
    expect(
      filterAnnotations(views, "", "all", "all", "book-desc").map(
        (v) => v.annotation.id,
      ),
    ).toEqual(["1", "2", "3"]);
    expect(
      filterAnnotations(views, "", "all", "all", "text-asc").map(
        (v) => v.annotation.text,
      ),
    ).toEqual(["Alpha", "Beta", "Zulu"]);
    expect(
      filterAnnotations(views, "", "all", "all", "text-desc").map(
        (v) => v.annotation.text,
      ),
    ).toEqual(["Zulu", "Beta", "Alpha"]);
  });
});
