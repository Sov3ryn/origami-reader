import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  AudioLines,
  Check,
  ChevronRight,
  Download,
  Flag,
  Lock,
  Music,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Play,
  RotateCcw,
  SlidersHorizontal,
  ListOrdered,
  Users,
  SpellCheck2,
  Square,
  Trash2,
  Undo2,
  Wand2,
  Search,
  X,
  Ear,
} from "lucide-react";
import { t } from "../i18n";
import { Cover, IconButton } from "../components/Primitives";
import type { Book, Preferences, Voice } from "../types";
import { CastPanel } from "./CastPanel";
import { Timeline } from "./Timeline";
import { Wave } from "./Wave";
import { JobBar, scopeLabel, scopeUnits, ScopePicker, type Scope } from "./JobScope";
import { WordsPanel } from "./WordsPanel";
import { repronounce, type Pronunciation } from "./pronounce";
import { asrReady } from "./recording";
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
import type { SideWidth } from "../components/ModeHeader";
import { useMedia } from "../useMedia";
import { recordFeat } from "../feats";

type Filter = "all" | "review" | "pending" | "speaker";
const uncertainSpeaker = (u: ProductionUnit) => Boolean(u.speech) && (u.confidence ?? 1) < 0.7;

export function ProductionView({
  production,
  book,
  voices,
  prefs,
  modeHeader,
  side,
  onBack,
  onChange,
  onDelete,
}: {
  production: Production;
  book: Book | null;
  voices: Voice[];
  prefs: Preferences;
  modeHeader: (tools?: ReactNode) => ReactNode;
  side: SideWidth;
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
  const [chapterQuery, setChapterQuery] = useState("");
  // The inspector's tabs, as in Read: the chosen line, or the production.
  const [inspectorTab, setInspectorTab] = useState<"line" | "production">("production");
  useEffect(() => {
    if (selected) setInspectorTab("line");
  }, [selected]);
  const [analysing, setAnalysing] = useState(false);
  const [analysisNote, setAnalysisNote] = useState("");
  // The analysis as it runs: its step and how far it is (0 to 1).
  const [analysisStep, setAnalysisStep] = useState<{ step: string; value: number } | null>(null);
  // How much of the book the next job covers (JobScope.tsx), shared by
  // Generate and Find the characters.
  const [scope, setScope] = useState<Scope>(() => ({ kind: "chapter", from: chapters[0]?.[0] ?? 0, to: chapters.at(-1)?.[0] ?? 0 }));
  // The running job: its lines with the take each had at the start (a line is
  // done once its take changes), when it began, what it covers, and the lines
  // being voiced now.
  const run = useRef<{ takes: Map<string, string | undefined>; label: string } | null>(null);
  const [jobStart, setJobStart] = useState(0);
  const [voicing, setVoicing] = useState<string[]>([]);
  // The whole production's count, for a job started before this view opened.
  const [overall, setOverall] = useState<{ done: number; total: number } | null>(null);
  const stopRequested = useRef(false);
  const [right, setRight] = useState(true);
  // Narrow windows: the panels slide over the script, one at a time, closed to start with.
  const narrow = useMedia("(max-width: 860px)");
  useEffect(() => {
    // Closed when the window gets narrow, back beside the script when it widens.
    setLeft(!narrow);
    setRight(!narrow);
  }, [narrow]);
  const leftWidth = side.width;
  const [rightWidth, setRightWidth] = useState(() => rememberedWidth("origami.studioRightWidth", 330));
  useEffect(() => rememberWidth("origami.studioRightWidth", rightWidth), [rightWidth]);
  const [rendering, setRendering] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkModels, setCheckModels] = useState<string[]>([]);
  // Studio's own transcription model (for recordings) is not the one that checks takes.
  const [parakeet, setParakeet] = useState(false);
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

  // Results that arrive after leaving the production are dropped, never shown.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // An analysis belongs to this view: leaving stops it.
      stopRequested.current = true;
      void stopAnalysis().catch(() => undefined);
    };
  }, []);
  async function reload() {
    const p = await readProduction(info.id);
    if (alive.current) onChange(p);
  }
  useEffect(() => {
    void renderRunning().then((busy) => {
      setRendering(busy);
      if (busy) setJobStart(Date.now());
    });
    void transcriptionModels().then(setCheckModels).catch(() => setCheckModels([]));
    void asrReady().then(setParakeet).catch(() => setParakeet(false));
    const off = [
      listen<RenderProgress>("studio-progress", (e) => {
        if (e.payload.id !== info.id) return;
        const now = Date.now();
        if (!started.current) started.current = { at: now, done: e.payload.done };
        setOverall({ done: e.payload.done, total: e.payload.total });
        const s = started.current;
        const rate = (e.payload.done - s.done) / Math.max(1, (now - s.at) / 1000);
        const left = e.payload.total - e.payload.done;
        const eta = rate > 0 ? t(" · about {time} left", { time: clock(left / rate) }) : "";
        setProgressNote(t("{done} of {total} lines", { done: String(e.payload.done), total: String(e.payload.total) }) + eta);
        void reload();
      }),
      listen<{ id: string; units: string[] }>("studio-batch", (e) => {
        if (e.payload.id !== info.id) return;
        setVoicing(e.payload.units);
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
        run.current = null;
        setVoicing([]);
        setProgressNote("");
        const missing = e.payload.missing || [];
        const names = missing.map((n) => n || t("Narrator")).join(", ");
        setStatus(
          !e.payload.ok
            ? e.payload.message || t("Rendering failed.")
            : missing.length
              ? t("Lines read by {names} were not generated: {problem} Choose another voice for them.", { names, problem: e.payload.problem || "" })
              : e.payload.cancelled
                ? t("Rendering stopped.")
                : t("Rendering finished."),
        );
        void reload();
      }),
    ];
    return () => off.forEach((p) => void p.then((f) => f()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.id]);

  async function render(options: { chapter?: number; units?: string[]; label?: string } = {}) {
    setStatus("");
    const ids = options.units || units.filter((u) => u.status === "pending" && (options.chapter === undefined || u.chapter === options.chapter)).map((u) => u.id);
    run.current = { takes: new Map(ids.map((id) => [id, units.find((u) => u.id === id)?.take])), label: options.label || (ids.length === 1 ? t("One line") : chapterName(chapter)) };
    setJobStart(Date.now());
    setVoicing([]);
    try {
      await startRender(info.id, options.chapter, options.units);
      setRendering(true);
      started.current = null;
      setProgressNote(t("Starting the voice"));
    } catch (e) {
      setStatus(String(e));
    }
  }
  // Generates the pending lines in the chosen scope: a page, a chapter, chapters or the book.
  function generate() {
    recordFeat("studio-generate");
    const ids = scopeUnits(units, scope, { chapter, selected }).filter((u) => u.status === "pending").map((u) => u.id);
    if (!ids.length) return setStatus(t("Every line here already has audio."));
    void render({ units: ids, label: scopeLabel(scope, chapterName, chapter) });
  }
  const scopePending = useMemo(() => scopeUnits(units, scope, { chapter, selected }).some((u) => u.status === "pending"), [units, scope, chapter, selected]);
  // How far the running job is, from the lines whose take changed since it began.
  const runDone = run.current ? [...run.current.takes].filter(([id, take]) => units.find((u) => u.id === id)?.take !== take).length : 0;
  const runTotal = run.current?.takes.size || 0;
  const voicingText = voicing.length ? units.find((u) => u.id === voicing[0])?.text : undefined;
  // Listens to every generated line of the chapter with the local transcription model
  // and compares the words with the text; mismatches join "To review".
  async function checkChapter() {
    const model = checkModels.includes("small") ? "small" : checkModels[0];
    if (!model)
      return setStatus(
        parakeet
          ? t("Checking takes uses a voice notes model, not Studio's Recordings to text. Download one in Settings, Work mode, Voice notes.")
          : t("Download a transcription model in Settings, Work mode, Voice notes to check takes."),
      );
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
  // Only the changed fields are saved; while a job writes takes, the saved
  // production is read back so the view shows what both did.
  async function saveUnits(changed: ProductionUnit[], nextInfo = info) {
    await saveProductionUnits(info.id, changed, units);
    const byId = new Map(changed.map((u) => [u.id, u]));
    onChange({ ...production, info: nextInfo, units: units.map((u) => byId.get(u.id) ?? u) });
    if (rendering || checking) void reload();
  }
  // A save that fails shows its reason in the status.
  const report = (e: unknown) => {
    if (alive.current) setStatus(String(e));
  };
  const approve = (u: ProductionUnit) =>
    void saveUnits([{ ...u, status: u.status === "approved" ? "rendered" : "approved" }]).catch(report);
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
    if (rendering) return setStatus(t("Stop rendering before finding the characters."));
    // Only the paragraphs in the scope are read; the rest keep what an earlier
    // analysis found. Blank paragraphs keep every index in place.
    const whole = scope.kind === "all";
    const covered = new Set(scopeUnits(units, scope, { chapter, selected }).map((u) => u.paragraph));
    if (!whole && !covered.size) return;
    const inScope = (i: number) => whole || covered.has(i);
    setAnalysing(true);
    setJobStart(Date.now());
    setAnalysisStep(null);
    stopRequested.current = false;
    setStatus("");
    try {
      const paragraphs = book.paragraphs.map((p, i) => (inScope(i) ? p.text : ""));
      // A script names its speakers itself; anything else goes to the analysis model.
      const result =
        scriptAnalysis(paragraphs) ||
        (await analyse(
          paragraphs,
          info.language || "en",
          (step, value) => {
            setAnalysisNote(`${t(step)} ${Math.round(value * 100)}%`);
            setAnalysisStep({ step, value });
          },
          () => stopRequested.current,
        ));
      if (!alive.current || stopRequested.current) throw new Error("cancelled");
      // The production as saved now: lines edited or approved during the analysis are kept.
      const fresh = await readProduction(info.id);
      const known = new Map((fresh.info.cast || []).map((c) => [c.id, c]));
      // Lines outside the scope stay as they are, in their place.
      const merge = (cut: ProductionUnit[]) =>
        whole ? cut : [...fresh.units.filter((u) => !inScope(u.paragraph)), ...cut.filter((u) => inScope(u.paragraph))].sort((a, b) => a.paragraph - b.paragraph);
      const draft = merge(castUnits(book, prefs, result.speech, result.speakers, [], fresh.units));
      const counts = lineCounts(draft);
      // Characters found before stay while they still have lines.
      const found = new Map(result.cast.map((c) => [c.id, c]));
      for (const c of fresh.info.cast || []) if (!found.has(c.id)) found.set(c.id, { id: c.id, name: c.name, aliases: c.aliases, gender: c.gender, speaks: true });
      const speaking = [...found.values()].filter((c) => counts.get(c.id));
      const voicesFor = suggestVoices(
        speaking.map((c) => ({ id: c.id, gender: c.gender, lines: counts.get(c.id) })),
        voices,
        fresh.info.voice,
        fresh.info.language,
        conversations(result.speech, result.speakers),
      );
      const cast: CastMember[] = speaking.map((c, i) => ({
        id: c.id,
        name: c.name,
        aliases: c.aliases,
        gender: c.gender,
        voice: known.get(c.id)?.voice || voicesFor.get(c.id) || fresh.info.voice,
        color: known.get(c.id)?.color || castColor(i),
        lines: counts.get(c.id),
      }));
      const next = merge(castUnits(book, prefs, result.speech, result.speakers, cast, fresh.units));
      if (!alive.current) return;
      await replaceProductionUnits(info.id, next);
      const nextInfo = {
        ...fresh.info,
        cast,
        analysis: { model: "", date: Date.now(), speech: new Set(next.filter((u) => u.speech).map((u) => u.speech)).size, uncertain: next.filter(uncertainSpeaker).length },
        updated: Date.now(),
      };
      await saveProductionInfo(nextInfo);
      const saved = await readProduction(info.id);
      if (!alive.current) return;
      onChange(saved);
      setStatus(t("{n} characters found.", { n: String(cast.length) }));
      setLeftTab("cast");
    } catch (e) {
      if (alive.current) setStatus(String(e).includes("cancelled") ? t("Analysis stopped.") : String(e));
    } finally {
      if (alive.current) {
        setAnalysing(false);
        setAnalysisNote("");
        setAnalysisStep(null);
      }
      void stopAnalysis().catch(() => undefined);
    }
  }
  // Stop: the analysis loop stops at its next step, and the model is shut so the
  // question it is answering ends too (also for a voice description).
  function stopAnalysing() {
    stopRequested.current = true;
    void stopAnalysis().catch(() => undefined);
  }
  // A voice designed for a character: the analysis model describes the voice from
  // the book's passages, and the voice designer opens with that draft and one of their lines.
  async function designVoice(c: CastMember) {
    if (!book) return setStatus(t("The book is no longer in the library."));
    setAnalysing(true);
    setAnalysisNote(t("Reading about {name}", { name: c.name }));
    try {
      const line = units.find((u) => u.speaker === c.id && u.text.length > 30)?.text || units.find((u) => u.speaker === c.id)?.text || "";
      stopRequested.current = false;
      const draft = await designDraft(c, book.paragraphs.map((p) => p.text), line, info.language);
      if (!alive.current || stopRequested.current) return;
      try {
        localStorage.setItem("origami.voice-design.draft", JSON.stringify(draft));
        localStorage.setItem("origami.voice-design.mode", "write");
      } catch {
        // Without storage the designer opens on its last draft.
      }
      await stopAnalysis().catch(() => undefined);
      window.dispatchEvent(new CustomEvent("origami:design-voice"));
    } catch (e) {
      if (alive.current) setStatus(stopRequested.current ? t("Analysis stopped.") : String(e));
    } finally {
      if (alive.current) {
        setAnalysing(false);
        setAnalysisNote("");
        setAnalysisStep(null);
      }
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
    recordFeat("studio-cast");
    const cast = (info.cast || []).map((c) => (c.id === character ? { ...c, voice } : c));
    const nextInfo = { ...info, cast, updated: Date.now() };
    await saveProductionInfo(nextInfo);
    // Lines given another voice (a mood version) keep it.
    const before = (info.cast || []).find((c) => c.id === character)?.voice;
    const changed = units
      .filter((u) => u.speaker === character && (!u.voice || u.voice === before))
      .map((u) => ({ ...u, voice, status: u.take && u.status !== "approved" ? ("pending" as const) : u.status }));
    await saveUnits(changed, nextInfo);
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
    await saveUnits(changed, nextInfo);
  }
  // A pronunciation for the whole book: every line with the word, in its spoken text.
  async function pronounce(p: Pronunciation) {
    // Saying the word as the book writes it removes the choice.
    const list = [...(info.pronunciations || []).filter((x) => x.word !== p.word), ...(p.sayAs === p.word ? [] : [p])];
    const nextInfo = { ...info, pronunciations: list, updated: Date.now() };
    await saveProductionInfo(nextInfo);
    const changed = repronounce(units, info.pronunciations?.find((x) => x.word === p.word), p);
    await saveUnits(changed, nextInfo);
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
      // Nothing reaches the script behind an open dialog (Export, say).
      if (exporting || e.defaultPrevented || document.querySelector("[aria-modal='true']")) return;
      if (target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']") || e.ctrlKey || e.metaKey || e.altKey) return;
      // A focused control keeps its own Enter, and its Space when it was reached by keyboard;
      // after a mouse click, Space still plays.
      const control = target.closest("button, summary, a[href], [role='button'], [role='tab'], [role='radio'], [role='option']");
      if (control && (e.key === "Enter" || (e.key === " " && target.matches(":focus-visible")))) return;
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
      else if (e.key.toLowerCase() === "r" && unit && !rendering && !analysing) void render({ units: [unit.id] });
      else if (e.key.toLowerCase() === "n") nextToReview();
      else if (e.key === "Enter" && unit) playback.play(unit.id);
      else if (/^[0-9]$/.test(e.key) && unit?.speech) {
        // 0 gives the line to the narrator; 1 to 9 to this chapter's speakers.
        const who = e.key === "0" ? "" : chapterSpeakers[Number(e.key) - 1];
        if (who !== undefined) void setSpeaker(unit, who).catch(report);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const shown = chapterUnits.filter(
    (u) => filter === "all" || (filter === "review" ? issues.has(u.id) : filter === "speaker" ? uncertainSpeaker(u) : !u.take || u.status === "pending"),
  );
  // The script as blocks: each run of one speaker inside a paragraph, with
  // who speaks it, its state and its length beside it.
  const blocks = useMemo(() => {
    const groups: { paragraph: number; heading: boolean; speaker: string; units: ProductionUnit[] }[] = [];
    for (const u of shown) {
      const last = groups.at(-1);
      const speaker = u.speaker || "";
      if (last && last.paragraph === u.paragraph && last.speaker === speaker && !u.heading && !last.heading) last.units.push(u);
      else groups.push({ paragraph: u.paragraph, heading: u.heading, speaker, units: [u] });
    }
    return groups;
  }, [shown]);
  const blockState = (list: ProductionUnit[]) =>
    list.some((u) => issues.has(u.id))
      ? (["flagged", t("Worth a listen")] as const)
      : list.some((u) => u.status === "failed")
        ? (["failed", t("Needs a new take")] as const)
        : list.some((u) => !u.take || u.status === "pending")
          ? (["pending", t("Not generated")] as const)
          : list.every((u) => u.status === "approved")
            ? (["approved", t("Approved")] as const)
            : (["rendered", t("Generated")] as const);
  const narratorVoice = voices.find((v) => v.id === info.voice)?.name || info.voice;
  const chapterIndex = chapters.findIndex(([c]) => c === chapter);
  const sideTabs = [
    ["chapters", t("Chapters"), <ListOrdered size={17} key="i" />, chapters.length],
    ["cast", t("Cast"), <Users size={17} key="i" />, (info.cast || []).length],
    ["words", t("Pronunciation"), <SpellCheck2 size={17} key="i" />, (info.pronunciations || []).length],
  ] as const;
  // The chapters panel can be filtered by name.
  const chapterFilter = chapterQuery.trim().toLowerCase();

  return (
    <div
      className={`studio-mode studio-editor${left ? "" : " no-left"}${right ? "" : " no-right"}${narrow ? " narrow" : ""}`}
      style={{ "--studio-left": `${leftWidth}px`, "--studio-right": `${rightWidth}px` } as React.CSSProperties}
    >
      {left && (
        <PanelResizer side="left" width={leftWidth} min={side.min} max={side.max} fallback={side.fallback} inset={{ edge: 0, gap: 0 }} label={t("Resize the chapters panel")} onChange={side.onChange} />
      )}
      {right && (
        <PanelResizer side="right" width={rightWidth} min={260} max={560} fallback={330} inset={{ edge: 0, gap: 0 }} label={t("Resize the inspector")} onChange={setRightWidth} />
      )}
      {left && (
        <nav className="studio-side" aria-label={leftTab === "cast" ? t("Cast") : t("Chapters")}>
          {modeHeader()}
          {/* Back to the productions, the book and its progress, as Read shows an open book. */}
          <button className="back-library" onClick={onBack}>
            <ArrowLeft size={16} />
            {t("Productions")}
          </button>
          {/* The book and its progress in one card. */}
          <div className="studio-book-card">
          <div className="reader-book">
            {book ? <Cover book={book.meta} small /> : <span className="studio-nav-cover" />}
            <div className="reader-book-text">
              <strong>{info.title}</strong>
              <span>{info.author}</span>
            </div>
          </div>
          <div className="reader-progress studio-side-progress">
            <span className="studio-meter" aria-hidden="true">
              <i className="approved" style={{ width: `${(counts.approved / Math.max(1, units.length)) * 100}%` }} />
              <i style={{ width: `${((counts.rendered - counts.approved) / Math.max(1, units.length)) * 100}%` }} />
            </span>
            <span>
              {t("{done} of {total} lines generated", { done: String(counts.rendered), total: String(units.length) })} · {clock(spokenLength(production, units))}
            </span>
          </div>
          </div>
          {/* Three icon tabs with their counts, and the open one's name on its own
              line below, so the longest names in any language have the panel's width. */}
          <div className="studio-side-tabs" role="tablist">
            {sideTabs.map(([id, label, icon, count]) => (
              <button
                key={id}
                role="tab"
                aria-selected={leftTab === id}
                aria-label={count ? `${label} (${count})` : label}
                className={leftTab === id ? "active" : ""}
                onClick={() => setLeftTab(id)}
                data-tip={count ? `${label} (${count})` : label}
              >
                <span className="tab-icon" aria-hidden="true">
                  {icon}
                  {count > 0 && <b>{count > 999 ? "999+" : count}</b>}
                </span>
              </button>
            ))}
          </div>
          <h3 className="studio-side-title">{sideTabs.find(([id]) => id === leftTab)?.[1]}</h3>
          {leftTab === "words" ? (
            <WordsPanel production={production} onApply={(p) => void pronounce(p)} onJump={jumpTo} />
          ) : leftTab === "cast" ? (
            <CastPanel
              script={isScript}
              production={production}
              voices={voices}
              busy={analysing}
              progress={analysisNote}
              scope={<ScopePicker scope={scope} chapters={chapters.map(([c]) => c)} chapterName={chapterName} onChange={setScope} label={t("What to read")} />}
              onAnalyse={() => (analysing ? stopAnalysing() : void runAnalysis())}
              onVoice={(c, v) => void setCharacterVoice(c, v)}
              onMerge={(a, b) => void mergeCharacters(a, b)}
              onDesign={(c) => void designVoice(c)}
              onMood={(c, mood) => moodVoice(c, mood)}
            />
          ) : (
          <>
          <label className="search-field small-search studio-chapter-find">
            <Search size={14} />
            <input aria-label={t("Find a chapter")} placeholder={t("Find a chapter")} value={chapterQuery} onChange={(e) => setChapterQuery(e.target.value)} />
          </label>
          <ol className="studio-chapter-list">
            {chapters.map(([c, n], i) => (
              <li key={c} hidden={Boolean(chapterFilter) && !chapterName(c).toLowerCase().includes(chapterFilter)}>
                <button aria-current={c === chapter} onClick={() => setChapter(c)}>
                  <span className="number">{i + 1}</span>
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
          </>
          )}
        </nav>
      )}
      {/* The desk: the top bar, the script, the inspector and the player in
          one panel, as the main panel in Read and Work. */}
      <div className={"studio-desk" + (right ? "" : " no-right")}>
      <header className="topbar studio-topbar">
        <div className="header-left">
          <IconButton label={left ? t("Collapse navigation") : t("Expand navigation")} onClick={() => setLeft(!left)}>
            {left ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          </IconButton>
          <span className="breadcrumb">
            <button onClick={onBack}>{t("Productions")}</button>
            <ChevronRight size={13} />
            <span>{info.title}</span>
            <ChevronRight size={13} />
            <span className="current">{chapterName(chapter)}</span>
          </span>
        </div>
        <div className="header-actions">
          {checking ? (
            <span className="studio-pill busy" role="status">
              <span className="studio-spinner" aria-hidden="true" />
              {progressNote || t("Rendering")}
            </span>
          ) : status && !rendering && !analysing ? (
            <span className="studio-pill" role="status">
              {status}
            </span>
          ) : null}
          {checking ? (
            <button onClick={() => void cancelCheck()}>
              <Square size={14} /> {t("Stop")}
            </button>
          ) : rendering ? null : (
            <div className="studio-split">
              <ScopePicker scope={scope} chapters={chapters.map(([c]) => c)} chapterName={chapterName} onChange={setScope} label={t("What to generate")} />
              <button className="primary" onClick={generate} disabled={analysing || !scopePending}>
                <Wand2 size={15} /> {t("Generate")}
              </button>
            </div>
          )}
          <button
            className="icon-button"
            onClick={() => void checkChapter()}
            disabled={checking || !chapterUnits.some((u) => u.take && u.status !== "pending")}
            aria-label={t("Check this chapter by listening to it")}
            data-tip={checkModels.length ? t("Check this chapter by listening to it") : t("Needs a transcription model (Settings, Work mode, Voice notes)")}
          >
            <Ear size={18} />
          </button>
          <button onClick={() => setExporting(true)} disabled={!units.length}>
            <Download size={15} /> {t("Export")}
          </button>
          <IconButton label={right ? t("Collapse inspector") : t("Expand inspector")} onClick={() => setRight(!right)}>
            <PanelRight size={19} />
          </IconButton>
        </div>
      </header>


      <main className="studio-doc" ref={script}>
        <div className="studio-doc-head">
          {rendering && !run.current && (
            <JobBar
              title={t("Rendering")}
              value={overall ? overall.done / Math.max(1, overall.total) : null}
              detail={overall ? t("{done} of {total} lines", { done: String(overall.done), total: String(overall.total) }) : undefined}
              now={voicingText && t("Voicing: {line}", { line: voicingText.slice(0, 120) })}
              started={jobStart || Date.now()}
              onStop={() => void cancelRender()}
            />
          )}
          {rendering && run.current && (
            <JobBar
              title={t("Generating voices: {scope}", { scope: run.current.label })}
              value={runTotal ? runDone / runTotal : null}
              detail={t("{done} of {total} lines", { done: String(runDone), total: String(runTotal) })}
              now={voicingText && t("Voicing: {line}", { line: voicingText.slice(0, 120) })}
              started={jobStart}
              onStop={() => void cancelRender()}
            />
          )}
          {analysing && (
            <JobBar
              title={t("Finding who speaks: {scope}", { scope: scopeLabel(scope, chapterName, chapter) })}
              value={analysisStep ? Math.min(1, analysisStep.value) : null}
              detail={analysisStep ? t(analysisStep.step) : undefined}
              started={jobStart}
              onStop={stopAnalysing}
            />
          )}
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
          <span className="studio-spacer" />
          <span className="studio-narrator" data-tip={t("Narrator")}>
            <span className="studio-avatar" aria-hidden="true">
              {t("Narrator").slice(0, 1)}
            </span>
            {narratorVoice}
          </span>
        </div>
        <article className="studio-page">
          {blocks.map((block) => {
            const Tag = block.heading ? "h3" : "p";
            const who = block.speaker ? castById.get(block.speaker) : undefined;
            const [state, stateLabel] = blockState(block.units);
            const length = spokenLength(production, block.units);
            return (
              <div
                key={block.paragraph + ":" + block.units[0].id}
                className={"studio-block" + (block.heading ? " heading" : "") + (block.units.some((u) => u.id === selected) ? " sel" : "")}
                style={who ? ({ "--who": who.color } as React.CSSProperties) : undefined}
              >
                <span className="studio-block-who">
                  {!block.heading && (
                    <>
                      <span className="studio-avatar" aria-hidden="true">
                        {(who?.name || t("Narrator")).slice(0, 1)}
                      </span>
                      <span className="name">{who?.name || t("Narrator")}</span>
                    </>
                  )}
                </span>
                <Tag className="studio-block-text">
                  {block.units.map((u) => (
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
                        voicing.includes(u.id) ? "voicing" : "",
                        uncertainSpeaker(u) ? "unsure" : "",
                      ].join(" ")}
                      onClick={() => setSelected(u.id)}
                      onDoubleClick={() => playback.play(u.id)}
                    >
                      {u.text}{" "}
                      {u.status === "approved" && <Lock className="studio-lock" size={11} aria-label={t("Approved")} />}
                    </span>
                  ))}
                </Tag>
                <span className="studio-block-meta">
                  <span className={"studio-state " + state}>{stateLabel}</span>
                  <span className="time">{length ? clock(length) : ""}</span>
                  <button
                    className="icon-button"
                    aria-label={t("Play")}
                    data-tip={t("Play")}
                    disabled={!block.units.some((u) => u.take)}
                    onClick={() => playback.play(block.units[0].id)}
                  >
                    <Play size={13} fill="currentColor" />
                  </button>
                </span>
              </div>
            );
          })}
          {!blocks.length && (
            <p className="muted">
              {!chapterUnits.length
                ? t("This production has no lines.")
                : filter === "review"
                  ? t("Nothing to review in this chapter.")
                  : filter === "speaker"
                    ? t("No unsure speakers in this chapter.")
                    : t("Every line in this chapter has audio.")}
            </p>
          )}
        </article>
      </main>

      {right && (
        <aside className="studio-inspector" aria-label={t("Inspector")}>
          <div className="inspector-header">
            <div className="inspector-tabs" role="tablist" aria-label={t("Inspector tabs")}>
              {(
                [
                  ["line", t("Line"), <AudioLines size={18} key="i" />],
                  ["production", t("Production"), <SlidersHorizontal size={18} key="i" />],
                ] as const
              ).map(([id, label, icon]) => (
                <button key={id} role="tab" aria-selected={inspectorTab === id} className={inspectorTab === id ? "active" : ""} onClick={() => setInspectorTab(id)}>
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <IconButton label={t("Close inspector")} onClick={() => setRight(false)}>
              <X size={16} />
            </IconButton>
          </div>
          <div className="inspector-scroll">
          {inspectorTab === "line" && !unit ? (
            <p className="studio-hint studio-empty">{t("Choose a line in the script to hear its takes, change its text or who says it.")}</p>
          ) : inspectorTab === "line" && unit ? (
            <LineInspector
              key={unit.id}
              production={production}
              unit={unit}
              issues={issues.get(unit.id) || []}
              rendering={rendering || analysing}
              onPlayTake={(take) => playback.play(unit.id, take)}
              onSave={(u) => void saveUnits([u]).catch(report)}
              onApprove={() => approve(unit)}
              onRegenerate={() => void render({ units: [unit.id] })}
              onNext={() => nextToReview(unit.id)}
              onPause={(pause) => void saveUnits([{ ...unit, pause }]).catch(report)}
              cast={info.cast || []}
              chapterSpeakers={chapterSpeakers}
              onSpeaker={(who) => void setSpeaker(unit, who).catch(report)}
              voices={voices}
              onVoice={(v) => void setLineVoice(unit, v).catch(report)}
            />
          ) : (
            <Overview
              production={production}
              voices={voices}
              counts={counts}
              onVoice={async (voice) => {
                try {
                  const next = { ...info, voice, updated: Date.now() };
                  await saveProductionInfo(next);
                  onChange({ ...production, info: next });
                } catch (e) {
                  report(e);
                }
              }}
              onReview={() => nextToReview("")}
              onRegenerateFlagged={() => void render({ units: [...issues.keys()].filter((id) => units.find((u) => u.id === id)?.status !== "approved") })}
              rendering={rendering || analysing}
              busy={rendering || checking || exporting || analysing}
              confirming={confirming}
              setConfirming={setConfirming}
              onDelete={async () => {
                try {
                  await onDelete();
                } catch (e) {
                  setConfirming(false);
                  report(e);
                }
              }}
              onInfo={async (next) => {
                await saveProductionInfo(next);
                onChange({ ...production, info: next });
              }}
            />
          )}
          </div>
        </aside>
      )}

      <Timeline
        production={production}
        units={chapterUnits}
        cast={info.cast || []}
        issues={issues}
        selected={selected}
        playback={playback}
        chapterName={chapterName(chapter)}
        canPrev={chapterIndex > 0}
        canNext={chapterIndex < chapters.length - 1}
        onPrev={() => setChapter(chapters[chapterIndex - 1][0])}
        onNext={() => setChapter(chapters[chapterIndex + 1][0])}
        onSelect={(id) => {
          setSelected(id);
          script.current?.querySelector(`[data-unit="${id}"]`)?.scrollIntoView({ block: "center" });
        }}
      />
      </div>

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
  // A change from outside (a pronunciation, say) shows here while nothing is typed.
  const [seenText, setSeenText] = useState(unit.text);
  if (unit.text !== seenText) {
    setSeenText(unit.text);
    if (draft.replace(/\s+/g, " ").trim() === seenText) setDraft(unit.text);
  }
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
      <div className="studio-voice-card" style={unit.speaker ? ({ "--who": cast.find((c) => c.id === unit.speaker)?.color } as React.CSSProperties) : undefined}>
        <span className="studio-avatar" aria-hidden="true">
          {(cast.find((c) => c.id === unit.speaker)?.name || t("Narrator")).slice(0, 1)}
        </span>
        <LineVoice production={production} unit={unit} cast={cast} voices={voices} onVoice={onVoice} disabled={rendering} />
      </div>
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
              <Wave production={production.info.id} take={take} bars={36} />
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
      <div className="studio-row studio-actions">
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
  busy,
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
  // A job runs on the production (render, check, export, analysis): it cannot be deleted now.
  busy: boolean;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  onDelete: () => Promise<void>;
  onInfo: (info: Production["info"]) => Promise<void>;
}) {
  const { info, units } = production;
  const total = units.length;
  const [savingCopy, setSavingCopy] = useState(false);
  const blocked = busy || savingCopy;
  return (
    <div className="studio-panel">
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
      <PortableCopy id={info.id} onSaving={setSavingCopy} />
      <div className="studio-danger">
        {confirming && !blocked ? (
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
          <button className="danger-text" onClick={() => setConfirming(true)} disabled={blocked} data-tip={blocked ? t("Stop rendering, checking or exporting first") : undefined}>
            <Trash2 size={14} /> {t("Delete production")}
          </button>
        )}
      </div>
    </div>
  );
}

// Saves the production as one file (takes, book and designed voices) to carry to another computer.
function PortableCopy({ id, onSaving }: { id: string; onSaving: (saving: boolean) => void }) {
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
          onSaving(true);
          setSaved("");
          setError("");
          setValue(0);
          try {
            setSaved((await savePortable(id)) || "");
          } catch (e) {
            setError(String(e));
          } finally {
            setSaving(false);
            onSaving(false);
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
            <select
              value={bed.level}
              onChange={(e) => {
                setError("");
                onInfo({ ...info, bed: { ...bed, level: e.target.value as "quiet" | "low" | "medium" }, updated: Date.now() }).catch((err) => setError(String(err)));
              }}
              aria-label={t("Level")}
            >
              <option value="quiet">{t("Quiet")}</option>
              <option value="low">{t("Low")}</option>
              <option value="medium">{t("Medium")}</option>
            </select>
            <button
              onClick={async () => {
                setError("");
                try {
                  // The file is only dropped from the production once it is gone.
                  await clearBed(info.id);
                  const next = { ...info, updated: Date.now() };
                  delete next.bed;
                  await onInfo(next);
                } catch (e) {
                  setError(String(e));
                }
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
