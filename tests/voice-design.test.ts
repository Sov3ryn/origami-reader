import { expect, it } from "vitest";
import {
  designError,
  designLanguages,
  designSamples,
  initialDesign,
  presetPrompt,
} from "../src/voiceDesign";
it("keeps every native-language reference inside the generator limits", () => {
  for (const language of designLanguages)
    expect(
      designError({
        ...initialDesign,
        language,
        text: designSamples[language],
      }),
    ).toBe("");
});
it("rejects unbounded generation and invalid sampling settings", () => {
  for (const patch of [
    { count: 4 },
    { count: 1.5 },
    { seed: -1 },
    { seed: NaN },
    { temperature: Infinity },
    { text: "Too short" },
    { prompt: "" },
  ])
    expect(designError({ ...initialDesign, ...patch })).not.toBe("");
});
it("presets explicitly include the chosen language and accent", () => {
  expect(presetPrompt(1, "French", "Parisian")).toContain(
    "Speak in French with a Parisian accent",
  );
});
