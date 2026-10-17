import { describe, it, expect } from "vitest";
import {
  paragraphsFromText,
  splitSpeech,
  cleanSpokenText,
  epubParagraphs,
} from "../src/documents";
describe("structured reading", () => {
  it("skips addresses, automation messages and decoration without damaging prose", () => {
    expect(
      cleanSpokenText(
        "Read [the guide](https://example.test/docs). Visit https://example.test/a?q=1\n<heartbeat><message>Internal status</message></heartbeat>\n✨ Done.",
      ),
    ).toBe("Read the guide. Visit \n \n Done.");
    const prose =
      "It costs $12.50, a 5% increase. 日本語 한국어 हिन्दी. 2 + 2 = 4.";
    expect(cleanSpokenText(prose)).toBe(prose);
    const literal = "https://example.test <message>hello</message> ✨";
    expect(cleanSpokenText(literal, false)).toBe(literal);
    expect(splitSpeech(literal, 400, false).join(" ")).toBe(literal);
  });
  it("separates nested diary paragraphs and headings and retains list introductions once", () => {
    const doc = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><blockquote><h3>Journal</h3><p>First entry.</p><p>Second entry.</p></blockquote><ul><li>Introduction<ul><li>Nested item</li></ul>Conclusion</li></ul></body></html>',
      "application/xhtml+xml",
    );
    const paragraphs = epubParagraphs(doc, 3);
    expect(paragraphs.map((p) => p.text)).toEqual([
      "Journal",
      "First entry.",
      "Second entry.",
      "Introduction",
      "Nested item",
      "Conclusion",
    ]);
    expect(paragraphs[0]).toMatchObject({
      kind: "heading",
      headingLevel: 3,
      chapter: 3,
      quote: true,
    });
    expect(paragraphs[1].quote).toBe(true);
    expect(new Set(paragraphs.map((p) => p.id)).size).toBe(6);
  });
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
