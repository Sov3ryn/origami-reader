import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  Flag,
  Lock,
  Music,
  Package,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Wand2,
  Ear,
} from "lucide-react";
import { t } from "../i18n";
import type { Book, Preferences, Voice } from "../types";
import { CastPanel } from "./CastPanel";
import { WordsPanel } from "./WordsPanel";
import { applyPronunciation, type Pronunciation } from "./pronounce";
import { analyse, castColor, castUnits, conversations, designDraft, lineCounts, MOODS, moodDraft, scriptAnalysis, stopAnalysis, suggestVoices, type CastMember } from "./cast";
import {
  cancelRender,
  chapterTitles,
  chosenTake,
  clock,
  editUnit,
  issueText,
  readProduction,
  renderRunning,
  revealFile,
  savePortable,
  chooseBed,
  clearBed,
  replaceProductionUnits,
  checkTakes,
  cancelCheck,
  transcriptionModels,
  type CheckDone,
  type CheckProgress,
  saveProductionInfo,
  saveProductionUnits,
  spokenLength,
  startRender,
  takeIssues,
  takesOf,
  typicalPace,
  type Issue,
  type Production,
  type ProductionUnit,
  type RenderDone,
  type RenderProgress,
} from "./production";
import { usePlayback } from "./usePlayback";
import { ExportDialog } from "./ExportDialog";
import { PanelResizer, rememberWidth, rememberedWidth } from "../work/PanelResizer";
import { useMedia } from "../useMedia";

type Filter = "all" | "review" | "pending" | "speaker";
const uncertainSpeaker = (u: ProductionUnit) => Boolean(u.speech) && (u.confidence ?? 1) < 0.7;

