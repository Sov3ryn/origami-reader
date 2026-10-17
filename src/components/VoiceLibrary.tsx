import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  Check,
  Download,
  Heart,
  ImagePlus,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { t } from "../i18n";
import { VoicePortrait } from "./VoicePortrait";
import type { Voice } from "../types";
import type { ModelVersion } from "../storage";
import { emptyVoiceFilters, filterVoices, type VoiceFilters } from "../voiceCatalog";
import "./voiceLibrary.css";

// A sentence each voice says when previewed, in its own language.
const previewLines: Record<string, string> = {
  English: "Hello, I'm {name}. Shall we read a few pages together?",
  French: "Bonjour, je suis {name}. On lit quelques pages ensemble ?",
  German: "Hallo, ich bin {name}. Wollen wir ein paar Seiten zusammen lesen?",
  Spanish: "Hola, soy {name}. ¿Leemos unas páginas juntos?",
  Italian: "Ciao, sono {name}. Leggiamo qualche pagina insieme?",
  Portuguese: "Olá, eu sou {name}. Vamos ler algumas páginas juntos?",
  Russian: "Здравствуйте, я {name}. Почитаем вместе несколько страниц?",
  Japanese: "こんにちは、{name}です。一緒に少し読みましょうか。",
  Korean: "안녕하세요, {name}입니다. 함께 몇 페이지 읽어 볼까요?",
  Chinese: "你好，我是{name}。我们一起读几页吧？",
};
export const previewLine = (v: Voice) =>
  (previewLines[v.languages[0]] || previewLines.English).replace(
    "{name}",
    v.name,
  );

type Props = {
  voices: Voice[];
  selected: string;
  favorites: string[];
  documentScope: boolean;
  status?: string;
  language: string;
  models: ModelVersion[];
  model: string;
  portraitActive: string;
  // Voice variation and other settings shown under the featured voice.
  extra?: ReactNode;
  // Previews need the speech engine free; reading aloud has priority.
  canPreview: boolean;
  onPreview: (voice: Voice) => Promise<string>;
  onSelect: (id: string) => void;
  onFavorite: (id: string) => void;
  onLanguage: (language: string) => void;
  onPortrait: (voice: Voice) => void;
  onRefresh: () => void;
  onDownloads?: () => void;
  onCreate: () => void;
  onDelete: (ids: string[]) => Promise<void>;
};

