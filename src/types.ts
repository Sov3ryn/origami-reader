export type Page = "library" | "reader" | "bookmarks" | "voices" | "settings";
export type InspectorTab =
  "selection" | "notes" | "voice" | "appearance" | "document";
export type Paragraph = {
  id: string;
  text: string;
  kind: "heading" | "paragraph";
  chapter: number;
};
export type BookMeta = {
  id: string;
  title: string;
  author: string;
  format: string;
  added: number;
  opened: number;
  position: number;
  paragraphCount: number;
  wordCount: number;
  collection: string;
  favorite: boolean;
  deleted: boolean;
  cover: string;
  voice: string;
  sourceHash: string;
};
export type Book = { meta: BookMeta; paragraphs: Paragraph[] };
export type Annotation = {
  id: string;
  bookId: string;
  paragraphId: string;
  start: number;
  end: number;
  quote: string;
  kind: "note" | "underline" | "bookmark";
  color: string;
  text: string;
  group: string;
  created: number;
};
export type TextSelection = {
  paragraphId: string;
  start: number;
  end: number;
  text: string;
};
export type Preferences = {
  theme: string;
  surface: string;
  texture: boolean;
  scene: string;
  backgroundMode: "manual" | "seasonal" | "random";
  seasonHemisphere: "north" | "south";
  scenePreferences: Record<string, SceneAppearance>;
  backgroundOpacity: number;
  motion: boolean;
  mist: boolean;
  petals: boolean;
  mountainFog: boolean;
  ripples: boolean;
  cabinLights: boolean;
  moonCloud: boolean;
  skyClouds: boolean;
  fireflies: boolean;
  fishRipples: boolean;
  leaves: boolean;
  snow: boolean;
  fontSize: number;
  lineHeight: number;
  pageWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  inspector: InspectorTab;
  leftWidth: number;
  rightWidth: number;
  speed: number;
  volume: number;
  voice: string;
  follow: boolean;
  preloadAtStartup: boolean;
  lastVoice: string;
  voiceFavorites: string[];
};
export type SceneAppearance = Pick<
  Preferences,
  | "theme"
  | "surface"
  | "texture"
  | "backgroundOpacity"
  | "motion"
  | "mist"
  | "petals"
  | "mountainFog"
  | "ripples"
  | "cabinLights"
  | "moonCloud"
  | "skyClouds"
  | "fireflies"
  | "fishRipples"
  | "leaves"
  | "snow"
>;
export type Voice = {
  id: string;
  name: string;
  description: string;
  available: boolean;
  engine: string;
  languages: string[];
  gender: "female" | "male" | "unspecified";
  styles: string[];
  accent: string;
};
export type SpeechResult = { audio: string; rate: number; duration: number };
export const defaultPreferences: Preferences = {
  theme: "plum",
  surface: "dark",
  texture: true,
  scene: "lake",
  backgroundMode: "manual",
  seasonHemisphere: "north",
  scenePreferences: {},
  backgroundOpacity: 0.5,
  motion: true,
  mist: true,
  petals: true,
  mountainFog: true,
  ripples: true,
  cabinLights: true,
  moonCloud: true,
  skyClouds: true,
  fireflies: true,
  fishRipples: true,
  leaves: true,
  snow: true,
  fontSize: 21,
  lineHeight: 1.8,
  pageWidth: 850,
  leftOpen: true,
  rightOpen: false,
  inspector: "appearance",
  leftWidth: 218,
  rightWidth: 310,
  speed: 1,
  volume: 0.8,
  voice: "maeve-crimson-desert",
  follow: true,
  preloadAtStartup: true,
  lastVoice: "",
  voiceFavorites: [],
};
