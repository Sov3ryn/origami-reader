import type { Voice } from "./types";
export type VoiceFilters = {
  query: string;
  language: string;
  gender: string;
  style: string;
  favoritesOnly: boolean;
  sort: "name" | "name-desc";
};
export const emptyVoiceFilters: VoiceFilters = {
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
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) * (filters.sort === "name" ? 1 : -1),
    );
}
