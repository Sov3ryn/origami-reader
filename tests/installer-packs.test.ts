import { expect, it } from "vitest";
import { packageLanguages } from "../installer/src/model";

it("setup offers only packaged voices and uses actual counts", () => {
  expect(
    packageLanguages([
      { group: "voices-en", path: "voices/en/alistair.wav" },
      { group: "voices-en", path: "voices/en/maeve.wav" },
      { group: "core", path: "voice-catalog.json" },
      { group: "speech", path: "models/multilingual.safetensors" },
    ]),
  ).toEqual([
    { id: "en", name: "English", native: "English", count: 2, glyph: "Aa" },
  ]);
  expect(packageLanguages([])).toEqual([]);
});
