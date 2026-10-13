import { describe, it, expect } from "vitest";
import {
  paragraphsFromText,
  splitSpeech,
  cleanSpokenText,
} from "../src/documents";
describe("structured reading", () => {
  it("preserves all paragraphs and chapter identity", () => {
    const p = paragraphsFromText(
      "# One\r\n\r\nFirst.\r\n\r\n# Two\r\n\r\nSecond.",
    );
    expect(p.map((x) => x.text)).toEqual(["One", "First.", "Two", "Second."]);
    expect(p.map((x) => x.chapter)).toEqual([1, 1, 2, 2]);
    expect(new Set(p.map((x) => x.id)).size).toBe(4);
  });
  it("does not truncate a novel-sized import", () => {
    const text = Array.from(
      { length: 10000 },
      (_, i) => "Paragraph " + i + " " + "Text ".repeat(20),
    ).join("\n\n");
    const p = paragraphsFromText(text);
    expect(p.length).toBe(10000);
    expect(p[9999].text).toContain("9999");
  });
  it("preserves decimal values and trailing unpunctuated text in speech", () => {
    const text = "It costs 3.14 pounds. Dr. Vale arrived. And then the light";
    expect(splitSpeech(text).join(" ")).toBe(text);
  });
  it("bounds long sentences and unbroken tokens", () => {
    const result = splitSpeech("word ".repeat(600) + "x".repeat(1000), 100);
    expect(result.every((s) => s.length <= 100)).toBe(true);
    expect(result.join("").replace(/\s/g, "")).toBe(
      "word".repeat(600) + "x".repeat(1000),
    );
  });
  it("cleans displayed markup only in the spoken layer", () => {
    const original =
      "# Title\nRead [this](https://example.test) **now**.\n\n```js\nsecretCode()\n```";
    const spoken = cleanSpokenText(original);
    expect(spoken).toBe("Title\nRead this now.");
    expect(original).toContain("secretCode");
  });
});
