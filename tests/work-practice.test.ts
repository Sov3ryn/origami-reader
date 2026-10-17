import { describe, expect, it } from "vitest";
import { makeCard } from "../src/work/cards";
import { buildTest, daysToExam, examCards, exportCardSet, grade, importCardSet, questionFor } from "../src/work/practice";
import type { Subject } from "../src/work/types";

const day = 86_400_000;
const subject = (exam?: string): Subject => ({ id: "s", kind: "subject", name: "Biology", color: "#000", order: 1, created: 0, exam });
const keyOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("exams", () => {
  it("count the days left and spread later cards before the exam", () => {
    const now = new Date(2026, 9, 17, 10).getTime();
    expect(daysToExam(subject(keyOf(now + 4 * day)), now)).toBe(4);
    expect(daysToExam(subject(keyOf(now - day)), now)).toBeNull();
    const cards = Array.from({ length: 8 }, (_, i) => {
      const c = makeCard({ type: "qa", front: "Q" + i, back: "A" + i, subjectId: "s" }, now);
      return { ...c, schedule: { ...c.schedule, due: now + (10 + i) * day, stability: i } };
    });
    const extra = examCards(cards, [subject(keyOf(now + 4 * day))], now);
    expect(extra).toHaveLength(2);
    expect(extra[0].front).toBe("Q0");
    expect(examCards(cards, [subject()], now)).toHaveLength(0);
  });
});

describe("practice tests", () => {
  const cards = ["Osmosis:water", "Mitosis:division", "ATP:energy", "DNA:genes", "Ribosome:proteins"].map((s) => {
    const [front, back] = s.split(":");
    return makeCard({ type: "qa", front, back });
  });
  it("ask multiple choice with other answers as options", () => {
    const test = buildTest(cards, 4, "choice", () => 0.3);
    expect(test).toHaveLength(4);
    for (const q of test) {
      expect(q.choices).toHaveLength(4);
      expect(q.choices).toContain(q.answer);
      expect(new Set(q.choices).size).toBe(4);
    }
  });
  it("turn fill-in-the-blank cards into questions and grade typing", () => {
    const cloze = makeCard({ type: "cloze", front: "The {{mitochondria}} makes energy", back: "" });
    expect(questionFor(cloze)).toEqual({ prompt: "The _____ makes energy", answer: "mitochondria" });
    expect(grade("Mitochondria", "mitochondria")).toBe("right");
    expect(grade("mitocondria", "mitochondria")).toBe("close");
    expect(grade("ribosome", "mitochondria")).toBe("wrong");
  });
  it("share card sets without review history", () => {
    const file = exportCardSet("Biology", cards);
    expect(file).not.toContain("schedule");
    const back = importCardSet(file, "s2");
    expect(back.title).toBe("Biology");
    expect(back.cards).toHaveLength(5);
    expect(back.cards[0].subjectId).toBe("s2");
    expect(back.cards[0].id).not.toBe(cards[0].id);
    expect(() => importCardSet("{}")).toThrow();
  });
});
