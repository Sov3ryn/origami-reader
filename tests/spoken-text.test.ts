import { describe, expect, it } from "vitest";
import {
  expandSpokenRange,
  replaceSpokenRange,
  romanValue,
  spokenText,
  validateSpokenEdits,
} from "../src/spokenText";
import { defaultPreferences, type Paragraph } from "../src/types";
const paragraph = (
  text: string,
  kind: Paragraph["kind"] = "paragraph",
): Paragraph => ({ id: "p", text, kind, chapter: 1 });

describe("accepted narration wording", () => {
  it("replaces source ranges without changing source text or later offsets", () => {
    const p = paragraph("One short sentence. Another sentence follows.");
    const end = p.text.indexOf(" Another");
    p.spokenEdits = replaceSpokenRange(
      p,
      { start: 0, end },
      "A much longer replacement, with different wording.",
    );
    const next = { start: p.text.indexOf("Another"), end: p.text.length };
    p.spokenEdits = replaceSpokenRange(p, next, "The next one.");
    expect(spokenText(p, defaultPreferences)).toBe(
      "A much longer replacement, with different wording. The next one.",
    );
    expect(spokenText(p, defaultPreferences, next)).toBe("The next one.");
    expect(p.text).toBe("One short sentence. Another sentence follows.");
  });
  it("keeps deletion as an explicit empty replacement and resets only the requested range", () => {
    const p = paragraph("One. Two. Three.");
    p.spokenEdits = [
      { start: 0, end: 4, text: "First." },
      { start: 5, end: 9, text: "" },
    ];
    expect(spokenText(p, defaultPreferences, { start: 5, end: 9 })).toBe("");
    expect(spokenText(p, defaultPreferences)).toBe("First. Three.");
    p.spokenEdits = replaceSpokenRange(p, { start: 5, end: 9 }, null);
    expect(spokenText(p, defaultPreferences)).toBe("First. Two. Three.");
  });
  it("expands a selection inside a saved replacement and preserves unrelated edits", () => {
    const p = paragraph("First sentence. Second sentence. Third sentence.");
    p.spokenEdits = [
      { start: 0, end: 15, text: "First edit." },
      { start: 33, end: p.text.length, text: "Third edit." },
    ];
    expect(expandSpokenRange(p, { start: 3, end: 8 })).toEqual({
      start: 0,
      end: 15,
    });
    p.spokenEdits = replaceSpokenRange(
      p,
      { start: 3, end: 8 },
      "Revised first.",
    );
    expect(spokenText(p, defaultPreferences)).toBe(
      "Revised first. Second sentence. Third edit.",
    );
  });
  it("rejects overlaps, invalid boundaries and half of a surrogate pair", () => {
    const p = paragraph("A 😀 word");
    expect(() =>
      validateSpokenEdits(p.text, [{ start: 2, end: 4, text: "smile" }]),
    ).not.toThrow();
    expect(() =>
      validateSpokenEdits(p.text, [{ start: 3, end: 4, text: "bad" }]),
    ).toThrow();
    expect(() =>
      validateSpokenEdits(p.text, [
        { start: 0, end: 6, text: "a" },
        { start: 4, end: 7, text: "b" },
      ]),
    ).toThrow();
    expect(() =>
      validateSpokenEdits(p.text, [{ start: 0, end: 100, text: "bad" }]),
    ).toThrow();
  });
});

describe("Roman heading numbers", () => {
  it("recognizes canonical, lowercase and Unicode numerals", () => {
    expect(
      ["I", "IV", "XVI", "XLIX", "MMMCMXCIX", "iv", "ⅩⅥ"].map(romanValue),
    ).toEqual([1, 4, 16, 49, 3999, 4, 16]);
    expect(
      ["", "IIII", "IIV", "VX", "MMMM", "Chapter"].map(romanValue),
    ).toEqual([null, null, null, null, null, null]);
  });
  it("normalizes numbered headings, while preserving body text and ordinary titles", () => {
    for (const [text, expected] of [
      ["Chapter XVI · The lake", "Chapter 16 · The lake"],
      ["XVI", "16"],
      ["ⅩⅥ", "16"],
      ["XVI The lake", "16 The lake"],
      ["I. The lake", "1. The lake"],
      ["Part iv: Arrival", "Part 4: Arrival"],
      ["I Am Legend", "I Am Legend"],
      ["Civil War", "Civil War"],
      ["mix and match", "mix and match"],
    ]) {
      expect(spokenText(paragraph(text, "heading"), defaultPreferences)).toBe(
        expected,
      );
    }
    expect(
      spokenText(
        paragraph("Chapter XVI is mentioned here."),
        defaultPreferences,
      ),
    ).toBe("Chapter XVI is mentioned here.");
  });
  it("honors the setting and gives manual wording priority over the automatic rule", () => {
    const p = paragraph("Chapter XVI", "heading");
    expect(spokenText(p, { romanNumeralHeadings: false })).toBe("Chapter XVI");
    p.spokenEdits = [{ start: 8, end: 11, text: "the final chapter" }];
    expect(spokenText(p, defaultPreferences)).toBe("Chapter the final chapter");
    p.spokenEdits = [{ start: 0, end: 11, text: "Chapter XVI, as written." }];
    expect(spokenText(p, defaultPreferences)).toBe("Chapter XVI, as written.");
  });
});
