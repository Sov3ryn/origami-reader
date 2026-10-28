import { describe, expect, it } from "vitest";
import { bindingOf, bookThickness, edgeFinish, edgeFinishes } from "../src/binding";

describe("book binding", () => {
  it("draws the chosen finish, earned or not, since locks apply when choosing", () => {
    expect(edgeFinish("silver").id).toBe("silver");
    expect(edgeFinish("gold").id).toBe("gold");
    expect(edgeFinishes.map((f) => f.id)).toContain("rose-gold");
  });
  it("falls back to plain for unknown or missing values", () => {
    expect(edgeFinish(undefined).id).toBe("plain");
    expect(edgeFinish("platinum").id).toBe("plain");
  });
  it("lets a book override the binding for all books, part by part", () => {
    const all = { edges: "silver", spine: "copper", cover: "plain" } as const;
    expect(bindingOf(all)).toEqual(all);
    expect(bindingOf(all, { cover: "rose-gold" })).toEqual({ edges: "silver", spine: "copper", cover: "rose-gold" });
    expect(bindingOf(all, { spine: "gold" }).spine).toBe("gold");
    expect(bindingOf(undefined)).toEqual({ edges: "plain", spine: "plain", cover: "plain" });
  });
  it("makes longer books thicker, within a booklet and a brick", () => {
    expect(bookThickness(4000)).toBeCloseTo(0.025);
    expect(bookThickness(100000)).toBeGreaterThan(bookThickness(40000));
    // Dracula, about 160,000 words: close to a real paperback's proportions.
    expect(bookThickness(160000)).toBeGreaterThan(0.15);
    expect(bookThickness(160000)).toBeLessThan(0.2);
    expect(bookThickness(2000000)).toBe(0.22);
  });
});
