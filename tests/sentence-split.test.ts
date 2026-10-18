import { describe, expect, it } from "vitest";
import { sentences } from "../src/documents";
import { sentenceRanges } from "../src/contents";

describe("sentences", () => {
  it("do not end after titles or initials", () => {
    expect(sentences("Mr. Bennet was silent. Mrs. Bennet was not.")).toEqual(["Mr. Bennet was silent. ", "Mrs. Bennet was not."]);
    expect(sentences("M. Dupont arriva. Mme. Martin et Mlle. Roux aussi.")).toHaveLength(2);
    expect(sentences("J. R. R. Tolkien wrote it. Dr. Watson read it.")).toHaveLength(2);
    expect(sentences("\u00ab Bonjour, M. Martin. \u00bb Il sourit.")).toHaveLength(2);
  });
  it("do not end before a lowercase word", () => {
    expect(sentences("It costs approx. ten pounds, e.g. here. Then we left.")).toHaveLength(2);
  });
  it("still end at real full stops", () => {
    expect(sentences("I am done. And so is he! Is she? Yes.")).toHaveLength(4);
  });
  it("keep the highlight ranges in step", () => {
    const text = "Mr. Bennet replied that he had not. But it is.";
    const r = sentenceRanges(text);
    expect(r).toHaveLength(2);
    expect(text.slice(r[0].start, r[0].end)).toBe("Mr. Bennet replied that he had not.");
  });
});
