import { describe, expect, it } from "vitest";
import {
  authorFromText,
  findAuthor,
  lifeYears,
  normalizeName,
  packNote,
  titleKey,
  type Pack,
  type PackAuthor,
} from "../src/authorPack";

const authors: PackAuthor[] = [
  {
    id: 1,
    g: "f",
    b: 1797,
    d: 1851,
    bp: 100,
    dp: 101,
    o: [200],
    x: [201],
    w: [[300, 1818]],
    r: [["p", 2]],
    pn: ["M. W. S."],
    s: 120,
  },
  { id: 2, g: "f", b: 1759, d: 1797, s: 90 },
  { id: 3, g: "m", b: 1900, s: 3, nn: 4, aw: [[37922, 1950]] },
  { id: 4, b: -428, d: -348, s: 200 },
];
const pack: Pack = {
  authors: new Map(authors.map((a) => [a.id, a])),
  index: {
    names: {
      [normalizeName("Mary Shelley")]: [1, 3],
      [normalizeName("Mary Wollstonecraft")]: [2],
    },
    titles: { [titleKey("Frankenstein")]: [1] },
  },
  text: [
    {
      names: { 1: "Mary Shelley", 2: "Mary Wollstonecraft", 3: "Mary Shelley" },
      descriptions: { 1: "English novelist" },
      labels: {
        100: "London",
        101: "Belgravia",
        200: "novelist",
        201: "travel guide",
        300: "Frankenstein",
      },
    },
  ],
};

describe("author pack", () => {
  it("matches names regardless of order, accents and life dates", () => {
    expect(normalizeName("Shelley, Mary, 1797-1851")).toBe(
      normalizeName("Mary Shelley"),
    );
    expect(normalizeName("Émile Zola")).toBe(normalizeName("Zola, Emile"));
    expect(titleKey("The Count of Monte Cristo")).toBe("count of monte cristo");
  });

  it("uses the title to choose between namesakes", () => {
    expect(
      findAuthor(pack, { author: "Mary Shelley", title: "Frankenstein" })?.id,
    ).toBe(1);
    expect(
      findAuthor(pack, { author: "Mary Shelley", title: "Other" })?.id,
    ).toBe(1);
    expect(
      findAuthor(pack, { author: "Nobody Known", title: "Frankenstein" }),
    ).toBeNull();
  });

  it("finds unknown authors by a unique title or a by-line in the text", () => {
    expect(
      findAuthor(pack, { author: "Unknown author", title: "Frankenstein" })?.id,
    ).toBe(1);
    expect(findAuthor(pack, { author: "", title: "Unlisted" })).toBeNull();
    const found = authorFromText(pack, [
      "FRANKENSTEIN",
      "by Mary Wollstonecraft.",
    ]);
    expect(found?.author.id).toBe(2);
    expect(found?.written).toBe("Mary Wollstonecraft");
    expect(
      authorFromText(pack, [
        "Written by hand in a long sentence about nothing",
      ]),
    ).toBeNull();
  });

  it("writes a paragraph and trivia only from recorded facts", () => {
    const note = packNote(pack, authors[0], "en", "M. Shelley");
    expect(note.name).toBe("Mary Shelley");
    expect(note.years).toBe("1797-1851");
    expect(note.bio).toBe(
      "English novelist. She was born in London and died in Belgravia. Best known for Frankenstein (1818).",
    );
    expect(note.facts).toEqual([
      "Also wrote as M. W. S.",
      "Daughter of writer Mary Wollstonecraft.",
      "Besides writing, also worked as: travel guide.",
    ]);
  });

  it("describes awards, nominations and ancient dates", () => {
    const note = packNote(pack, authors[2], "en", "");
    expect(note.facts).toEqual([
      "Won the Nobel Prize in Literature in 1950.",
      "Nominated for the Nobel Prize in Literature 4 times.",
    ]);
    expect(note.years).toBe("Born 1900");
    expect(lifeYears(authors[3])).toBe("428 BC-348 BC");
  });
});

describe("web and genre authors", () => {
  it("mentions genres and publishing platforms", () => {
    const web: PackAuthor = { id: 9, b: 1990, ge: [400, 401], pl: [500], s: 1 };
    const withLabels: Pack = {
      ...pack,
      text: [
        {
          ...pack.text[0],
          names: { 9: "pirateaba" },
          labels: {
            400: "LitRPG",
            401: "progression fantasy",
            500: "Royal Road",
          },
        },
      ],
    };
    const note = packNote(withLabels, web, "en", "");
    expect(note.bio).toBe("Genres: LitRPG and progression fantasy.");
    expect(note.facts).toEqual(["Published on Royal Road."]);
  });
});
