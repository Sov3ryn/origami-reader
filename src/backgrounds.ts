import type { Preferences, SceneAppearance } from "./types";
import { defaultPreferences } from "./types";
import { placeSceneId, places, type Place } from "./places";

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
  fountain: "Bamboo fountain",
  gardenShadows: "Moving leaf shadows",
} as const;

export type BackgroundEffect = keyof typeof effectLabels;
export type TimeOfDay = "day" | "night";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type BackgroundDefinition = {
  id: string;
  location?: "lake" | "garden";
  name: string;
  image?: string;
  effects: readonly BackgroundEffect[];
  season?: Season;
  time?: TimeOfDay;
  // Temporary art: a filtered copy of the other half of the pair. It is used
  // until a painted version of the same composition exists at `image`.
  draft?: { from: string; filter: string };
  // A celebration or reading-milestone place, drawn by <origami-background>.
  place?: Place;
};

export const backgrounds: readonly BackgroundDefinition[] = [
  { id: "none", name: "None", effects: [] },
  {
    id: "lake",
    name: "Moonlit lake",
    image: "/moonlit-lake.webp",
    season: "spring",
    time: "night",
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
    image: "/backgrounds/spring-morning.webp",
    season: "spring",
    time: "day",
    effects: ["petals", "mist", "mountainFog", "ripples", "skyClouds"],
  },
  {
    id: "summer",
    name: "Summer evening",
    image: "/backgrounds/summer-evening.webp",
    season: "summer",
    time: "night",
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
    id: "summer-day",
    name: "Summer day",
    image: "/backgrounds/summer-day.webp",
    season: "summer",
    time: "day",
    draft: {
      from: "/backgrounds/summer-evening.webp",
      filter: "brightness(1.45) contrast(0.88) saturate(0.9)",
    },
    effects: ["fishRipples", "mountainFog", "ripples", "skyClouds"],
  },
  {
    id: "autumn",
    name: "Autumn dusk",
    image: "/backgrounds/autumn-dusk.webp",
    season: "autumn",
    time: "night",
    effects: ["leaves", "mist", "mountainFog", "ripples", "cabinLights"],
  },
  {
    id: "autumn-day",
    name: "Autumn day",
    image: "/backgrounds/autumn-day.webp",
    season: "autumn",
    time: "day",
    draft: {
      from: "/backgrounds/autumn-dusk.webp",
      filter: "brightness(1.35) contrast(0.9) saturate(0.95) hue-rotate(-6deg)",
    },
    effects: ["leaves", "mist", "mountainFog", "ripples", "skyClouds"],
  },
  {
    id: "winter",
    name: "Winter daylight",
    image: "/backgrounds/winter-daylight.webp",
    season: "winter",
    time: "day",
    effects: ["snow", "mist", "mountainFog", "ripples", "cabinLights"],
  },
  {
    id: "winter-night",
    name: "Winter night",
    image: "/backgrounds/winter-night.webp",
    season: "winter",
    time: "night",
    draft: {
      from: "/backgrounds/winter-daylight.webp",
      filter:
        "brightness(0.42) saturate(0.65) hue-rotate(12deg) contrast(1.05)",
    },
    effects: ["snow", "mist", "mountainFog", "ripples", "cabinLights"],
  },
  {
    id: "garden-spring-day",
    location: "garden",
    name: "Garden \u00b7 Spring day",
    season: "spring",
    time: "day",
    image: "/backgrounds/garden-spring.webp",
    effects: ["petals", "mist", "fountain", "gardenShadows"],
  },
  {
    id: "garden-spring-night",
    location: "garden",
    name: "Garden \u00b7 Spring night",
    season: "spring",
    time: "night",
    image: "/backgrounds/garden-spring-night.webp",
    effects: ["petals", "mist", "fountain", "gardenShadows", "cabinLights"],
    draft: {
      from: "/backgrounds/garden-spring.webp",
      filter: "brightness(0.38) saturate(0.66) hue-rotate(12deg)",
    },
  },
  {
    id: "garden-summer-day",
    location: "garden",
    name: "Garden \u00b7 Summer day",
    season: "summer",
    time: "day",
    image: "/backgrounds/garden-summer.webp",
    effects: ["gardenShadows", "mist", "fountain", "skyClouds"],
  },
  {
    id: "garden-summer-night",
    location: "garden",
    name: "Garden \u00b7 Summer night",
    season: "summer",
    time: "night",
    image: "/backgrounds/garden-summer-night.webp",
    effects: ["fireflies", "mist", "fountain", "skyClouds", "cabinLights"],
    draft: {
      from: "/backgrounds/garden-summer.webp",
      filter: "brightness(0.38) saturate(0.66) hue-rotate(12deg)",
    },
  },
  {
    id: "garden-autumn-day",
    location: "garden",
    name: "Garden \u00b7 Autumn day",
    season: "autumn",
    time: "day",
    image: "/backgrounds/garden-autumn.webp",
    effects: ["leaves", "mist", "fountain", "gardenShadows"],
  },
  {
    id: "garden-autumn-night",
    location: "garden",
    name: "Garden \u00b7 Autumn night",
    season: "autumn",
    time: "night",
    image: "/backgrounds/garden-autumn-night.webp",
    effects: ["leaves", "mist", "fountain", "gardenShadows", "cabinLights"],
    draft: {
      from: "/backgrounds/garden-autumn.webp",
      filter: "brightness(0.38) saturate(0.66) hue-rotate(12deg)",
    },
  },
  {
    id: "garden-winter-day",
    location: "garden",
    name: "Garden \u00b7 Winter day",
    season: "winter",
    time: "day",
    image: "/backgrounds/garden-winter.webp",
    effects: ["snow", "mist", "fountain", "skyClouds"],
  },
  {
    id: "garden-winter-night",
    location: "garden",
    name: "Garden \u00b7 Winter night",
    season: "winter",
    time: "night",
    image: "/backgrounds/garden-winter-night.webp",
    effects: ["snow", "mist", "fountain", "skyClouds", "cabinLights"],
    draft: {
      from: "/backgrounds/garden-winter.webp",
      filter: "brightness(0.38) saturate(0.66) hue-rotate(12deg)",
    },
  },
  { id: "paper", name: "Paper hills", effects: [] },
  ...places.map((place) => ({
    id: placeSceneId(place.id),
    name: place.title,
    image: place.image,
    effects: [],
    place,
  })),
];

