import { t } from "../i18n";
import { useMemo, useState, type ReactNode } from "react";
import { Section, SectionLevel } from "./Section";
import {
  AudioLines,
  Check,
  Search,
  Star,
  X,
  ImagePlus,
  RefreshCw,
  LoaderCircle,
  SlidersHorizontal,
  Download,
} from "lucide-react";
import { VoicePortrait } from "./VoicePortrait";
import type { Voice } from "../types";
import { desktop, type ModelVersion } from "../storage";
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
  language: string;
  onLanguage: (language: string) => void;
  onPortrait: (voice: Voice) => void;
  onRefresh: () => void;
  onDownloads?: () => void;
  portraitActive: string;
  headingLevel?: 2 | 3;
  // Speech engine status, such as a voice being prepared.
  status?: string;
  // Extra groups shown above the list.
  extra?: ReactNode;
  // Installed speech models and the selected one, for the model filter.
  models?: ModelVersion[];
  model?: string;
};
export function VoiceCatalog({
  voices,
  selected,
  favorites,
  onSelect,
  onFavorite,
  documentScope,
  language,
  onLanguage,
  onPortrait,
  onRefresh,
  onDownloads,
  portraitActive,
  headingLevel = 3,
  status = "",
  extra,
  models = [],
  model = "",
}: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [filters, setFilters] = useState<VoiceFilters>({
    ...emptyVoiceFilters,
    language,
  });
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
  // Voices made for other models are hidden until the model filter asks.
  const engines = useMemo(
    () => [...new Set(voices.map((v) => v.engine || "qwen"))],
    [voices],
  );
  const modelName = (engine: string) =>
    models.find((m) => (m.engine || "qwen") === engine)?.name || engine;
  const currentName = models.find((m) => m.id === model)?.name;
  const activeFilters = [
    filters.model !== "current",
    filters.language !== "all",
    filters.gender !== "all",
    filters.style !== "all",
    filters.favoritesOnly,
  ].filter(Boolean).length;
  const current = voices.find((v) => v.id === selected);
  return (
    <SectionLevel value={headingLevel === 2 ? 3 : 4}>
      <div className="inspector-content voice-catalog">
        <div className="voice-current">
          <div>
            <span className="eyebrow">
              {documentScope
                ? t("This book's voice")
                : t("Voice for all books")}
            </span>
            <Heading>{current?.name || t("No voice selected")}</Heading>
            {status && (
              <span className="hint" role="status">
                {status}
              </span>
            )}
          </div>
          {onDownloads && (
            <button
              className="icon-button voice-downloads-button"
              aria-label={t("Download voices")}
              title={t("Download voices")}
              onClick={onDownloads}
            >
              <Download size={17} />
            </button>
          )}
        </div>
        {extra}
        {desktop && (
          <div className="voice-art-status">
            <button className="text-button" onClick={onRefresh}>
              <RefreshCw size={14} />
              {t("Refresh voices")}
            </button>
            {portraitActive && (
              <span className="hint" role="status">
                <LoaderCircle className="spin" size={14} />
                {t("Generating portrait for {name}", {
                  name:
                    voices.find((v) => v.id === portraitActive)?.name ||
                    t("this voice"),
                })}
              </span>
            )}
          </div>
        )}
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label={t("Search voices")}
            placeholder={t("Search name, accent or style")}
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
          />
          {filters.query && (
            <button
              className="icon-button"
              aria-label={t("Clear voice search")}
              onClick={() => patch({ query: "" })}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Section
          id="voice-filters"
          title={t("Filters")}
          icon={<SlidersHorizontal size={15} />}
          meta={
            activeFilters
              ? t("{count} active", { count: activeFilters })
              : t("{shown} of {total}", {
                  shown: visible.length,
                  total: voices.length,
                })
          }
          defaultOpen={false}
        >
          <div className="voice-filters">
            {engines.length > 1 && (
              <label>
                {t("Speech model")}
                <select
                  aria-label={t("Voices for speech model")}
                  value={filters.model}
                  onChange={(e) => patch({ model: e.target.value })}
                >
                  <option value="current">
                    {currentName
                      ? t("Selected model ({name})", { name: currentName })
                      : t("Selected model")}
                  </option>
                  <option value="all">{t("All models")}</option>
                  {engines.map((e) => (
                    <option key={e} value={e}>
                      {modelName(e)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t("Language")}
              <select
                aria-label={t("Voice language")}
                value={filters.language}
                onChange={(e) => {
                  patch({ language: e.target.value });
                  if (e.target.value !== "all") onLanguage(e.target.value);
                }}
              >
                <option value="all">{t("All languages")}</option>
                {languages.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              {t("Voice gender")}
              <select
                aria-label={t("Voice gender")}
                value={filters.gender}
                onChange={(e) => patch({ gender: e.target.value })}
              >
                <option value="all">{t("All voices")}</option>
                <option value="female">{t("Female")}</option>
                <option value="male">{t("Male")}</option>
                <option value="unspecified">{t("Unspecified")}</option>
              </select>
            </label>
            <label>
              {t("Style")}
              <select
                aria-label={t("Voice style")}
                value={filters.style}
                onChange={(e) => patch({ style: e.target.value })}
              >
                <option value="all">{t("All styles")}</option>
                {styles.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              {t("Sort")}
              <select
                aria-label={t("Sort voices")}
                value={filters.sort}
                onChange={(e) =>
                  patch({ sort: e.target.value as VoiceFilters["sort"] })
                }
              >
                <option value="name">{t("Name A to Z")}</option>
                <option value="name-desc">{t("Name Z to A")}</option>
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
              {t("Favorites")}
            </label>
            <span className="hint" aria-live="polite">
              {t("{shown} of {total} voices", {
                shown: visible.length,
                total: voices.length,
              })}
            </span>
            <button
              className="text-button"
              onClick={() => setFilters(emptyVoiceFilters)}
            >
              {t("Reset filters")}
            </button>
          </div>
        </Section>
        <div className="voice-results">
          {visible.map((v) => (
            <article
              key={v.id}
              className={"voice-card " + (selected === v.id ? "chosen" : "")}
            >
              <div className="voice-portrait-control">
                <button
                  className="portrait-select"
                  aria-label={t("Select voice: {name}", { name: v.name })}
                  disabled={!v.available && !v.otherModel}
                  onClick={() => onSelect(v.id)}
                >
                  <VoicePortrait voice={v} />
                </button>
                {desktop && (
                  <button
                    className="icon-button portrait-edit"
                    aria-label={t("Change portrait for {name}", {
                      name: v.name,
                    })}
                    onClick={() => onPortrait(v)}
                  >
                    <ImagePlus size={14} />
                  </button>
                )}
              </div>
              <button
                className="voice-choice"
                aria-label={t("Use {name}", { name: v.name })}
                onClick={() => onSelect(v.id)}
                disabled={!v.available && !v.otherModel}
              >
                <span className="voice-description">
                  <strong>{v.name}</strong>
                  <small>
                    {v.languages.join(" · ")}
                    {v.accent ? " · " + v.accent : ""}
                  </small>
                  <small>{v.description}</small>
                  <span className="voice-tags">
                    {v.otherModel && (
                      <span className="voice-model-tag">
                        {t("For {name}", { name: modelName(v.engine || "qwen") })}
                      </span>
                    )}
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
                  favorites.includes(v.id)
                    ? t("Remove {title} from favorites", { title: v.name })
                    : t("Add {title} to favorites", { title: v.name })
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
                ? t("No matching voices")
                : desktop
                  ? t("No local voices configured")
                  : t("Desktop voice generation")}
            </h4>
            <p>
              {voices.length
                ? t("Change the filters or clear the search.")
                : desktop
                  ? t(
                      "Configure your engine and voice profiles to populate the catalog.",
                    )
                  : t(
                      "Your configured voices appear in the desktop app. The browser preview supports library and annotation workflows.",
                    )}
            </p>
          </div>
        )}
        <p className="hint">
          {documentScope
            ? t(
                "This book has its own voice. Turn this off from the book's menu in the Library.",
              )
            : t(
                "Every book uses this voice, so switching books starts quickly. A book can have its own voice from its menu in the Library.",
              )}
        </p>
      </div>
    </SectionLevel>
  );
}
