import type { Preferences, SceneAppearance } from "./types";

export const effectLabels = {
  mist: "Drifting mist",
  petals: "Windblown petals",
  mountainFog: "Mountain fog",
  ripples: "Lake ripples",
  cabinLights: "Cabin lights",
  moonCloud: "Cloud across the moon",
  skyClouds: "High drifting clouds",
  fireflies: "Fireflies",
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

export function switchBackground(
  prefs: Preferences,
  scene: string,
): Preferences {
  if (scene === prefs.scene) return prefs;
  const current: SceneAppearance = {
    theme: prefs.theme,
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
    leaves: prefs.leaves,
    snow: prefs.snow,
  };
  const scenePreferences = {
    ...prefs.scenePreferences,
    [prefs.scene]: current,
  };
  return { ...prefs, ...scenePreferences[scene], scene, scenePreferences };
}
