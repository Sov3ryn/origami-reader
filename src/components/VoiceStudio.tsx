import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AudioLines,
  Check,
  Download,
  Heart,
  LoaderCircle,
  Play,
  Pause,
  RotateCcw,
  Search,
  Settings2,
  Shuffle,
  Sparkles,
  Square,
  Trash2,
  PenLine,
  LayoutGrid,
  SlidersHorizontal,
  Dices,
  Eraser,
  CircleCheck,
} from "lucide-react";
import { desktop } from "../storage";
import {
  designError,
  designLanguages,
  designPresets,
  designSamples,
  initialDesign,
  presetPrompt,
  readDesignDraft,
  builderTones,
  commonAccents,
  composePrompt,
  initialBuilder,
  type VoiceBuilder,
  type StudioState,
  type VoiceDesign,
  type VoiceTake,
} from "../voiceDesign";
import { t } from "../i18n";
import "./voiceStudio.css";
import { recordFeat } from "../feats";

const emptyState: StudioState = { installed: false, busy: false, previews: [] };
const seconds = (n: number) =>
  `${Math.floor(n / 60)}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;

export function VoiceStudio({
  beforeGenerate,
  onBusy,
  onSaved,
  onModels,
  onUse,
  active,
}: {
  active: boolean;
  // Makes a saved voice the one in use.
  onUse?: (id: string) => void;
  beforeGenerate: () => Promise<unknown>;
  onBusy: (busy: boolean) => void;
  onSaved: () => Promise<unknown>;
  onModels: () => void;
}) {
  const [spec, setSpec] = useState<VoiceDesign>(readDesignDraft);
  const [state, setState] = useState<StudioState>(emptyState);
  const [working, setWorking] = useState(false);
  const [mutation, setMutation] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState("newest");
  const [name, setName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [listened, setListened] = useState<string[]>([]);
  const [remove, setRemove] = useState("");
  const [source, setSource] = useState("");
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(0.8);
  const audio = useRef<HTMLAudioElement>(null);
  // How the voice is described: a preset, the guided builder, or free text.
  const [mode, setMode] = useState<"preset" | "guided" | "write">(() => {
    try {
      const m = localStorage.getItem("origami.voice-design.mode");
      return m === "guided" || m === "write" ? m : "preset";
    } catch {
      return "preset";
    }
  });
  const [builder, setBuilder] = useState<VoiceBuilder>(() => {
    try {
      return {
        ...initialBuilder,
        ...JSON.parse(
          localStorage.getItem("origami.voice-design.builder") || "{}",
        ),
      };
    } catch {
      return { ...initialBuilder };
    }
  });
  const [preset, setPreset] = useState(-1);
  // A take to play as soon as its audio has loaded.
  const [autoplay, setAutoplay] = useState("");
  const [askClear, setAskClear] = useState(false);
  const alive = useRef(true);
  const callbacks = useRef({ beforeGenerate, onBusy, onSaved });
  callbacks.current = { beforeGenerate, onBusy, onSaved };
  const take = state.previews.find((v) => v.id === selected);
  const busy = working || state.busy;
  useEffect(() => {
    if (!active) audio.current?.pause();
  }, [active]);
  const error = designError(spec);
  async function refresh() {
    if (!desktop) return;
    const next = await invoke<StudioState>("voice_studio_state");
    if (alive.current) setState(next);
  }
  useEffect(() => {
    alive.current = true;
    void refresh().catch((e) => setMessage(String(e)));
    return () => {
      alive.current = false;
      void invoke("cancel_voice_design").catch(() => {});
      callbacks.current.onBusy(false);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("origami.voice-design.draft", JSON.stringify(spec));
    } catch {
      /* Draft persistence is optional when storage is full. */
    }
  }, [spec]);
  useEffect(() => {
    try {
      localStorage.setItem("origami.voice-design.mode", mode);
      localStorage.setItem(
        "origami.voice-design.builder",
        JSON.stringify(builder),
      );
    } catch {
      /* Remembering the builder is optional. */
    }
  }, [mode, builder]);
  useEffect(() => {
    if (mode !== "guided") return;
    const prompt = composePrompt(
      builder,
      spec.gender,
      spec.language,
      spec.accent,
    );
    if (prompt !== spec.prompt) setSpec((s) => ({ ...s, prompt }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, builder, spec.gender, spec.language, spec.accent]);
  useEffect(() => {
    if (!busy) return;
    const interval = window.setInterval(() => {
      setElapsed((n) => n + 1);
      void refresh().catch(() => {});
    }, 1000);
    return () => window.clearInterval(interval);
  }, [busy]);
  useEffect(() => {
    setSource("");
    setPlaying(false);
    setPosition(0);
    setReviewed(false);
    setRemove("");
    const current = state.previews.find((v) => v.id === selected);
    setName(current?.spec.name || "");
    setTranscript(current?.spec.text || "");
    setNotes(current?.notes || "");
    let cancelled = false;
    if (selected && desktop)
      void invoke<string>("voice_preview_audio", { id: selected })
        .then((url) => {
          if (!cancelled) setSource(url);
        })
        .catch((e) => {
          if (!cancelled) setMessage(String(e));
        });
    return () => {
      cancelled = true;
    };
    // Only changing takes resets the review form, not progress polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  useEffect(() => {
    if (!source || autoplay !== selected || !audio.current) return;
    setAutoplay("");
    void audio.current.play().catch(() => {});
  }, [source, autoplay, selected]);
  useEffect(() => {
    if (audio.current) {
      audio.current.playbackRate = rate;
      audio.current.volume = volume;
    }
  }, [rate, volume, source]);
  const patch = (value: Partial<VoiceDesign>) =>
    setSpec((s) => ({ ...s, ...value }));
  async function generate() {
    if (error || busy) return;
    recordFeat("voice-generate");
    setWorking(true);
    setElapsed(0);
    setMessage("");
    callbacks.current.onBusy(true);
    audio.current?.pause();
    try {
      await callbacks.current.beforeGenerate();
      if (!alive.current) return;
      const results = await invoke<VoiceTake[]>("design_voice", { spec });
      if (alive.current) {
        setState((s) => ({ ...s, previews: results, busy: false }));
        setSelected(results[0]?.id || "");
        setMessage(t("Takes ready. Listen before saving a voice."));
      }
    } catch (e) {
      if (alive.current) setMessage(String(e));
    } finally {
      await refresh().catch(() => {});
      if (alive.current) setWorking(false);
      callbacks.current.onBusy(false);
    }
  }
  async function action(task: () => Promise<unknown>) {
    setMutation(true);
    setMessage("");
    try {
      await task();
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setMutation(false);
    }
  }
  async function play() {
    if (!audio.current) return;
    if (playing) audio.current.pause();
    else {
      try {
        await audio.current.play();
      } catch (e) {
        setMessage(String(e));
      }
    }
  }
  const filtered = state.previews
    .filter(
      (v) =>
        (!favorites || v.favorite) &&
        `${v.spec.name} ${v.spec.prompt} ${v.spec.language} ${v.notes}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? (a.spec.name || "Untitled").localeCompare(b.spec.name || "Untitled")
        : sort === "oldest"
          ? a.createdAt - b.createdAt
          : b.createdAt - a.createdAt,
    );
  return (
    <div className="voice-studio">
      <div className="studio-intro">
        <div className="studio-emblem">
          <AudioLines size={30} />
        </div>
        <div>
          <h2>{t("Voice designer")}</h2>
          <p>
            {t(
              "Describe a voice, compare takes, then add your favorite to your library.",
            )}
          </p>
        </div>
        <span className="studio-model">
          <span className={state.installed ? "ready-dot" : ""} />
          {state.installed
            ? "Qwen VoiceDesign · 1.7B"
            : t("Creator not installed")}
        </span>
      </div>
      <ol className="studio-steps" aria-label={t("Progress")}>
        {[
          t("Describe the voice"),
          t("Generate and listen"),
          t("Save and use it"),
        ].map((label, i) => {
          const stage = take
            ? take.savedVoice
              ? 3
              : 2
            : state.previews.length
              ? 1
              : 0;
          return (
            <li
              key={label}
              className={i < stage ? "done" : i === stage ? "current" : ""}
            >
              <span>{i < stage ? <Check size={13} /> : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
      {!state.installed && (
        <div className="studio-notice">
          <div>
            <strong>
              {t(
                desktop
                  ? "Qwen VoiceDesign is required"
                  : "Voice creation runs in the desktop app",
              )}
            </strong>
            <p>
              {t(
                "The model runs locally. Download hosting is not available yet; connected local installations can be used now.",
              )}
            </p>
          </div>
          <button onClick={onModels}>
            <Settings2 size={16} />
            {t("Manage models")}
          </button>
        </div>
      )}
      <div className="studio-layout">
        <section
          className="studio-design"
          aria-label={t("Voice design controls")}
        >
          <div className="studio-section-heading">
            <span className="studio-step">01</span>
            <h3>{t("Design your voice")}</h3>
            <button
              className="icon-button"
              title={t("Reset design")}
              aria-label={t("Reset design")}
              disabled={busy}
              onClick={() => setSpec({ ...initialDesign })}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <fieldset disabled={busy}>
            <label>
              {t("Voice name")}
              <input
                maxLength={80}
                placeholder={t("Name it now or after listening")}
                value={spec.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <div className="studio-field-pair">
              <label>
                {t("Language")}
                <select
                  aria-label={t("Language")}
                  value={spec.language}
                  onChange={(e) => {
                    const language = e.target.value as VoiceDesign["language"];
                    patch({
                      language,
                      text: designSamples[language],
                      prompt: spec.prompt.replace(
                        /Speak in \w+/,
                        `Speak in ${language}`,
                      ),
                    });
                  }}
                >
                  {designLanguages.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("Voice category")}
                <select
                  aria-label={t("Voice category")}
                  value={spec.gender}
                  onChange={(e) =>
                    patch({ gender: e.target.value as VoiceDesign["gender"] })
                  }
                >
                  <option value="female">{t("Female")}</option>
                  <option value="male">{t("Male")}</option>
                  <option value="unspecified">{t("Unspecified")}</option>
                </select>
              </label>
            </div>
            <div
              className="voice-design-mode"
              role="tablist"
              aria-label={t("How to describe the voice")}
            >
              {(
                [
                  ["preset", t("Pick a preset"), <LayoutGrid size={15} key="i" />],
                  [
                    "guided",
                    t("Build it step by step"),
                    <SlidersHorizontal size={15} key="i" />,
                  ],
                  ["write", t("Write it yourself"), <PenLine size={15} key="i" />],
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => setMode(id)}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            {mode === "preset" && (
              <div className="studio-preset-cards">
                {designPresets.map((p, i) => (
                  <button
                    type="button"
                    key={p.name}
                    className={preset === i ? "active" : ""}
                    aria-pressed={preset === i}
                    onClick={() => {
                      setPreset(i);
                      patch({
                        prompt: presetPrompt(i, spec.language, spec.accent),
                        gender: p.gender,
                        style: p.style,
                      });
                    }}
                  >
                    <strong>{t(p.name)}</strong>
                    <small>
                      {t(p.style)} ·{" "}
                      {t(p.gender === "female" ? "Female" : "Male")}
                    </small>
                    <span>{p.detail.split(". ")[0]}.</span>
                  </button>
                ))}
              </div>
            )}
            {mode === "guided" && (
              <div className="studio-builder">
                {(
                  [
                    [
                      "age",
                      t("Age"),
                      ["young adult", "adult", "middle-aged", "older"],
                    ],
                    ["pitch", t("Pitch"), ["low", "medium", "high"]],
                    ["pace", t("Pace"), ["slow", "natural", "brisk"]],
                    [
                      "delivery",
                      t("Delivery"),
                      [
                        "storytelling",
                        "conversational",
                        "dramatic",
                        "documentary",
                        "soothing",
                      ],
                    ],
                  ] as const
                ).map(([key, label, options]) => (
                  <div className="studio-chip-row" key={key}>
                    <span>{label}</span>
                    <div>
                      {options.map((o) => (
                        <button
                          type="button"
                          key={o}
                          aria-pressed={builder[key] === o}
                          className={builder[key] === o ? "active" : ""}
                          onClick={() =>
                            setBuilder((b) => ({ ...b, [key]: o }))
                          }
                        >
                          {t(o[0].toUpperCase() + o.slice(1))}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="studio-chip-row">
                  <span>{t("Tone (up to 3)")}</span>
                  <div>
                    {builderTones.map((o) => {
                      const on = builder.tones.includes(o);
                      return (
                        <button
                          type="button"
                          key={o}
                          aria-pressed={on}
                          className={on ? "active" : ""}
                          onClick={() =>
                            setBuilder((b) => ({
                              ...b,
                              tones: on
                                ? b.tones.filter((x) => x !== o)
                                : [...b.tones, o].slice(-3),
                            }))
                          }
                        >
                          {t(o[0].toUpperCase() + o.slice(1))}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  className="studio-text-button"
                  onClick={() => {
                    const pick = <T,>(list: readonly T[]) =>
                      list[Math.floor(Math.random() * list.length)];
                    setBuilder({
                      age: pick([
                        "young adult",
                        "adult",
                        "middle-aged",
                        "older",
                      ] as const),
                      pitch: pick(["low", "medium", "high"] as const),
                      pace: pick(["slow", "natural", "brisk"] as const),
                      delivery: pick([
                        "storytelling",
                        "conversational",
                        "dramatic",
                        "documentary",
                        "soothing",
                      ] as const),
                      tones: [...builderTones]
                        .sort(() => Math.random() - 0.5)
                        .slice(0, 2),
                    });
                    patch({
                      seed:
                        crypto.getRandomValues(new Uint32Array(1))[0] %
                        2147483647,
                    });
                  }}
                >
                  <Dices size={14} />
                  {t("Surprise me")}
                </button>
              </div>
            )}
            {mode === "write" ? (
              <label>
                {t("Voice description")}
                <textarea
                  aria-label={t("Voice description")}
                  rows={6}
                  maxLength={2000}
                  value={spec.prompt}
                  onChange={(e) => patch({ prompt: e.target.value })}
                />
                <span className="studio-field-hint">
                  {t(
                    "Describe age, pitch, accent, texture and delivery. This description controls the sound.",
                  )}{" "}
                  <span>{spec.prompt.length}/2000</span>
                </span>
              </label>
            ) : (
              <details className="studio-prompt-preview">
                <summary>{t("Description the creator will use")}</summary>
                <p>{spec.prompt}</p>
                <button
                  type="button"
                  className="studio-text-button"
                  onClick={() => setMode("write")}
                >
                  <PenLine size={14} />
                  {t("Edit by hand")}
                </button>
              </details>
            )}
            <div className="studio-field-pair">
              <label>
                {t("Accent label")}
                <input
                  value={spec.accent}
                  maxLength={100}
                  list="studio-accents"
                  placeholder={t("For example, Scottish")}
                  onChange={(e) => patch({ accent: e.target.value })}
                />
                <datalist id="studio-accents">
                  {commonAccents.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </label>
              <label>
                {t("Style label")}
                <input
                  value={spec.style}
                  maxLength={80}
                  onChange={(e) => patch({ style: e.target.value })}
                />
              </label>
            </div>
            <p className="hint">
              {t(
                "Category, accent and style organize your library. Include the sound you want in the description; presets include the accent label.",
              )}
            </p>
            <div className="studio-section-heading">
              <span className="studio-step">02</span>
              <h3>{t("Give it something to read")}</h3>
            </div>
            <label>
              {t("Sample passage")}
              <textarea
                aria-label={t("Sample passage")}
                rows={5}
                maxLength={600}
                value={spec.text}
                onChange={(e) => patch({ text: e.target.value })}
              />
              <span className="studio-field-hint">
                {t(
                  "Use natural sentences in the selected language, with narration and a little dialogue.",
                )}{" "}
                <span>{spec.text.length}/600</span>
              </span>
            </label>
            <button
              className="studio-text-button"
              onClick={() => patch({ text: designSamples[spec.language] })}
            >
              <RotateCcw size={14} />
              {t("Use sample passage")}
            </button>
            <details className="studio-advanced">
              <summary>{t("Generation settings")}</summary>
              <div className="studio-field-pair">
                <label>
                  {t("Takes per batch")}
                  <select
                    aria-label={t("Takes per batch")}
                    value={spec.count}
                    onChange={(e) => patch({ count: Number(e.target.value) })}
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Variation")}
                  <input
                    type="number"
                    min="0.3"
                    max="1.2"
                    step="0.05"
                    value={spec.temperature}
                    onChange={(e) =>
                      patch({ temperature: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                {t("Seed")}
                <div className="studio-inline">
                  <input
                    type="number"
                    min="0"
                    max="2147483646"
                    step="1"
                    value={spec.seed}
                    onChange={(e) => patch({ seed: Number(e.target.value) })}
                  />
                  <button
                    title={t("Random seed")}
                    aria-label={t("Random seed")}
                    onClick={() =>
                      patch({
                        seed:
                          crypto.getRandomValues(new Uint32Array(1))[0] %
                          2147483647,
                      })
                    }
                  >
                    <Shuffle size={16} />
                  </button>
                </div>
              </label>
              <p className="hint">
                {t(
                  "Each take uses the next seed. Reusing settings helps comparisons, but results can differ across hardware. More variation can also introduce artifacts.",
                )}
              </p>
              <label>
                {t("Portrait appearance (optional)")}
                <textarea
                  rows={2}
                  maxLength={500}
                  placeholder={t("Describe the portrait for this voice")}
                  value={spec.portrait}
                  onChange={(e) => patch({ portrait: e.target.value })}
                />
              </label>
            </details>
          </fieldset>
          {error && <p className="hint">{t(error)}</p>}
          <div className="studio-generate-bar">
            {busy ? (
              <>
                <div>
                  <LoaderCircle className="studio-spin" size={18} />
                  <strong>
                    {t("Creating voices")} · {seconds(elapsed)}
                  </strong>
                </div>
                <button
                  onClick={() =>
                    void invoke("cancel_voice_design").catch((e) =>
                      setMessage(String(e)),
                    )
                  }
                >
                  <Square size={14} />
                  {t("Cancel")}
                </button>
              </>
            ) : (
              <button
                className="primary studio-generate"
                disabled={!state.installed || !!error || mutation}
                onClick={() => void generate()}
              >
                <Sparkles size={18} />
                {t("Generate takes")} <span>{spec.count}</span>
              </button>
            )}
          </div>
          <p className="hint">
            {busy
              ? t(
                  "The model loads once for the batch. Finished takes are kept if you cancel. Leaving Voices stops the batch.",
                )
              : t(
                  "Each take usually takes one to three minutes, depending on this computer. Reading and artwork generation pause during creation. Saved voices work with Qwen readers, not Kitten or Kokoro.",
                )}
          </p>
        </section>
        <section className="studio-results" aria-label={t("Voice takes")}>
          <div className="studio-section-heading">
            <span className="studio-step">03</span>
            <h3>{t("Listen and choose")}</h3>
            <span className="studio-count">{state.previews.length}</span>
          </div>
          <div className="studio-result-tools">
            <label className="studio-search">
              <Search size={15} />
              <input
                aria-label={t("Search voice takes")}
                placeholder={t("Search takes or notes")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className={favorites ? "active" : ""}
              aria-label={t("Favorite takes only")}
              aria-pressed={favorites}
              onClick={() => setFavorites(!favorites)}
            >
              <Heart size={16} fill={favorites ? "currentColor" : "none"} />
            </button>
            <select
              aria-label={t("Sort voice takes")}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">{t("Newest")}</option>
              <option value="oldest">{t("Oldest")}</option>
              <option value="name">{t("Name")}</option>
            </select>
            <button
              title={t("Delete takes that are not saved or favorited")}
              aria-label={t("Clear unsaved takes")}
              disabled={
                busy ||
                mutation ||
                !state.previews.some((v) => !v.savedVoice && !v.favorite)
              }
              onClick={() => setAskClear(true)}
            >
              <Eraser size={16} />
            </button>
          </div>
          {askClear && (
            <div className="studio-notice">
              <div>
                <p>
                  {t(
                    "Delete every take that is not saved as a voice or marked as a favorite? Saved voices are kept.",
                  )}
                </p>
                <button
                  disabled={mutation}
                  onClick={() =>
                    void action(async () => {
                      audio.current?.pause();
                      for (const v of state.previews)
                        if (!v.savedVoice && !v.favorite)
                          await invoke("delete_voice_preview", { id: v.id });
                      if (take && !take.savedVoice && !take.favorite)
                        setSelected("");
                      setAskClear(false);
                    })
                  }
                >
                  {t("Clear unsaved takes")}
                </button>{" "}
                <button onClick={() => setAskClear(false)}>
                  {t("Cancel")}
                </button>
              </div>
            </div>
          )}
          {!filtered.length ? (
            <div className="studio-empty">
              <AudioLines size={44} />
              <h3>
                {t(
                  state.previews.length
                    ? "No matching takes"
                    : "No voice takes yet",
                )}
              </h3>
              <p>
                {t(
                  state.previews.length
                    ? "Try another search or turn off the favorites filter."
                    : "Choose a direction and generate a few takes. Compare them here before saving one to your voice library.",
                )}
              </p>
            </div>
          ) : (
            <div className="studio-take-list">
              {filtered.map((v) => (
                <div
                  className={
                    "studio-take" + (selected === v.id ? " selected" : "")
                  }
                  key={v.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(v.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(v.id);
                    }
                  }}
                >
                  <button
                    className="studio-take-icon"
                    aria-label={t("Play {name}", {
                      name: (v.spec.name || t("Untitled voice")) + " " + v.take,
                    })}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selected === v.id) void play();
                      else {
                        setAutoplay(v.id);
                        setSelected(v.id);
                      }
                    }}
                  >
                    {selected === v.id && playing ? (
                      <Pause size={17} />
                    ) : (
                      <Play size={17} />
                    )}
                  </button>
                  <div>
                    <strong>
                      {v.spec.name || t("Untitled voice")}{" "}
                      <span>
                        · {t("Take")} {v.take}
                      </span>
                    </strong>
                    <small>
                      {v.spec.language} · {seconds(v.duration)} ·{" "}
                      {new Date(v.createdAt).toLocaleDateString()}
                    </small>
                  </div>
                  {v.favorite && <Heart size={14} fill="currentColor" />}
                  {v.savedVoice && <Check size={16} />}
                </div>
              ))}
            </div>
          )}
          {take && (
            <div className="studio-review">
              <div className="studio-section-heading">
                <h3>
                  {take.spec.name || t("Untitled voice")} · {t("Take")}{" "}
                  {take.take}
                </h3>
                <button
                  disabled={mutation}
                  className="icon-button"
                  aria-label={t(
                    take.favorite ? "Remove favorite" : "Favorite take",
                  )}
                  onClick={() =>
                    void action(() =>
                      invoke("update_voice_preview", {
                        id: take.id,
                        favorite: !take.favorite,
                        notes,
                      }),
                    )
                  }
                >
                  <Heart
                    size={18}
                    fill={take.favorite ? "currentColor" : "none"}
                  />
                </button>
              </div>
              <svg
                className="studio-wave"
                viewBox="0 0 640 64"
                role="img"
                aria-label={t("Audio waveform")}
              >
                {take.peaks.map((peak, i) => (
                  <rect
                    key={i}
                    x={i * 10 + 2}
                    y={32 - Math.max(2, peak * 28)}
                    width="5"
                    height={Math.max(4, peak * 56)}
                    rx="2"
                    opacity={
                      i / take.peaks.length <= position / take.duration
                        ? 1
                        : 0.3
                    }
                  />
                ))}
              </svg>
              <audio
                ref={audio}
                src={source || undefined}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false);
                  setListened((ids) =>
                    ids.includes(take.id) ? ids : [...ids, take.id],
                  );
                }}
                onTimeUpdate={(e) => {
                  const time = e.currentTarget.currentTime;
                  setPosition(time);
                  if (time >= Math.min(3, take.duration / 2))
                    setListened((ids) =>
                      ids.includes(take.id) ? ids : [...ids, take.id],
                    );
                }}
              />
              <div className="studio-player">
                <button
                  className="primary"
                  aria-label={t(playing ? "Pause take" : "Play take")}
                  disabled={!source || busy}
                  onClick={() => void play()}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <input
                  aria-label={t("Preview position")}
                  type="range"
                  min="0"
                  max={take.duration}
                  step=".05"
                  value={position}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (audio.current) audio.current.currentTime = value;
                    setPosition(value);
                  }}
                />
                <small>
                  {seconds(position)} / {seconds(take.duration)}
                </small>
              </div>
              <div className="studio-playback-options">
                <label>
                  {t("Speed")}
                  <select
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                  >
                    {[0.75, 1, 1.25, 1.5].map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Volume")}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                  />
                </label>
              </div>
              <details>
                <summary>{t("Design used for this take")}</summary>
                <p>{take.spec.prompt}</p>
                <p className="hint">
                  {t("Seed")}: {take.seed} · {t("Variation")}:{" "}
                  {take.spec.temperature}
                </p>
              </details>
              <div className="studio-take-actions">
                <button
                  disabled={busy}
                  onClick={() => {
                    setSpec({ ...take.spec, seed: take.seed });
                    setMessage(
                      t(
                        "Design copied to the editor. Change it or generate another batch.",
                      ),
                    );
                  }}
                >
                  <RotateCcw size={15} />
                  {t("Reuse design")}
                </button>
                <button
                  disabled={mutation}
                  onClick={() =>
                    void action(async () => {
                      const saved = await invoke<boolean>(
                        "export_voice_preview",
                        { id: take.id },
                      );
                      if (saved) setMessage(t("WAV exported."));
                    })
                  }
                >
                  <Download size={15} />
                  {t("Export WAV")}
                </button>
                <button
                  className="icon-button"
                  disabled={mutation}
                  aria-label={t("Delete take")}
                  onClick={() => setRemove(take.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {remove === take.id && (
                <div className="studio-notice">
                  <div>
                    <p>
                      {t(
                        "Delete this preview? Saved voices and exported audio are kept.",
                      )}
                    </p>
                    <button
                      disabled={mutation}
                      onClick={() =>
                        void action(async () => {
                          audio.current?.pause();
                          await invoke("delete_voice_preview", { id: take.id });
                          setSelected("");
                        })
                      }
                    >
                      {t("Delete preview")}
                    </button>{" "}
                    <button onClick={() => setRemove("")}>{t("Cancel")}</button>
                  </div>
                </div>
              )}
              <label>
                {t("Review notes")}
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t(
                    "Pacing, pronunciation, texture, anything to adjust...",
                  )}
                />
              </label>
              <button
                className="studio-text-button"
                disabled={mutation || notes === take.notes}
                onClick={() =>
                  void action(async () => {
                    await invoke("update_voice_preview", {
                      id: take.id,
                      favorite: take.favorite,
                      notes,
                    });
                    setMessage(t("Review notes saved."));
                  })
                }
              >
                {t("Save notes")}
              </button>
              {take.savedVoice ? (
                <div className="studio-saved">
                  <CircleCheck size={18} />
                  <span>{t("Saved to your voice library")}</span>
                  {onUse && (
                    <button
                      className="primary"
                      onClick={() => onUse(take.savedVoice!)}
                    >
                      {t("Use this voice now")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="studio-save">
                  <h4>{t("Keep this voice")}</h4>
                  <label>
                    {t("Saved voice name")}
                    <input
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("Give this voice a name")}
                    />
                  </label>
                  <label>
                    {t("Exact words in the recording")}
                    <textarea
                      rows={4}
                      maxLength={800}
                      value={transcript}
                      onChange={(e) => {
                        setTranscript(e.target.value);
                        setReviewed(false);
                      }}
                    />
                  </label>
                  <p className="hint">
                    {t(
                      "Correct any words the model added or skipped. An accurate reference transcript helps future narration stay clean. If the take has artifacts, generate another one.",
                    )}
                  </p>
                  <label className="studio-check">
                    <input
                      type="checkbox"
                      disabled={!listened.includes(take.id)}
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    {t("I listened and the transcript matches the recording.")}
                  </label>
                  <button
                    className="primary"
                    disabled={
                      mutation ||
                      !reviewed ||
                      !name.trim() ||
                      transcript.trim().length < 20
                    }
                    onClick={() =>
                      void action(async () => {
                        await invoke("save_designed_voice", {
                          id: take.id,
                          name,
                          transcript,
                          reviewed,
                        });
                        audio.current?.pause();
                        setSelected("");
                        await callbacks.current.onSaved();
                        setMessage(
                          t(
                            "Voice added to your library. Select a Qwen reader to use it.",
                          ),
                        );
                      })
                    }
                  >
                    <Check size={16} />
                    {t("Save to voice library")}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      {message && (
        <div className="studio-status" role="status">
          {message}
          <button
            className="icon-button"
            aria-label={t("Dismiss message")}
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
