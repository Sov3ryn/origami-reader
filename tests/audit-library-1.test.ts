import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openSceneDefaults, switchBackground } from "../src/backgrounds";
import { achievements } from "../src/achievements";
import { achievementEarned, rewardsOf } from "../src/rewards";
import { shortcutTarget } from "../src/components/Shortcuts";
import { defaultPreferences, emptyReadingStats } from "../src/types";

describe("scene defaults and locked themes", () => {
  // Shows the locks as a new reader sees them in a development run.
  beforeEach(() => localStorage.setItem("origami.devLocks", "1"));
  afterEach(() => localStorage.removeItem("origami.devLocks"));

  it("keeps the current theme when the scene's theme is locked", () => {
    const prefs = { ...defaultPreferences, scene: "lake", theme: "plum" };
    expect(openSceneDefaults("spring", prefs).theme).toBe("plum");
    expect(switchBackground(prefs, "spring").theme).toBe("plum");
  });

  it("uses the scene's theme once it is earned", () => {
    const prefs = {
      ...defaultPreferences,
      scene: "lake",
      theme: "plum",
      readingStats: { ...emptyReadingStats, unlocked: ["theme:forest"] },
    };
    expect(switchBackground(prefs, "spring").theme).toBe("forest");
  });

  it("still restores a theme saved for that scene", () => {
    const prefs = {
      ...defaultPreferences,
      scene: "lake",
      theme: "plum",
      scenePreferences: {
        spring: { ...openSceneDefaults("spring", defaultPreferences), theme: "copper" },
      },
    };
    expect(switchBackground(prefs, "spring").theme).toBe("copper");
  });
});

describe("finished-book achievements", () => {
  const theEnd = achievements.find((a) => a.metric === "completedBooks" && rewardsOf(a).length > 0)!;

  it("stay earned after the finished count drops, when the rewards were kept", () => {
    const stats = { ...emptyReadingStats, unlocked: rewardsOf(theEnd) };
    expect(achievementEarned(theEnd, stats, 0)).toBe(true);
    expect(achievementEarned(theEnd, emptyReadingStats, 0)).toBe(false);
  });

  it("do not apply to other goals", () => {
    const other = achievements.find((a) => a.metric === "activeSeconds" && rewardsOf(a).length > 0)!;
    const stats = { ...emptyReadingStats, unlocked: rewardsOf(other) };
    expect(achievementEarned(other, stats, 0)).toBe(false);
  });
});

describe("shortcuts inside dialogs", () => {
  it("ignores keys typed anywhere in a dialog", () => {
    document.body.innerHTML =
      '<div role="dialog"><input type="checkbox" id="agree"></div><input type="checkbox" id="page">';
    const key = (id: string) => {
      const event = new KeyboardEvent("keydown", { key: " " });
      Object.defineProperty(event, "target", { value: document.getElementById(id) });
      return event;
    };
    expect(shortcutTarget(key("agree"))).toBe(false);
    expect(shortcutTarget(key("page"))).toBe(true);
  });
});