export const seasons: readonly { id: Season; name: string }[] = [
  { id: "spring", name: "Spring" },
  { id: "summer", name: "Summer" },
  { id: "autumn", name: "Autumn" },
  { id: "winter", name: "Winter" },
];

export function getBackground(id: string) {
  return (
    backgrounds.find((background) => background.id === id) || backgrounds[0]
  );
}

// Painted art replaces a draft as soon as the file loads, without code changes.
const paintedArt = new Set<string>();
export async function detectPaintedArt(): Promise<boolean> {
  if (typeof Image === "undefined") return false;
  const found = await Promise.all(
    backgrounds
      .filter((b) => b.draft && b.image && !paintedArt.has(b.image))
      .map(
        (b) =>
          new Promise<boolean>((resolve) => {
            const probe = new Image();
            probe.onload = () => {
              paintedArt.add(b.image!);
              resolve(true);
            };
            probe.onerror = () => resolve(false);
            probe.src = b.image!;
          }),
      ),
  );
  return found.some(Boolean);
}
export function backgroundImage(background: BackgroundDefinition) {
  if (!background.image) return undefined;
  if (isDraftArt(background))
    return { url: background.draft!.from, filter: background.draft!.filter };
  return { url: background.image, filter: undefined };
}
export function isDraftArt(background: BackgroundDefinition) {
  return Boolean(
    background.draft && background.image && !paintedArt.has(background.image),
  );
}

export function sceneFor(
  season: Season,
  time: TimeOfDay,
  location: "lake" | "garden" = "lake",
) {
  return (
    backgrounds.find(
      (b) =>
        b.season === season &&
        b.time === time &&
        (b.location || "lake") === location,
    )?.id || "lake"
  );
}
export function sceneTime(scene: string): TimeOfDay {
  return getBackground(scene).time || "night";
}
// The other half of a day/night pair, or null for None and Paper hills.
export function counterpart(scene: string) {
  const b = getBackground(scene);
  if (!b.season || !b.time) return null;
  return sceneFor(b.season, b.time === "day" ? "night" : "day", b.location);
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
    pageBrightness: prefs.pageBrightness,
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
    fountain: prefs.fountain,
    gardenShadows: prefs.gardenShadows,
  };
}

