import { describe, expect, it } from "vitest";
import { autoTitleStyle, coverTitleInk, coverTitleStyle, titleFit } from "../src/coverTitles";
import type { BookMeta } from "../src/types";

const book = (patch: Partial<BookMeta> = {}): BookMeta => ({
  id: "b", title: "A Book", author: "Someone", format: "EPUB", added: 0, opened: 0,
  position: 0, paragraphCount: 1, wordCount: 1, collection: "", favorite: false,
  deleted: false, cover: "lake", voice: "", sourceHash: "b", shelf: "stories", ...patch,
});

describe("cover title styles", () => {
  it("picks a style from the genres", () => {
    expect(autoTitleStyle(book({ genres: ["Gothic horror"] }))).toBe("gothic");
    expect(autoTitleStyle(book({ genres: ["Romance", "Classic"] }))).toBe("script");
    expect(autoTitleStyle(book({ genres: ["Science fiction", "Adventure"] }))).toBe("scifi");
    expect(autoTitleStyle(book({ genres: ["Mystery"] }))).toBe("deco");
    expect(autoTitleStyle(book({ genres: ["Fantasy"] }))).toBe("storybook");
    expect(autoTitleStyle(book({ genres: ["Historical"] }))).toBe("gilded");
    expect(autoTitleStyle(book({ genres: [] }))).toBe("gilded");
  });

  it("keeps documents plain and honours the reader's choice", () => {
    expect(autoTitleStyle(book({ shelf: "documents", genres: ["Romance"] }))).toBe("classic");
    expect(coverTitleStyle(book({ genres: ["Romance"], titleStyle: "thriller" }))).toBe("thriller");
    expect(coverTitleStyle(book({ genres: ["Romance"], titleStyle: "unknown" }))).toBe("script");
  });

  it("uses dark ink on the light paper cover unless a colour is chosen", () => {
    expect(coverTitleInk(book(), "gilded")).toBe("gold");
    expect(coverTitleInk(book({ cover: "forest" }), "gilded")).toBe("ink");
    expect(coverTitleInk(book({ cover: "forest", titleInk: "copper" }), "gilded")).toBe("copper");
  });

  it("shrinks long titles and long words, never below the floor", () => {
    expect(titleFit("Dracula", "gothic")).toBe(1);
    expect(titleFit("The Count of Monte Cristo", "gilded")).toBeLessThan(0.8);
    expect(titleFit("Bookmark Journey", "gilded")).toBeLessThan(1);
    expect(titleFit("x".repeat(400), "scifi")).toBe(0.45);
  });

  it("fits titles to the narrower space inside a frame pattern", () => {
    const title = "The Hound of the Baskervilles";
    expect(titleFit(title, "thriller", true)).toBeLessThan(titleFit(title, "thriller"));
    expect(titleFit("Dracula", "gothic", true)).toBe(1);
  });
});
