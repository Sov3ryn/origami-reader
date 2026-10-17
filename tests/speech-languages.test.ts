import { describe, expect, it } from "vitest";
import {
  hanNumber,
  koreanNumber,
  speechUnits,
  speechWeight,
  spellBareNumber,
  textLanguage,
} from "../src/documents";

describe("reading other languages aloud", () => {
  it("spells bare chapter numbers in the book's language", () => {
    expect(spellBareNumber("1", "en")).toBe("One.");
    expect(spellBareNumber("12.", "ko")).toBe("십이.");
    expect(spellBareNumber("3", "ja")).toBe("三。");
    expect(spellBareNumber("7", "other")).toBe("7.");
    expect(spellBareNumber("Chapter 1", "ko")).toBe("Chapter 1");
  });

  it("writes Sino-Korean and Chinese numerals correctly", () => {
    expect([1, 10, 11, 20, 100, 1863, 2024].map(koreanNumber)).toEqual([
      "일",
      "십",
      "십일",
      "이십",
      "백",
      "천팔백육십삼",
      "이천이십사",
    ]);
    expect([10, 21, 105, 1000].map(hanNumber)).toEqual([
      "十",
      "二十一",
      "百五",
      "千",
    ]);
  });

  it("detects a book's main language", () => {
    expect(textLanguage("On the 24th of May, my uncle rushed into the house.")).toBe("en");
    expect(textLanguage("그는 오래된 서재에 앉아 비를 바라보았다.")).toBe("ko");
    expect(textLanguage("吾輩は猫である。名前はまだ無い。")).toBe("ja");
    expect(textLanguage("Le comte de Monte-Cristo arriva à Marseille.")).toBe("other");
  });

  it("keeps Korean passages short enough to read in full", () => {
    const sentence =
      "그날 저녁 우리는 오래된 서재에 앉아 창밖으로 내리는 비를 바라보며 아무 말도 하지 않았다.";
    const text = Array.from({ length: 12 }, () => sentence).join(" ");
    const units = speechUnits(text, 400);
    expect(units.length).toBeGreaterThan(1);
    for (const unit of units) expect(speechWeight(unit.text)).toBeLessThanOrEqual(400);
    // Every unit ends at a sentence boundary: no sentence is cut in half.
    for (const unit of units) expect(unit.text.endsWith(".")).toBe(true);
    // Text without spaces is split into pieces that fit as well.
    const chinese = "我们明天去北京看看长城然后回家吃饭".repeat(30);
    for (const unit of speechUnits(chinese, 400))
      expect(speechWeight(unit.text)).toBeLessThanOrEqual(400);
  });
});