export function ProductionView({
  production,
  book,
  voices,
  prefs,
  modeSwitch,
  onBack,
  onChange,
  onDelete,
}: {
  production: Production;
  book: Book | null;
  voices: Voice[];
  prefs: Preferences;
  modeSwitch: ReactNode;
  onBack: () => void;
  onChange: (p: Production) => void;
  onDelete: () => Promise<void>;
}) {
  const { info, units } = production;
  const castById = useMemo(() => new Map((info.cast || []).map((c) => [c.id, c])), [info.cast]);
  const typical = useMemo(() => typicalPace(production.takes), [production.takes]);
  const issues = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const u of units) {
      const found = takeIssues(chosenTake(production, u), u, typical);
      if (found.length && u.status !== "approved") map.set(u.id, found);
    }
    return map;
  }, [production, units, typical]);
  const chapters = useMemo(() => {
    const map = new Map<number, { units: ProductionUnit[]; rendered: number; approved: number; review: number }>();
    for (const u of units) {
      const c = map.get(u.chapter) ?? { units: [], rendered: 0, approved: 0, review: 0 };
      c.units.push(u);
      if (u.take && u.status !== "pending") c.rendered++;
      if (u.status === "approved") c.approved++;
      if (issues.has(u.id)) c.review++;
      map.set(u.chapter, c);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [units, issues]);
  const titles = useMemo(() => {
    const fromBook = book ? chapterTitles(book) : new Map<number, string>();
    for (const u of units) if (u.heading && !fromBook.has(u.chapter)) fromBook.set(u.chapter, u.text.slice(0, 80));
    return fromBook;
  }, [book, units]);
  const chapterName = (c: number) => titles.get(c) || t("Chapter {n}", { n: String(c + 1) });

  const [chapter, setChapter] = useState(chapters[0]?.[0] ?? 0);
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [left, setLeft] = useState(true);
  const [leftTab, setLeftTab] = useState<"chapters" | "cast" | "words">("chapters");
  const [analysing, setAnalysing] = useState(false);
  const [analysisNote, setAnalysisNote] = useState("");
  const stopRequested = useRef(false);
  const [right, setRight] = useState(true);
  // Narrow windows: the panels slide over the script, one at a time, closed to start with.
  const narrow = useMedia("(max-width: 860px)");
  useEffect(() => {
    // Closed when the window gets narrow, back beside the script when it widens.
    setLeft(!narrow);
    setRight(!narrow);
  }, [narrow]);
  const [leftWidth, setLeftWidth] = useState(() => rememberedWidth("origami.studioLeftWidth", 250));
  const [rightWidth, setRightWidth] = useState(() => rememberedWidth("origami.studioRightWidth", 330));
  useEffect(() => rememberWidth("origami.studioLeftWidth", leftWidth), [leftWidth]);
  useEffect(() => rememberWidth("origami.studioRightWidth", rightWidth), [rightWidth]);
  const [rendering, setRendering] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkModels, setCheckModels] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const started = useRef<{ at: number; done: number } | null>(null);
  const script = useRef<HTMLDivElement>(null);

  const chapterUnits = useMemo(() => units.filter((u) => u.chapter === chapter), [units, chapter]);
  const playback = usePlayback(production, chapterUnits, (id) => {
    setSelected(id);
    script.current?.querySelector(`[data-unit="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  const unit = units.find((u) => u.id === selected);

  const counts = useMemo(() => {
    const rendered = units.filter((u) => u.take && u.status !== "pending").length;
    return { rendered, approved: units.filter((u) => u.status === "approved").length, review: issues.size, pending: units.length - rendered };
  }, [units, issues]);

  async function reload() {
    onChange(await readProduction(info.id));
  }
  useEffect(() => {
    void renderRunning().then(setRendering);
    void transcriptionModels().then(setCheckModels).catch(() => setCheckModels([]));
    const off = [
      listen<RenderProgress>("studio-progress", (e) => {
        if (e.payload.id !== info.id) return;
        const now = Date.now();
        if (!started.current) started.current = { at: now, done: e.payload.done };
        const s = started.current;
        const rate = (e.payload.done - s.done) / Math.max(1, (now - s.at) / 1000);
        const left = e.payload.total - e.payload.done;
        const eta = rate > 0 ? t(" · about {time} left", { time: clock(left / rate) }) : "";
        setProgressNote(t("{done} of {total} lines", { done: String(e.payload.done), total: String(e.payload.total) }) + eta);
        void reload();
      }),
      listen<CheckProgress>("studio-check-progress", (e) => {
        if (e.payload.id !== info.id) return;
        setProgressNote(t("Listening to {done} of {total} lines", { done: String(e.payload.done), total: String(e.payload.total) }));
        if (e.payload.done % 10 === 0) void reload();
      }),
      listen<CheckDone>("studio-check-done", (e) => {
        if (e.payload.id !== info.id) return;
        setChecking(false);
        setProgressNote("");
        setStatus(
          e.payload.ok
            ? e.payload.cancelled
              ? t("Check stopped.")
              : t("{n} lines may not say their text.", { n: String(e.payload.flagged || 0) })
            : e.payload.message || t("The check failed."),
        );
        void reload();
      }),
      listen<RenderDone>("studio-render-done", (e) => {
        if (e.payload.id !== info.id) return;
        setRendering(false);
        started.current = null;
        setProgressNote("");
        setStatus(e.payload.ok ? (e.payload.cancelled ? t("Rendering stopped.") : t("Rendering finished.")) : e.payload.message || t("Rendering failed."));
        void reload();
      }),
    ];
    return () => off.forEach((p) => void p.then((f) => f()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.id]);

  async function render(options: { chapter?: number; units?: string[] } = {}) {
    setStatus("");
    try {
      await startRender(info.id, options.chapter, options.units);
      setRendering(true);
      started.current = null;
      setProgressNote(t("Starting the voice"));
    } catch (e) {
      setStatus(String(e));
    }
  }
  // Listens to every generated line of the chapter with the local transcription model
  // and compares the words with the text; mismatches join "To review".
  async function checkChapter() {
    const model = checkModels.includes("small") ? "small" : checkModels[0];
    if (!model) return setStatus(t("Download a transcription model in Settings, Work mode, Voice notes to check takes."));
    const ids = chapterUnits.filter((u) => u.take && u.status !== "pending").map((u) => u.id);
    if (!ids.length) return;
    try {
      await checkTakes(info.id, ids, model);
      setChecking(true);
      setProgressNote(t("Listening to the chapter"));
    } catch (e) {
      setStatus(String(e));
    }
  }
  async function saveUnits(changed: ProductionUnit[]) {
    await saveProductionUnits(info.id, changed);
    const byId = new Map(changed.map((u) => [u.id, u]));
    onChange({ ...production, units: units.map((u) => byId.get(u.id) ?? u) });
  }
  const approve = (u: ProductionUnit) =>
    void saveUnits([{ ...u, status: u.status === "approved" ? "rendered" : "approved" }]);
  function nextToReview(from = selected) {
    const order = units;
    const start = Math.max(0, order.findIndex((u) => u.id === from));
    const found = [...order.slice(start + 1), ...order.slice(0, start + 1)].find((u) => issues.has(u.id) || (u.status === "pending" && u.take));
    if (!found) return setStatus(t("Nothing left to review."));
    setChapter(found.chapter);
    setSelected(found.id);
    window.setTimeout(() => script.current?.querySelector(`[data-unit="${found.id}"]`)?.scrollIntoView({ block: "center" }), 30);
  }

  // A script or play (speaker labels) is cast from its labels, without the model.
  const isScript = useMemo(() => (book ? scriptAnalysis(book.paragraphs.map((p) => p.text)) !== null : false), [book]);
  // Phase 2: find the characters and who says each line, then cut the script so
  // each character reads their own speech. Takes whose text did not change stay.
  async function runAnalysis() {
    if (!book) return setStatus(t("The book is no longer in the library."));
    setAnalysing(true);
    stopRequested.current = false;
    setStatus("");
    try {
      const paragraphs = book.paragraphs.map((p) => p.text);
      // A script names its speakers itself; anything else goes to the analysis model.
      const result = scriptAnalysis(paragraphs) || (await analyse(paragraphs, info.language || "en", (step, value) => setAnalysisNote(`${t(step)} ${Math.round(value * 100)}%`), () => stopRequested.current));
      const known = new Map((info.cast || []).map((c) => [c.id, c]));
      const draft = castUnits(book, prefs, result.speech, result.speakers, [], units);
      const counts = lineCounts(draft);
      const speaking = result.cast.filter((c) => counts.get(c.id));
      const voicesFor = suggestVoices(
        speaking.map((c) => ({ id: c.id, gender: c.gender, lines: counts.get(c.id) })),
        voices,
        info.voice,
        info.language,
        conversations(result.speech, result.speakers),
      );
      const cast: CastMember[] = speaking.map((c, i) => ({
        id: c.id,
        name: c.name,
        aliases: c.aliases,
        gender: c.gender,
        voice: known.get(c.id)?.voice || voicesFor.get(c.id) || info.voice,
        color: known.get(c.id)?.color || castColor(i),
        lines: counts.get(c.id),
      }));
      const next = castUnits(book, prefs, result.speech, result.speakers, cast, units);
      await replaceProductionUnits(info.id, next);
      const nextInfo = {
        ...info,
        cast,
        analysis: { model: "", date: Date.now(), speech: result.speech.length, uncertain: next.filter(uncertainSpeaker).length },
        updated: Date.now(),
      };
      await saveProductionInfo(nextInfo);
      onChange(await readProduction(info.id));
      setStatus(t("{n} characters found.", { n: String(cast.length) }));
      setLeftTab("cast");
    } catch (e) {
      setStatus(String(e).includes("cancelled") ? t("Analysis stopped.") : String(e));
    } finally {
      setAnalysing(false);
      setAnalysisNote("");
      void stopAnalysis().catch(() => undefined);
    }
  }
  // A voice designed for a character: the analysis model describes the voice from
  // the book's passages, and the voice designer opens with that draft and one of their lines.
  async function designVoice(c: CastMember) {
    if (!book) return setStatus(t("The book is no longer in the library."));
    setAnalysing(true);
    setAnalysisNote(t("Reading about {name}", { name: c.name }));
    try {
      const line = units.find((u) => u.speaker === c.id && u.text.length > 30)?.text || units.find((u) => u.speaker === c.id)?.text || "";
      const draft = await designDraft(c, book.paragraphs.map((p) => p.text), line, info.language);
      try {
        localStorage.setItem("origami.voice-design.draft", JSON.stringify(draft));
        localStorage.setItem("origami.voice-design.mode", "write");
      } catch {
        // Without storage the designer opens on its last draft.
      }
      await stopAnalysis().catch(() => undefined);
      window.dispatchEvent(new CustomEvent("origami:design-voice"));
    } catch (e) {
      setStatus(String(e));
    } finally {
      setAnalysing(false);
      setAnalysisNote("");
    }
  }
  // A mood version of a character's voice, made in the voice designer.
  function moodVoice(c: CastMember, mood: string) {
    const line = units.find((u) => u.speaker === c.id && u.text.length > 30)?.text || units.find((u) => u.speaker === c.id)?.text || "";
    const label = t(MOODS.find((m) => m[0] === mood)?.[1] || mood).toLowerCase();
    const draft = moodDraft(c, voices.find((v) => v.id === c.voice), mood, line, info.language, label);
    try {
      localStorage.setItem("origami.voice-design.draft", JSON.stringify(draft));
      localStorage.setItem("origami.voice-design.mode", "write");
    } catch {
      // Without storage the designer opens on its last draft.
    }
    window.dispatchEvent(new CustomEvent("origami:design-voice"));
  }
  // One line read by another voice (a mood version, say), then a new take.
  async function setLineVoice(u: ProductionUnit, voice: string) {
    await saveUnits([{ ...u, voice, status: u.status === "approved" ? "rendered" : u.status }]);
    void render({ units: [u.id] });
  }
  // A line's speaker; the rest of that piece of speech follows.
  async function setSpeaker(u: ProductionUnit, speaker: string) {
    const voice = speaker ? castById.get(speaker)?.voice : undefined;
    const group = u.speech ? units.filter((x) => x.speech === u.speech) : [u];
    const changed = group.map((x) => {
      const needsTake = x.take && x.status !== "approved" && (x.voice || "") !== (voice || "");
      return { ...x, speaker: speaker || undefined, voice, confidence: 1, status: needsTake ? ("pending" as const) : x.status };
    });
    await saveUnits(changed);
  }
  async function setCharacterVoice(character: string, voice: string) {
    const cast = (info.cast || []).map((c) => (c.id === character ? { ...c, voice } : c));
    const nextInfo = { ...info, cast, updated: Date.now() };
    await saveProductionInfo(nextInfo);
    // Lines given another voice (a mood version) keep it.
    const before = (info.cast || []).find((c) => c.id === character)?.voice;
    const changed = units
      .filter((u) => u.speaker === character && (!u.voice || u.voice === before))
      .map((u) => ({ ...u, voice, status: u.take && u.status !== "approved" ? ("pending" as const) : u.status }));
    await saveProductionUnits(info.id, changed);
    const byId = new Map(changed.map((u) => [u.id, u]));
    onChange({ ...production, info: nextInfo, units: units.map((u) => byId.get(u.id) ?? u) });
  }
  async function mergeCharacters(from: string, into: string) {
    const target = castById.get(into);
    const source = castById.get(from);
    if (!target || !source) return;
    const cast = (info.cast || []).filter((c) => c.id !== from).map((c) => (c.id === into ? { ...c, aliases: [...new Set([...c.aliases, source.name, ...source.aliases])] } : c));
    const nextInfo = { ...info, cast, updated: Date.now() };
    await saveProductionInfo(nextInfo);
    const changed = units
      .filter((u) => u.speaker === from)
      .map((u) => ({ ...u, speaker: into, voice: target.voice, status: u.take && u.status !== "approved" && u.voice !== target.voice ? ("pending" as const) : u.status }));
    await saveProductionUnits(info.id, changed);
    const byId = new Map(changed.map((u) => [u.id, u]));
    onChange({ ...production, info: nextInfo, units: units.map((u) => byId.get(u.id) ?? u) });
  }
  // A pronunciation for the whole book: every line with the word, in its spoken text.
  async function pronounce(p: Pronunciation) {
    const list = [...(info.pronunciations || []).filter((x) => x.word !== p.word), p];
    const nextInfo = { ...info, pronunciations: list, updated: Date.now() };
    await saveProductionInfo(nextInfo);
    const previous = info.pronunciations?.find((x) => x.word === p.word);
    // Changing an earlier choice starts again from the book's word.
    const base = previous ? units.map((u) => (u.original && u.text.includes(previous.sayAs) ? { ...u, text: u.text.split(previous.sayAs).join(p.word) } : u)) : units;
    const changed = applyPronunciation(base, p);
    await saveProductionUnits(info.id, changed);
    const byId = new Map(changed.map((u) => [u.id, u]));
    onChange({ ...production, info: nextInfo, units: units.map((u) => byId.get(u.id) ?? u) });
    setStatus(t("{n} lines will say it the new way.", { n: String(changed.length) }));
  }
  function jumpTo(id: string) {
    const u = units.find((x) => x.id === id);
    if (!u) return;
    setChapter(u.chapter);
    setFilter("all");
    setSelected(id);
    window.setTimeout(() => script.current?.querySelector(`[data-unit="${id}"]`)?.scrollIntoView({ block: "center" }), 40);
  }

  // The characters who speak in this chapter, most lines first: keys 1 to 9 assign them.
  const chapterSpeakers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of units) if (u.chapter === chapter && u.speaker) counts.set(u.speaker, (counts.get(u.speaker) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => castById.has(id)).slice(0, 9);
  }, [units, chapter, castById]);

  // Keyboard: space plays, arrows move between lines, A approves, R regenerates, N finds the next line to review.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']") || e.ctrlKey || e.metaKey || e.altKey) return;
      const index = chapterUnits.findIndex((u) => u.id === selected);
      if (e.key === " ") {
        e.preventDefault();
        playback.toggle(selected || chapterUnits[0]?.id || "");
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = chapterUnits[Math.min(chapterUnits.length - 1, Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next) {
          setSelected(next.id);
          script.current?.querySelector(`[data-unit="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key.toLowerCase() === "a" && unit?.take) approve(unit);
      else if (e.key.toLowerCase() === "r" && unit && !rendering) void render({ units: [unit.id] });
      else if (e.key.toLowerCase() === "n") nextToReview();
      else if (e.key === "Enter" && unit) playback.play(unit.id);
      else if (/^[0-9]$/.test(e.key) && unit?.speech) {
        // 0 gives the line to the narrator; 1 to 9 to this chapter's speakers.
        const who = e.key === "0" ? "" : chapterSpeakers[Number(e.key) - 1];
        if (who !== undefined) void setSpeaker(unit, who);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const shown = chapterUnits.filter(
    (u) => filter === "all" || (filter === "review" ? issues.has(u.id) : filter === "speaker" ? uncertainSpeaker(u) : !u.take || u.status === "pending"),
  );
  const paragraphs = useMemo(() => {
    const groups: { paragraph: number; heading: boolean; units: ProductionUnit[] }[] = [];
    for (const u of shown) {
      const last = groups.at(-1);
      if (last && last.paragraph === u.paragraph) last.units.push(u);
      else groups.push({ paragraph: u.paragraph, heading: u.heading, units: [u] });
    }
    return groups;
  }, [shown]);
  const chapterLength = spokenLength(production, chapterUnits);
  const elapsed = (() => {
    let s = 0;
    for (let i = 0; i < chapterUnits.length; i++) {
      const u = chapterUnits[i];
      if (u.id === playback.current) return s + playback.position;
      const take = chosenTake(production, u);
      if (take) s += take.duration + (i + 1 < chapterUnits.length ? 0.4 : 0);
    }
    return 0;
  })();
  const chapterIndex = chapters.findIndex(([c]) => c === chapter);

  return (
    <div
      className={`studio-mode studio-editor${left ? "" : " no-left"}${right ? "" : " no-right"}${narrow ? " narrow" : ""}`}
      style={{ "--studio-left": `${leftWidth}px`, "--studio-right": `${rightWidth}px` } as React.CSSProperties}
    >
      {left && (
        <PanelResizer side="left" width={leftWidth} min={180} max={420} fallback={250} inset={{ edge: 0, gap: 0 }} label={t("Resize the chapters panel")} onChange={setLeftWidth} />
      )}
      {right && (
        <PanelResizer side="right" width={rightWidth} min={260} max={560} fallback={330} inset={{ edge: 0, gap: 0 }} label={t("Resize the inspector")} onChange={setRightWidth} />
      )}
      <header className="studio-bar-top">
        {modeSwitch}
        <button className="icon-only" onClick={onBack} aria-label={t("All productions")} data-tip={t("All productions")}>
          <ArrowLeft size={17} />
        </button>
        <div className="studio-title">
          <strong>{info.title}</strong>
          <span>{info.author}</span>
        </div>
        <span className="studio-spacer" />
        {rendering || checking ? (
          <span className="studio-pill busy" role="status">
            <span className="studio-spinner" aria-hidden="true" />
            {progressNote || t("Rendering")}
          </span>
        ) : status ? (
          <span className="studio-pill" role="status">
            {status}
          </span>
        ) : null}
        {checking ? (
          <button onClick={() => void cancelCheck()}>
            <Square size={14} /> {t("Stop")}
          </button>
        ) : rendering ? (
          <button onClick={() => void cancelRender()}>
            <Square size={14} /> {t("Stop")}
          </button>
        ) : (
          <div className="studio-split">
            <button onClick={() => void render({ chapter })} disabled={!chapterUnits.some((u) => u.status === "pending")}>
              <Sparkles size={15} /> {t("Generate chapter")}
            </button>
            <button className="primary" onClick={() => void render()} disabled={!counts.pending}>
              <Wand2 size={15} /> {t("Generate all")}
            </button>
            <button
              className="icon-only"
              onClick={() => void checkChapter()}
              disabled={!chapterUnits.some((u) => u.take && u.status !== "pending")}
              aria-label={t("Check this chapter by listening to it")}
              data-tip={checkModels.length ? t("Check this chapter by listening to it") : t("Needs a transcription model (Settings, Work mode, Voice notes)")}
            >
              <Ear size={16} />
            </button>
          </div>
        )}
        <button onClick={() => setExporting(true)} disabled={!counts.rendered}>
          <Download size={15} /> {t("Export")}
        </button>
        <button className="icon-only" onClick={() => setLeft(!left)} aria-label={t("Chapters panel")} aria-pressed={left} data-tip={t("Chapters panel")}>
          <PanelLeft size={17} />
        </button>
        <button className="icon-only" onClick={() => setRight(!right)} aria-label={t("Inspector panel")} aria-pressed={right} data-tip={t("Inspector panel")}>
          <PanelRight size={17} />
        </button>
      </header>

      {left && (
        <nav className="studio-side" aria-label={leftTab === "cast" ? t("Cast") : t("Chapters")}>
          <div className="studio-tabs" role="tablist">
            <button role="tab" aria-selected={leftTab === "chapters"} onClick={() => setLeftTab("chapters")}>
              {t("Chapters")} <span className="muted">{chapters.length}</span>
            </button>
            <button role="tab" aria-selected={leftTab === "cast"} onClick={() => setLeftTab("cast")}>
              {t("Cast")} <span className="muted">{(info.cast || []).length || ""}</span>
            </button>
            <button role="tab" aria-selected={leftTab === "words"} onClick={() => setLeftTab("words")}>
              {t("Words")}
            </button>
          </div>
          {leftTab === "words" ? (
            <WordsPanel production={production} onApply={(p) => void pronounce(p)} onJump={jumpTo} />
          ) : leftTab === "cast" ? (
            <CastPanel
              script={isScript}
              production={production}
              voices={voices}
              busy={analysing}
              progress={analysisNote}
              onAnalyse={() => (analysing ? (stopRequested.current = true) : void runAnalysis())}
              onVoice={(c, v) => void setCharacterVoice(c, v)}
              onMerge={(a, b) => void mergeCharacters(a, b)}
              onDesign={(c) => void designVoice(c)}
              onMood={(c, mood) => moodVoice(c, mood)}
            />
          ) : (
          <ol className="studio-chapter-list">
            {chapters.map(([c, n]) => (
              <li key={c}>
                <button aria-current={c === chapter} onClick={() => setChapter(c)}>
                  <span className="name">{chapterName(c)}</span>
                  <span className="studio-meter" aria-hidden="true">
                    <i className="approved" style={{ width: `${(n.approved / n.units.length) * 100}%` }} />
                    <i style={{ width: `${((n.rendered - n.approved) / n.units.length) * 100}%` }} />
                  </span>
                  <span className="meta">
                    {n.rendered < n.units.length
                      ? t("{done}/{total} lines", { done: String(n.rendered), total: String(n.units.length) })
                      : clock(spokenLength(production, n.units))}
                    {n.review > 0 && (
                      <em className="flag">
                        <Flag size={11} /> {n.review}
                      </em>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          )}
        </nav>
      )}

      <main className="studio-doc" ref={script}>
        <div className="studio-doc-head">
          <h2>{chapterName(chapter)}</h2>
          <div className="studio-chips" role="radiogroup" aria-label={t("Show")}>
            {(
              [
                ["all", t("All lines")],
                ["review", t("To review ({n})", { n: String(chapterUnits.filter((u) => issues.has(u.id)).length) })],
                ["pending", t("Not generated ({n})", { n: String(chapterUnits.filter((u) => !u.take || u.status === "pending").length) })],
                ...(info.cast?.length ? [["speaker", t("Unsure speaker ({n})", { n: String(chapterUnits.filter(uncertainSpeaker).length) })]] : []),
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button key={value} role="radio" aria-checked={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <article className="studio-page">
          {paragraphs.map((p) => {
            const Tag = p.heading ? "h3" : "p";
            return (
              <Tag key={p.paragraph + ":" + p.units[0].id}>
                {p.units.map((u) => (
                  <span
                    key={u.id}
                    data-unit={u.id}
                    className={[
                      "studio-line",
                      u.take && u.status !== "pending" ? "has-take" : "no-take",
                      u.status,
                      issues.has(u.id) ? "flagged" : "",
                      selected === u.id ? "selected" : "",
                      playback.current === u.id && playback.playing ? "speaking" : "",
                      u.speaker ? "voiced" : "",
                      uncertainSpeaker(u) ? "unsure" : "",
                    ].join(" ")}
                    style={u.speaker && castById.get(u.speaker) ? ({ "--who": castById.get(u.speaker)!.color } as React.CSSProperties) : undefined}
                    title={u.speaker ? castById.get(u.speaker)?.name : undefined}
                    onClick={() => setSelected(u.id)}
                    onDoubleClick={() => playback.play(u.id)}
                  >
                    {u.text}
                    {u.status === "approved" && <Lock className="studio-lock" size={11} aria-label={t("Approved")} />}
                  </span>
                ))}
              </Tag>
            );
          })}
          {!paragraphs.length && <p className="muted">{filter === "review" ? t("Nothing to review in this chapter.") : t("Every line in this chapter has audio.")}</p>}
        </article>
      </main>

      {right && (
        <aside className="studio-inspector" aria-label={t("Inspector")}>
          {unit ? (
            <LineInspector
              key={unit.id}
              production={production}
              unit={unit}
              issues={issues.get(unit.id) || []}
              rendering={rendering}
              onPlayTake={(take) => playback.play(unit.id, take)}
              onSave={(u) => void saveUnits([u])}
              onApprove={() => approve(unit)}
              onRegenerate={() => void render({ units: [unit.id] })}
              onNext={() => nextToReview(unit.id)}
              onPause={(pause) => void saveUnits([{ ...unit, pause }])}
              cast={info.cast || []}
              chapterSpeakers={chapterSpeakers}
              onSpeaker={(who) => void setSpeaker(unit, who)}
              voices={voices}
              onVoice={(v) => void setLineVoice(unit, v)}
            />
          ) : (
            <Overview
              production={production}
              voices={voices}
              counts={counts}
              onVoice={async (voice) => {
                const next = { ...info, voice, updated: Date.now() };
                await saveProductionInfo(next);
                onChange({ ...production, info: next });
              }}
              onReview={() => nextToReview("")}
              onRegenerateFlagged={() => void render({ units: [...issues.keys()].filter((id) => units.find((u) => u.id === id)?.status !== "approved") })}
              rendering={rendering}
              confirming={confirming}
              setConfirming={setConfirming}
              onDelete={onDelete}
              onInfo={async (next) => {
                await saveProductionInfo(next);
                onChange({ ...production, info: next });
              }}
            />
          )}
        </aside>
      )}

      <footer className="studio-player">
        <div className="studio-transport">
          <button className="icon-only" disabled={chapterIndex <= 0} onClick={() => setChapter(chapters[chapterIndex - 1][0])} aria-label={t("Previous chapter")} data-tip={t("Previous chapter")}>
            <SkipBack size={16} />
          </button>
          <button
            className="studio-play"
            onClick={() => playback.toggle(selected || chapterUnits[0]?.id || "")}
            aria-label={playback.playing ? t("Pause") : t("Play")}
            data-tip={t("Play or pause (Space)")}
            disabled={!chapterUnits.some((u) => u.take)}
          >
            {playback.playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="icon-only" disabled={chapterIndex >= chapters.length - 1} onClick={() => setChapter(chapters[chapterIndex + 1][0])} aria-label={t("Next chapter")} data-tip={t("Next chapter")}>
            <SkipForward size={16} />
          </button>
        </div>
        <div className="studio-timeline">
          <div className="studio-now">
            <span>{chapterName(chapter)}</span>
            <span className="muted">
              {clock(elapsed)} / {clock(chapterLength)}
            </span>
          </div>
          <div className="studio-strip" aria-hidden="true">
            {chapterUnits.map((u) => {
              const take = chosenTake(production, u);
              return (
                <i
                  key={u.id}
                  className={[u.status, take ? "" : "empty", issues.has(u.id) ? "flagged" : "", u.id === playback.current ? "now" : "", u.id === selected ? "sel" : ""].join(" ")}
                  style={{ flexGrow: take ? take.duration : Math.max(1, u.text.length / 15) }}
                  onClick={() => {
                    setSelected(u.id);
                    script.current?.querySelector(`[data-unit="${u.id}"]`)?.scrollIntoView({ block: "center" });
                  }}
                />
              );
            })}
          </div>
        </div>
        <label className="studio-speed">
          <span className="sr-only">{t("Playback speed")}</span>
          <select value={playback.rate} onChange={(e) => playback.setRate(Number(e.target.value))}>
            {[0.8, 1, 1.15, 1.3, 1.5].map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>
      </footer>

      {exporting && <ExportDialog production={production} book={book} titles={titles} onClose={() => setExporting(false)} />}
    </div>
  );
}

function LineInspector({
  production,
  unit,
  issues,
  rendering,
  onPlayTake,
  onSave,
  onApprove,
  onRegenerate,
  onNext,
  cast,
  chapterSpeakers,
  onSpeaker,
  onPause,
  voices,
  onVoice,
}: {
  voices: Voice[];
  onVoice: (voice: string) => void;
  onPause: (pause: ProductionUnit["pause"]) => void;
  cast: CastMember[];
  chapterSpeakers: string[];
  onSpeaker: (speaker: string) => void;
  production: Production;
  unit: ProductionUnit;
  issues: Issue[];
  rendering: boolean;
  onPlayTake: (take: NonNullable<ReturnType<typeof chosenTake>>) => void;
  onSave: (u: ProductionUnit) => void;
  onApprove: () => void;
  onRegenerate: () => void;
  onNext: () => void;
}) {
  const [draft, setDraft] = useState(unit.text);
  const takes = takesOf(production, unit.id);
  const changed = draft.replace(/\s+/g, " ").trim() !== unit.text;
  return (
    <div className="studio-panel">
      <div className="studio-panel-head">
        <span>{unit.heading ? t("Heading") : t("Script line")}</span>
        <span className={`studio-state ${unit.status}`}>
          {unit.status === "approved"
            ? t("Approved")
            : unit.status === "pending"
              ? unit.take
                ? t("Text changed")
                : t("Not generated")
              : unit.status === "failed"
                ? t("Needs a new take")
                : t("Generated")}
        </span>
      </div>
      {cast.length > 0 && (
        <div className="studio-field">
          <span>{unit.speech ? t("Speaker") : t("Read by")}</span>
          {unit.speech ? (
            <>
              <select value={unit.speaker || ""} onChange={(e) => onSpeaker(e.target.value)} aria-label={t("Speaker")}>
                <option value="">{t("Narrator")}</option>
                {[...cast]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              {(unit.confidence ?? 1) < 0.7 && <small className="studio-unsure">{t("The analysis was not sure. Check who says this.")}</small>}
              {chapterSpeakers.length > 0 && (
                <div className="studio-quick" aria-label={t("Quick choice")}>
                  <button className={!unit.speaker ? "on" : ""} onClick={() => onSpeaker("")}>
                    <kbd>0</kbd> {t("Narrator")}
                  </button>
                  {chapterSpeakers.map((id, i) => {
                    const c = cast.find((x) => x.id === id);
                    return c ? (
                      <button key={id} className={unit.speaker === id ? "on" : ""} onClick={() => onSpeaker(id)} style={{ "--who": c.color } as React.CSSProperties}>
                        <kbd>{i + 1}</kbd> {c.name}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
            </>
          ) : (
            <small className="muted">{t("Narration, read by the narrator.")}</small>
          )}
        </div>
      )}
      <LineVoice production={production} unit={unit} cast={cast} voices={voices} onVoice={onVoice} disabled={rendering} />
      <label className="studio-field">
        <span>{t("Spoken text")}</span>
        <textarea
          value={draft}
          rows={Math.min(8, Math.max(3, Math.ceil(draft.length / 42)))}
          onChange={(e) => setDraft(e.target.value)}
          disabled={unit.status === "approved"}
        />
      </label>
      <p className="studio-hint">{t("Change how a line is said (spell out a name, add a comma for a pause). The book's text is not changed.")}</p>
      <div className="studio-row">
        {changed && (
          <button className="primary" onClick={() => onSave(editUnit(unit, draft))}>
            {t("Save text")}
          </button>
        )}
        {unit.original && !changed && (
          <button
            onClick={() => {
              setDraft(unit.original!);
              onSave(editUnit(unit, unit.original!));
            }}
          >
            <Undo2 size={14} /> {t("Book text")}
          </button>
        )}
      </div>

      <div className="studio-field">
        <span>{t("Pause after")}</span>
        <div className="studio-chips small" role="radiogroup" aria-label={t("Pause after")}>
          {(
            [
              [undefined, t("Normal")],
              ["short", t("Short")],
              ["long", t("Long")],
            ] as [ProductionUnit["pause"], string][]
          ).map(([value, label]) => (
            <button key={label} role="radio" aria-checked={unit.pause === value} onClick={() => onPause(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {chosenTake(production, unit)?.checks?.heard !== undefined && (
        <p className="studio-heard">
          <span className="muted small">{t("Heard ({n}% of the words)", { n: String(Math.round((chosenTake(production, unit)?.checks?.match ?? 0) * 100)) })}</span>
          <span>{chosenTake(production, unit)?.checks?.heard || t("nothing")}</span>
        </p>
      )}
      {issues.length > 0 && (
        <div className="studio-issues" role="note">
          <strong>
            <Flag size={13} /> {t("Worth a listen")}
          </strong>
          <ul>
            {issues.map((i) => (
              <li key={i}>{t(issueText[i])}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="studio-row">
        <button onClick={onRegenerate} disabled={rendering || unit.status === "approved"} data-tip={t("New take (R)")}>
          <RotateCcw size={14} /> {unit.take ? t("Regenerate") : t("Generate")}
        </button>
        <button className={unit.status === "approved" ? "primary" : ""} onClick={onApprove} disabled={!unit.take} data-tip={t("Approve and lock (A)")}>
          <Check size={14} /> {unit.status === "approved" ? t("Approved") : t("Approve")}
        </button>
        <button className="icon-only" onClick={onNext} aria-label={t("Next line to review (N)")} data-tip={t("Next line to review (N)")}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="studio-panel-head">
        <span>{t("Takes")}</span>
        <span className="muted">{takes.length}</span>
      </div>
      {takes.length ? (
        <ol className="studio-takes">
          {takes.map((take, n) => (
            <li key={take.id} className={take.id === unit.take ? "chosen" : ""}>
              <button className="icon-only" onClick={() => onPlayTake(take)} aria-label={t("Play take {n}", { n: String(takes.length - n) })}>
                <Play size={14} />
              </button>
              <span className="studio-take-name">
                {t("Take {n}", { n: String(takes.length - n) })}
                <small>
                  {clock(take.duration)}
                  {take.text !== unit.text ? " · " + t("older text") : ""}
                </small>
              </span>
              {take.id === unit.take ? (
                <span className="studio-chosen">
                  <Check size={13} /> {t("In use")}
                </span>
              ) : (
                <button disabled={unit.status === "approved"} onClick={() => onSave({ ...unit, take: take.id, status: take.text === unit.text ? "rendered" : unit.status })}>
                  {t("Use")}
                </button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{t("No takes yet.")}</p>
      )}
    </div>
  );
}

function Overview({
  production,
  voices,
  counts,
  onVoice,
  onReview,
  onRegenerateFlagged,
  rendering,
  confirming,
  setConfirming,
  onDelete,
  onInfo,
}: {
  production: Production;
  voices: Voice[];
  counts: { rendered: number; approved: number; review: number; pending: number };
  onVoice: (voice: string) => void;
  onReview: () => void;
  onRegenerateFlagged: () => void;
  rendering: boolean;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  onDelete: () => Promise<void>;
  onInfo: (info: Production["info"]) => Promise<void>;
}) {
  const { info, units } = production;
  const total = units.length;
  return (
    <div className="studio-panel">
      <div className="studio-panel-head">
        <span>{t("Production")}</span>
      </div>
      <label className="studio-field">
        <span>{t("Narrator")}</span>
        <select value={info.voice} onChange={(e) => onVoice(e.target.value)}>
          {!voices.some((v) => v.id === info.voice) && <option value={info.voice}>{info.voice}</option>}
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <p className="studio-hint">{t("A new narrator applies to lines generated from now on. Regenerate a chapter to hear it everywhere.")}</p>
      <dl className="studio-stats">
        <div>
          <dt>{t("Generated")}</dt>
          <dd>
            {counts.rendered} / {total}
          </dd>
        </div>
        <div>
          <dt>{t("Approved")}</dt>
          <dd>{counts.approved}</dd>
        </div>
        <div>
          <dt>{t("To review")}</dt>
          <dd>{counts.review}</dd>
        </div>
        <div>
          <dt>{t("Length")}</dt>
          <dd>{clock(spokenLength(production, units))}</dd>
        </div>
      </dl>
      <div className="studio-row">
        <button onClick={onReview} disabled={!counts.review}>
          <Flag size={14} /> {t("Review flagged lines")}
        </button>
        <button onClick={onRegenerateFlagged} disabled={!counts.review || rendering} data-tip={t("A new take for every flagged line that is not approved")}>
          <RotateCcw size={14} /> {t("Regenerate them")}
        </button>
      </div>
      <div className="studio-help">
        <strong>{t("Shortcuts")}</strong>
        <ul>
          <li>
            <kbd>Space</kbd> {t("play or pause")}
          </li>
          <li>
            <kbd>↑</kbd> <kbd>↓</kbd> {t("previous or next line")}
          </li>
          <li>
            <kbd>R</kbd> {t("new take")} · <kbd>A</kbd> {t("approve")} · <kbd>N</kbd> {t("next to review")}
          </li>
          <li>{t("Double-click a line to play from there.")}</li>
        </ul>
      </div>
      <BackgroundSound production={production} onInfo={onInfo} />
      <PortableCopy id={info.id} />
      <div className="studio-danger">
        {confirming ? (
          <>
            <p>{t("Delete this production and its takes? Exported files are kept.")}</p>
            <div className="studio-row">
              <button className="danger" onClick={() => void onDelete()}>
                {t("Delete")}
              </button>
              <button onClick={() => setConfirming(false)}>{t("Cancel")}</button>
            </div>
          </>
        ) : (
          <button className="danger-text" onClick={() => setConfirming(true)}>
            <Trash2 size={14} /> {t("Delete production")}
          </button>
        )}
      </div>
    </div>
  );
}

// Saves the production as one file (takes, book and designed voices) to carry to another computer.
function PortableCopy({ id }: { id: string }) {
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(0);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const off = listen<number>("studio-portable-progress", (e) => setValue(e.payload));
    return () => void off.then((f) => f());
  }, []);
  return (
    <div className="studio-portable">
      <button
        onClick={async () => {
          setSaving(true);
          setSaved("");
          setError("");
          setValue(0);
          try {
            setSaved((await savePortable(id)) || "");
          } catch (e) {
            setError(String(e));
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving}
        data-tip={t("One file with the takes, the book and the designed voices, to continue on another computer")}
      >
        <Package size={14} /> {saving ? t("Saving {n}%", { n: String(Math.round(value * 100)) }) : t("Save a portable copy")}
      </button>
      {saved && (
        <p className="studio-hint">
          {t("Saved as {file}.", { file: saved.split(/[\\/]/).pop() || saved })}{" "}
          <button className="link" onClick={() => void revealFile(saved)}>
            {t("Show in folder")}
          </button>
        </p>
      )}
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// The voice that reads one line: the usual voice of its speaker, or another one
// such as a mood version ("Mara, whispering"). Versions of the usual voice come first.
function LineVoice({ production, unit, cast, voices, onVoice, disabled }: { production: Production; unit: ProductionUnit; cast: CastMember[]; voices: Voice[]; onVoice: (voice: string) => void; disabled: boolean }) {
  const usual = (unit.speaker && cast.find((c) => c.id === unit.speaker)?.voice) || production.info.voice;
  const current = unit.voice || usual;
  const usualName = voices.find((v) => v.id === usual)?.name || usual;
  const who = unit.speaker ? cast.find((c) => c.id === unit.speaker)?.name : "";
  const related = (v: Voice) => v.id !== usual && (v.name.startsWith(usualName + ",") || (who ? v.name.startsWith(who + ",") : false));
  const versions = voices.filter(related);
  const others = voices.filter((v) => v.id !== usual && !related(v));
  return (
    <label className="studio-field">
      <span>{t("Voice for this line")}</span>
      <select value={current} onChange={(e) => onVoice(e.target.value)} disabled={disabled}>
        <option value={usual}>{t("{name} (usual)", { name: usualName })}</option>
        {versions.length > 0 && (
          <optgroup label={t("Versions of this voice")}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={t("Other voices")}>
          {!voices.some((v) => v.id === current) && current !== usual && <option value={current}>{current}</option>}
          {others.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </optgroup>
      </select>
      {current !== usual && <small className="muted">{t("This line has its own voice. A new take is made when you change it.")}</small>}
    </label>
  );
}

// A background sound under every chapter (rain, a fire, music), lowered while anyone
// speaks. It is mixed at export and is also its own stem.
function BackgroundSound({ production, onInfo }: { production: Production; onInfo: (info: Production["info"]) => Promise<void> }) {
  const { info } = production;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bed = info.bed;
  return (
    <div className="studio-bed">
      <div className="studio-panel-head">
        <span>{t("Background sound")}</span>
      </div>
      {bed ? (
        <>
          <p className="studio-bed-name">
            <Music size={14} /> <span title={bed.name}>{bed.name}</span>
          </p>
          <div className="studio-row">
            <select value={bed.level} onChange={(e) => void onInfo({ ...info, bed: { ...bed, level: e.target.value as "quiet" | "low" | "medium" }, updated: Date.now() })} aria-label={t("Level")}>
              <option value="quiet">{t("Quiet")}</option>
              <option value="low">{t("Low")}</option>
              <option value="medium">{t("Medium")}</option>
            </select>
            <button
              onClick={async () => {
                await clearBed(info.id).catch(() => undefined);
                const next = { ...info, updated: Date.now() };
                delete next.bed;
                await onInfo(next);
              }}
            >
              {t("Remove")}
            </button>
          </div>
        </>
      ) : (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const got = await chooseBed(info.id);
              if (got) await onInfo({ ...info, bed: { ...got, level: "quiet" }, updated: Date.now() });
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Music size={14} /> {t("Add a background sound")}
        </button>
      )}
      <p className="studio-hint">{t("Your own file, looped under every chapter and lowered while anyone speaks; it is mixed at export and is its own stem. Audiobook stores ask for narration without background sound.")}</p>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
