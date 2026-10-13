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
  backgroundOpacity: number;
  motion: boolean;
  mist: boolean;
  petals: boolean;
  mountainFog: boolean;
  ripples: boolean;
  cabinLights: boolean;
  moonCloud: boolean;
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
  voiceFavorites: string[];
};
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
  surface: "paper",
  texture: true,
  scene: "lake",
  backgroundOpacity: 0.21,
  motion: true,
  mist: true,
  petals: true,
  mountainFog: true,
  ripples: true,
  cabinLights: true,
  moonCloud: true,
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
  voiceFavorites: [],
};
