// Reading comfort: the text settings a reader may want to change together,
// presets for a quick start, and an optional profile for a single book.
import type { BookMeta, Preferences } from "./types";

export const comfortKeys = [
  "readerFont",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTone",
  "justify",
  "hyphenate",
  "focusTool",
] as const;
export type ComfortKey = (typeof comfortKeys)[number];
export type Comfort = Pick<Preferences, ComfortKey>;

const base: Comfort = {
  readerFont: "book",
  fontSize: 21,
  lineHeight: 1.8,
  letterSpacing: 0,
  wordSpacing: 0,
  textTone: "default",
  justify: false,
  hyphenate: false,
  focusTool: "off",
};

// Starting points. Names and descriptions are translated where shown.
export const comfortPresets: {
  id: string;
  name: string;
  description: string;
  values: Comfort;
}[] = [
  {
    id: "default",
    name: "Default",
    description: "The standard book layout.",
    values: base,
  },
  {
    id: "easier",
    name: "Easier reading",
    description:
      "A dyslexia-friendly font with wider letter, word and line spacing.",
    values: {
      ...base,
      readerFont: "dyslexic",
      letterSpacing: 0.06,
      wordSpacing: 0.2,
      lineHeight: 2,
    },
  },
  {
    id: "wide",
    name: "Wide sans",
    description: "Open, wide letters with a little extra space.",
    values: {
      ...base,
      readerFont: "verdana",
      letterSpacing: 0.02,
      wordSpacing: 0.1,
      lineHeight: 1.9,
    },
  },
  {
    id: "clarity",
    name: "High clarity",
    description: "Distinct letter shapes and stronger contrast.",
    values: {
      ...base,
      readerFont: "hyperlegible",
      letterSpacing: 0.02,
      wordSpacing: 0.05,
      lineHeight: 1.9,
      textTone: "contrast",
    },
  },
  {
    id: "large",
    name: "Large print",
    description: "Bigger text with generous line spacing.",
    values: { ...base, readerFont: "sans", fontSize: 28, lineHeight: 1.9 },
  },
];

export function comfortOf(prefs: Comfort): Comfort {
  return Object.fromEntries(comfortKeys.map((k) => [k, prefs[k]])) as Comfort;
}

// The preset the current settings match exactly, if any.
export function matchingPreset(prefs: Comfort) {
  return comfortPresets.find((preset) =>
    comfortKeys.every((k) => {
      const a = preset.values[k];
      const b = prefs[k] ?? base[k];
      return typeof a === "number"
        ? Math.abs(a - (b as number)) < 0.001
        : a === b;
    }),
  );
}

// Preferences as the open book is read: a book with its own comfort profile
// overrides the shared one.
export function readingComfort(
  prefs: Preferences,
  meta?: Pick<BookMeta, "comfort">,
): Preferences {
  return meta?.comfort ? { ...prefs, ...meta.comfort } : prefs;
}

// Splits a change into comfort settings and everything else.
export function splitComfort(change: Partial<Preferences>) {
  const comfort: Partial<Comfort> = {};
  const rest: Partial<Preferences> = {};
  for (const [key, value] of Object.entries(change))
    if ((comfortKeys as readonly string[]).includes(key))
      (comfort as Record<string, unknown>)[key] = value;
    else (rest as Record<string, unknown>)[key] = value;
  return { comfort, rest };
}
