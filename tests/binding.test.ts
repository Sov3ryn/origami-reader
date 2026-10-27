import { describe, expect, it } from "vitest";
import { bindingOf, bookThickness, edgeFinish, edgeFinishes } from "../src/binding";

describe("book binding", () => {
  it("draws the chosen finish when it is open to everyone", () => {
    expect(edgeFinish("silver", false).id).toBe("silver");
    expect(edgeFinish("rose-gold", false).id).toBe("rose-gold");
  });
  it("keeps gold for supporters", () => {
    expect(edgeFinish("gold", false).id).toBe("plain");
    expect(edgeFinish("gold", true).id).toBe("gold");
    expect(edgeFinishes.filter((f) => f.supporter).map((f) => f.id)).toEqual(["gold"]);
  });
  it("falls back to plain for unknown or missing values", () => {
    expect(edgeFinish(undefined, true).id).toBe("plain");
    expect(edgeFinish("platinum", true).id).toBe("plain");
  });
  it("lets a book override the binding for all books, part by part", () => {
    const all = { edges: "silver", spine: "copper", cover: "plain" } as const;
    expect(bindingOf(all, undefined, false)).toEqual(all);
    expect(bindingOf(all, { cover: "rose-gold" }, false)).toEqual({ edges: "silver", spine: "copper", cover: "rose-gold" });
    expect(bindingOf(all, { spine: "gold" }, false).spine).toBe("plain");
    expect(bindingOf(undefined, undefined, false)).toEqual({ edges: "plain", spine: "plain", cover: "plain" });
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
