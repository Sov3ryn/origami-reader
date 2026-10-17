// Interface translations. English text is the key, so untranslated strings
// fall back to English instead of showing an identifier. Book text and
// speech voices are never translated.
export type Language = {
  code: string;
  name: string; // English name
  native: string;
  // File in /flags for a country commonly associated with the language, or
  // empty for a neutral badge with the language code.
  flag: string;
  dir?: "rtl";
};

export const languages: readonly Language[] = [
  // English: a split United Kingdom and United States flag (public/flags/en.svg).
  { code: "en", name: "English", native: "English", flag: "en" },
  {
    code: "zh-CN",
    name: "Chinese (Simplified)",
    native: "简体中文",
    flag: "cn",
  },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "in" },
  { code: "es", name: "Spanish", native: "Español", flag: "es" },
  { code: "fr", name: "French", native: "Français", flag: "fr" },
  { code: "ar", name: "Arabic", native: "العربية", flag: "arab", dir: "rtl" },
  { code: "bn", name: "Bengali", native: "বাংলা", flag: "bd" },
  {
    code: "pt-BR",
    name: "Portuguese (Brazil)",
    native: "Português (Brasil)",
    flag: "br",
  },
  { code: "ru", name: "Russian", native: "Русский", flag: "ru" },
  { code: "ja", name: "Japanese", native: "日本語", flag: "jp" },
  { code: "de", name: "German", native: "Deutsch", flag: "de" },
  { code: "ko", name: "Korean", native: "한국어", flag: "kr" },
  { code: "tr", name: "Turkish", native: "Türkçe", flag: "tr" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", flag: "vn" },
  { code: "it", name: "Italian", native: "Italiano", flag: "it" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", flag: "id" },
  { code: "pl", name: "Polish", native: "Polski", flag: "pl" },
  { code: "uk", name: "Ukrainian", native: "Українська", flag: "ua" },
  { code: "nl", name: "Dutch", native: "Nederlands", flag: "nl" },
  { code: "th", name: "Thai", native: "ไทย", flag: "th" },
];

type Catalog = Record<string, string>;
// Each locale is a separate chunk, loaded only when chosen.
const loaders = import.meta.glob<Catalog>(
  ["./locales/*.json", "!./locales/source.json"],
  { import: "default" },
);

// Kept on globalThis so a development hot reload of this module (for example
// while locale files change) keeps the chosen language.
const state = ((
  globalThis as { __origamiI18n?: { current: string; catalog: Catalog } }
).__origamiI18n ??= { current: "en", catalog: {} });

// Best match for the operating system's preferred languages.
export function detectLanguage(
  preferred: readonly string[] = typeof navigator === "undefined"
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language],
): string {
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    const exact = languages.find((l) => l.code.toLowerCase() === lower);
    if (exact) return exact.code;
    const base = lower.split("-")[0];
    if (base === "zh" && /hant|tw|hk|mo/.test(lower)) continue;
    if (base === "pt") return "pt-BR";
    const match = languages.find((l) => l.code.split("-")[0] === base);
    if (match) return match.code;
  }
  return "en";
}

export function getLanguage(code: string) {
  return languages.find((l) => l.code === code) || languages[0];
}

export async function loadLanguage(code: string) {
  const language = getLanguage(code);
  if (language.code === "en") {
    state.catalog = {};
  } else {
    const load = loaders[`./locales/${language.code}.json`];
    // A missing or unreadable translation falls back to English text.
    state.catalog = load ? await load().catch(() => ({})) : {};
  }
  state.current = language.code;
  if (typeof document !== "undefined") {
    document.documentElement.lang = language.code;
    document.documentElement.dir = language.dir || "ltr";
  }
  return language.code;
}

export function currentLanguage() {
  return state.current;
}

// t("Sleep timer: {minutes} min left", { minutes: 12 })
export function t(text: string, values?: Record<string, string | number>) {
  let out = state.catalog[text] || text;
  if (values)
    out = out.replace(/\{(\w+)\}/g, (match, key) =>
      key in values ? String(values[key]) : match,
    );
  return out;
}

// Numbers and plural-free counts formatted for the interface language.
export function formatNumber(n: number) {
  return n.toLocaleString(state.current);
}
