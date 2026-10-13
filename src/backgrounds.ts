import type { Preferences, SceneAppearance } from "./types";
import { defaultPreferences } from "./types";

export const effectLabels = {
  mist: "Drifting mist",
  petals: "Windblown petals",
  mountainFog: "Mountain fog",
  ripples: "Lake ripples",
  cabinLights: "Cabin lights",
  moonCloud: "Cloud across the moon",
  skyClouds: "High drifting clouds",
  fireflies: "Fireflies",
  fishRipples: "Fish feeding ripples",
  leaves: "Windblown leaves",
  snow: "Light snowfall",
} as const;

export type BackgroundEffect = keyof typeof effectLabels;
export type BackgroundDefinition = {
  id: string;
  name: string;
  image?: string;
  effects: readonly BackgroundEffect[];
};

export const backgrounds: readonly BackgroundDefinition[] = [
  { id: "none", name: "None", effects: [] },
  {
    id: "lake",
    name: "Moonlit lake",
    image: "/moonlit-lake.png",
    effects: [
      "mist",
      "petals",
      "mountainFog",
      "ripples",
      "cabinLights",
      "moonCloud",
    ],
  },
  {
    id: "spring",
    name: "Spring morning",
    image: "/backgrounds/spring-morning.png",
    effects: ["petals", "mist", "mountainFog", "ripples", "skyClouds"],
  },
  {
    id: "summer",
    name: "Summer evening",
    image: "/backgrounds/summer-evening.png",
    effects: [
      "fireflies",
      "fishRipples",
      "mountainFog",
      "ripples",
      "cabinLights",
      "moonCloud",
    ],
  },
  {
    id: "autumn",
    name: "Autumn dusk",
    image: "/backgrounds/autumn-dusk.png",
    effects: ["leaves", "mist", "mountainFog", "ripples", "cabinLights"],
  },
  {
    id: "winter",
    name: "Winter daylight",
    image: "/backgrounds/winter-daylight.png",
    effects: ["snow", "mist", "mountainFog", "ripples", "cabinLights"],
  },
  { id: "paper", name: "Paper hills", effects: [] },
];

export function getBackground(id: string) {
  return (
    backgrounds.find((background) => background.id === id) || backgrounds[0]
  );
}

export function enabledEffects(prefs: Preferences): BackgroundEffect[] {
  return prefs.motion
    ? getBackground(prefs.scene).effects.filter((key) => prefs[key])
    : [];
}

function sceneAppearance(prefs: Preferences): SceneAppearance {
  return {
    theme: prefs.theme,
    surface: prefs.surface,
    texture: prefs.texture,
    backgroundOpacity: prefs.backgroundOpacity,
    motion: prefs.motion,
    mist: prefs.mist,
    petals: prefs.petals,
    mountainFog: prefs.mountainFog,
    ripples: prefs.ripples,
    cabinLights: prefs.cabinLights,
    moonCloud: prefs.moonCloud,
    skyClouds: prefs.skyClouds,
    fireflies: prefs.fireflies,
    fishRipples: prefs.fishRipples,
    leaves: prefs.leaves,
    snow: prefs.snow,
  };
}

const sceneDefaults: Record<string, Partial<SceneAppearance>> = {
  lake: { theme: "plum", surface: "dark", backgroundOpacity: 0.5 },
  spring: { theme: "forest", surface: "parchment", backgroundOpacity: 0.5 },
  summer: { theme: "burgundy", surface: "parchment", backgroundOpacity: 0.6 },
  autumn: { theme: "copper", surface: "parchment", backgroundOpacity: 0.65 },
  winter: { theme: "white", surface: "paper", backgroundOpacity: 0.85 },
};

export function defaultSceneAppearance(scene: string): SceneAppearance {
  return { ...sceneAppearance(defaultPreferences), ...sceneDefaults[scene] };
}

export function switchBackground(
  prefs: Preferences,
  scene: string,
): Preferences {
  const target = getBackground(scene).id;
  if (target === prefs.scene) return prefs;
  const scenePreferences = {
    ...prefs.scenePreferences,
    [prefs.scene]: sceneAppearance(prefs),
  };
  return {
    ...prefs,
    ...(sceneDefaults[target]
      ? defaultSceneAppearance(target)
      : sceneAppearance(prefs)),
    ...scenePreferences[target],
    scene: target,
    scenePreferences,
  };
}

// Local calendar months, with no location lookup or network access.
export function seasonalScene(
  date: Date,
  hemisphere: Preferences["seasonHemisphere"],
) {
  const offset = hemisphere === "south" ? 6 : 0;
  const month = (date.getMonth() + offset) % 12;
  return ["winter", "spring", "summer", "autumn"][
    Math.floor(((month + 1) % 12) / 3)
  ];
}

export function startupBackground(
  prefs: Preferences,
  date = new Date(),
  random = Math.random,
): Preferences {
  if (prefs.backgroundMode === "seasonal") {
    return switchBackground(prefs, seasonalScene(date, prefs.seasonHemisphere));
  }
  if (prefs.backgroundMode === "random") {
    const candidates = backgrounds.filter(
      (b) => b.image && b.id !== prefs.scene,
    );
    return switchBackground(
      prefs,
      candidates[Math.floor(random() * candidates.length)].id,
    );
  }
  return prefs;
}

export function changeAppearance(
  prefs: Preferences,
  patch: Partial<Preferences>,
  date = new Date(),
): Preferences {
  let next = {
    ...(patch.scene ? switchBackground(prefs, patch.scene) : prefs),
    ...patch,
  };
  if (
    next.backgroundMode === "seasonal" &&
    (patch.backgroundMode || patch.seasonHemisphere)
  ) {
    next = switchBackground(next, seasonalScene(date, next.seasonHemisphere));
  }
  return next;
}
