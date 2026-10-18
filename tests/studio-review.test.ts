import { describe, expect, it } from "vitest";
import {
  clock,
  creditLine,
  creditTitle,
  editUnit,
  gapAfter,
  manuscript,
  spokenLength,
  takeIssues,
  typicalPace,
  type Production,
  type ProductionUnit,
  type Take,
} from "../src/studio/production";
import type { Book } from "../src/types";

const unit = (id: string, paragraph: number, extra: Partial<ProductionUnit> = {}): ProductionUnit => ({
  id,
  chapter: 0,
  paragraph,
  paragraphId: `p${paragraph}`,
  heading: false,
  text: "A line of text that is long enough to judge its pace properly.",
  status: "rendered",
  take: `t-${id}`,
  ...extra,
});
const take = (id: string, duration: number, extra: Partial<Take> = {}): Take => ({
  id: `t-${id}`,
  unit: id,
  file: `t-${id}.flac`,
  duration,
  seed: 1,
  model: "",
  voice: "v",
  text: "A line of text that is long enough to judge its pace properly.",
  created: 1,
  checks: { peak: -6, rms: -20, lead: 0.1, trail: 0.2 },
  ended: true,
  ...extra,
});

describe("take checks", () => {
  const takes = ["a", "b", "c", "d", "e", "f"].map((id) => take(id, 4));
  const typical = typicalPace(takes);
  it("finds the book's pace from its takes", () => {
    expect(typical).toBeCloseTo(62 / 4, 0);
  });
  it("passes an ordinary take", () => {
    expect(takeIssues(take("a", 4), unit("a", 0), typical)).toEqual([]);
  });
  it("flags cut, rushed, dragging, clipping, quiet and long silences", () => {
    expect(takeIssues(take("a", 4, { ended: false }), unit("a", 0), typical)).toContain("cut");
    expect(takeIssues(take("a", 2), unit("a", 0), typical)).toContain("fast");
    expect(takeIssues(take("a", 9), unit("a", 0), typical)).toContain("slow");
    expect(takeIssues(take("a", 4, { checks: { peak: -0.1, rms: -20, lead: 0, trail: 0 } }), unit("a", 0), typical)).toContain("clipping");
    expect(takeIssues(take("a", 4, { checks: { peak: -10, rms: -40, lead: 0, trail: 0 } }), unit("a", 0), typical)).toContain("quiet");
    expect(takeIssues(take("a", 4, { checks: { peak: -6, rms: -20, lead: 0, trail: 2.5 } }), unit("a", 0), typical)).toContain("pause");
  });
  it("marks a take whose text has changed", () => {
    expect(takeIssues(take("a", 4), unit("a", 0, { status: "pending" }), typical)).toContain("changed");
  });
  it("does not judge the pace of very short lines", () => {
    expect(takeIssues(take("a", 3, { text: "Yes." }), unit("a", 0, { text: "Yes." }), typical)).toEqual([]);
  });
});

describe("editing spoken text", () => {
  it("keeps the book text and asks for a new take", () => {
    const u = unit("a", 0, { text: "Mr. Darcy bowed." });
    const edited = editUnit(u, "Mister Darcy bowed.");
    expect(edited).toMatchObject({ text: "Mister Darcy bowed.", original: "Mr. Darcy bowed.", status: "pending" });
    // Going back to the book text forgets the original.
    expect(editUnit(edited, "Mr. Darcy bowed.").original).toBeUndefined();
    // No change, no new take.
    expect(editUnit(u, "  Mr. Darcy   bowed. ")).toBe(u);
  });
});

