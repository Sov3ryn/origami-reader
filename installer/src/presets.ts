import { backgrounds, defaultSceneAppearance } from "../../src/backgrounds";
import { themes } from "../../src/themes";

export const presets = backgrounds
  .filter((scene) => scene.id !== "none")
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
