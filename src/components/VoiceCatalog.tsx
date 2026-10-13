import { useMemo, useState } from "react";
import { AudioLines, Check, Search, Star, X } from "lucide-react";
import type { Voice } from "../types";
import { desktop } from "../storage";
import {
  emptyVoiceFilters,
  filterVoices,
  type VoiceFilters,
} from "../voiceCatalog";
type Props = {
  voices: Voice[];
  selected: string;
  favorites: string[];
  onSelect: (id: string) => void;
  onFavorite: (id: string) => void;
  documentScope: boolean;
};
export function VoiceCatalog({
  voices,
  selected,
  favorites,
  onSelect,
  onFavorite,
  documentScope,
}: Props) {
  const [filters, setFilters] = useState<VoiceFilters>(emptyVoiceFilters);
  const patch = (next: Partial<VoiceFilters>) =>
    setFilters((old) => ({ ...old, ...next }));
  const languages = useMemo(
    () => [...new Set(voices.flatMap((v) => v.languages))].sort(),
    [voices],
  );
  const styles = useMemo(
    () => [...new Set(voices.flatMap((v) => v.styles))].sort(),
    [voices],
  );
  const visible = useMemo(
    () => filterVoices(voices, filters, favorites),
    [voices, filters, favorites],
  );
  return (
    <div className="inspector-content voice-catalog">
      <h3>{documentScope ? "Document voice" : "Default voice"}</h3>
      <div className="search-field">
        <Search size={16} />
        <input
          aria-label="Search voices"
          placeholder="Search name, accent or style"
          value={filters.query}
          onChange={(e) => patch({ query: e.target.value })}
        />
        {filters.query && (
          <button
            className="icon-button"
            aria-label="Clear voice search"
            onClick={() => patch({ query: "" })}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="voice-filters">
        <label>
          Language
          <select
            aria-label="Voice language"
            value={filters.language}
            onChange={(e) => patch({ language: e.target.value })}
          >
            <option value="all">All languages</option>
            {languages.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          Voice gender
          <select
            aria-label="Voice gender"
            value={filters.gender}
            onChange={(e) => patch({ gender: e.target.value })}
          >
            <option value="all">All voices</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="unspecified">Unspecified</option>
          </select>
        </label>
        <label>
          Style
          <select
            aria-label="Voice style"
            value={filters.style}
            onChange={(e) => patch({ style: e.target.value })}
          >
            <option value="all">All styles</option>
            {styles.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select
            aria-label="Sort voices"
            value={filters.sort}
            onChange={(e) =>
              patch({ sort: e.target.value as VoiceFilters["sort"] })
            }
          >
            <option value="name">Name A to Z</option>
            <option value="name-desc">Name Z to A</option>
          </select>
        </label>
      </div>
      <div className="voice-filter-footer">
        <label className="check-label">
          <input
            type="checkbox"
            checked={filters.favoritesOnly}
            onChange={(e) => patch({ favoritesOnly: e.target.checked })}
          />
          Favorites
        </label>
        <span className="hint" aria-live="polite">
          {visible.length} of {voices.length} voices
        </span>
        <button
          className="text-button"
          onClick={() => setFilters(emptyVoiceFilters)}
        >
          Reset filters
        </button>
      </div>
      <div className="voice-results">
        {visible.map((v) => (
          <article
            key={v.id}
            className={"voice-card " + (selected === v.id ? "chosen" : "")}
          >
            <button
              className="voice-choice"
              aria-label={"Use " + v.name}
              onClick={() => onSelect(v.id)}
              disabled={!v.available}
            >
              <span className="avatar">{v.name[0]}</span>
              <span className="voice-description">
                <strong>{v.name}</strong>
                <small>
                  {v.languages.join(" · ")}
                  {v.accent ? " · " + v.accent : ""}
                </small>
                <small>{v.description}</small>
                <span className="voice-tags">
                  {v.styles.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </span>
              </span>
              {selected === v.id && <Check size={16} />}
            </button>
            <button
              className="icon-button voice-favorite"
              aria-label={
                (favorites.includes(v.id) ? "Unfavorite " : "Favorite ") +
                v.name
              }
              aria-pressed={favorites.includes(v.id)}
              onClick={() => onFavorite(v.id)}
            >
              <Star
                size={16}
                fill={favorites.includes(v.id) ? "currentColor" : "none"}
              />
            </button>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="empty-small">
          <AudioLines size={28} />
          <h4>
            {voices.length
              ? "No matching voices"
              : desktop
                ? "No local voices configured"
                : "Desktop voice generation"}
          </h4>
          <p>
            {voices.length
              ? "Change the filters or clear the search."
              : desktop
                ? "Configure your engine and voice profiles to populate the catalog."
                : "Your configured voices appear in the desktop app. The browser preview supports library and annotation workflows."}
          </p>
        </div>
      )}
      <p className="hint">
        {documentScope
          ? "This choice applies to the current document."
          : "This choice is the default for documents without their own voice."}
      </p>
    </div>
  );
}
