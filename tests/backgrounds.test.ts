import { describe, expect, it } from "vitest";
import {
  changeAppearance,
  defaultSceneAppearance,
  seasonalScene,
  startupBackground,
  switchBackground,
} from "../src/backgrounds";
import { defaultPreferences } from "../src/types";

describe("background selection", () => {
  it("uses local calendar seasons in both hemispheres, including every boundary", () => {
    const northern = [
      "winter",
      "winter",
      "spring",
      "spring",
      "spring",
      "summer",
      "summer",
      "summer",
      "autumn",
      "autumn",
      "autumn",
      "winter",
    ];
    for (let month = 0; month < 12; month++) {
      const date = new Date(2026, month, 1);
      expect(seasonalScene(date, "north")).toBe(northern[month]);
      expect(seasonalScene(date, "south")).toBe(northern[(month + 6) % 12]);
    }
  });

  it("applies the screenshot defaults to unvisited scenes and remembers custom surfaces", () => {
    let prefs = { ...defaultPreferences };
    for (const [scene, theme, surface, opacity] of [
      ["spring", "forest", "parchment", 0.5],
      ["summer", "burgundy", "parchment", 0.6],
      ["autumn", "copper", "parchment", 0.65],
      ["winter", "white", "paper", 0.85],
      ["lake", "plum", "dark", 0.5],
    ] as const) {
      prefs = switchBackground(prefs, scene);
      expect(prefs).toMatchObject({
        theme,
        surface,
        backgroundOpacity: opacity,
        texture: true,
        motion: true,
      });
    }
    prefs = {
      ...prefs,
      theme: "forest",
      surface: "light",
      texture: false,
      backgroundOpacity: 0.73,
      fishRipples: false,
    };
    prefs = switchBackground(switchBackground(prefs, "summer"), "lake");
    expect(prefs).toMatchObject({
      theme: "forest",
      surface: "light",
      texture: false,
      backgroundOpacity: 0.73,
      fishRipples: false,
    });
  });

  it("merges legacy profiles with the new defaults without discarding customization", () => {
    const saved = JSON.parse(
      '{"scenePreferences":{"winter":{"theme":"copper","backgroundOpacity":0.3,"motion":false}}}',
    );
    const prefs = switchBackground(
      { ...defaultPreferences, ...saved },
      "winter",
    );
    expect(prefs).toMatchObject({
      theme: "copper",
      backgroundOpacity: 0.3,
      motion: false,
      surface: "paper",
      fishRipples: true,
    });
  });

  it("randomizes among other seasons once at startup and keeps the time of day", () => {
    const prefs = { ...defaultPreferences, backgroundMode: "random" as const };
    const choices = [0, 0.4, 0.999].map(
      (value) => startupBackground(prefs, new Date(), () => value).scene,
    );
    // The default Moonlit lake is spring at night.
    expect(choices).toEqual(["summer", "autumn", "winter-night"]);
    const started = startupBackground(prefs, new Date(), () => 0.5);
    expect(changeAppearance(started, { fontSize: 24 }).scene).toBe("autumn");
    expect(startupBackground(defaultPreferences)).toBe(defaultPreferences);
  });

  it("applies seasonal selection immediately, restores profiles, and allows manual override", () => {
    const date = new Date(2026, 9, 12);
    const custom = {
      ...switchBackground(defaultPreferences, "autumn"),
      theme: "forest",
      backgroundOpacity: 0.72,
    };
    let prefs = switchBackground(custom, "lake");
    prefs = changeAppearance(prefs, { backgroundMode: "seasonal" }, date);
    expect(prefs).toMatchObject({
      scene: "autumn",
      theme: "forest",
      backgroundOpacity: 0.72,
    });
    prefs = changeAppearance(prefs, { seasonHemisphere: "south" }, date);
    // Spring in the south, still at night: the Moonlit lake.
    expect(prefs.scene).toBe("lake");
    prefs = changeAppearance(
      prefs,
      { scene: "summer", backgroundMode: "manual" },
      date,
    );
    expect(startupBackground(prefs, date)).toBe(prefs);
    prefs = changeAppearance(
      { ...prefs, motion: false },
      defaultSceneAppearance("summer"),
      date,
    );
    expect(prefs).toMatchObject({
      scene: "summer",
      backgroundMode: "manual",
      motion: true,
      theme: "burgundy",
      backgroundOpacity: 0.6,
    });
  });
});
