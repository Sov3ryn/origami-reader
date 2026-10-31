import type { Binding } from "./binding";
export type Page = "library" | "reader" | "bookmarks" | "voices" | "achievements" | "settings";
export type InspectorTab =
  "selection" | "notes" | "voice" | "appearance" | "document";
export type Paragraph = {
  id: string;
  text: string;
  kind: "heading" | "paragraph";
  chapter: number;
  headingLevel?: number;
  quote?: boolean;
  align?: "center" | "right";
  spokenEdits?: SpokenEdit[];
};
export type SpokenEdit = { start: number; end: number; text: string };
export type BookMeta = {
  id: string;
  title: string;
  author: string;
  format: string;
  added: number;
  opened: number;
  position: number;
  positionOffset?: number;
  bookmarkId?: string;
  paragraphCount: number;
  wordCount: number;
  collection: string;
  favorite: boolean;
  deleted: boolean;
  deletedAt?: number;
  cover: string;
  coverImage?: string;
  coverOrigin?: "imported" | "custom" | "generated";
  coverText?: "auto" | "show" | "hide";
  // Lettering of the title on the cover (coverTitles.ts); unset is automatic.
  titleStyle?: string;
  titleInk?: string;
  finished?: boolean;
  // Kept for books that use their own voice; others follow the shared voice.
  voice: string;
  uniqueVoice?: boolean;
  // This book's own binding in book mode (binding.ts), over the one for all books.
  binding?: Partial<Binding>;
  // Reading comfort settings used only for this book.
  comfort?: Partial<
    Pick<
      Preferences,
      | "readerFont"
      | "fontSize"
      | "lineHeight"
      | "letterSpacing"
      | "wordSpacing"
      | "textTone"
      | "justify"
      | "hyphenate"
      | "focusTool"
    >
  >;
  sourceHash: string;
  genres?: string[];
  // Language code such as "en" or "ko"; empty when it could not be told.
  language?: string;
  // False after the reader deletes this book's cover, so automatic artwork
  // does not bring it back. Generating or importing one still works.
  autoCover?: boolean;
  // The vault this book is locked in; its text, notes and details are stored
  // encrypted and it only appears while that vault is unlocked.
  vault?: string;
  // A source for Work Mode: imported there, or added from the book menu.
  // Work Mode shows only these by default, so leisure reading stays apart.
  work?: boolean;
  // Read aloud with this Studio production's cast and takes instead of the live voice.
  narration?: string;
  // Which library it is in; unset, its format and genres decide (libraryShelf.ts).
  shelf?: "stories" | "documents";
};
export type Book = { meta: BookMeta; paragraphs: Paragraph[] };
export type Annotation = {
  id: string;
  bookId: string;
  paragraphId: string;
  start: number;
  end: number;
  quote: string;
  // "sticky": a sticky note in the margin beside the passage.
  kind: "note" | "underline" | "bookmark" | "sticky";
  // Empty or absent keeps the original colored ribbon.
  design?: string;
  // An illustrated design held still instead of moving.
  still?: boolean;
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
export type VisualizerStyle = "bars" | "wave" | "mirror" | "pulse";

export type Preferences = {
  theme: string;
  surface: string;
  texture: boolean;
  pageBrightness: number;
  collections: string[];
  scene: string;
  backgroundMode: "manual" | "seasonal" | "random";
  seasonHemisphere: "north" | "south";
  scenePreferences: Record<string, SceneAppearance>;
  backgroundOpacity: number;
  motion: boolean;
  // Distant fireworks in the celebration places that have them.
  fireworks: boolean;
  // Reading time, days and celebrations that unlock places (see places.ts).
  readingStats: ReadingStats;
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
  fountain: boolean;
  gardenShadows: boolean;
  fontSize: number;
  lineHeight: number;
  pageWidth: number;
  readingMode: "continuous" | "paged" | "snap" | "book";
  // Book mode: the opening animation, a soft page sound, and printed-book
  // typography (justified, hyphenated, indented paragraphs).
  bookOpening: boolean;
  bookSound: boolean;
  bookTypeset: boolean;
  // The 3D book's page edges, spine and cover for all books (binding.ts);
  // a book can have its own (BookMeta.binding).
  binding: Partial<Binding>;
  // The ribbon colour of new bookmarks (an annotation colour id); empty uses
  // the highlight colour.
  ribbonColor: string;
  // New bookmarks: an illustrated design (empty for a plain ribbon), moving
  // unless bookmarkStill.
  bookmarkDesign: string;
  bookmarkStill?: boolean;
  // Set once copies saved with plain ribbons as the default were moved to the
  // animated default, so a later choice of ribbon sticks.
  bookmarksAnimatedDefault?: boolean;
  pageGap: number;
  readingProgress: "pages" | "paragraphs" | "percentage";
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
  voiceLanguage: string;
  randomVoiceAtStartup: boolean;
  autoGenerateCovers: boolean;
  autoGenerateVoicePortraits: boolean;
  // Voices whose portrait the reader deleted; automatic portraits skip them.
  portraitsRemoved: string[];
  // Every voice this app has seen installed, so removed ones can be offered
  // for download again.
  seenVoices: Record<string, { name: string; languages: string[] }>;
  showCoverText: boolean;
  libraryFilters: LibraryFilters;
  librarySort: string;
  allowMatureCovers: boolean;
  romanNumeralHeadings: boolean;
  skipSpeechMarkup: boolean;
  skipCitations: boolean;
  skipAuthorYear: boolean;
  pronunciations: PronunciationRule[];
  voiceTemperature: number;
  // Suggest a lighter reader when reading aloud keeps waiting between sentences.
  speedHints: boolean;
  // The sound visualizer beside the play button, and its style.
  visualizer: boolean;
  visualizerStyle: VisualizerStyle;
  // The "Save place and close" button in the player bar while reading.
  saveCloseButton: boolean;
  // Where that button saves the place.
  saveCloseTarget: "previous-start" | "previous-end" | "current-start" | "current-sentence";
  // Interface language code; empty follows the operating system.
  uiLanguage: string;
  // "later" means the reader chose Maybe later once; it is asked one last time.
  supportPrompt: "ask" | "later" | "never";
  supportPromptAfter: number;
  // SHA-256 of the app license text agreed to in the app (setup records its own).
  appTermsSha256: string;
  sentencePause: number;
  paragraphPause: number;
  headingPause: number;
  highlight: "sentence" | "paragraph" | "off";
  // The word being read, marked on its own (with or without the sentence).
  wordHighlight: boolean;
  readerFont: string;
  letterSpacing: number;
  wordSpacing: number;
  justify: boolean;
  hyphenate: boolean;
  uiScale: number;
  // Interface size follows the window size until the reader picks one.
  uiScaleAuto: boolean;
  timeMode: "manual" | "system" | "clock";
  dayStarts: string;
  nightStarts: string;
  trashRetentionDays: number | null;
  // Installed model versions; empty uses the configured default.
  speechModel: string;
  imageModel: string;
  // The first-launch look at this computer, used for performance defaults.
  hardware: HardwareCheck | null;
  // Keeps the speech model loaded while artwork is generated.
  keepSpeechDuringArt: boolean;
  // Collapsible groups in the inspector and Settings, by id.
  openSections: Record<string, boolean>;
  settingsCategory: string;
  // Reading text color on the page: as designed, softer, or high contrast.
  textTone: "default" | "soft" | "contrast";
  // Tracking aids: a highlighted line under the pointer, a reading strip that
  // dims the text around it, or focus on one paragraph.
  focusTool: "off" | "line" | "strip" | "paragraph";
  // Library presentation.
  libraryView: "grid" | "list";
  libraryCardSize: number;
  libraryDensity: "comfortable" | "compact";
  libraryBookmarks: boolean;
  // What each library book shows, and larger titles and author names.
  libraryCovers: boolean;
  libraryFlags: boolean;
  libraryGenres: boolean;
  libraryAuthors: boolean;
  libraryLargeText: boolean;
  // The library shown: stories or documents.
  libraryShelf: "stories" | "documents";
  // How the library page looks: "classic" or a 3D room (src/libraryThemes.ts).
  libraryTheme: string;
  // Selecting text in a book switches the inspector to the Selection tab.
  selectionOpensTab: boolean;
  // Minutes without activity before open vaults lock; 0 never.
  vaultIdleMinutes: number;
  // Work Mode (src/work): open instead of the reader, and study settings.
  workMode: boolean;
  // Studio mode (productions); exclusive with Work mode.
  studioMode?: boolean;
  // Language of the starter books, chosen in setup (an interface language code).
  starterLanguage?: string;
  studyFourButtons: boolean;
  studyNewPerDay: number;
  // "standard" (Granite 97M) or "precise" (Granite 311M) for Related notes.
  connectionsModel: string;
  // Work Mode's sources: "work" (marked for work) or "all" books.
  workSources: string;
  // "reading" (the scene and reader colours), "light" or "dark" professional.
  workTheme: string;
  // "Did you know?" tips in Work mode.
  workTips: boolean;
  // Online embeds (videos, posts, maps) in notes; off until accepted.
  onlineEmbeds: boolean;
  // Look for app updates when an update address is configured. On by default.
  autoUpdate: boolean;
  // Set once update checks were switched on for copies saved while they
  // were off by default, so a later choice to turn them off sticks.
  autoUpdateDefaultOn?: boolean;
  // Work mode plugins: which are on and the permissions granted to each.
  plugins: Record<string, { on: boolean; granted: string[] }>;
  pluginsOff: boolean;
};
export type HardwareCheck = {
  tier: "high" | "standard" | "light";
  summary: string;
  checkedAt: number;
  // False when the computer did not report its graphics or memory.
  detected?: boolean;
};
export type PronunciationRule = {
  id: string;
  from: string;
  to: string;
  bookId?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
};
export type SceneAppearance = Pick<
  Preferences,
  | "theme"
  | "surface"
  | "texture"
  | "pageBrightness"
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
  | "fountain"
  | "gardenShadows"
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
  portrait?: string;
  portraitPrompt?: string;
  portraitOrigin?: "generated" | "custom";
  portraitAppearance?: string;
  // Ready, but made for a speech model other than the selected one.
  otherModel?: boolean;
  // Made in the voice designer rather than installed with Origami.
  created?: boolean;
  // In the voice library, not on this computer yet (with its download size).
  store?: boolean;
  size?: number;
  // Library voices read by Qwen3-TTS, which is not on this computer yet.
  needsQwen?: boolean;
};
export type LibraryFilters = {
  author: string;
  type: string;
  status: string;
  genre?: string;
};
export type SpeechResult = {
  audio: string;
  rate: number;
  duration: number;
  unvoiced?: boolean;
  // The audio's type when it is not WAV (a Studio take in FLAC).
  mime?: string;
};
// Cumulative and permanent: reading and listening time, local reading days,
// time read during each celebration, and the places already earned.
export type ReadingStats = {
  activeSeconds: number;
  readingDays: number;
  lastReadingDay: string;
  holidaySeconds: Record<string, number>;
  unlocked: string[];
  // Parts of Origami tried at least once, for achievements (feats.ts).
  feats: string[];
  // Reading seconds on lastReadingDay, and the modes used on modesDay.
  daySeconds: number;
  dayModes: string[];
  modesDay: string;
};
export const emptyReadingStats: ReadingStats = {
  activeSeconds: 0,
  readingDays: 0,
  lastReadingDay: "",
  holidaySeconds: {},
  unlocked: [],
  feats: [],
  daySeconds: 0,
  dayModes: [],
  modesDay: "",
};
export const defaultPreferences: Preferences = {
  theme: "plum",
  surface: "dark",
  texture: true,
  pageBrightness: 100,
  collections: [],
  scene: "lake",
  backgroundMode: "manual",
  seasonHemisphere: "north",
  scenePreferences: {},
  backgroundOpacity: 0.5,
  motion: true,
  fireworks: true,
  readingStats: emptyReadingStats,
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
  fountain: true,
  gardenShadows: true,
  fontSize: 21,
  lineHeight: 1.8,
  pageWidth: 850,
  // The 3D book makes the first impression; small windows fall back to the
  // usual layout, and the reader can change it in the text menu.
  readingMode: "book",
  bookOpening: true,
  bookSound: false,
  binding: {},
  ribbonColor: "",
  bookmarkDesign: "plum-crane-ribbon",
  bookmarksAnimatedDefault: true,
  bookTypeset: true,
  pageGap: 32,
  readingProgress: "pages",
  leftOpen: true,
  rightOpen: false,
  inspector: "appearance",
  leftWidth: 240,
  rightWidth: 310,
  speed: 1,
  volume: 0.8,
  voice: "alistair-highland-scholar",
  follow: true,
  preloadAtStartup: true,
  lastVoice: "",
  voiceFavorites: [],
  voiceLanguage: "English",
  randomVoiceAtStartup: false,
  autoGenerateCovers: true,
  autoGenerateVoicePortraits: true,
  portraitsRemoved: [],
  seenVoices: {},
  showCoverText: true,
  libraryFilters: { author: "all", type: "all", status: "all", genre: "all" },
  librarySort: "recent",
  allowMatureCovers: false,
  romanNumeralHeadings: true,
  skipSpeechMarkup: true,
  skipCitations: true,
  skipAuthorYear: false,
  pronunciations: [],
  voiceTemperature: 0.9,
  speedHints: true,
  visualizer: true,
  visualizerStyle: "bars",
  saveCloseButton: true,
  saveCloseTarget: "previous-start",
  uiLanguage: "",
  supportPrompt: "ask",
  supportPromptAfter: 0,
  appTermsSha256: "",
  sentencePause: 120,
  paragraphPause: 450,
  headingPause: 800,
  highlight: "sentence",
  wordHighlight: true,
  readerFont: "book",
  letterSpacing: 0,
  wordSpacing: 0,
  justify: false,
  hyphenate: false,
  uiScale: 100,
  uiScaleAuto: true,
  timeMode: "manual",
  dayStarts: "07:00",
  nightStarts: "19:00",
  trashRetentionDays: null,
  speechModel: "",
  imageModel: "",
  hardware: null,
  keepSpeechDuringArt: false,
  openSections: {},
  settingsCategory: "general",
  textTone: "default",
  focusTool: "off",
  libraryView: "grid",
  libraryCardSize: 100,
  libraryDensity: "comfortable",
  libraryBookmarks: true,
  libraryCovers: true,
  libraryFlags: true,
  libraryGenres: true,
  libraryAuthors: true,
  libraryLargeText: false,
  libraryShelf: "stories",
  libraryTheme: "classic",
  selectionOpensTab: true,
  vaultIdleMinutes: 10,
  workMode: false,
  studyFourButtons: false,
  studyNewPerDay: 20,
  connectionsModel: "standard",
  workSources: "work",
  workTheme: "reading",
  workTips: true,
  onlineEmbeds: false,
  autoUpdate: true,
  autoUpdateDefaultOn: true,
  plugins: {},
  pluginsOff: false,
};
