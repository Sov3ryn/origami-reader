import { describe, expect, it } from "vitest";
import { scopeUnits, type Scope } from "../src/studio/JobScope";
import type { ProductionUnit } from "../src/studio/production";

// Three chapters of ten lines, twenty words each.
const units: ProductionUnit[] = Array.from({ length: 30 }, (_, i) => ({
  id: "u" + i,
  chapter: Math.floor(i / 10),
  paragraph: i,
  paragraphId: "p" + i,
  heading: false,
  text: Array.from({ length: 20 }, () => "word").join(" "),
  status: "pending",
}));
const ids = (scope: Scope, at: { chapter: number; selected?: string }) => scopeUnits(units, scope, at).map((u) => u.id);

describe("studio job scope", () => {
  it("covers the whole book or one chapter", () => {
    expect(ids({ kind: "all", from: 0, to: 0 }, { chapter: 1 })).toHaveLength(30);
    expect(ids({ kind: "chapter", from: 0, to: 0 }, { chapter: 1 })).toEqual(units.slice(10, 20).map((u) => u.id));
  });
  it("covers a run of chapters in either order", () => {
    expect(ids({ kind: "range", from: 1, to: 2 }, { chapter: 0 })).toHaveLength(20);
    expect(ids({ kind: "range", from: 2, to: 1 }, { chapter: 0 })).toHaveLength(20);
  });
  it("takes a page of about 300 words from the selected line", () => {
    const page = ids({ kind: "page", from: 0, to: 0 }, { chapter: 0, selected: "u5" });
    expect(page[0]).toBe("u5");
    expect(page).toHaveLength(15);
  });
  it("starts a page at the chapter's first line when nothing is selected", () => {
    expect(ids({ kind: "page", from: 0, to: 0 }, { chapter: 2 })[0]).toBe("u20");
  });
});
