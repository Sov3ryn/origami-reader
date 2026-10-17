import { it, expect } from "vitest";
import { composePrompt, designError, initialBuilder, initialDesign } from "../src/voiceDesign";
it("builds a usable voice description from simple choices", () => {
  const p = composePrompt(
    { ...initialBuilder, tones: ["warm", "gravelly", "rich"], age: "older" },
    "male",
    "French",
    "Parisian",
  );
  expect(p).toContain("An older man with a clearly masculine, medium-pitched, warm, gravelly and rich voice.");
  expect(p).toContain("Speak in French with a Parisian accent.");
  expect(designError({ ...initialDesign, prompt: p })).toBe("");
  expect(composePrompt({ ...initialBuilder, tones: [] }, "unspecified", "English", "")).toContain(
    "medium-pitched, clear voice",
  );
});
