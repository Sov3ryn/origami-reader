import type { BookMeta, Preferences, Voice } from "./types";
export function startupVoice(
  prefs: Preferences,
  voices: Voice[],
  random = Math.random,
): Preferences {
  if (!prefs.randomVoiceAtStartup) return prefs;
  const matches = voices.filter(
    (v) => v.available && v.languages.includes(prefs.voiceLanguage),
  );
  const choices =
    matches.length > 1 ? matches.filter((v) => v.id !== prefs.voice) : matches;
  if (!choices.length) return prefs;
  const voice = choices[Math.floor(random() * choices.length)].id;
  return { ...prefs, voice, lastVoice: voice };
}
export type VoiceFilters = {
  query: string;
  language: string;
  gender: string;
  style: string;
  favoritesOnly: boolean;
  sort: "name" | "name-desc";
  // "current" shows voices for the selected speech model, "all" every voice,
  // anything else one engine's voices.
  model: string;
};
export const emptyVoiceFilters: VoiceFilters = {
  model: "current",
  query: "",
  language: "all",
  gender: "all",
  style: "all",
  favoritesOnly: false,
  sort: "name",
};
export function filterVoices(
  voices: Voice[],
  filters: VoiceFilters,
  favorites: string[],
): Voice[] {
  const query = filters.query.toLocaleLowerCase().trim();
  return voices
    .filter((v) =>
      (
        v.name +
        " " +
        v.description +
        " " +
        v.accent +
        " " +
        v.styles.join(" ") +
        " " +
        v.languages.join(" ")
      )
        .toLocaleLowerCase()
        .includes(query),
    )
    .filter(
      (v) =>
        filters.language === "all" || v.languages.includes(filters.language),
    )
    .filter((v) => filters.gender === "all" || v.gender === filters.gender)
    .filter((v) => filters.style === "all" || v.styles.includes(filters.style))
    .filter((v) => !filters.favoritesOnly || favorites.includes(v.id))
    .filter((v) =>
      filters.model === "current"
        ? !v.otherModel
        : filters.model === "all" || v.engine === filters.model,
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) * (filters.sort === "name" ? 1 : -1),
    );
}
// Books share one voice, so changing books never loads another voice. A book
// can opt in to its own voice from its menu in the Library.
export function bookVoice(
  meta: Pick<BookMeta, "voice" | "uniqueVoice"> | undefined,
  prefs: Pick<Preferences, "voice">,
) {
  return (meta?.uniqueVoice && meta.voice) || prefs.voice;
}
