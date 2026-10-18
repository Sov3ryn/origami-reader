import { describe, expect, it } from "vitest";
import { applyPronunciation, occurrences, sampleAround, suggestWords } from "../src/studio/pronounce";
import type { ProductionUnit } from "../src/studio/production";

const u = (id: string, text: string, extra: Partial<ProductionUnit> = {}): ProductionUnit => ({ id, chapter: 0, paragraph: 0, paragraphId: "p", heading: false, text, status: "rendered", take: "t-" + id, ...extra });
const units = [
  u("a", "They rode to Netherfield at dawn."),
  u("b", "Netherfield Park was let at last, said Mrs. Bennet."),
  u("c", "Nobody at Netherfield slept."),
  u("d", "The house stood near Netherfieldshire.", { status: "approved" }),
  u("e", "Bingley smiled. The weather was fine."),
];

describe("pronunciations", () => {
  it("suggests names and recurring proper nouns, not sentence starts", () => {
    const words = suggestWords(units, [{ id: "Bingley", name: "Charles Bingley", aliases: [], gender: "m", voice: "v", color: "" }], []);
    const list = words.map((w) => w.word);
    expect(list).toContain("Netherfield");
    expect(list).toContain("Bingley");
    expect(list).not.toContain("They");
    expect(list).not.toContain("Nobody");
  });
  it("finds every whole-word occurrence", () => {
    expect(occurrences(units, "Netherfield").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("changes the spoken text only, needs new takes and leaves approved lines", () => {
    const changed = applyPronunciation(units, { word: "Netherfield", sayAs: "Nether-field" });
    expect(changed.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(changed[0]).toMatchObject({ text: "They rode to Nether-field at dawn.", original: "They rode to Netherfield at dawn.", status: "pending" });
  });
  it("builds a short sample around the word", () => {
    expect(sampleAround(units[1].text, "Netherfield", "Nether-field")).toContain("Nether-field Park");
  });
});
