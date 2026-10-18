import { describe, expect, it } from "vitest";
import { bookMarkdown, prettyName, sentences, structure, type HeardWord } from "../src/studio/recording";

// Words spoken one after another; `pause` adds silence after a word.
function speak(text: string, pauses: Record<number, number> = {}, from = 0): HeardWord[] {
  let t = from;
  return text.split(" ").map((w, i) => {
    const word: HeardWord = [w, t, t + 0.3, 0.95];
    t += 0.35 + (pauses[i] || 0);
    return word;
  });
}

describe("recording to book", () => {
  it("joins words into sentences with their pauses", () => {
    const s = sentences(speak("It was dark. Nobody came.", { 2: 0.8 }));
    expect(s.map((x) => x.text)).toEqual(["It was dark.", "Nobody came."]);
    expect(s[0].gap).toBeCloseTo(0.85);
  });
  it("removes credits, finds the chapter title and breaks paragraphs at long pauses", () => {
    const text =
      "This is a LibriVox recording. All LibriVox recordings are in the public domain. Chapter One. " +
      "It is a truth universally acknowledged. Everyone agrees. " +
      "Mr. Bennet said nothing. His wife spoke again. End of chapter one.";
    // Long pauses after "One." (heading) and after "agrees." (paragraph).
    const idx = (w: string) => text.split(" ").indexOf(w);
    // Narrators pause about half a second between sentences.
    const pauses: Record<number, number> = {};
    text.split(" ").forEach((w, i) => /[.!?]$/.test(w) && !/^Mr\.$/.test(w) && (pauses[i] = 0.45));
    Object.assign(pauses, { [idx("recording.")]: 1, [idx("domain.")]: 1.5, [idx("One.")]: 2, [idx("agrees.")]: 1.4 });
    const words = speak(text, pauses);
    const chapters = structure([{ name: "01_book", seconds: 60, words }]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Chapter One");
    expect(chapters[0].paragraphs).toEqual(["It is a truth universally acknowledged. Everyone agrees.", "Mr. Bennet said nothing. His wife spoke again."]);
  });
  it("finds a heading run into the first sentence", () => {
    const chapters = structure([{ name: "x", seconds: 5, words: speak("CHAPTER XVI As no objection was made, they went.") }]);
    expect(chapters[0].title).toBe("Chapter XVI");
    expect(chapters[0].paragraphs[0]).toBe("As no objection was made, they went.");
  });
  it("drops the reader's announcement of the book", () => {
    const words = speak("Le tour du monde en quatre-vingts jours, de Jules Verne. Chapitre I Phileas Fogg et Passepartout. Il pleuvait.");
    const chapters = structure([{ name: "x", seconds: 5, words }], { title: "Le tour du monde en quatre-vingts jours", author: "Jules Verne" });
    expect(chapters[0].title).toBe("Chapitre I");
    expect(chapters[0].paragraphs[0]).toBe("Phileas Fogg et Passepartout. Il pleuvait.");
  });
  it("names chapters after their files when there are several", () => {
    const chapters = structure([
      { name: "01_the_storm", seconds: 5, words: speak("Rain fell. The wind rose.") },
      { name: "02_the_calm", seconds: 5, words: speak("Morning came.") },
    ]);
    expect(chapters.map((c) => c.title)).toEqual(["The storm", "The calm"]);
    expect(prettyName("03-pride-and-prejudice")).toBe("Pride and prejudice");
  });
  it("writes Markdown for the importer", () => {
    const md = bookMarkdown("Book", "Ann", [{ title: "One", paragraphs: ["A.", "B."], start: 0 }]);
    expect(md).toBe("# Book\n\nAnn\n\n## One\n\nA.\n\nB.\n");
  });
});
