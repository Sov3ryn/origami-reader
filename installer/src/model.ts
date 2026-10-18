import type { SceneAppearance } from "../../src/types";
import { presetOptions } from "./presets";
export type Platform = "windows" | "linux" | "macos";
export const platforms: { id: Platform; name: string }[] = [
  { id: "windows", name: "Windows" },
  { id: "macos", name: "macOS" },
  { id: "linux", name: "Linux" },
];
// Catalog metadata only. No recordings, model weights or application payloads are included.
export const languages = [
  { id: "en", name: "English", native: "English", count: 31, glyph: "Aa" },
  { id: "fr", name: "French", native: "Français", count: 20, glyph: "Fr" },
  { id: "ko", name: "Korean", native: "한국어", count: 10, glyph: "한" },
  { id: "hi", name: "Hindi", native: "हिन्दी", count: 10, glyph: "अ" },
  { id: "es", name: "Spanish", native: "Español", count: 3, glyph: "Ñ" },
];
export function packageLanguages(files: { group: string; path: string }[]) {
  return languages.flatMap((language) => {
    const count = files.filter(
      (file) =>
        file.group === `voices-${language.id}` && file.path.endsWith(".wav"),
    ).length;
    return count ? [{ ...language, count }] : [];
  });
}
export interface SetupOptions {
  platform: Platform;
  scope: "user" | "system";
  installPath: string;
  languages: string[];
  theme: string;
  scene: boolean;
  motion: "system" | "reduced";
  background: string;
  appearance: SceneAppearance;
  readingSurface: string;
  textSize: "standard" | "large";
  paperTexture: boolean;
  speech: boolean;
  speechModel: "default";
  // Download AMD's ROCm PyTorch so speech runs on a supported Radeon card.
  amdSpeech: boolean;
  coverModel: boolean;
  portraitModel: boolean;
  // Kitten Mini, Kitten Micro and Kokoro: built-in voices for any computer.
  lightVoices: boolean;
  // SD-Turbo: fast covers and portraits on modest computers.
  turboModel: boolean;
  // Qwen3-TTS 1.7B beside 0.6B, for strong NVIDIA cards (optional download).
  largeModel: boolean;
  // Qwen VoiceDesign 1.7B, the voice designer's model (optional download).
  voiceDesign: boolean;
  shortcuts: boolean;
  updates: boolean;
  startOnLogin: boolean;
  // Start menu (Windows), Dock (macOS) or applications menu (Linux).
  startMenu: boolean;
  // Interface language code; empty follows the operating system.
  uiLanguage: string;
  // Language of the six starter books; empty follows the interface language.
  starterLanguage: string;
}
export function defaultPath(
  platform: Platform,
  scope: SetupOptions["scope"],
): string {
  if (platform === "windows")
    return scope === "user"
      ? "%LOCALAPPDATA%\\Programs\\Origami"
      : "C:\\Program Files\\Origami";
  if (platform === "macos")
    return scope === "user"
      ? "~/Applications/Origami.app"
      : "/Applications/Origami.app";
  return scope === "user" ? "~/.local/share/origami" : "/opt/origami";
}
export function pathError(platform: Platform, path: string): string {
  const value = path.trim();
  if (!value) return "Enter an installation folder.";
  if (/[\u0000-\u001f]/.test(value) || value.split(/[\\/]/).includes(".."))
    return "Use a folder path without control characters or parent-directory segments.";
  if (platform === "windows") {
    if (!/^(?:[a-z]:[\\/]|%LOCALAPPDATA%[\\/])[^<>:"|?*]+$/i.test(value))
      return "Use an absolute Windows folder, such as C:\\Apps\\Origami.";
    if (/^[a-z]:[\\/]\s*$/i.test(value))
      return "Choose an application folder, rather than a drive root.";
  } else {
    if (!/^(?:\/|~\/).+/.test(value) || value === "~/")
      return "Use a folder starting with / or ~/ .";
    if (platform === "macos" && !value.endsWith(".app"))
      return "The macOS destination should end with Origami.app.";
  }
  return "";
}
export function initialOptions(): SetupOptions {
  const platform: Platform = /Mac/i.test(navigator.platform)
    ? "macos"
    : /Linux/i.test(navigator.platform)
      ? "linux"
      : "windows";
  return {
    platform,
    scope: "user",
    installPath: defaultPath(platform, "user"),
    languages: ["en"],
    ...presetOptions("lake"),
    motion: "system",
    textSize: "standard",
    speech: true,
    speechModel: "default",
    amdSpeech: true,
    coverModel: false,
    portraitModel: false,
    lightVoices: true,
    turboModel: false,
    largeModel: false,
    voiceDesign: false,
    shortcuts: true,
    updates: true,
    startOnLogin: false,
    startMenu: true,
    uiLanguage: "",
    starterLanguage: "",
  };
}
export function installationPlan(options: SetupOptions) {
  return {
    schemaVersion: 1,
    kind: "origami-installation-plan",
    mode: "preview",
    payloadsIncluded: false,
    ...options,
    appAppearance: {
      ...options.appearance,
      scene: options.background,
      backgroundMode: "manual",
      motion: options.motion !== "reduced" && options.appearance.motion,
    },
    installPath: options.installPath.trim(),
    components: [
      "reader",
      ...(options.speech ? ["local-speech"] : []),
      ...(options.coverModel ? ["cover-generation"] : []),
      ...(options.portraitModel ? ["portrait-generation"] : []),
      ...(options.lightVoices ? ["light-speech"] : []),
      ...(options.turboModel ? ["fast-image-generation"] : []),
    ],
    packages: [
      ...options.languages.map((id) => `voices-${id}`),
      ...(options.speech ? [`tts-${options.speechModel}`] : []),
      ...(options.coverModel ? ["model-book-covers"] : []),
      ...(options.portraitModel ? ["model-portraits"] : []),
    ].map((id) => ({
      id,
      version: null,
      sizeBytes: null,
      sha256: null,
    })),
    requiresNativeValidation: [
      "path-expansion",
      "permissions",
      "free-space",
      "package-integrity",
      "runtime-compatibility",
    ],
  };
}
