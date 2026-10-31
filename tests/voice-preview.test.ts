import { describe, expect, it } from "vitest";
import { createPreviewPicker, voicePreviewTips } from "../src/voicePreview";

describe("spoken feature previews", () => {
  it("covers every tip before repeating, including when switching voices", () => {
    const pick = createPreviewPicker(() => 0.5);
    const tips = Array.from({ length: voicePreviewTips.length }, (_, i) =>
      pick({ name: i % 2 ? "Opal" : "Finn", languages: ["English"] }).split(". ").slice(1).join(". "),
    );
    expect(new Set(tips).size).toBe(voicePreviewTips.length);
    expect(new Set(tips)).toEqual(new Set(voicePreviewTips.map(t => t.English)));
    const next = pick({ name: "Opal", languages: ["English"] }).replace("Hello, I'm Opal. ", "");
    expect(next).not.toBe(tips.at(-1));
  });

  it("keeps French speech separate and leaves other supported languages intact", () => {
    const pick = createPreviewPicker(() => 0);
    const french = Array.from({ length: voicePreviewTips.length }, () => pick({ name: "Colette", languages: ["French"] }));
    expect(new Set(french)).toEqual(new Set(voicePreviewTips.map(t => `Bonjour, je suis Colette. ${t.French}`)));
    expect(pick({ name: "Anna", languages: ["German"] })).toBe("Hallo, ich bin Anna. Wollen wir ein paar Seiten zusammen lesen?");
    expect(pick({ name: "$&", languages: [] })).toContain("Hello, I'm $&. ");
  });
});