// The Voices page: the voice in use, then every voice as a card, with
// previews, filters and an opt-in mode for deleting voices.
export function VoiceLibrary(props: Props) {
  const { voices, selected, favorites, models, model } = props;
  const [filters, setFilters] = useState<VoiceFilters>({
    ...emptyVoiceFilters,
    language: props.language,
  });
  const [createdOnly, setCreatedOnly] = useState(false);
  const patch = (next: Partial<VoiceFilters>) =>
    setFilters((old) => ({ ...old, ...next }));
  // Deletion is off until the reader allows it and confirms the warning.
  const [manage, setManage] = useState(false);
  const [askManage, setAskManage] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<Voice[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState("");
  // Previews: one at a time, stoppable.
  const [previewing, setPreviewing] = useState("");
  const [loadingPreview, setLoadingPreview] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  // The preview still wanted when its audio arrives.
  const wanted = useRef("");
  useEffect(() => () => audio.current?.pause(), []);

  const languages = useMemo(
    () => [...new Set(voices.flatMap((v) => v.languages))].sort(),
    [voices],
  );
  const styles = useMemo(
    () => [...new Set(voices.flatMap((v) => v.styles))].sort(),
    [voices],
  );
  const engines = useMemo(
    () => [...new Set(voices.map((v) => v.engine || "qwen"))],
    [voices],
  );
  const modelName = (engine: string) =>
    models.find((m) => (m.engine || "qwen") === engine)?.name || engine;
  const currentModel = models.find((m) => m.id === model)?.name;
  const visible = useMemo(
    () =>
      filterVoices(voices, filters, favorites).filter(
        (v) => !createdOnly || v.created,
      ),
    [voices, filters, favorites, createdOnly],
  );
  const current = voices.find((v) => v.id === selected);
  const createdCount = voices.filter((v) => v.created).length;
  const filtersActive =
    filters.query ||
    filters.language !== "all" ||
    filters.gender !== "all" ||
    filters.style !== "all" ||
    filters.model !== "current" ||
    filters.favoritesOnly ||
    createdOnly;

  async function preview(v: Voice) {
    audio.current?.pause();
    if (previewing === v.id || loadingPreview === v.id) {
      wanted.current = "";
      setPreviewing("");
      setLoadingPreview("");
      return;
    }
    wanted.current = v.id;
    setProblem("");
    setPreviewing("");
    setLoadingPreview(v.id);
    try {
      const src = await props.onPreview(v);
      if (wanted.current !== v.id) return;
      const player = new Audio(src);
      audio.current = player;
      player.onended = () => setPreviewing("");
      setLoadingPreview("");
      setPreviewing(v.id);
      await player.play().catch(() => setPreviewing(""));
    } catch (e) {
      if (wanted.current === v.id) {
        setLoadingPreview("");
        setProblem(e instanceof Error ? e.message : String(e));
      }
    }
  }
  function toggleChosen(id: string) {
    setChosen((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function remove(list: Voice[]) {
    setDeleting(true);
    setProblem("");
    try {
      audio.current?.pause();
      await props.onDelete(list.map((v) => v.id));
      setChosen(new Set());
      setConfirmDelete(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }
  const previewButton = (v: Voice, large = false) => {
    const usable = (v.available || v.otherModel) && props.canPreview;
    const busy = loadingPreview === v.id;
    const on = previewing === v.id;
    return (
      <button
        className={"vl-preview" + (large ? " large" : "") + (on ? " on" : "")}
        disabled={!usable || !!(loadingPreview && !busy) || !v.available}
        title={
          !props.canPreview
            ? t("Stop reading aloud to preview voices.")
            : v.otherModel
              ? t("Switch to this voice's model to preview it.")
              : t("Hear a short sample")
        }
        aria-label={
          on || busy
            ? t("Stop preview")
            : t("Preview {name}", { name: v.name })
        }
        onClick={(e) => {
          e.stopPropagation();
          void preview(v);
        }}
      >
        {busy ? (
          <LoaderCircle className="spin" size={large ? 18 : 15} />
        ) : on ? (
          <Square size={large ? 16 : 13} />
        ) : (
          <Play size={large ? 18 : 15} />
        )}
        {large && (busy ? t("Preparing…") : on ? t("Stop") : t("Preview"))}
      </button>
    );
  };

  return (
    <div className="voice-library">
      <section className="vl-hero" aria-label={t("Voice in use")}>
        <div className="vl-hero-portrait">
          {current ? (
            <VoicePortrait voice={current} large />
          ) : (
            <AudioLines size={40} />
          )}
        </div>
        <div className="vl-hero-body">
          <span className="eyebrow">
            {props.documentScope ? t("This book's voice") : t("Reading with")}
          </span>
          <h2>{current?.name || t("No voice selected")}</h2>
          {current && (
            <p className="vl-hero-meta">
              {[current.languages.join(" · "), current.accent, currentModel]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {current?.description && <p>{current.description}</p>}
          {props.status && (
            <p className="hint" role="status">
              {props.status}
            </p>
          )}
          <div className="vl-hero-actions">
            {current && previewButton(current, true)}
            {current && (
              <button onClick={() => props.onPortrait(current)}>
                <ImagePlus size={16} />
                {t("Portrait")}
              </button>
            )}
            <button onClick={props.onCreate}>
              <Sparkles size={16} />
              {t("Create a voice")}
            </button>
            {props.onDownloads && (
              <button onClick={props.onDownloads}>
                <Download size={16} />
                {t("Get more voices")}
              </button>
            )}
          </div>
        </div>
        <div className="vl-hero-extra">{props.extra}</div>
      </section>

      <div className="vl-toolbar">
        <label className="vl-search">
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
        </label>
        <select
          aria-label={t("Voice language")}
          value={filters.language}
          onChange={(e) => {
            patch({ language: e.target.value });
            if (e.target.value !== "all") props.onLanguage(e.target.value);
          }}
        >
          <option value="all">{t("All languages")}</option>
          {languages.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
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
        {styles.length > 1 && (
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
        )}
        {engines.length > 1 && (
          <select
            aria-label={t("Voices for speech model")}
            value={filters.model}
            onChange={(e) => patch({ model: e.target.value })}
          >
            <option value="current">
              {currentModel
                ? t("Selected model ({name})", { name: currentModel })
                : t("Selected model")}
            </option>
            <option value="all">{t("All models")}</option>
            {engines.map((e) => (
              <option key={e} value={e}>
                {modelName(e)}
              </option>
            ))}
          </select>
        )}
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
        <div className="vl-chips">
          <button
            className={filters.favoritesOnly ? "active" : ""}
            aria-pressed={filters.favoritesOnly}
            onClick={() => patch({ favoritesOnly: !filters.favoritesOnly })}
          >
            <Star size={14} fill={filters.favoritesOnly ? "currentColor" : "none"} />
            {t("Favorites")}
          </button>
          {createdCount > 0 && (
            <button
              className={createdOnly ? "active" : ""}
              aria-pressed={createdOnly}
              onClick={() => setCreatedOnly(!createdOnly)}
            >
              <Sparkles size={14} />
              {t("Created by you")}
            </button>
          )}
        </div>
      </div>

      <div className="vl-summary">
        <span aria-live="polite">
          {t("{shown} of {total} voices", {
            shown: visible.length,
            total: voices.length,
          })}
          {filtersActive && (
            <button
              className="text-button"
              onClick={() => {
                setFilters(emptyVoiceFilters);
                setCreatedOnly(false);
              }}
            >
              {t("Reset filters")}
            </button>
          )}
        </span>
        <span className="vl-summary-tools">
          <button className="text-button" onClick={props.onRefresh}>
            <RefreshCw size={14} />
            {t("Refresh voices")}
          </button>
          <label className="vl-switch">
            <input
              type="checkbox"
              role="switch"
              checked={manage}
              onChange={(e) => {
                if (e.target.checked) setAskManage(true);
                else {
                  setManage(false);
                  setChosen(new Set());
                }
              }}
            />
            <span aria-hidden="true" />
            {t("Allow voice deletion")}
          </label>
        </span>
      </div>

      {manage && (
        <div className="vl-manage" role="region" aria-label={t("Delete voices")}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={visible.length > 0 && visible.every((v) => chosen.has(v.id))}
              onChange={(e) =>
                setChosen(e.target.checked ? new Set(visible.map((v) => v.id)) : new Set())
              }
            />
            {t("Select all")}
          </label>
          <span>{t("{count} selected", { count: chosen.size })}</span>
          <button
            className="danger"
            disabled={!chosen.size || deleting}
            onClick={() =>
              setConfirmDelete(voices.filter((v) => chosen.has(v.id)))
            }
          >
            <Trash2 size={15} />
            {t("Delete selected")}
          </button>
          <button
            onClick={() => {
              setManage(false);
              setChosen(new Set());
            }}
          >
            {t("Done")}
          </button>
        </div>
      )}

      {problem && (
        <p className="vl-problem" role="alert">
          {problem}
        </p>
      )}

      <div className="vl-grid">
        {visible.map((v) => {
          const inUse = v.id === selected;
          const usable = v.available || v.otherModel;
          const fav = favorites.includes(v.id);
          return (
            <article
              key={v.id}
              className={
                "vl-card" +
                (inUse ? " in-use" : "") +
                (chosen.has(v.id) ? " chosen" : "") +
                (!usable ? " unavailable" : "")
              }
              onClick={() =>
                manage ? toggleChosen(v.id) : usable && props.onSelect(v.id)
              }
            >
              {manage && (
                <input
                  className="vl-card-check"
                  type="checkbox"
                  aria-label={t("Select {name}", { name: v.name })}
                  checked={chosen.has(v.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleChosen(v.id)}
                />
              )}
              <div className="vl-card-top">
                <div className="vl-card-portrait">
                  <VoicePortrait voice={v} />
                  {props.portraitActive === v.id && (
                    <LoaderCircle className="spin vl-portrait-busy" size={18} />
                  )}
                </div>
                <div className="vl-card-name">
                  <strong>{v.name}</strong>
                  <small>
                    {v.languages.join(" · ")}
                    {v.accent ? " · " + v.accent : ""}
                  </small>
                </div>
                <button
                  className={"icon-button vl-fav" + (fav ? " on" : "")}
                  aria-pressed={fav}
                  aria-label={
                    fav
                      ? t("Remove {title} from favorites", { title: v.name })
                      : t("Add {title} to favorites", { title: v.name })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onFavorite(v.id);
                  }}
                >
                  <Heart size={16} fill={fav ? "currentColor" : "none"} />
                </button>
              </div>
              {v.description && <p className="vl-card-desc">{v.description}</p>}
              <div className="vl-tags">
                {inUse && (
                  <span className="vl-tag in-use">
                    <Check size={12} />
                    {t("In use")}
                  </span>
                )}
                {v.created && (
                  <span className="vl-tag created">
                    <Sparkles size={12} />
                    {t("Created by you")}
                  </span>
                )}
                {v.otherModel && (
                  <span className="vl-tag model">
                    {t("For {name}", { name: modelName(v.engine || "qwen") })}
                  </span>
                )}
                {v.styles.map((s) => (
                  <span className="vl-tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>
              <div className="vl-card-actions">
                {previewButton(v)}
                {manage ? (
                  <button
                    className="vl-delete"
                    aria-label={t("Delete {name}", { name: v.name })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete([v]);
                    }}
                  >
                    <Trash2 size={15} />
                    {t("Delete")}
                  </button>
                ) : (
                  <button
                    className={"vl-use" + (inUse ? " on" : "")}
                    disabled={!usable || inUse}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onSelect(v.id);
                    }}
                  >
                    {inUse ? t("In use") : t("Use this voice")}
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label={t("Change portrait for {name}", { name: v.name })}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onPortrait(v);
                  }}
                >
                  <ImagePlus size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className="vl-empty">
          <AudioLines size={36} />
          <h3>{voices.length ? t("No matching voices") : t("No local voices configured")}</h3>
          <p>
            {voices.length
              ? t("Change the filters or clear the search.")
              : t("Create a voice, or install voices to fill this page.")}
          </p>
        </div>
      )}
      <p className="hint vl-footnote">
        {props.documentScope
          ? t(
              "This book has its own voice. Turn this off from the book's menu in the Library.",
            )
          : t(
              "Every book uses this voice, so switching books starts quickly. A book can have its own voice from its menu in the Library.",
            )}
      </p>

      {askManage && (
        <div className="modal-scrim">
          <section
            className="quick-dialog vl-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vl-allow-title"
            onKeyDown={(e) => e.key === "Escape" && setAskManage(false)}
          >
            <ShieldAlert size={28} className="vl-dialog-icon" />
            <h2 id="vl-allow-title">{t("Allow voice deletion?")}</h2>
            <p>
              {t(
                "Deleted voices cannot be recovered. Their recordings are removed from this computer, and voices installed with Origami only come back by reinstalling.",
              )}
            </p>
            <div className="dialog-actions">
              <button autoFocus onClick={() => setAskManage(false)}>
                {t("Cancel")}
              </button>
              <button
                className="danger"
                onClick={() => {
                  setAskManage(false);
                  setManage(true);
                }}
              >
                {t("Allow deletion")}
              </button>
            </div>
          </section>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-scrim">
          <section
            className="quick-dialog vl-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vl-delete-title"
            onKeyDown={(e) =>
              e.key === "Escape" && !deleting && setConfirmDelete(null)
            }
          >
            <Trash2 size={26} className="vl-dialog-icon" />
            <h2 id="vl-delete-title">
              {confirmDelete.length === 1
                ? t("Delete {name}?", { name: confirmDelete[0].name })
                : t("Delete {count} voices?", { count: confirmDelete.length })}
            </h2>
            <p>{t("This cannot be undone.")}</p>
            {confirmDelete.length > 1 && (
              <ul>
                {confirmDelete.slice(0, 8).map((v) => (
                  <li key={v.id}>{v.name}</li>
                ))}
                {confirmDelete.length > 8 && (
                  <li>
                    {t("And {count} more.", { count: confirmDelete.length - 8 })}
                  </li>
                )}
              </ul>
            )}
            {confirmDelete.some((v) => v.id === selected) && (
              <p className="hint">
                {t(
                  "The voice in use is included. Origami switches to another voice.",
                )}
              </p>
            )}
            <div className="dialog-actions">
              <button
                autoFocus
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
              >
                {t("Cancel")}
              </button>
              <button
                className="danger"
                disabled={deleting}
                onClick={() => void remove(confirmDelete)}
              >
                {deleting ? t("Deleting…") : t("Delete permanently")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
