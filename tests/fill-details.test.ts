import { describe, expect, it } from "vitest";
import {
  fillBookDetails,
  looksUntitled,
  normalizeName,
  titleFromText,
  titleKey,
  type Pack,
} from "../src/authorPack";
import { unwrapGutenberg } from "../src/documents";

const pack: Pack = {
  authors: new Map([
    [1, { id: 1, g: "f", ge: [400, 401], s: 120 }],
    [2, { id: 2, g: "m", s: 80 }],
  ]),
  index: {
    names: {
      [normalizeName("Mary Wollstonecraft Shelley")]: [1],
      [normalizeName("Mary Shelley")]: [1],
      [normalizeName("Franz Kafka")]: [2],
    },
    titles: {
      [titleKey("Frankenstein")]: [1],
      [titleKey("The Metamorphosis")]: [2],
    },
  },
  text: [
    {
      names: { 1: "Mary Shelley", 2: "Franz Kafka" },
      descriptions: {},
      labels: { 400: "gothic novel", 401: "science fiction" },
    },
  ],
};
const book = (title: string, author: string, texts: string[]) => ({
  meta: { title, author } as {
    title: string;
    author: string;
    genres?: string[];
  },
  paragraphs: texts.map((text) => ({ text })),
});

describe("Project Gutenberg plain text", () => {
  const file = [
    "The Project Gutenberg eBook of Frankenstein",
    "",
    "This eBook is for the use of anyone anywhere.",
    "",
    "Title: Frankenstein; or, the modern prometheus",
    "",
    "Author: Mary Wollstonecraft Shelley",
    "",
    "Language: English",
    "",
    "*** START OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***",
    "",
    "Letter 1",
    "",
    "You will rejoice to hear that no disaster has accompanied me.",
    "",
    "*** END OF THE PROJECT GUTENBERG EBOOK FRANKENSTEIN ***",
    "",
    "Section 1. General Terms of Use",
  ].join("\r\n");

  it("keeps only the book and reads the header details", () => {
    const result = unwrapGutenberg(file)!;
    expect(result.title).toBe("Frankenstein; or, the modern prometheus");
    expect(result.author).toBe("Mary Wollstonecraft Shelley");
    expect(result.body).toContain("You will rejoice");
    expect(result.body).not.toContain("General Terms");
    expect(result.body).not.toContain("anyone anywhere");
    expect(unwrapGutenberg("Just a plain story.")).toBeNull();
  });
});

describe("filling missing details", () => {
  it("recognizes file names and placeholders as missing titles", () => {
    expect(looksUntitled("pg84")).toBe(true);
    expect(looksUntitled("my_book")).toBe(true);
    expect(looksUntitled("Untitled text")).toBe(true);
    expect(looksUntitled("Dracula")).toBe(false);
    expect(looksUntitled("The Moonstone")).toBe(false);
  });

  it("takes the title from the lines above a by-line", () => {
    expect(
      titleFromText(pack, [
        "FRANKENSTEIN;",
        "or, the Modern Prometheus",
        "by Mary Wollstonecraft (Godwin) Shelley",
        "CONTENTS",
      ]),
    ).toBe("Frankenstein; or, the Modern Prometheus");
    expect(titleFromText(pack, ["The Metamorphosis", "One morning..."])).toBe(
      "The Metamorphosis",
    );
    expect(
      titleFromText(pack, ["A long opening line of an unknown story."]),
    ).toBe("");
  });

  it("fills author, title and genres for a bare text file", () => {
    const b = book("pg84", "Unknown author", [
      "Frankenstein;",
      "or, the Modern Prometheus",
      "by Mary Wollstonecraft (Godwin) Shelley",
      "Letter 1",
    ]);
    fillBookDetails(pack, b);
    expect(b.meta.title).toBe("Frankenstein; or, the Modern Prometheus");
    expect(b.meta.author).toBe("Mary Wollstonecraft Shelley");
    expect(b.meta.genres).toEqual(["Gothic novel", "Science fiction"]);
  });

  it("finds the author from a known title alone and keeps existing details", () => {
    const pasted = book("Untitled text", "Unknown author", [
      "The Metamorphosis",
      "One morning, a man woke from troubled dreams.",
    ]);
    fillBookDetails(pack, pasted);
    expect(pasted.meta.title).toBe("The Metamorphosis");
    expect(pasted.meta.author).toBe("Franz Kafka");

    const tagged = book("Frankenstein", "Mary Shelley", ["Letter 1"]);
    tagged.meta.genres = ["Horror"];
    fillBookDetails(pack, tagged);
    expect(tagged.meta).toEqual({
      title: "Frankenstein",
      author: "Mary Shelley",
      genres: ["Horror"],
    });
  });
});

describe("genres of the work itself", () => {
  const withWorks: Pack = {
    ...pack,
    index: {
      ...pack.index,
      titleGenres: {
        [titleKey("Frankenstein")]: [1, 500, 501, 502],
        [titleKey("The Metamorphosis")]: [2, 503],
      },
    },
    text: [
      {
        ...pack.text[0],
        labels: {
          ...pack.text[0].labels,
          500: "Gothic fiction",
          501: "novel",
          502: "science fiction",
          503: "novella",
        },
      },
    ],
  };

  it("prefers the work's own genres, skipping ones too general to help", () => {
    const b = book("Frankenstein; or, the Modern Prometheus", "Mary Shelley", [
      "Letter 1",
    ]);
    fillBookDetails(withWorks, b);
    expect(b.meta.genres).toEqual(["Gothic fiction", "Science fiction"]);
  });

  it("falls back to the author's genres for titles it does not know", () => {
    const b = book("The Last Man", "Mary Shelley", ["Chapter 1"]);
    fillBookDetails(withWorks, b);
    expect(b.meta.genres).toEqual(["Gothic novel", "Science fiction"]);
  });

  it("ignores a known title by a different author", () => {
    const b = book("The Metamorphosis", "Mary Shelley", ["Chapter 1"]);
    fillBookDetails(withWorks, b);
    expect(b.meta.genres).toEqual(["Gothic novel", "Science fiction"]);
  });
});
