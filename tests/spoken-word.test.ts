import { describe, expect, it } from "vitest";
import { playedFraction, wordAt, wordSpans } from "../src/spokenWord";

describe("the word being read", () => {
  const text = "It is a truth universally acknowledged, that a single man must be in want of a wife.";
  it("weighs words by letters and the pause after punctuation", () => {
    const words = wordSpans(text, 0, text.length);
    expect(words).toHaveLength(17);
    const comma = words.find((w) => text.slice(w.start, w.end) === "acknowledged,")!;
    expect(comma.weight).toBe(12 + 1 + 3);
  });
  it("moves through the sentence as the clip plays", () => {
    const at = (f: number) => {
      const w = wordAt(text, 0, text.length, f)!;
      return text.slice(w.start, w.end);
    };
    expect(at(0)).toBe("It");
    expect(at(0.2)).toBe("universally");
    expect(at(0.3)).toBe("acknowledged,");
    expect(at(0.999)).toBe("wife.");
    expect(at(2)).toBe("wife.");
  });
  it("only counts words inside the sentence range", () => {
    const two = "First one. Second sentence here.";
    const w = wordAt(two, 11, two.length, 0)!;
    expect(two.slice(w.start, w.end)).toBe("Second");
  });
  it("leaves out the voice's short silences", () => {
    expect(playedFraction(0, 4)).toBeLessThan(0);
    expect(playedFraction(3.9, 4)).toBeGreaterThan(1);
    expect(playedFraction(1, 0)).toBe(0);
  });
});
