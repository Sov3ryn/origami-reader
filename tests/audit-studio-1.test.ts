import { describe, expect, it } from "vitest";
import { scopeUnits } from "../src/studio/JobScope";
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
const page = { kind: "page", from: 0, to: 0 } as const;

describe("studio One page scope", () => {
  it("starts at the selected line when it is in the shown chapter", () => {
    expect(scopeUnits(units, page, { chapter: 1, selected: "u12" })[0].id).toBe("u12");
  });
  it("starts at the shown chapter's first line when the selection is in another chapter", () => {
    const lines = scopeUnits(units, page, { chapter: 2, selected: "u3" });
    expect(lines[0].id).toBe("u20");
    expect(lines.every((u) => u.chapter === 2)).toBe(true);
  });
});