describe("timing", () => {
  const units = [unit("a", 0, { heading: true }), unit("b", 1), unit("c", 1), unit("d", 2)];
  const p: Production = { info: { id: "p", title: "T", author: "A", bookId: "b", language: "en", voice: "v", created: 0, updated: 0, sourceHash: "" }, units, takes: units.map((u) => take(u.id, 2)) };
  it("pauses longer around headings and between paragraphs", () => {
    expect(gapAfter(units[0], units[1])).toBe(1.2);
    expect(gapAfter(units[1], units[2])).toBe(0.25);
    expect(gapAfter(units[2], units[3])).toBe(0.65);
    expect(gapAfter(units[3], undefined)).toBe(0);
  });
  it("adds takes and pauses", () => {
    expect(spokenLength(p, units)).toBeCloseTo(8 + 1.2 + 0.25 + 0.65);
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(65)).toBe("1:05");
  });
});

describe("export text", () => {
  it("speaks the credit in the book's language", () => {
    expect(creditLine({ title: "Dracula", author: "Bram Stoker", language: "en" })).toBe("Dracula, by Bram Stoker. Narrated by digital voices. Made with Origami Studio.");
    expect(creditLine({ title: "Dracula", author: "Bram Stoker", language: "fr-FR" })).toContain("Réalisé avec Origami Studio");
    expect(creditLine({ title: "X", author: "Y", language: "ja" })).toContain("Made with Origami Studio");
    expect(creditTitle("fr")).toBe("Générique");
  });
  it("builds the manuscript from the book, not from edited spoken text", () => {
    const book = {
      meta: { id: "b", title: "T", author: "A" },
      paragraphs: [
        { id: "1", text: "Chapter One", kind: "heading", chapter: 0 },
        { id: "2", text: "Mr. Darcy bowed.", kind: "paragraph", chapter: 0 },
        { id: "3", text: "A letter.", kind: "paragraph", chapter: 0, quote: true },
        { id: "4", text: "Chapter Two", kind: "heading", chapter: 1 },
        { id: "5", text: "Part the second", kind: "heading", chapter: 1 },
        { id: "6", text: "End.", kind: "paragraph", chapter: 1 },
      ],
    } as unknown as Book;
    const p = { info: { title: "T", author: "A", language: "en" }, units: [unit("a", 1, { text: "Mister Darcy bowed.", original: "Mr. Darcy bowed." })], takes: [] } as unknown as Production;
    const m = manuscript(p, book, { rights: ["Public domain."], ai: "" });
    expect(m.chapters).toHaveLength(2);
    expect(m.chapters[0]).toEqual({ title: "Chapter One", blocks: [{ text: "Mr. Darcy bowed.", quote: false, center: false }, { text: "A letter.", quote: true, center: false }] });
    expect(m.chapters[1].blocks[0]).toEqual({ text: "Part the second", center: true });
    // Without the book, the units' original text is used.
    const fallback = manuscript(p, null, { rights: [], ai: "" });
    expect(fallback.chapters[0].blocks[0].text).toBe("Mr. Darcy bowed.");
  });
});

describe("phase 3", () => {
  const a = unit("a", 0, { pause: "long" });
  const b = unit("b", 0, { pause: "short" });
  const c = unit("c", 1);
  it("lets a line's pause be shorter or longer", () => {
    expect(gapAfter(a, c)).toBe(1.625);
    expect(gapAfter(b, c)).toBeCloseTo(0.26);
    expect(gapAfter(unit("x", 0, { pause: "long" }), unit("y", 0))).toBe(1.2);
    expect(gapAfter(a, undefined)).toBe(0);
  });
  it("flags a take whose words were not heard", () => {
    const heardWrong = take("a", 4, { checks: { peak: -6, rms: -20, lead: 0.1, trail: 0.2, heard: "something else", match: 0.4 } });
    expect(takeIssues(heardWrong, unit("a", 0), 15)).toContain("mismatch");
    const heardRight = take("a", 4, { checks: { peak: -6, rms: -20, lead: 0.1, trail: 0.2, heard: "same", match: 0.95 } });
    expect(takeIssues(heardRight, unit("a", 0), 15)).not.toContain("mismatch");
  });
});
