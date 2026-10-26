import { backgrounds, defaultSceneAppearance } from "../../src/backgrounds";
import { themes } from "../../src/themes";

// Setup offers the lake seasons and Paper hills; gardens are retired and the
// places to read are earned in the app.
export const presets = backgrounds
  .filter((scene) => scene.id !== "none" && !scene.place && scene.location !== "garden")
  .map((scene) => ({
    ...scene,
    name: scene.id === "lake" ? "Plum Nocturne" : scene.name,
    appearance: defaultSceneAppearance(scene.id),
  }));
export function getPreset(id: string) {
  return presets.find((preset) => preset.id === id) || presets[0];
}
export function presetOptions(id: string) {
  const preset = getPreset(id);
  return {
    background: preset.id,
    appearance: { ...preset.appearance },
    theme: preset.appearance.theme,
    readingSurface: preset.appearance.surface,
    paperTexture: preset.appearance.texture,
    scene: true,
  };
}
export const surfaceNames: Record<string, string> = {
  dark: "Dark textured paper",
  paper: "Light textured paper",
  parchment: "Sepia paper",
  light: "White paper",
};
export function presetTheme(id: string) {
  return (
    themes.find((theme) => theme.id === getPreset(id).appearance.theme) ||
    themes[0]
  );
}

// Places for the picker: the same scenery by day and by night (the default
// Plum Nocturne is the spring lake at night).
const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const SEASON_NAMES: Record<string, string> = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };
export type Place = { id: string; name: string; location: string; season: string; scenes: typeof presets };
export const places: Place[] = SEASONS.map((season) => ({
  id: season === "spring" ? "lake" : `lake-${season}`,
  name: `Lake \u00b7 ${SEASON_NAMES[season]}`,
  location: "Lake",
  season: SEASON_NAMES[season],
  scenes: presets.filter((p) => p.season === season),
})).filter((place) => place.scenes.length);
export const timeOf = (id: string) => getPreset(id).time || "night";
export function sceneFor(place: Place, time: string) {
  return place.scenes.find((s) => s.time === time) || place.scenes[0];
}
