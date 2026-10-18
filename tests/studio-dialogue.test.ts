import { describe, expect, it } from "vitest";
import { dialogueStyle, findSpeech, speechText } from "../src/studio/dialogue";
import { attribute, type Character } from "../src/studio/attribution";

// Dialogue dash, written by code so this file holds no literal em dash.
const D = String.fromCharCode(0x2014);
const L = String.fromCharCode(0x201c);
const R = String.fromCharCode(0x201d);
const q = (text: string) => L + text + R;

describe("finding speech", () => {
  it("joins an English line split around its tag and reads the tag", () => {
    const paras = [`${q("You are uniformly charming,")} said Elizabeth, ${q("and I thank you.")}`];
    const [s] = findSpeech(paras, "en");
    expect(speechText(paras, s)).toBe("You are uniformly charming, and I thank you.");
    expect(s.tag).toMatchObject({ kind: "name", who: "Elizabeth", verb: "said" });
  });

  it("carves French incises out of dash dialogue", () => {
    const paras = [
      "D'Artagnan se tourna vers elle.",
      `${D} Je le dirai, s'écria Milady avec une exaltation feinte, le jour où j'aurai assez souffert.`,
      `${D} Tel rit du cheval qui n'oserait pas rire du maître! s'écria l'émule de Tréville, furieux.`,
    ];
    expect(dialogueStyle(paras, "fr").dash).toBe(true);
    const speech = findSpeech(paras, "fr");
    expect(speech).toHaveLength(2);
    expect(speechText(paras, speech[0])).toBe("Je le dirai, le jour où j'aurai assez souffert.");
    expect(speech[0].tag).toMatchObject({ verb: "s'écria", who: "Milady" });
    // The word after the incise describes the speaker; it is not spoken.
    expect(speechText(paras, speech[1])).toBe("Tel rit du cheval qui n'oserait pas rire du maître!");
  });

  it("reads guillemet exchanges with dash turns and skips quoted terms", () => {
    const paras = [
      "Il regarda la «surface» de l'eau.",
      "«Vous êtes Français? lui demanda Phileas Fogg.",
      "--Oui, monsieur, répondit le nouveau venu.",
      "--Bien.»",
    ];
    const speech = findSpeech(paras, "fr");
    expect(speech.map((s) => speechText(paras, s))).toEqual(["Vous êtes Français?", "Oui, monsieur,", "Bien."]);
    expect(speech[0].tag?.who).toBe("Phileas Fogg");
    expect(speech[1].tag?.who).toBe("le nouveau venu");
  });

  it("carries an open quotation into the next paragraph", () => {
    const paras = [`${L}It was a long letter, and I read it twice.`, `${q("Then I burned it.")}`];
    const speech = findSpeech(paras, "en");
    expect(speech[1].continued).toBe(true);
  });
});

describe("attributing speech", () => {
  const cast: Character[] = [
    { id: "Mr. Bennet", aliases: ["her father"], gender: "m" },
    { id: "Mrs. Bennet", aliases: ["his wife", "his lady"], gender: "f" },
    { id: "Mr. Bingley", aliases: ["Bingley"], gender: "m" },
  ];

  it("uses tags, the person addressed and turn-taking", () => {
    const paras = [
      `${q("My dear Mr. Bennet,")} said his lady to him one day, ${q("have you heard that Netherfield Park is let at last?")}`,
      "Mr. Bennet replied that he had not.",
      `${q("Do you not want to know who has taken it?")} cried his wife impatiently.`,
      q("You want to tell me, and I have no objection to hearing it."),
      q("A young man of large fortune; Mr. Bingley is his name."),
      q("Is he married or single?"),
    ];
    const speech = findSpeech(paras, "en");
    const result = attribute(speech, paras, cast);
    expect(result.map((a) => a.speaker)).toEqual(["Mrs. Bennet", "Mrs. Bennet", "Mr. Bennet", "Mrs. Bennet", "Mr. Bennet"]);
    expect(result[0].cue).toBe("descriptive");
    expect(result[2].cue).toBe("turn");
  });

  it("resolves l'autre to the other person in the exchange", () => {
    const fr: Character[] = [
      { id: "d'Artagnan", aliases: ["le jeune homme"], gender: "m" },
      { id: "L'inconnu", aliases: ["l'inconnu"], gender: "m" },
    ];
    const paras = [
      `${D} Je ne vous parle pas, monsieur, dit l'inconnu.`,
      `${D} Mais je vous parle, moi! s'écria le jeune homme exaspéré de ce mélange d'insolence.`,
      `${D} Me frapper, moi! dit l'autre en pivotant sur ses talons.`,
    ];
    const result = attribute(findSpeech(paras, "fr"), paras, fr);
    expect(result.map((a) => a.speaker)).toEqual(["L'inconnu", "d'Artagnan", "L'inconnu"]);
  });
});

describe("productions", () => {
  it("cuts a book into stable render units by chapter", async () => {
    const { productionUnits, newProduction } = await import("../src/studio/production");
    const { defaultPreferences: defaults } = await import("../src/types");
    const book = {
      meta: { id: "b1", title: "Test", author: "A", language: "en", sourceHash: "h" },
      paragraphs: [
        { id: "a", text: "Chapter One", kind: "heading", chapter: 0 },
        { id: "b", text: "It was a dark night. The rain fell. Nobody came to the door, and nobody called.", kind: "paragraph", chapter: 0 },
        { id: "c", text: "Morning came at last.", kind: "paragraph", chapter: 1 },
      ],
    } as never;
    const units = productionUnits(book, defaults);
    expect(units.length).toBeGreaterThanOrEqual(2);
    expect(units.every((u) => u.status === "pending")).toBe(true);
    expect(units.at(-1)).toMatchObject({ chapter: 1, paragraphId: "c", id: "p2-u0" });
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
    const p = newProduction(book, defaults, "voice-1", 1000);
    expect(p.info).toMatchObject({ title: "Test", bookId: "b1", voice: "voice-1", created: 1000 });
    expect(p.info.id).toMatch(/^prod-[a-z0-9]+-[a-z0-9]+$/);
  });
});