const sceneDefaults: Record<string, Partial<SceneAppearance>> = {
  lake: { theme: "plum", surface: "dark", backgroundOpacity: 0.5 },
  spring: { theme: "forest", surface: "parchment", backgroundOpacity: 0.5 },
  "summer-day": { theme: "sage", surface: "paper", backgroundOpacity: 0.7 },
  summer: { theme: "burgundy", surface: "parchment", backgroundOpacity: 0.6 },
  "autumn-day": {
    theme: "parchment",
    surface: "parchment",
    backgroundOpacity: 0.7,
  },
  autumn: { theme: "copper", surface: "parchment", backgroundOpacity: 0.65 },
  winter: { theme: "white", surface: "paper", backgroundOpacity: 0.85 },
  "winter-night": {
    theme: "graphite",
    surface: "dark",
    backgroundOpacity: 0.55,
  },
};

export function defaultSceneAppearance(scene: string): SceneAppearance {
  const garden = getBackground(scene);
  return {
    ...sceneAppearance(defaultPreferences),
    ...sceneDefaults[scene],
    ...(garden.location === "garden"
      ? {
          theme:
            garden.time === "night"
              ? "plum"
              : garden.season === "autumn"
                ? "copper"
                : garden.season === "winter"
                  ? "graphite"
                  : "forest",
          backgroundOpacity: 0.7,
        }
      : {}),
  };
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
    ...(sceneDefaults[target] || getBackground(target).location === "garden"
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
): Season {
  const offset = hemisphere === "south" ? 6 : 0;
  const month = (date.getMonth() + offset) % 12;
  return (["winter", "spring", "summer", "autumn"] as const)[
    Math.floor(((month + 1) % 12) / 3)
  ];
}

const minutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
// Local clock or the operating system appearance, with no location access.
export function desiredTime(
  prefs: Pick<Preferences, "timeMode" | "dayStarts" | "nightStarts">,
  date = new Date(),
  systemDark = typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches,
): TimeOfDay | null {
  if (prefs.timeMode === "system") return systemDark ? "night" : "day";
  if (prefs.timeMode === "clock") {
    const now = date.getHours() * 60 + date.getMinutes();
    const day = minutes(prefs.dayStarts);
    const night = minutes(prefs.nightStarts);
    const isDay =
      day <= night ? now >= day && now < night : now >= day || now < night;
    return isDay ? "day" : "night";
  }
  return null;
}
export function applyTimeOfDay(
  prefs: Preferences,
  date = new Date(),
  systemDark?: boolean,
): Preferences {
  const time = desiredTime(prefs, date, systemDark);
  const target = counterpart(prefs.scene);
  if (!time || !target || sceneTime(prefs.scene) === time) return prefs;
  return switchBackground(prefs, target);
}
// The Sun/Moon button keeps the season and swaps the time of day.
export function toggleTimeOfDay(prefs: Preferences): Preferences {
  const target = counterpart(prefs.scene);
  if (!target) return prefs;
  return { ...switchBackground(prefs, target), timeMode: "manual" };
}

export function startupBackground(
  prefs: Preferences,
  date = new Date(),
  random = Math.random,
): Preferences {
  const time = desiredTime(prefs, date) || sceneTime(prefs.scene);
  if (prefs.backgroundMode === "seasonal") {
    return switchBackground(
      prefs,
      sceneFor(
        seasonalScene(date, prefs.seasonHemisphere),
        time,
        getBackground(prefs.scene).location,
      ),
    );
  }
  if (prefs.backgroundMode === "random") {
    const current = getBackground(prefs.scene).season;
    const candidates = seasons.filter((s) => s.id !== current);
    return switchBackground(
      prefs,
      sceneFor(
        candidates[Math.floor(random() * candidates.length)].id,
        time,
        getBackground(prefs.scene).location,
      ),
    );
  }
  return applyTimeOfDay(prefs, date);
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
    next = switchBackground(
      next,
      sceneFor(
        seasonalScene(date, next.seasonHemisphere),
        desiredTime(next, date) || sceneTime(next.scene),
        getBackground(next.scene).location,
      ),
    );
  }
  if (patch.timeMode || patch.dayStarts || patch.nightStarts)
    next = applyTimeOfDay(next, date);
  return next;
}
