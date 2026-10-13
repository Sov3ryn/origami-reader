import { describe, it, expect } from "vitest";
import { filterVoices, emptyVoiceFilters } from "../src/voiceCatalog";
import { startupVoice } from "../src/voiceCatalog";
import { defaultPreferences } from "../src/types";
import type { Voice } from "../src/types";
const base = { description: "", available: true, engine: "test", accent: "" };
it("random startup voices stay inside the last selected language and require availability", () => {
  const candidates = [
    { ...base, id: "english", languages: ["English"] },
    { ...base, id: "french1", languages: ["French"] },
    { ...base, id: "french2", languages: ["French", "English"] },
    { ...base, id: "offline", languages: ["French"], available: false },
  ] as Voice[];
  const prefs = {
    ...defaultPreferences,
    voice: "french1",
    voiceLanguage: "French",
    randomVoiceAtStartup: true,
  };
  expect(startupVoice(prefs, candidates, () => 0)).toMatchObject({
    voice: "french2",
    lastVoice: "french2",
    voiceLanguage: "French",
  });
  expect(
    startupVoice({ ...prefs, voiceLanguage: "Japanese" }, candidates),
  ).toMatchObject({ voice: "french1" });
  expect(startupVoice(defaultPreferences, candidates)).toBe(defaultPreferences);
});
const voices: Voice[] = [
  {
    ...base,
    id: "1",
    name: "A",
    languages: ["English", "French"],
    gender: "female",
    styles: ["Calm"],
  },
  {
    ...base,
    id: "2",
    name: "B",
    languages: ["English"],
    gender: "male",
    styles: ["Narration", "Calm"],
  },
  {
    ...base,
    id: "3",
    name: "C",
    languages: ["French"],
    gender: "unspecified",
    styles: ["Expressive"],
  },
];
describe("voice catalog metadata", () => {
  it("combines language, gender and style", () => {
    expect(
      filterVoices(
        voices,
        {
          ...emptyVoiceFilters,
          language: "English",
          gender: "male",
          style: "Calm",
        },
        [],
      ).map((v) => v.id),
    ).toEqual(["2"]);
  });
  it("supports multilingual profiles and favorites", () => {
    expect(
      filterVoices(
        voices,
        { ...emptyVoiceFilters, language: "French", favoritesOnly: true },
        ["1"],
      ).map((v) => v.id),
    ).toEqual(["1"]);
  });
  it("does not infer unspecified gender and keeps input ordering intact", () => {
    expect(
      filterVoices(voices, { ...emptyVoiceFilters, gender: "female" }, []).map(
        (v) => v.id,
      ),
    ).toEqual(["1"]);
    expect(
      filterVoices(voices, { ...emptyVoiceFilters, sort: "name-desc" }, []).map(
        (v) => v.id,
      ),
    ).toEqual(["3", "2", "1"]);
    expect(voices[0].id).toBe("1");
  });
});
