// The language a book is written in, shown as a small flag in the library.
// Detected from the text: the writing system first, then, for Latin and
// Cyrillic scripts, how often each language's most common words appear.

// Common short words that are frequent in one language and rare in the others.
const commonWords: Record<string, string> = {
  en: "the and of to that is was he it with for his you had but not her this have which",
  fr: "le les des et est une dans il pas qui pour au du ne se sur elle avec mais cette",
  es: "el los las que y en una por con para es del lo su como pero sus le muy",
  de: "der die und das ist nicht ich sie er ein eine zu den mit sich auf dem war auch",
  it: "il di che e un una per non della sono si gli lo con anche ma come ho questo",
  pt: "o os as que e um uma não do da em para com se é ao dos uma mas como",
  nl: "de het een en van ik te dat die is niet zijn op ze hij maar met voor",
  pl: "i w nie się na że z to jest do jak co ale tak już po jego był",
  tr: "ve bir bu da için ile ne çok gibi ama daha ben sen olan kadar",
  id: "yang dan di itu dengan untuk tidak ini dari dalam akan ke ada saya",
  sv: "och att det som en är på för av med inte jag han hon var till",
  da: "og at det i en til er som på de med han af for ikke var hun",
  fi: "ja on ei se että hän oli mutta niin kun ovat myös",
  la: "et in est non ad cum quod ut sed qui quae enim sunt",
  cs: "a se na je že to v s z o jsem ale jako tak by",
  ro: "și de la în nu că cu o pe se un este care mai",
  hu: "a az és hogy nem is egy de meg van volt csak",
};
const wordSets = Object.fromEntries(
  Object.entries(commonWords).map(([code, words]) => [
    code,
    new Set(words.split(" ")),
  ]),
);

function count(text: string, pattern: RegExp) {
  return text.match(pattern)?.length || 0;
}

export function detectLanguage(text: string): string {
  const letters = count(text, /\p{L}/gu);
  if (letters < 40) return "";
  const share = (pattern: RegExp) => count(text, pattern) / letters;
  if (share(/[가-힯ᄀ-ᇿ]/g) > 0.3) return "ko";
  if (share(/[぀-ヿ]/g) > 0.05) return "ja";
  if (share(/[㐀-鿿]/g) > 0.3) return "zh";
  if (share(/[฀-๿]/g) > 0.3) return "th";
  if (share(/[ঀ-৿]/g) > 0.3) return "bn";
  if (share(/[ऀ-ॿ]/g) > 0.3) return "hi";
  if (share(/[؀-ۿ]/g) > 0.3) {
    if (share(/[ٹڈڑےں]/g) > 0.005) return "ur";
    if (share(/[پچژگک]/g) > 0.01) return "fa";
    return "ar";
  }
  if (share(/[֐-׿]/g) > 0.3) return "he";
  if (share(/[Ͱ-Ͽἀ-῿]/g) > 0.3) return "el";
  if (share(/[Ѐ-ӿ]/g) > 0.3) return share(/[іїєґІЇЄҐ]/g) > 0.004 ? "uk" : "ru";
  if (share(/[ơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/giu) > 0.02)
    return "vi";
  const words = text.toLowerCase().match(/\p{L}+/gu) || [];
  let best = "";
  let bestScore = 0;
  for (const [code, set] of Object.entries(wordSets)) {
    let hits = 0;
    for (const word of words) if (set.has(word)) hits++;
    const score = hits / words.length;
    if (score > bestScore) [best, bestScore] = [code, score];
  }
  return bestScore >= 0.06 ? best : "";
}

// About 30,000 characters from across the book, so a foreign-language
// preface or quotation does not decide it.
export function detectBookLanguage(paragraphs: { text: string }[]) {
  const step = Math.max(1, Math.floor(paragraphs.length / 120));
  let sample = "";
  for (let i = 0; i < paragraphs.length && sample.length < 30_000; i += step)
    sample += paragraphs[i].text.slice(0, 600) + "\n";
  return detectLanguage(sample);
}

// Flags in public/flags (the same ones the language menu uses).
const flags: Record<string, string> = {
  en: "en",
  fr: "fr",
  es: "es",
  de: "de",
  it: "it",
  pt: "br",
  nl: "nl",
  pl: "pl",
  tr: "tr",
  id: "id",
  vi: "vn",
  ru: "ru",
  uk: "ua",
  ar: "arab",
  hi: "in",
  bn: "bd",
  th: "th",
  ja: "jp",
  ko: "kr",
  zh: "cn",
};
export function languageFlag(code: string) {
  return flags[code] || "";
}
export function languageName(code: string, interfaceLanguage: string) {
  // The interface language may be unset while it follows the system.
  for (const locale of [interfaceLanguage, "en"]) {
    try {
      const name = locale
        ? new Intl.DisplayNames([locale], { type: "language" }).of(code)
        : "";
      if (name && name !== code)
        return name[0].toLocaleUpperCase(locale) + name.slice(1);
    } catch {
      /* Unknown locale or code: try the next one. */
    }
  }
  return code.toUpperCase();
}
// Languages offered in Details, with the detected ones above.
export const bookLanguages = [
  ...Object.keys(flags),
  "sv",
  "da",
  "fi",
  "la",
  "cs",
  "ro",
  "hu",
  "el",
  "he",
  "fa",
  "ur",
];
