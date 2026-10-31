import { describe, expect, it } from "vitest";
import { formatWait, makeCard } from "../src/work/cards";
import { buildTest } from "../src/work/practice";

describe("retest of missed cards", () => {
  const cards = ["Osmosis:water", "Mitosis:division", "ATP:energy", "DNA:genes", "Ribosome:proteins"].map((s) => {
    const [front, back] = s.split(":");
    return makeCard({ type: "qa", front, back });
  });

  it("falls back to typed answers when only the missed cards give wrong options", () => {
    const test = buildTest(cards.slice(0, 2), 2, "choice", () => 0.3);
    expect(test.every((q) => !q.choices)).toBe(true);
  });

  it("keeps multiple choice with wrong options from the whole set", () => {
    const missed = cards.slice(0, 2);
    const test = buildTest(missed, 2, "choice", () => 0.3, cards);
    expect(test).toHaveLength(2);
    for (const q of test) {
      expect(q.choices).toHaveLength(4);
      expect(q.choices).toContain(q.answer);
      expect(new Set(q.choices).size).toBe(4);
    }
  });

  it("never offers a suspended card's answer as a wrong option", () => {
    const whole = cards.map((c, i) => (i === 4 ? { ...c, suspended: true } : c));
    const test = buildTest(whole.slice(0, 1), 1, "choice", () => 0.3, whole);
    expect(test[0].choices).toHaveLength(4);
    expect(test[0].choices).not.toContain("proteins");
  });
});

describe("formatWait", () => {
  it("keeps the English units", () => {
    expect(formatWait(5 * 60000)).toBe("5 min");
    expect(formatWait(3 * 3600000)).toBe("3 h");
    expect(formatWait(3 * 86400000)).toBe("3 d");
    expect(formatWait(90 * 86400000)).toBe("3 mo");
    expect(formatWait(438 * 86400000)).toMatch(/^1[.,]2 y$/);
  });
});
