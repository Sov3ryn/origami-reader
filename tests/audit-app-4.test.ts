import { afterEach, describe, expect, it } from "vitest";
import { annotationViews } from "../src/annotations";
import { collectionLabel, starterCollection } from "../src/collections";
import { loadLanguage, t } from "../src/i18n";
import type { Annotation } from "../src/types";

afterEach(async () => {
  await loadLanguage("en");
});

describe("collection names on screen", () => {
  it("translates built-in and starter names, keeps the reader's own", async () => {
    await loadLanguage("fr");
    expect(collectionLabel("Favorites")).toBe(t("Favorites"));
    expect(collectionLabel("Favorites")).not.toBe("Favorites");
    expect(collectionLabel(starterCollection)).toBe(t("Starter library"));
    expect(collectionLabel("My summer books")).toBe("My summer books");
  });
  it("stores the starter collection in English", () => {
    expect(starterCollection).toBe("Starter library");
  });
});

describe("note fallbacks", () => {
  it("names a missing book and a position without a quote", () => {
    const note: Annotation = {
      id: "a",
      bookId: "gone",
      paragraphId: "p",
      start: 0,
      end: 0,
      quote: "",
      kind: "bookmark",
      color: "",
      text: "",
      group: "",
      created: 1,
    } as Annotation;
    const [view] = annotationViews([note], [], {}, null);
    expect(view.title).toBe("Unavailable book");
    expect(view.line).toBe("Saved reading position");
  });
});
