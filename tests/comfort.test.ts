import { describe, expect, it } from "vitest";
import {
  comfortOf,
  comfortPresets,
  matchingPreset,
  readingComfort,
  splitComfort,
} from "../src/comfort";
import { defaultPreferences } from "../src/types";

describe("reading comfort", () => {
  it("recognizes each preset and the default settings", () => {
    expect(matchingPreset(defaultPreferences)?.id).toBe("default");
    for (const preset of comfortPresets)
      expect(
        matchingPreset({ ...defaultPreferences, ...preset.values })?.id,
      ).toBe(preset.id);
    expect(
      matchingPreset({ ...defaultPreferences, fontSize: 23 }),
    ).toBeUndefined();
  });

  it("uses a book's own profile over the shared one", () => {
    const prefs = { ...defaultPreferences, fontSize: 22, theme: "plum" };
    expect(readingComfort(prefs, {}).fontSize).toBe(22);
    const own = readingComfort(prefs, {
      comfort: { fontSize: 28, readerFont: "dyslexic" },
    });
    expect(own.fontSize).toBe(28);
    expect(own.readerFont).toBe("dyslexic");
    expect(own.theme).toBe("plum");
  });

  it("separates comfort settings from the rest of a change", () => {
    const { comfort, rest } = splitComfort({
      fontSize: 24,
      focusTool: "strip",
      surface: "dark",
    });
    expect(comfort).toEqual({ fontSize: 24, focusTool: "strip" });
    expect(rest).toEqual({ surface: "dark" });
    expect(Object.keys(comfortOf(defaultPreferences))).toContain("focusTool");
  });
});
