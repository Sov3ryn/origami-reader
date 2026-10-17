import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FileSpreadsheet,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  FilePlus2,
  FileText,
  FolderPlus,
  GalleryVerticalEnd,
  Highlighter,
  Inbox,
  LoaderCircle,
  MoreHorizontal,
  History,
  Presentation,
  Puzzle,
  StickyNote as StickyIcon,
  FolderInput,
  Square,
  Volume2,
  CalendarClock,
  ClipboardCheck,
  Share2,
  DraftingCompass,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Quote,
  Search,
  Sparkles,
  SunMedium,
  Trash2,
  Upload,
  X,
  ImagePlus,
} from "lucide-react";
import { currentLanguage, t } from "../i18n";
import type { Annotation, BookMeta } from "../types";
import { CardComposer, type CardDraft } from "./CardComposer";
import { makeCard, reviewedToday, syncNoteCards, todaysQueue } from "./cards";
import { Connections, type DocInfo, type LinkedItem } from "./Connections";
import { LinkForMe, type LinkScope, type Proposal } from "./LinkForMe";
import { NoteEditor, type DraggedPassage } from "./NoteEditor";
import { SourcePane } from "./SourcePane";
import { StudySession } from "./StudySession";
import { deleteWork, exportFolder, loadWork, pruneVersions, saveWork } from "./store";
import {
  addRelated,
  escapeHtml,
  linkMentions,
  noteLinks,
  noteText,
  pairId,
  passageLinks,
  related,
  relatedIndex,
  removeRelated,
  renameLinks,
  same,
  unlinkedMentions,
  type RelatedDoc,
} from "./text";
import { exportFiles, importAsNote, NOTE_IMPORTS, safeName } from "./transfer";
import {
  decodeVector,
  embedTexts,
  embeddingStatus,
  encodeVector,
  mergeMatches,
  onDownload,
  semanticRelated,
  textHash,
  vectorId,
  type EmbeddingStatus,
  type VectorItem,
} from "./semantic";
import { logAnswer, setTaskDone } from "./schedule";
import { SchedulePage } from "./SchedulePage";
import { NoteHeader } from "./NoteHeader";
import { buildTutorial } from "./tutorial";
import { readBook } from "../storage";
import type { Editor } from "@tiptap/react";
import {
  blankWorkbook,
  findSheet,
  parseRange,
  rangeText,
  readRange,
  tablesFromHtml,
  usedRange,
  workbookText,
  type CellValue,
  type SheetDoc,
} from "./sheets/model";
import { readCsv, readXlsx, writeCsv, writeXlsx } from "./sheets/excel";
import { SheetPage } from "./sheets/SheetPage";
import { TipCard } from "./TipCard";
import { shortcuts } from "./shortcuts";
import { MathText } from "./FormulaDialog";
import { diagramSvgs } from "./diagrams/DiagramBlock";
import { HistoryDialog } from "./HistoryDialog";
import { TemplatePicker } from "./TemplatePicker";
import { PageBoundary } from "./PageBoundary";
import { PracticeTest } from "./PracticeTest";
import { PictureContext, PicturePage } from "./PictureCards";
import { maskOrder, newPictureSet, pictureTitle, syncPictureCards, type PictureSet } from "./pictures";
import { useNoteReader } from "./useNoteReader";
import { daysToExam, examCards, exportCardSet, importCardSet } from "./practice";
import { StickyLayer, newSticky, type StickyNote } from "./stickies/Stickies";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { VaultMenu } from "./VaultMenu";
import { PlanPage } from "./plans/PlanPage";
import { PlanContext, type PlanWorld } from "./plans/PlanBlock";
import { PluginBlockContext, type PluginBlockWorld } from "./plugins/PluginBlock";
import { VoiceContext, type VoiceWorld } from "./voice/VoiceBlock";
import { listRecordings, loadRecording } from "./voice/voice";
import { linesToHtml, readPhoto } from "./ink/ink";
import { newPlan, planText, type PlanDoc } from "./plans/model";
import { exportWorkspace, importWorkspace, inWorkspace, mainWorkspace, MAIN, rememberWorkspace, savedWorkspace, stamp, workspaceColors, workspaceOf, type WorkspaceDoc } from "./workspaces";
import type { Vault } from "../storage";
import { noteVersions } from "./store";
import { PluginHost, type PluginCalls, type PluginCommand, type PluginHostApi } from "./plugins/PluginHost";
import { listPlugins, pluginActive, type PluginManifest, type PluginPrefs } from "./plugins/plugins";
import { cleanHtml } from "./transfer";
import { embedsAsLinks } from "./embeds/EmbedBlock";
import { BoardPage } from "./boards/BoardPage";
import { boardIsEmpty, boardText, emptyScene, fromExcalidrawFile, type BoardDoc } from "./boards/model";
import { EmbedContext, type EmbedWorld } from "./embeds/EmbedBlock";
import { ConsentDialog, EmbedDialog } from "./embeds/EmbedDialogs";
import { openUrl } from "./store";
import { ChartBuilder } from "./charts/ChartBuilder";
import { ChartContext, type ChartWorld } from "./charts/ChartBlock";
import { lookFrom, renderChartSvg } from "./charts/ChartView";
import { defaultSpec, type ChartSpec } from "./charts/spec";
import { bytesToBase64 } from "./store";
import {
  subjectColors,
  type CardSource,
  type HiddenPair,
  type LinkBatch,
  type Note,
  type NoteVersion,
  type StudyCard,
  type Subject,
  type WorkData,
  type WorkItem,
} from "./types";
import "./work.css";
import "./work-refine.css";
import "./work-theme.css";
import "./work-sheets.css";
import "./work-embeds.css";
import "./work-blocks.css";

type View =
  | { kind: "today" }
  | { kind: "inbox" }
  | { kind: "cards" }
  | { kind: "schedule" }
  | { kind: "sheet"; id: string }
  | { kind: "board"; id: string }
  | { kind: "plan"; id: string }
  | { kind: "picture"; id: string }
  | { kind: "subject"; id: string }
  | { kind: "note"; id: string }
  | { kind: "study"; cards: StudyCard[]; title: string; back: View }
  | { kind: "practice"; cards: StudyCard[]; title: string; back: View };

export type Handoff = { bookId: string; paragraphId?: string; at: number };

const LIST_OF: Record<WorkItem["kind"], keyof WorkData> = {
  subject: "subjects",
  note: "notes",
  card: "cards",
  batch: "batches",
  hidden: "hidden",
  vector: "vectors",
  log: "logs",
  meta: "meta",
  sheet: "sheets",
  chart: "charts",
  board: "boards",
  sticky: "stickies",
  workspace: "workspaces",
  plan: "plans",
  picture: "pictures",
};
const WELCOME_KEY = "origami-work-welcomed";
const SECONDS_PER_CARD = 9;

const remembered = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
const remember = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* private window */
  }
};

export function WorkMode({
  open,
  books,
  annotations,
  handoff,
  speak,
  fourButtons,
  newPerDay,
  connectionsModel,
  language,
  dataVersion,
  modeSwitch,
  onOpenPassage,
  onImportBooks,
  onSettings,
  sourcesFilter,
  onSourcesFilter,
  theme,
  onTheme,
  onMarkSource,
  tipsOn,
  onTipsOff,
  embedsOn,
  pluginPrefs,
  pluginsOff,
  vaults,
  onUnlockVault,
  onLockVault,
  onEmbedsChoice,
  notify,
}: {
  open: boolean;
  books: BookMeta[];
  annotations: Annotation[];
  handoff: Handoff | null;
  speak?: (text: string) => Promise<string>;
  fourButtons: boolean;
  newPerDay: number;
  // "standard", "precise" or "words" (Settings, Work mode).
  connectionsModel: string;
  language: string;
  dataVersion: number;
  modeSwitch: React.ReactNode;
  onOpenPassage: (bookId: string, paragraphId?: string) => void;
  onImportBooks: (files: File[]) => void;
  // Opens Settings, Work mode (to add the Connections model).
  onSettings: () => void;
  // "work": only books marked for work; "all": the whole library.
  sourcesFilter: string;
  onSourcesFilter: (value: string) => void;
  // "reading", "light" or "dark".
  theme: string;
  onTheme: (value: string) => void;
  onMarkSource: (book: BookMeta) => void;
  tipsOn: boolean;
  onTipsOff: () => void;
  // Online embeds, accepted in a consent dialog.
  embedsOn: boolean;
  pluginPrefs: PluginPrefs;
  pluginsOff: boolean;
  vaults: Vault[];
  onUnlockVault: (vault: Vault) => void;
  onLockVault: (vault: Vault) => void;
  onEmbedsChoice: (on: boolean) => void;
  notify: (message: string) => void;
}) {
  const [data, setData] = useState<WorkData | null>(null);
  const [view, setView] = useState<View>({ kind: "today" });
  const [source, setSource] = useState<{ bookId: string; paragraphId?: string } | null>(null);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [composer, setComposer] = useState<{ text: string; source?: CardSource; noteId?: string } | null>(null);
  const [palette, setPalette] = useState(false);
  const [history, setHistory] = useState(false);
  const [picking, setPicking] = useState(false);
  // Plugins: the installed ones, those turned on, and what they added.
  const [manifests, setManifests] = useState<PluginManifest[]>([]);
  const [pluginCommands, setPluginCommands] = useState<PluginCommand[]>([]);
  const [pluginPanel, setPluginPanel] = useState<string | null>(null);
  const pluginHost = useRef<PluginHostApi>(null);
  useEffect(() => {
    if (!open) return;
    void listPlugins()
      .then(setManifests)
      .catch(() => setManifests([]));
  }, [open, pluginPrefs, pluginsOff]);
  const activePlugins = useMemo(() => manifests.filter((m) => pluginActive(m, pluginPrefs, pluginsOff)), [manifests, pluginPrefs, pluginsOff]);
  // Voice notes: recordings saved for the open note, in its vault and workspace.
  const voiceNoteRef = useRef<{ id: string; vault?: string; workspace?: string } | null>(null);
  const voiceWorld = useMemo<VoiceWorld>(
    () => ({
      save: async (r) => {
        const note = voiceNoteRef.current;
        if (!note) throw new Error(t("Open a note to record a voice note."));
        await saveWork([{ ...r, note: note.id, ...(note.vault ? { vault: note.vault } : {}), ...(note.workspace ? { workspace: note.workspace } : {}) } as unknown as WorkItem]);
      },
      load: (id) => loadRecording(id).catch(() => null),
      remove: (id) => void deleteWork([id]).catch(() => undefined),
      notify,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const pluginBlockWorld = useMemo<PluginBlockWorld>(
    () => ({ active: new Map(activePlugins.map((p) => [p.id, p])), dark: theme === "dark", notify }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlugins, theme],
  );
  const [linkForMe, setLinkForMe] = useState(false);
  // Both side columns fold away on their own, and stay as they were left.
  const [sidebarOpen, setSidebarOpen] = useState(() => remembered("origami.workSidebar", true));
  const [connectionsOpen, setConnectionsOpen] = useState(() => remembered("origami.workConnections", true));
  useEffect(() => remember("origami.workSidebar", sidebarOpen), [sidebarOpen]);
  useEffect(() => remember("origami.workConnections", connectionsOpen), [connectionsOpen]);
  const [newSubject, setNewSubject] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const [welcomed, setWelcomed] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) === "1";
    } catch {
      return true;
    }
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const dataRef = useRef<WorkData | null>(null);
  dataRef.current = data;

  const fail = useCallback((e: unknown) => notify(e instanceof Error ? e.message : String(e)), [notify]);
  // The open workspace (remembered on this computer). Work mode holds only
  // its items; the list of workspaces comes with every load.
  const [wsId, setWsId] = useState(savedWorkspace);
  const wsRef = useRef(wsId);
  wsRef.current = wsId;
  // Notes in every workspace, so search data of the others is kept.
  const otherNotes = useRef(new Set<string>());
  const reload = useCallback(
    () =>
      loadWork()
        .then((all) => {
          let id = wsRef.current;
          if (id !== MAIN && !all.workspaces.some((w) => w.id === id)) {
            // Its vault locked, or it was deleted elsewhere.
            id = MAIN;
            wsRef.current = MAIN;
            setWsId(MAIN);
          }
          otherNotes.current = new Set(all.notes.map((n) => "n:" + n.id));
          setData(inWorkspace(all, id));
        })
        .catch(fail),
    [fail],
  );
  useEffect(() => {
    if (open) void reload();
  }, [open, dataVersion, reload]);

  // The tour, added once (and again on request from the menu).
  const seeding = useRef(false);
  async function addTutorial() {
    if (seeding.current) return;
    seeding.current = true;
    try {
      const lang = (language || currentLanguage()).startsWith("fr") ? "fr" : "en";
      const items = await buildTutorial(lang, books, readBook);
      await put([...items, { id: "meta:tutorial", kind: "meta", value: "1" }]);
      const first = items.find((i): i is Note => i.kind === "note");
      if (first) setView({ kind: "note", id: first.id });
    } catch (e) {
      fail(e);
    } finally {
      seeding.current = false;
    }
  }
  useEffect(() => {
    if (open && data && !data.meta.some((m) => m.id === "meta:tutorial")) void addTutorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  // --- Saving ----------------------------------------------------------------------
  const put = useCallback(
    async (given: WorkItem[], remove: string[] = []) => {
      const id = wsRef.current;
      const items = stamp(given, dataRef.current?.workspaces.find((w) => w.id === id), id);
      setData((d) => {
        if (!d) return d;
        const next: WorkData = { ...d };
        const drop = new Set([...remove, ...items.map((i) => i.id)]);
        for (const key of Object.keys(d) as (keyof WorkData)[])
          (next as Record<string, WorkItem[]>)[key] = (d[key] as WorkItem[]).filter((x) => !drop.has(x.id));
        for (const i of items) (next as Record<string, WorkItem[]>)[LIST_OF[i.kind]].push(i);
        next.subjects.sort((a, b) => a.order - b.order);
        return next;
      });
      try {
        await saveWork(items);
        await deleteWork(remove);
      } catch (e) {
        fail(e);
        void reload();
      }
    },
    [fail, reload],
  );
  const bump = (id: string) => setRevisions((r) => ({ ...r, [id]: (r[id] || 0) + 1 }));

  const notes = data?.notes || [];
  const subjects = data?.subjects || [];
  const cards = data?.cards || [];
  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const current = view.kind === "note" ? notes.find((n) => n.id === view.id) : undefined;
  voiceNoteRef.current = current ? { id: current.id, vault: current.vault, workspace: (current as { workspace?: string }).workspace } : null;
  // A vault that locks takes its notes and books with it: leave them.
  useEffect(() => {
    if (!data) return;
    if (view.kind === "note" && !current) setView({ kind: "today" });
    if (view.kind === "picture" && !data.pictures.some((p) => p.id === view.id)) setView({ kind: "cards" });
    if (source && !books.some((b) => b.id === source.bookId)) setSource(null);
  }, [data, view, current, source, books]);

  // Sheets left empty and untitled go the same way.
  const lastSheet = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastSheet.current;
    const now = view.kind === "sheet" ? view.id : null;
    lastSheet.current = now;
    if (!prev || prev === now) return;
    const sh = dataRef.current?.sheets.find((x) => x.id === prev);
    const empty = sh && sh.data.sheetOrder.every((id) => !Object.keys(sh.data.sheets[id]?.cellData || {}).length);
    const used = dataRef.current?.charts.some((c) => c.source.kind === "sheet" && c.source.sheetId === prev);
    if (sh && empty && !used && (sh.title === t("Untitled sheet") || !sh.title.trim())) void put([], [sh.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  // And boards.
  const lastBoard = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastBoard.current;
    lastBoard.current = view.kind === "board" ? view.id : null;
    if (!prev || prev === lastBoard.current) return;
    const b = dataRef.current?.boards.find((x) => x.id === prev);
    if (b && boardIsEmpty(b) && (b.title === t("Untitled board") || !b.title.trim())) void put([], [b.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  // Notes left empty and untitled are tidied away when you move on.
  const lastNote = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastNote.current;
    lastNote.current = current?.id || null;
    if (!prev || prev === current?.id) return;
    const n = dataRef.current?.notes.find((x) => x.id === prev);
    if (n && !n.title.trim() && !noteText(n.html).trim() && !dataRef.current?.cards.some((c) => c.noteId === n.id)) {
      void put([], [n.id]);
      void pruneVersions(n.id, 0).catch(() => undefined);
    }
  }, [current?.id, put]);

  async function createNote(fields: Partial<Note> = {}) {
    const now = Date.now();
    const note: Note = {
      id: crypto.randomUUID(),
      kind: "note",
      title: "",
      html: "",
      created: now,
      updated: now,
      subjectId: view.kind === "subject" ? view.id : current?.subjectId,
      ...fields,
    };
    await put([note]);
    setView({ kind: "note", id: note.id });
    return note;
  }
  function changeNote(id: string, patch: Partial<Note>) {
    const d = dataRef.current;
    const note = d?.notes.find((n) => n.id === id);
    if (!d || !note) return;
    const next = { ...note, ...patch, updated: Date.now() };
    if (
      next.html === note.html &&
      next.title === note.title &&
      next.subjectId === note.subjectId &&
      next.icon === note.icon &&
      next.cover === note.cover &&
      next.pinned === note.pinned &&
      next.paper === note.paper &&
      (next.tags || []).join() === (note.tags || []).join()
    )
      return;
    const sync = syncNoteCards(next, d.cards);
    void put([next, ...sync.save], sync.remove);
    // History: the text as it was before each stretch of editing, at most
    // one version every ten minutes.
    if (next.html !== note.html && noteText(note.html).trim() && Date.now() - (snapshots.current.get(id) || 0) > 10 * 60_000) {
      snapshots.current.set(id, Date.now());
      void keepVersion(note);
    }
  }
  const snapshots = useRef(new Map<string, number>());
  async function keepVersion(note: Note) {
    const v: NoteVersion = { id: `v:${note.id}:${Date.now()}`, kind: "version", note: note.id, title: note.title, html: note.html, saved: note.updated, vault: note.vault };
    try {
      await saveWork([v]);
      await pruneVersions(note.id);
    } catch {
      /* history is a convenience; the note itself is saved */
    }
  }
  // What plugins can do, each call checked against the permissions granted
  // (PluginHost). Vault notes and cards are never shared, and any HTML a
  // plugin sends goes through the note schema like an import.
  const pluginHtml = (html: string) => embedsAsLinks(cleanHtml(html));
  const pluginCalls: PluginCalls = {
    listNotes: () =>
      (dataRef.current?.notes || [])
        .filter((n) => !n.vault)
        .map((n) => ({ id: n.id, title: n.title, updated: n.updated, subject: subjects.find((s) => s.id === n.subjectId)?.name || null, tags: n.tags || [] })),
    getNote: (id) => {
      const n = dataRef.current?.notes.find((x) => x.id === id && !x.vault);
      return n ? { id: n.id, title: n.title, html: n.html, text: noteText(n.html), updated: n.updated } : null;
    },
    currentNote: () => (current && !current.vault ? { id: current.id, title: current.title, html: current.html, text: noteText(current.html), updated: current.updated } : null),
    selection: () => {
      const e = noteEditor.current;
      if (!e || !current || current.vault) return "";
      const { from, to } = e.state.selection;
      return e.state.doc.textBetween(from, to, "\n");
    },
    createNote: async (title, html) => {
      const now = Date.now();
      const note: Note = { id: crypto.randomUUID(), kind: "note", title: title.slice(0, 140), html: pluginHtml(html), created: now, updated: now };
      await put([note]);
      return note.id;
    },
    appendNote: (id, html) => {
      const n = dataRef.current?.notes.find((x) => x.id === id && !x.vault);
      if (!n) throw new Error("No such note");
      changeNote(id, { html: n.html + pluginHtml(html) });
      bump(id);
    },
    replaceNote: (id, html) => {
      const n = dataRef.current?.notes.find((x) => x.id === id && !x.vault);
      if (!n) throw new Error("No such note");
      void keepVersion(n);
      changeNote(id, { html: pluginHtml(html) });
      bump(id);
    },
    insert: (html) => {
      const e = noteEditor.current;
      if (!e || view.kind !== "note" || !current || current.vault) return false;
      e.chain().focus().insertContent(pluginHtml(html)).run();
      return true;
    },
    listCards: () =>
      (dataRef.current?.cards || [])
        .filter((c) => !c.vault)
        .map((c) => ({ id: c.id, type: c.type, front: c.front, back: c.back, subject: subjects.find((s) => s.id === c.subjectId)?.name || null })),
    createCard: async (front, back) => {
      const card = makeCard({ type: back.trim() ? "qa" : "cloze", front, back, subjectId: current?.subjectId, origin: "manual" });
      await put([card]);
      return card.id;
    },
    notify: (text) => notify(text),
  };
  // --- Workspaces -----------------------------------------------------------------------
  const workspaces: WorkspaceDoc[] = useMemo(() => {
    const list = data?.workspaces || [];
    const main = list.find((w) => w.id === MAIN) || mainWorkspace();
    return [main, ...list.filter((w) => w.id !== MAIN).sort((a, b) => a.created - b.created)];
  }, [data?.workspaces]);
  const ws = workspaces.find((w) => w.id === wsId) || workspaces[0];
  const [naming, setNaming] = useState<{ title: string; value: string; run: (name: string) => void } | null>(null);
  const wsInput = useRef<HTMLInputElement>(null);
  function switchWorkspace(id: string) {
    if (id === wsRef.current) return;
    wsRef.current = id;
    setWsId(id);
    rememberWorkspace(id);
    setView({ kind: "today" });
    setSource(null);
    void reload();
  }
  function createWorkspace() {
    setNaming({
      title: t("New workspace"),
      value: "",
      run: async (name) => {
        const w: WorkspaceDoc = { id: crypto.randomUUID(), kind: "workspace", name, color: workspaceColors[workspaces.length % workspaceColors.length], created: Date.now() };
        await put([w]);
        switchWorkspace(w.id);
      },
    });
  }
  function renameWorkspace(w: WorkspaceDoc) {
    setNaming({ title: t("Rename workspace"), value: w.name, run: (name) => void put([{ ...w, name }]) });
  }
  async function duplicateWorkspace(w: WorkspaceDoc) {
    try {
      const all = await loadWork();
      const copy = importWorkspace(exportWorkspace(all, w), []);
      copy.workspace.name = t("Copy of {name}", { name: w.name }).slice(0, 60);
      copy.workspace.color = w.color;
      const sealed = w.vault ? { ...copy.workspace, vault: w.vault } : copy.workspace;
      const items = w.vault ? copy.items.map((i) => ({ ...i, vault: w.vault })) : copy.items;
      await saveWork([sealed, ...items]);
      switchWorkspace(sealed.id);
      notify(t("Workspace duplicated."));
    } catch (e) {
      fail(e);
    }
  }
  async function exportWs(w: WorkspaceDoc) {
    if (w.vault && !window.confirm(t("This workspace is in a vault. The exported file is not encrypted: anyone with the file can read it. Export anyway?"))) return;
    try {
      saveFile(w.name || "workspace", exportWorkspace(await loadWork(), w), "origami-workspace");
    } catch (e) {
      fail(e);
    }
  }
  async function importWsFile(file: File) {
    const { workspace, items } = importWorkspace(await file.text(), workspaces.map((w) => w.name));
    await saveWork([workspace, ...items]);
    switchWorkspace(workspace.id);
    notify(t("Workspace imported: {name}", { name: workspace.name }));
  }
  async function deleteWorkspace(w: WorkspaceDoc) {
    if (w.id === MAIN) return;
    if (!window.confirm(t('Delete the workspace "{name}" and everything in it? This cannot be undone. Export it first to keep a copy.', { name: w.name }))) return;
    try {
      const all = await loadWork();
      const ids: string[] = [w.id];
      for (const list of Object.values(all) as WorkItem[][]) for (const i of list) if (workspaceOf(i as { workspace?: string }) === w.id) ids.push(i.id);
      for (const n of all.notes.filter((n) => workspaceOf(n as { workspace?: string }) === w.id)) void pruneVersions(n.id, 0).catch(() => undefined);
      await deleteWork(ids);
      switchWorkspace(MAIN);
      void reload();
    } catch (e) {
      fail(e);
    }
  }
  // Sealing: moves items (and the history and search data built from them)
  // into a vault or out of one. Items already in another vault stay there.
  async function seal(items: WorkItem[], from: string | undefined, to: string | null) {
    const moved = items
      .filter((i) => (i as { vault?: string }).vault === from || (!from && !(i as { vault?: string }).vault))
      .map((i) => {
        const { vault: _v, ...rest } = i as WorkItem & { vault?: string };
        return (to ? { ...rest, vault: to } : rest) as WorkItem;
      });
    const versions: NoteVersion[] = [];
    for (const n of moved.filter((i): i is Note => i.kind === "note"))
      for (const v of await noteVersions(n.id)) {
        const { vault: _v, ...rest } = v;
        versions.push(to ? { ...rest, vault: to } : rest);
      }
    // Search data is rebuilt (and sealed) from the moved text.
    const ids = new Set(moved.map((i) => i.id));
    const vectors = (dataRef.current?.vectors || []).filter((v) => ids.has(v.doc.slice(2))).map((v) => v.id);
    await saveWork([...moved, ...versions]);
    await deleteWork(vectors);
  }
  async function vaultWorkspace(w: WorkspaceDoc, vault: string | null) {
    try {
      const all = await loadWork();
      const items: WorkItem[] = [];
      for (const list of Object.values(all) as WorkItem[][]) for (const i of list) if (["subject", "note", "card", "sheet", "chart", "board", "sticky", "plan", "picture"].includes(i.kind) && workspaceOf(i as { workspace?: string }) === w.id) items.push(i);
      for (const r of await listRecordings().catch(() => [])) if (workspaceOf(r) === w.id) items.push(r as unknown as WorkItem);
      await seal(items, w.vault, vault);
      const { vault: _v, ...plain } = w;
      await saveWork([vault ? { ...plain, vault } : plain]);
      notify(vault ? t("The workspace is now in the vault. It hides when the vault locks.") : t("The workspace is out of the vault."));
      void reload();
    } catch (e) {
      fail(e);
    }
  }
  // One document, with its cards, charts, sticky notes and history.
  async function vaultDoc(doc: Note | SheetDoc | BoardDoc | PlanDoc, vault: string | null) {
    const d = dataRef.current;
    if (!d) return;
    const related: WorkItem[] = [
      doc,
      ...d.cards.filter((c) => c.noteId === doc.id),
      ...d.stickies.filter((s) => s.doc === doc.id),
      ...d.charts.filter((c) => c.source.kind === "sheet" && c.source.sheetId === doc.id),
      // Voice recordings follow their note.
      ...((await listRecordings().catch(() => [])).filter((r) => r.note === doc.id) as unknown as WorkItem[]),
    ];
    try {
      await seal(related, doc.vault, vault);
      notify(vault ? t("Kept in the vault. It hides when the vault locks.") : t("Taken out of the vault."));
      void reload();
    } catch (e) {
      fail(e);
    }
  }

  // --- Sticky notes ---------------------------------------------------------------------
  const stickies = data?.stickies || [];
  const noteSheet = useRef<HTMLDivElement>(null);
  const [newStickyId, setNewStickyId] = useState<string | null>(null);
  function addSticky(doc: { id: string; vault?: string }) {
    const sheet = noteSheet.current;
    const y = (sheet?.scrollTop || 0) + 140 + (stickies.filter((s) => s.doc === doc.id).length % 5) * 28;
    const s = { ...newSticky(doc.id, 0.64, y), ...(doc.vault ? { vault: doc.vault } : {}) };
    setNewStickyId(s.id);
    void put([s]);
  }
  const changeSticky = (s: StickyNote, patch: Partial<StickyNote>) => void put([{ ...s, ...patch, updated: Date.now() }]);
  async function restoreVersion(note: Note, v: NoteVersion) {
    await keepVersion({ ...note, updated: Date.now() });
    snapshots.current.set(note.id, Date.now());
    changeNote(note.id, { html: v.html });
    bump(note.id);
    setHistory(false);
    notify(t("Version restored. The text before it is in History too."));
  }
  async function deleteNote(note: Note) {
    if (!window.confirm(t('Delete "{title}"? Its cards from "question :: answer" lines go too.', { title: note.title || t("Untitled") })))
      return;
    const own = cards.filter((c) => c.noteId === note.id);
    const keep = own.filter((c) => c.origin === "manual").map((c) => ({ ...c, noteId: undefined }));
    const recordings = (await listRecordings().catch(() => [])).filter((r) => r.note === note.id).map((r) => r.id);
    await put(keep, [note.id, ...own.filter((c) => c.origin === "note").map((c) => c.id), ...stickies.filter((s) => s.doc === note.id).map((s) => s.id), ...recordings]);
    void pruneVersions(note.id, 0).catch(() => undefined);
    setView(note.subjectId ? { kind: "subject", id: note.subjectId } : { kind: "today" });
  }
  // Renaming a note keeps the links to it working.
  const titleAtFocus = useRef("");
  function renamed(id: string, before: string) {
    const d = dataRef.current;
    const note = d?.notes.find((n) => n.id === id);
    if (!d || !note || !before.trim() || same(before, note.title) || !note.title.trim()) return;
    const changed = d.notes
      .filter((n) => n.id !== id && noteLinks(n.html).some((l) => same(l, before)))
      .map((n) => ({ ...n, html: renameLinks(n.html, before, note.title), updated: Date.now() }));
    if (!changed.length) return;
    void put(changed);
    changed.forEach((n) => bump(n.id));
  }
  function noteByTitle(title: string) {
    return notes.find((n) => same(n.title.trim(), title.trim()));
  }
  function openTitle(title: string) {
    const found = noteByTitle(title);
    const sheet = found ? undefined : sheets.find((x) => same(x.title.trim(), title.trim()));
    const board = found || sheet ? undefined : boards.find((x) => same(x.title.trim(), title.trim()));
    const plan = found || sheet || board ? undefined : plans.find((x) => same(x.title.trim(), title.trim()));
    if (found) setView({ kind: "note", id: found.id });
    else if (sheet) setView({ kind: "sheet", id: sheet.id });
    else if (board) setView({ kind: "board", id: board.id });
    else if (plan) setView({ kind: "plan", id: plan.id });
    else void createNote({ title: title.trim(), subjectId: current?.subjectId });
  }

  // --- Sheets and charts ---------------------------------------------------------------
  const sheets = data?.sheets || [];
  const charts = data?.charts || [];
  const currentSheet = view.kind === "sheet" ? sheets.find((x) => x.id === view.id) : undefined;
  const [builder, setBuilder] = useState<{ spec: ChartSpec; insertInto?: string; tables?: CellValue[][][] } | null>(null);
  const [chartTarget, setChartTarget] = useState<string | null>(null);
  // Online embeds: the insert dialog, and the consent question (with what to
  // do once it is answered yes).
  const [embedDialog, setEmbedDialog] = useState(false);
  const [consent, setConsent] = useState<null | (() => void)>(null);
  const embedWorld = useMemo<EmbedWorld>(
    () => ({
      allowed: embedsOn,
      ask: () => setConsent(() => () => {}),
      openExternal: (url) => void openUrl(url).catch(fail),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [embedsOn],
  );
  function startEmbed() {
    if (embedsOn) setEmbedDialog(true);
    else setConsent(() => () => setEmbedDialog(true));
  }
  const noteEditor = useRef<Editor | null>(null);
  async function createSheet(fields: Partial<SheetDoc> = {}, rows: CellValue[][] = []) {
    const now = Date.now();
    const title = fields.title || t("Untitled sheet");
    const sheet: SheetDoc = {
      id: crypto.randomUUID(),
      kind: "sheet",
      title,
      data: fields.data || blankWorkbook(title, t("Sheet1"), rows),
      created: now,
      updated: now,
      subjectId: view.kind === "subject" ? view.id : current?.subjectId,
      ...fields,
    };
    await put([sheet]);
    setView({ kind: "sheet", id: sheet.id });
    return sheet;
  }
  // --- Plans ----------------------------------------------------------------------------
  const plans = data?.plans || [];
  const currentPlan = view.kind === "plan" ? plans.find((x) => x.id === view.id) : undefined;
  async function createPlan(fields: Partial<PlanDoc> = {}, open = true) {
    const now = Date.now();
    const imperial = /^en-US/.test(navigator.language);
    const plan: PlanDoc = {
      ...newPlan(t("Untitled plan"), imperial ? "in" : "mm"),
      id: crypto.randomUUID(),
      created: now,
      updated: now,
      subjectId: view.kind === "subject" ? view.id : current?.subjectId,
      ...fields,
    };
    await put([plan]);
    if (open) setView({ kind: "plan", id: plan.id });
    return plan;
  }
  // Plans in notes: pick one (or start one) for the open note, or send a
  // plan to a note from its page.
  // Photos of handwriting: the photo, then the text read from it.
  const photoInput = useRef<HTMLInputElement>(null);
  async function photoHtml(file: File) {
    const { image, lines, error } = await readPhoto(file);
    const read = lines.length
      ? `<div data-callout="note"><p>${escapeHtml(t("Read from the photo. Words underlined in orange may be wrong."))}</p></div>${linesToHtml(lines)}`
      : `<div data-callout="warning"><p>${escapeHtml(error ? error.replace(/^Error: /, "") : t("No handwriting was found in this photo."))}</p></div>`;
    return `<img src="${image}" alt="${escapeHtml(t("Photo of handwriting"))}">${read}`;
  }
  // Reading a note aloud, and importing a folder of notes.
  const aloud = useNoteReader(speak);
  useEffect(() => aloud.stop(), [current?.id, aloud.stop]);
  const folderInput = useRef<HTMLInputElement>(null);
  async function importFolder(list: File[]) {
    const files = list.filter((f) => /\.(md|markdown|txt|html?)$/i.test(f.name) && !/(^|\/)\./.test(f.webkitRelativePath));
    if (!files.length) return notify(t("No notes found in this folder (Markdown, text or HTML)."));
    // Folders become subjects (two levels), files become notes.
    const made: WorkItem[] = [];
    const bySubject = new Map<string, string>();
    let order = (subjects.at(-1)?.order || 0) + 1;
    const subjectFor = (path: string[]): string | undefined => {
      if (!path.length) return undefined;
      const parts = path.slice(0, 2);
      const key = parts.join("/");
      if (bySubject.has(key)) return bySubject.get(key);
      const parent = parts.length > 1 ? subjectFor(parts.slice(0, 1)) : undefined;
      const existing = subjects.find((s) => same(s.name, parts[parts.length - 1]) && s.parent === parent);
      const id = existing?.id || crypto.randomUUID();
      if (!existing)
        made.push({ id, kind: "subject", name: parts[parts.length - 1].slice(0, 60), color: subjectColors[(order - 1) % subjectColors.length], order: order++, created: Date.now(), ...(parent ? { parent } : {}) } as Subject);
      bySubject.set(key, id);
      return id;
    };
    let notesMade = 0;
    for (const f of files) {
      const path = (f.webkitRelativePath || f.name).split("/").slice(1, -1);
      const n = await importAsNote(f).catch(() => null);
      if (!n) continue;
      const now = Date.now();
      made.push({ id: crypto.randomUUID(), kind: "note", title: n.title, html: n.html, created: now, updated: now, subjectId: subjectFor(path) } as Note);
      notesMade++;
    }
    await put(made);
    notify(t("{count} notes imported from the folder.", { count: notesMade }));
  }
  const [planPick, setPlanPick] = useState(false);
  const [planTarget, setPlanTarget] = useState<string | null>(null);
  const planWorld = useMemo<PlanWorld>(() => ({ plans: new Map(plans.map((p) => [p.id, p])), onOpen: (id) => setView({ kind: "plan", id }) }), [plans]);
  function insertPlan(id: string) {
    const e = noteEditor.current;
    if (e) e.chain().focus().insertContent([{ type: "planBlock", attrs: { id } }, { type: "paragraph" }]).run();
  }
  function changePlan(id: string, patch: Partial<PlanDoc>) {
    const old = dataRef.current?.plans.find((x) => x.id === id);
    if (old) void put([{ ...old, ...patch, updated: Date.now() }]);
  }
  async function deletePlan(plan: PlanDoc) {
    if (!window.confirm(t('Delete the plan "{title}"?', { title: plan.title || t("Untitled") }))) return;
    await put([], [plan.id, ...stickies.filter((x) => x.doc === plan.id).map((x) => x.id)]);
    setView(plan.subjectId ? { kind: "subject", id: plan.subjectId } : { kind: "today" });
  }

  // --- Picture cards ---------------------------------------------------------------------
  const pictures = data?.pictures || [];
  const pictureMap = useMemo(() => new Map(pictures.map((p) => [p.id, p])), [pictures]);
  const currentPicture = view.kind === "picture" ? pictures.find((x) => x.id === view.id) : undefined;
  async function createPictureSet(subjectId?: string) {
    const set = newPictureSet(subjectId ?? (view.kind === "subject" ? view.id : current?.subjectId));
    await put([set]);
    setView({ kind: "picture", id: set.id });
  }
  function changePicture(id: string, patch: Partial<PictureSet>) {
    const old = dataRef.current?.pictures.find((x) => x.id === id);
    if (!old) return;
    const next = { ...old, ...patch, updated: Date.now() };
    const { save, remove } = syncPictureCards(next, dataRef.current?.cards || []);
    void put([next, ...save], remove);
  }
  async function deletePicture(set: PictureSet) {
    await put([], [set.id, ...cards.filter((c) => c.picture?.set === set.id).map((c) => c.id)]);
    setView({ kind: "cards" });
  }
  // The cards of a set in the order of its boxes.
  function pictureCards(set: PictureSet) {
    const order = new Map(maskOrder(set.masks).map((m, i) => [m.id, i]));
    return (dataRef.current?.cards || []).filter((c) => c.picture?.set === set.id).sort((a, b) => (order.get(a.picture!.mask) ?? 0) - (order.get(b.picture!.mask) ?? 0));
  }
  // Deleting a picture card removes its box too, so it does not come back.
  function deleteCard(c: StudyCard) {
    const set = c.picture && dataRef.current?.pictures.find((p) => p.id === c.picture!.set);
    if (set) void put([{ ...set, masks: set.masks.filter((m) => m.id !== c.picture!.mask), updated: Date.now() }], [c.id]);
    else void put([], [c.id]);
  }
  // A picture set left without a picture or a title is removed on leaving it.
  const lastPicture = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastPicture.current;
    lastPicture.current = view.kind === "picture" ? view.id : null;
    if (!prev || prev === lastPicture.current) return;
    const p = dataRef.current?.pictures.find((x) => x.id === prev);
    if (p && !p.image && !p.title.trim()) void put([], [p.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // --- Boards ---------------------------------------------------------------------------
  const boards = data?.boards || [];
  const currentBoard = view.kind === "board" ? boards.find((x) => x.id === view.id) : undefined;
  async function createBoard(fields: Partial<BoardDoc> = {}) {
    const now = Date.now();
    const board: BoardDoc = {
      id: crypto.randomUUID(),
      kind: "board",
      title: t("Untitled board"),
      scene: emptyScene(),
      created: now,
      updated: now,
      subjectId: view.kind === "subject" ? view.id : current?.subjectId,
      ...fields,
    };
    await put([board]);
    setView({ kind: "board", id: board.id });
    return board;
  }
  function changeBoard(id: string, patch: Partial<BoardDoc>) {
    const old = dataRef.current?.boards.find((x) => x.id === id);
    if (old) void put([{ ...old, ...patch, updated: Date.now() }]);
  }
  async function deleteBoard(board: BoardDoc) {
    if (!window.confirm(t('Delete the board "{title}"?', { title: board.title || t("Untitled") }))) return;
    await put([], [board.id, ...stickies.filter((x) => x.doc === board.id).map((x) => x.id)]);
    setView(board.subjectId ? { kind: "subject", id: board.subjectId } : { kind: "today" });
  }
  function changeSheet(id: string, patch: Partial<SheetDoc>) {
    const old = dataRef.current?.sheets.find((x) => x.id === id);
    if (!old) return;
    void put([{ ...old, ...patch, updated: Date.now() }]);
  }
  async function deleteSheet(sheet: SheetDoc) {
    const used = charts.filter((c) => c.source.kind === "sheet" && c.source.sheetId === sheet.id);
    if (!window.confirm(t('Delete the sheet "{title}"? Charts made from it keep their last numbers.', { title: sheet.title || t("Untitled") })))
      return;
    // Charts keep working in notes, frozen with the sheet's last values.
    const frozen = used.map((c) => ({ ...c, source: { kind: "data" as const, rows: rowsFor(c) }, updated: Date.now() }));
    await put(frozen, [sheet.id, ...stickies.filter((x) => x.doc === sheet.id).map((x) => x.id)]);
    setView(sheet.subjectId ? { kind: "subject", id: sheet.subjectId } : { kind: "today" });
  }
  function rowsFor(spec: ChartSpec): CellValue[][] {
    if (spec.source.kind === "data") return spec.source.rows;
    const sheetId = spec.source.sheetId;
    const sheet = dataRef.current?.sheets.find((x) => x.id === sheetId) || sheets.find((x) => x.id === sheetId);
    const range = parseRange(spec.source.range);
    return sheet && range ? readRange(sheet.data, range) : [];
  }
  function sourceLabel(spec: ChartSpec) {
    if (spec.source.kind === "data") return t("Typed data");
    const sheetId = spec.source.sheetId;
    const sheet = sheets.find((x) => x.id === sheetId);
    return sheet ? `${sheet.title || t("Untitled")} · ${spec.source.range}` : t("Sheet deleted");
  }
  function newChart(fields: { sheet?: SheetDoc; range?: string | null; rows?: CellValue[][]; insertInto?: string; tables?: CellValue[][][] }) {
    const sheet = fields.sheet;
    let source: ChartSpec["source"];
    if (sheet) {
      const first = findSheet(sheet.data);
      const used = first ? usedRange(first) : null;
      const picked = fields.range && parseRange(fields.range);
      // A single selected cell means "chart the whole table".
      const range = picked && (picked.r2 > picked.r1 || picked.c2 > picked.c1) ? fields.range! : used ? rangeText(used) : "A1:C10";
      source = { kind: "sheet", sheetId: sheet.id, range };
    } else source = { kind: "data", rows: fields.rows || [] };
    setBuilder({
      spec: defaultSpec({ source, palette: theme === "reading" ? "origami" : "professional" }),
      insertInto: fields.insertInto,
      tables: fields.tables,
    });
  }
  async function saveChart(spec: ChartSpec, insertInto?: string) {
    await put([spec]);
    setBuilder(null);
    if (!insertInto) return;
    // Into the note on screen at the cursor, or at the end of another note.
    if (current?.id === insertInto && noteEditor.current)
      noteEditor.current.chain().focus().insertContent({ type: "chartBlock", attrs: { id: spec.id } }).run();
    else {
      const n = dataRef.current?.notes.find((x) => x.id === insertInto);
      if (n) {
        changeNote(n.id, { html: n.html + `<div data-chart="${spec.id}" class="chart-block"></div>` });
        bump(n.id);
      }
    }
  }
  function saveFile(name: string, payload: string, kind: "png" | "svg" | "xlsx" | "csv" | "excalidraw" | "origami-workspace" | "dxf" | "origami-cards") {
    const files: [string, string][] = [
      [
        `${safeName(name)}.${kind}`,
        kind === "svg" || kind === "csv" || kind === "excalidraw" || kind === "origami-workspace" || kind === "dxf" || kind === "origami-cards" ? payload : "base64:" + payload.replace(/^data:[^,]*,/, ""),
      ],
    ];
    void exportFolder(t("Origami export {date}", { date: new Date().toISOString().slice(0, 10) }), files)
      .then((ok) => ok && notify(t("Saved.")))
      .catch(fail);
  }
  async function exportSheet(sheet: SheetDoc, format: "xlsx" | "csv") {
    try {
      if (format === "csv") saveFile(sheet.title || "sheet", writeCsv(sheet.data), "csv");
      else saveFile(sheet.title || "sheet", bytesToBase64(await writeXlsx(sheet.data)), "xlsx");
    } catch (e) {
      fail(e);
    }
  }
  const chartWorld = useMemo<ChartWorld>(
    () => ({
      charts: new Map(charts.map((c) => [c.id, c])),
      rowsFor,
      sourceLabel,
      onEdit: (id) => {
        const spec = charts.find((c) => c.id === id);
        if (spec) setBuilder({ spec });
      },
      onOpenSheet: (id) => setView({ kind: "sheet", id }),
      saveFile: (name, d, kind) => saveFile(name, d, kind),
      locale: language || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [charts, sheets, language],
  );

  // From Read mode: open the notes for that book with the book beside them.
  const handled = useRef(0);
  useEffect(() => {
    if (!open || !data || !handoff || handled.current === handoff.at) return;
    handled.current = handoff.at;
    const book = bookById.get(handoff.bookId);
    // Leisure reading stays out: only a work source opens beside the notes.
    if (!book || (sourcesFilter !== "all" && !book.work)) return;
    const mine = data.notes
      .filter((n) => passageLinks(n.html).some((p) => p.bookId === handoff.bookId))
      .sort((a, b) => b.updated - a.updated)[0];
    setSource({ bookId: handoff.bookId, paragraphId: handoff.paragraphId });
    if (mine) setView({ kind: "note", id: mine.id });
    else
      void createNote({
        title: book ? t("Notes on {title}", { title: book.title }) : "",
        vault: book?.vault,
        subjectId: undefined,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data, handoff]);

  // --- Related notes and highlights ----------------------------------------------
  // Leisure reading stays out of Work: only work sources feed the Inbox,
  // Related and the Sources list unless the reader asks for all books.
  const workBooks = useMemo(
    () => books.filter((b) => !b.deleted && (sourcesFilter === "all" || b.work)),
    [books, sourcesFilter],
  );
  const workIds = useMemo(() => new Set(workBooks.map((b) => b.id)), [workBooks]);
  const highlights = useMemo(
    () => annotations.filter((a) => a.kind !== "bookmark" && (a.quote.trim() || a.text.trim()) && workIds.has(a.bookId)),
    [annotations, workIds],
  );
  const docs = useMemo(() => {
    const m = new Map<string, DocInfo>();
    for (const n of notes)
      m.set("n:" + n.id, {
        id: n.id,
        noteId: n.id,
        kind: "note",
        title: n.title || t("Untitled"),
        subtitle: subjects.find((s) => s.id === n.subjectId)?.name || t("Note"),
        excerpt: noteText(n.html).slice(0, 220),
        vault: n.vault,
      });
    for (const a of highlights)
      m.set("h:" + a.id, {
        id: a.id,
        kind: "highlight",
        title: (a.text || a.quote).replace(/\s+/g, " ").slice(0, 70),
        subtitle: bookById.get(a.bookId)?.title || "",
        excerpt: a.quote,
        color: undefined,
        bookId: a.bookId,
        paragraphId: a.paragraphId,
      });
    return m;
  }, [notes, highlights, subjects, bookById]);
  const index = useMemo(() => {
    const list: RelatedDoc[] = [
      ...notes.map((n) => ({ id: "n:" + n.id, title: n.title, text: noteText(n.html, { links: false }) })),
      ...highlights.map((a) => ({ id: "h:" + a.id, title: "", text: `${a.quote} ${a.text}` })),
    ];
    return relatedIndex(list);
  }, [notes, highlights]);
  const hiddenPairs = useMemo(() => new Set((data?.hidden || []).map((h) => h.id)), [data?.hidden]);

  // --- The Connections model (IBM Granite) -------------------------------------------
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [indexing, setIndexing] = useState(0);
  useEffect(() => {
    if (!open) return;
    const refresh = () => void embeddingStatus().then(setStatus).catch(() => setStatus(null));
    refresh();
    return onDownload((e) => e.done && refresh());
  }, [open, connectionsModel]);
  const activeModel =
    connectionsModel !== "words" && status?.runtime && status.models.some((m) => m.id === connectionsModel && m.installed)
      ? connectionsModel
      : null;
  // What each note and highlight says, for the model.
  const sources = useMemo(() => {
    const m = new Map<string, { text: string; hash: string; vault?: string }>();
    // Very short texts (a caption under a video, a fresh note) match almost
    // anything by meaning, so they wait until there is more to go on.
    const add = (id: string, text: string, minWords: number, vault?: string) => {
      const clean = text.replace(/\s+/g, " ").trim().slice(0, 2400);
      if (clean.length >= 12 && clean.split(" ").length >= minWords) m.set(id, { text: clean, hash: textHash(clean), vault });
    };
    for (const n of notes) add("n:" + n.id, `${n.title}\n${noteText(n.html, { links: false })}`, 8, n.vault);
    for (const a of highlights) add("h:" + a.id, `${a.quote} ${a.text}`, 4, bookById.get(a.bookId)?.vault);
    return m;
  }, [notes, highlights, bookById]);
  // Only what Work mode may show: notes, and highlights from work sources in
  // unlocked vaults. Filtered-out books keep their vectors for later.
  const vectors = useMemo(() => {
    const m = new Map<string, Float32Array>();
    for (const v of data?.vectors || []) if (v.model === activeModel && sources.has(v.doc)) m.set(v.doc, decodeVector(v.v));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.vectors, activeModel, sources]);
  // Index quietly in small batches, a moment after typing stops.
  useEffect(() => {
    if (!open || !activeModel || !data) return;
    const stored = new Map(data.vectors.filter((v) => v.model === activeModel).map((v) => [v.doc, v.hash]));
    const stale = [...sources].filter(([id, s]) => stored.get(id) !== s.hash);
    const exists = new Set([...otherNotes.current, ...data.notes.map((n) => "n:" + n.id), ...annotations.map((a) => "h:" + a.id)]);
    const gone = data.vectors.filter((v) => !exists.has(v.doc)).map((v) => v.id);
    setIndexing(stale.length);
    if (!stale.length && !gone.length) return;
    const timer = window.setTimeout(async () => {
      try {
        const batch = stale.slice(0, 12);
        const rows = batch.length ? await embedTexts(activeModel, batch.map(([, s]) => s.text)) : [];
        const items: VectorItem[] = batch.map(([id, s], i) => ({
          id: vectorId(id),
          kind: "vector",
          doc: id,
          model: activeModel,
          hash: s.hash,
          v: encodeVector(rows[i]),
          vault: s.vault,
        }));
        await put(items, gone);
      } catch (e) {
        setIndexing(0);
        fail(e);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeModel, sources, data?.vectors]);
  const modelName = activeModel
    ? status?.models.find((m) => m.id === activeModel)?.name || ""
    : t("Shared words (no model installed)");
  function relatedTo(id: string, opts: { among?: (id: string) => boolean; limit?: number; min?: number } = {}) {
    const words = related(index, id, opts);
    return activeModel ? mergeMatches(semanticRelated(vectors, activeModel, id, opts), words).slice(0, opts.limit ?? 30) : words;
  }

  const panel = useMemo(() => {
    if (!current) return null;
    const links = noteLinks(current.html);
    const passages = passageLinks(current.html);
    const outgoing: LinkedItem[] = [
      ...links.map((title) => {
        const n = noteByTitle(title);
        return {
          id: n?.id || "new:" + title,
          title,
          subtitle: n ? subjects.find((s) => s.id === n.subjectId)?.name || t("Note") : t("Not written yet"),
          kind: "note" as const,
        };
      }),
      ...passages
        .filter((p, i) => passages.findIndex((q) => q.bookId === p.bookId && q.paragraphId === p.paragraphId) === i)
        .map((p) => ({
          id: p.bookId + "#" + p.paragraphId,
          title: p.label || bookById.get(p.bookId)?.title || t("Passage"),
          subtitle: t("Book passage"),
          kind: "passage" as const,
          bookId: p.bookId,
          paragraphId: p.paragraphId,
        })),
    ];
    const backlinks: LinkedItem[] = notes
      .filter((n) => n.id !== current.id && current.title.trim() && noteLinks(n.html).some((l) => same(l, current.title)))
      .map((n) => ({ id: n.id, title: n.title || t("Untitled"), subtitle: t("Links here"), kind: "note" }));
    const suggestions = relatedTo("n:" + current.id, { limit: 30 })
      .map((m) => ({ ...m, doc: docs.get(m.id)! }))
      .filter(({ id, doc }) => {
        if (!doc || hiddenPairs.has(pairId("n:" + current.id, id))) return false;
        if (doc.kind === "note") return !links.some((l) => same(l, doc.title)) && !backlinks.some((b) => b.id === doc.id);
        return !passages.some((p) => p.bookId === doc.bookId && p.paragraphId === doc.paragraphId);
      });
    const mentions = unlinkedMentions(
      current.html,
      notes.filter((n) => n.id !== current.id).map((n) => n.title),
    );
    // A note already offered as a mention is not repeated under Related.
    const fresh = suggestions.filter((s) => !(s.doc.kind === "note" && mentions.some((m) => same(m.title, s.doc.title))));
    return { outgoing, backlinks, suggestions: fresh, mentions };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, notes, index, docs, hiddenPairs, subjects, bookById, vectors, activeModel]);

  const relatedHeading = t("Related");
  function linkDoc(doc: DocInfo) {
    if (!current) return;
    if (doc.kind === "note") {
      const target = notes.find((n) => n.id === doc.id);
      if (!target) return;
      changeNote(current.id, { html: addRelated(current.html, [target.title || t("Untitled")], relatedHeading) });
    } else {
      const a = highlights.find((h) => h.id === doc.id);
      if (!a) return;
      quoteInto(current, { bookId: a.bookId, paragraphId: a.paragraphId, quote: a.quote, label: bookById.get(a.bookId)?.title || "" });
      return;
    }
    bump(current.id);
  }
  function quoteInto(note: Note, p: DraggedPassage) {
    const html =
      note.html +
      `<blockquote><p>${escapeHtml(p.quote)}</p></blockquote><p><a data-book="${escapeHtml(p.bookId)}" data-paragraph="${escapeHtml(p.paragraphId)}" class="passage-link">${escapeHtml(p.label)}</a></p>`;
    changeNote(note.id, { html, vault: note.vault || bookById.get(p.bookId)?.vault });
    bump(note.id);
  }
  function hide(doc: DocInfo) {
    if (!current) return;
    const other = (doc.kind === "note" ? "n:" : "h:") + doc.id;
    const item: HiddenPair = { id: pairId("n:" + current.id, other), kind: "hidden", a: "n:" + current.id, b: other };
    void put([item]);
  }

  function propose(scope: LinkScope): Proposal[] {
    const inScope = notes.filter((n) =>
      scope === "all" ? true : scope === "subject" ? n.subjectId === current?.subjectId : n.id === current?.id,
    );
    const out: Proposal[] = [];
    const seen = new Set<string>();
    for (const from of inScope) {
      const links = noteLinks(from.html);
      // A note that names another note's title is the clearest link of all.
      for (const m of unlinkedMentions(from.html, notes.filter((n) => n.id !== from.id).map((n) => n.title))) {
        const to = noteByTitle(m.title);
        if (!to || hiddenPairs.has(pairId("n:" + from.id, "n:" + to.id))) continue;
        if (to.vault && to.vault !== from.vault) continue;
        const key = from.id + ">" + to.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: "n:" + to.id,
          score: 1,
          strength: "strong",
          shared: [],
          from,
          to,
          key,
          reason: m.count === 1 ? t("Mentioned once") : t("Mentioned {count} times", { count: m.count }),
        });
      }
      for (const m of relatedTo("n:" + from.id, { among: (id) => id.startsWith("n:"), min: 0.07, limit: 4 })) {
        const to = notes.find((n) => "n:" + n.id === m.id);
        if (!to || !to.title.trim() || hiddenPairs.has(pairId("n:" + from.id, m.id))) continue;
        // A vault note's title never goes into a note outside that vault.
        if (to.vault && to.vault !== from.vault) continue;
        if (links.some((l) => same(l, to.title))) continue;
        const key = from.id + ">" + to.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...m, from, to, key });
      }
    }
    return out;
  }
  async function confirmLinks(accepted: Proposal[], rejected: Proposal[]) {
    const d = dataRef.current;
    if (!d) return;
    const byNote = new Map<string, string[]>();
    for (const p of accepted) byNote.set(p.from.id, [...(byNote.get(p.from.id) || []), p.to.title]);
    const changed: Note[] = [];
    for (const [id, titles] of byNote) {
      const n = d.notes.find((x) => x.id === id);
      if (n) changed.push({ ...n, html: addRelated(n.html, titles, relatedHeading), updated: Date.now() });
    }
    const batch: LinkBatch = {
      id: crypto.randomUUID(),
      kind: "batch",
      created: Date.now(),
      links: [...byNote].map(([noteId, targets]) => ({ noteId, targets })),
    };
    const hidden: HiddenPair[] = rejected.map((p) => ({
      id: pairId("n:" + p.from.id, "n:" + p.to.id),
      kind: "hidden",
      a: "n:" + p.from.id,
      b: "n:" + p.to.id,
    }));
    await put([...changed, batch, ...hidden]);
    changed.forEach((n) => bump(n.id));
    setLinkForMe(false);
    notify(t("{count} links added. You can undo the whole batch from the Connections panel.", { count: accepted.length }));
  }
  const lastBatch = (data?.batches || []).filter((b) => !b.undone).sort((a, b) => b.created - a.created)[0];
  async function undoBatch() {
    const d = dataRef.current;
    if (!d || !lastBatch) return;
    const changed: Note[] = [];
    for (const l of lastBatch.links) {
      const n = d.notes.find((x) => x.id === l.noteId);
      if (n) changed.push({ ...n, html: removeRelated(n.html, l.targets, relatedHeading), updated: Date.now() });
    }
    await put([...changed, { ...lastBatch, undone: true }]);
    changed.forEach((n) => bump(n.id));
    notify(t("Batch undone."));
  }

  // --- Cards ------------------------------------------------------------------------
  async function saveCard(draft: CardDraft, from: { source?: CardSource; noteId?: string }) {
    const book = from.source ? bookById.get(from.source.bookId) : undefined;
    const note = from.noteId ? notes.find((n) => n.id === from.noteId) : undefined;
    const card = makeCard({ ...draft, source: from.source, noteId: from.noteId, vault: book?.vault || note?.vault });
    await put([card]);
    setComposer(null);
    notify(t("Card saved. It joins your next study session."));
  }
  function study(list: StudyCard[], title: string) {
    if (!list.length) return notify(t("No cards are due here right now."));
    setView({ kind: "study", cards: list, title, back: view.kind === "study" ? view.back : view });
  }
  // Today's cards, plus those an upcoming exam brings forward.
  const queue = useMemo(() => {
    const today = todaysQueue(cards, newPerDay);
    const ids = new Set(today.map((c) => c.id));
    return [...today, ...examCards(cards, subjects).filter((c) => !ids.has(c.id))];
  }, [cards, newPerDay, subjects]);
  function practise(list: StudyCard[], title: string) {
    setView((v) => ({ kind: "practice", cards: list, title, back: v.kind === "practice" ? v.back : v }));
  }
  function shareCards(list: StudyCard[], title: string) {
    saveFile(title || "cards", exportCardSet(title, list, pictures), "origami-cards");
  }
  const cardSetInput = useRef<HTMLInputElement>(null);
  async function importCards(file: File) {
    const { title, cards: made, pictures: pics } = importCardSet(await file.text());
    let subject = subjects.find((s) => same(s.name, title));
    const extra: WorkItem[] = [];
    if (!subject) {
      subject = { id: crypto.randomUUID(), kind: "subject", name: title, color: subjectColors[subjects.length % subjectColors.length], order: (subjects.at(-1)?.order || 0) + 1, created: Date.now() };
      extra.push(subject);
    }
    const sid = subject.id;
    await put([...extra, ...pics.map((p) => ({ ...p, subjectId: sid })), ...made.map((c) => ({ ...c, subjectId: sid }))]);
    notify(t("{count} cards added to {subject}.", { count: made.length, subject: subject.name }));
    setView({ kind: "subject", id: sid });
  }

  // --- Inbox: highlights that are not in a note or a card yet ------------------------
  const inbox = useMemo(() => {
    const used = new Set<string>();
    for (const n of notes) for (const p of passageLinks(n.html)) used.add(p.bookId + "#" + p.paragraphId);
    for (const c of cards) if (c.source) used.add(c.source.bookId + "#" + c.source.paragraphId);
    return highlights
      .filter((a) => !used.has(a.bookId + "#" + a.paragraphId) && !hiddenPairs.has(pairId("inbox", a.id)))
      .sort((a, b) => b.created - a.created);
  }, [highlights, notes, cards, hiddenPairs]);

  // --- Import and export --------------------------------------------------------------
  async function importFiles(files: File[]) {
    const library: File[] = [];
    let made = 0;
    let sheetsMade = 0;
    let last: Note | undefined;
    for (const f of files) {
      try {
        const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
        if (ext === ".xlsx" || ext === ".csv" || ext === ".tsv") {
          const title = f.name.replace(/\.[^.]+$/, "");
          const book = ext === ".xlsx" ? await readXlsx(await f.arrayBuffer(), title) : readCsv(await f.text(), title);
          await createSheet({ title, data: book });
          sheetsMade++;
          continue;
        }
        if ([".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(ext)) {
          notify(t("Reading the handwriting in {name}…", { name: f.name }));
          const now = Date.now();
          last = { id: crypto.randomUUID(), kind: "note", title: f.name.replace(/\.[^.]+$/, ""), html: await photoHtml(f), created: now, updated: now, subjectId: view.kind === "subject" ? view.id : current?.subjectId };
          await put([last]);
          made++;
          continue;
        }
        if (ext === ".origami-cards") {
          await importCards(f);
          continue;
        }
        if (ext === ".origami-workspace") {
          await importWsFile(f);
          continue;
        }
        if (ext === ".excalidraw") {
          const scene = fromExcalidrawFile(await f.text());
          if (!scene) throw new Error(t("This is not an Excalidraw drawing."));
          await createBoard({ title: f.name.replace(/\.[^.]+$/, ""), scene });
          sheetsMade++;
          continue;
        }
        const n = await importAsNote(f);
        if (!n) {
          library.push(f);
          continue;
        }
        const now = Date.now();
        last = {
          id: crypto.randomUUID(),
          kind: "note",
          title: n.title,
          html: n.html,
          created: now,
          updated: now,
          subjectId: view.kind === "subject" ? view.id : current?.subjectId,
        };
        await put([last]);
        made++;
      } catch (e) {
        notify(f.name + ": " + (e instanceof Error ? e.message : String(e)));
      }
    }
    if (library.length) onImportBooks(library);
    if (last) setView({ kind: "note", id: last.id });
    if (made) notify(made === 1 ? t("Imported as a note.") : t("{count} notes imported.", { count: made }));
    else if (sheetsMade)
      notify(sheetsMade === 1 ? t("Imported as a spreadsheet.") : t("{count} spreadsheets imported.", { count: sheetsMade }));
  }
  async function exportAll() {
    if (!data) return;
    try {
      // Vault items stay in their vault: exports are plain files.
      const open: WorkData = {
        ...data,
        notes: data.notes.filter((n) => !n.vault),
        cards: data.cards.filter((c) => !c.vault),
        sheets: data.sheets.filter((x) => !x.vault),
        boards: data.boards.filter((x) => !x.vault),
        plans: data.plans.filter((x) => !x.vault),
        pictures: data.pictures.filter((x) => !x.vault),
        stickies: data.stickies.filter((x) => !x.vault),
      };
      const kept = data.notes.length - open.notes.length + data.cards.length - open.cards.length;
      // Charts as SVG images in light colours, sheets as Excel files.
      const look = { dark: false, font: "Inter, Segoe UI, system-ui, sans-serif", ink: "#1b2130", muted: "#687185", line: "rgba(16,24,40,0.1)", locale: language || undefined };
      const chartSvgs = new Map<string, string>();
      for (const c of open.charts) {
        const rows = rowsFor(c);
        if (rows.length) chartSvgs.set(c.id, await renderChartSvg(c, rows, look));
      }
      const boardSvgs = new Map<string, string>();
      if (open.boards.length) {
        const { boardSvg } = await import("./boards/render");
        for (const b of open.boards)
          try {
            boardSvgs.set(b.id, await boardSvg(b.scene));
          } catch {
            /* the .excalidraw file is still written */
          }
      }
      const sheetFiles = new Map<string, string>();
      for (const sh of open.sheets) sheetFiles.set(sh.id, bytesToBase64(await writeXlsx(sh.data)));
      const done = await exportFolder(
        t("Origami notes {date}", { date: new Date().toISOString().slice(0, 10) }),
        exportFiles(open, true, { chartSvgs, sheetFiles, boardSvgs, diagramSvgs: await diagramSvgs(open.notes.map((n) => n.html)) }),
      );
      if (done)
        notify(
          t("Notes exported as HTML and Markdown, with your cards for Anki.") +
            (kept ? " " + t("{count} items from vaults were left out.", { count: kept }) : ""),
        );
    } catch (e) {
      fail(e);
    }
  }

  // --- Keyboard ----------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    function key(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.altKey && e.code === "Backslash") {
        e.preventDefault();
        if (e.shiftKey) setConnectionsOpen((v) => !v);
        else setSidebarOpen((v) => !v);
      } else if (ctrl && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      } else if (ctrl && e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setPicking(true);
      } else if (ctrl && e.altKey && !e.shiftKey && e.key.toLowerCase() === "s" && (current || currentSheet || currentBoard || currentPlan)) {
        e.preventDefault();
        addSticky((current || currentSheet || currentBoard || currentPlan)!);
      } else if (ctrl && e.altKey && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void createPlan();
      } else if (ctrl && e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        void createBoard();
      } else if (ctrl && e.altKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void createSheet();
      } else if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void createNote();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const subjectOf = (id?: string) => subjects.find((s) => s.id === id);
  async function addSubject(name: string) {
    const clean = name.trim();
    setNewSubject(null);
    if (!clean) return;
    const s: Subject = {
      id: crypto.randomUUID(),
      kind: "subject",
      name: clean.slice(0, 60),
      color: subjectColors[subjects.length % subjectColors.length],
      order: (subjects.at(-1)?.order || 0) + 1,
      created: Date.now(),
    };
    await put([s]);
    setView({ kind: "subject", id: s.id });
  }
  async function renameSubject(s: Subject) {
    const name = window.prompt(t("Subject name"), s.name)?.trim();
    if (name) await put([{ ...s, name: name.slice(0, 60) }]);
  }
  async function deleteSubject(s: Subject) {
    const inside = notes.filter((n) => n.subjectId === s.id);
    if (!window.confirm(t('Delete the subject "{name}"? Its {count} notes stay, without a subject.', { name: s.name, count: inside.length })))
      return;
    await put(
      [
        ...inside.map((n) => ({ ...n, subjectId: undefined })),
        ...cards.filter((c) => c.subjectId === s.id).map((c) => ({ ...c, subjectId: undefined })),
      ],
      [s.id],
    );
    setView({ kind: "today" });
  }

  // Notes and sheets of a subject (or none), most recent first.
  type Doc = { id: string; kind: "note" | "sheet" | "board" | "plan"; title: string; icon?: string; updated: number };
  function docsIn(subjectId: string | undefined): Doc[] {
    return [
      ...notes.filter((n) => n.subjectId === subjectId).map((n) => ({ id: n.id, kind: "note" as const, title: n.title, icon: n.icon, updated: n.updated })),
      ...sheets.filter((x) => x.subjectId === subjectId).map((x) => ({ id: x.id, kind: "sheet" as const, title: x.title, icon: x.icon, updated: x.updated })),
      ...boards.filter((x) => x.subjectId === subjectId).map((x) => ({ id: x.id, kind: "board" as const, title: x.title, icon: x.icon, updated: x.updated })),
      ...plans.filter((x) => x.subjectId === subjectId).map((x) => ({ id: x.id, kind: "plan" as const, title: x.title, icon: x.icon, updated: x.updated })),
    ].sort((a, b) => b.updated - a.updated);
  }
  // A subject in the sidebar, with the subjects inside it (one level).
  function subjectRow(s: Subject, depth: number): React.ReactNode {
    const inside = docsIn(s.id);
    const children = subjects.filter((c) => c.parent === s.id);
    const holds = (id?: string): boolean => id === s.id || children.some((c) => c.id === id);
    const isOpen = expanded.has(s.id) || holds(current?.subjectId) || holds(currentSheet?.subjectId) || holds(currentBoard?.subjectId) || holds(currentPlan?.subjectId);
    return (
      <div key={s.id} className={"subject-row-wrap" + (depth ? " nested" : "")}>
        <div className={"subject-row" + (view.kind === "subject" && view.id === s.id ? " active" : "")}>
          <button
            className="subject-chevron"
            aria-label={isOpen ? t("Collapse") : t("Expand")}
            aria-expanded={isOpen}
            onClick={() =>
              setExpanded((old) => {
                const n = new Set(old);
                if (n.has(s.id)) n.delete(s.id);
                else n.add(s.id);
                return n;
              })
            }
          >
            <ChevronRight size={13} className={isOpen ? "open" : ""} />
          </button>
          <button className="subject-name" onClick={() => setView({ kind: "subject", id: s.id })}>
            <span className="subject-dot" style={{ background: s.color }} />
            <span>{s.name}</span>
            <small>{inside.length + children.reduce((n, c) => n + docsIn(c.id).length, 0) || ""}</small>
          </button>
        </div>
        {isOpen && depth < 1 && children.map((c) => subjectRow(c, depth + 1))}
        {isOpen && inside.slice(0, 14).map((d) => <DocRow key={d.id} doc={d} />)}
      </div>
    );
  }
  function DocRow({ doc }: { doc: Doc }) {
    const active = doc.kind === "note" ? current?.id === doc.id : doc.kind === "sheet" ? currentSheet?.id === doc.id : doc.kind === "plan" ? currentPlan?.id === doc.id : currentBoard?.id === doc.id;
    return (
      <button className={"note-row" + (active ? " active" : "")} onClick={() => setView({ kind: doc.kind, id: doc.id })}>
        {doc.icon ? (
          <span className="note-glyph">{doc.icon}</span>
        ) : doc.kind === "sheet" ? (
          <FileSpreadsheet size={13} className="sheet-glyph" />
        ) : doc.kind === "board" ? (
          <Presentation size={13} className="board-glyph" />
        ) : doc.kind === "plan" ? (
          <DraftingCompass size={13} className="plan-glyph" />
        ) : (
          <FileText size={13} />
        )}
        <span>{doc.title || t("Untitled")}</span>
      </button>
    );
  }
  if (!open) return null;
  if (!data)
    return (
      <div className="work-mode loading">
        <LoaderCircle className="spin" />
      </div>
    );

  const recentBooks = [...workBooks].sort((a, b) => (b.opened || 0) - (a.opened || 0)).slice(0, 8);
  const titles = notes.map((n) => n.title).filter(Boolean);
  const dueMinutes = Math.max(1, Math.round((queue.length * SECONDS_PER_CARD) / 60));
  const showConnections = view.kind === "note" && connectionsOpen && current && panel;

  return (
    <div
      className={"work-mode" + (showConnections ? " with-connections" : "") + (sidebarOpen ? "" : " sidebar-hidden")}
      data-work-theme={theme}
      role="region"
      aria-label={t("Work mode")}
    >
      <nav className="work-sidebar" aria-label={t("Work navigation")} hidden={!sidebarOpen}>
        <div className="work-brand">
          <img src="/crane.png" alt="" />
          {modeSwitch}
          <button className="icon-only sidebar-toggle" data-tip={t("Hide sidebar")} data-keys={shortcuts.sidebar} onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose size={16} />
          </button>
        </div>
        <WorkspaceSwitcher
          workspaces={workspaces}
          active={ws}
          vaults={vaults}
          onSwitch={switchWorkspace}
          onCreate={createWorkspace}
          onRename={renameWorkspace}
          onDuplicate={(w) => void duplicateWorkspace(w)}
          onExport={(w) => void exportWs(w)}
          onImport={() => wsInput.current?.click()}
          onVault={(w, v) => void vaultWorkspace(w, v)}
          onDelete={(w) => void deleteWorkspace(w)}
          onUnlock={onUnlockVault}
          onLock={onLockVault}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          // A whole folder (the browser's directory picker).
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            const list = [...(e.target.files || [])];
            e.target.value = "";
            if (list.length) void importFolder(list).catch(fail);
          }}
        />
        <input
          ref={cardSetInput}
          type="file"
          accept=".origami-cards,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importCards(f).catch(fail);
          }}
        />
        <input
          ref={photoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            notify(t("Reading the handwriting in {name}…", { name: f.name }));
            try {
              const html = await photoHtml(f);
              noteEditor.current?.chain().focus().insertContent(html).run();
            } catch (err) {
              fail(err);
            }
          }}
        />
        <input
          ref={wsInput}
          type="file"
          accept=".origami-workspace,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importWsFile(f).catch(fail);
          }}
        />
        <button className="work-search" data-tip={t("Search notes, sheets, books and actions")} data-keys="Ctrl+K" onClick={() => setPalette(true)}>
          <Search size={15} />
          <span>{t("Search or jump to…")}</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="work-nav">
          <NavButton icon={<SunMedium size={17} />} label={t("Today")} active={view.kind === "today"} onClick={() => setView({ kind: "today" })} />
          <NavButton
            icon={<Inbox size={17} />}
            label={t("Inbox")}
            count={inbox.length}
            active={view.kind === "inbox"}
            onClick={() => setView({ kind: "inbox" })}
          />
          <NavButton
            icon={<Sparkles size={17} />}
            label={t("Study")}
            count={queue.length}
            soft
            active={view.kind === "study" || view.kind === "cards"}
            onClick={() => (queue.length ? study(queue, t("Today's cards")) : setView({ kind: "cards" }))}
          />
          <NavButton
            icon={<CalendarDays size={17} />}
            label={t("Schedule")}
            active={view.kind === "schedule"}
            onClick={() => setView({ kind: "schedule" })}
          />
        </div>
        {notes.some((n) => n.pinned) && (
          <div className="work-group">
            <div className="work-group-head">
              <span>{t("Pinned")}</span>
            </div>
            {notes
              .filter((n) => n.pinned)
              .map((n) => (
                <button key={n.id} className={"note-row pinned-row" + (current?.id === n.id ? " active" : "")} onClick={() => setView({ kind: "note", id: n.id })}>
                  <NoteGlyph note={n} />
                  <span>{n.title || t("Untitled")}</span>
                </button>
              ))}
          </div>
        )}
        <div className="work-group">
          <div className="work-group-head">
            <span>{t("Subjects")}</span>
            <button className="icon-only" aria-label={t("New subject")} onClick={() => setNewSubject("")}>
              <FolderPlus size={15} />
            </button>
          </div>
          {newSubject !== null && (
            <input
              className="subject-input"
              autoFocus
              placeholder={t("Subject name")}
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              onBlur={() => void addSubject(newSubject)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addSubject(newSubject);
                if (e.key === "Escape") setNewSubject(null);
              }}
            />
          )}
          {subjects.length === 0 && newSubject === null && (
            <button className="work-empty-hint" onClick={() => setNewSubject("")}>
              {t("Add a subject, like Biology or Novel ideas")}
            </button>
          )}
          {subjects.filter((s) => !s.parent || !subjects.some((p) => p.id === s.parent)).map((s) => subjectRow(s, 0))}
          {docsIn(undefined).length > 0 && (
            <div className="subject-row-wrap">
              <div className="work-group-sub">{t("Loose notes")}</div>
              {docsIn(undefined)
                .slice(0, 10)
                .map((d) => (
                  <DocRow key={d.id} doc={d} />
                ))}
            </div>
          )}
        </div>
        <div className="work-group">
          <div className="work-group-head">
            <span>{t("Sources")}</span>
            <span className="sources-filter" role="radiogroup" aria-label={t("Which books")}>
              {(
                [
                  ["work", t("Work")],
                  ["all", t("All")],
                ] as const
              ).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={sourcesFilter === id} onClick={() => onSourcesFilter(id)}>
                  {label}
                </button>
              ))}
            </span>
            <button className="icon-only" aria-label={t("Import documents")} onClick={() => fileInput.current?.click()}>
              <Upload size={15} />
            </button>
          </div>
          {recentBooks.length === 0 && (
            <button className="work-empty-hint" onClick={() => fileInput.current?.click()}>
              {t("Import course documents here, or choose “Use in Work mode” on a book in the library. Leisure books stay out of Work.")}
            </button>
          )}
          {recentBooks.map((b) => (
            <button
              key={b.id}
              className={"note-row source-row" + (source?.bookId === b.id ? " active" : "")}
              title={t("Open beside your note")}
              onClick={() => {
                setSource({ bookId: b.id });
                if (view.kind !== "note") {
                  const mine = notes
                    .filter((n) => passageLinks(n.html).some((p) => p.bookId === b.id))
                    .sort((x, y) => y.updated - x.updated)[0];
                  if (mine) setView({ kind: "note", id: mine.id });
                  else void createNote({ title: t("Notes on {title}", { title: b.title }), vault: b.vault, subjectId: undefined });
                }
              }}
            >
              <BookOpen size={13} />
              <span>{b.title}</span>
            </button>
          ))}
        </div>
        <div className="work-sidebar-foot">
          <button className="primary new-note" data-tip={t("New note")} data-keys="Ctrl+N" onClick={() => void createNote()}>
            <FilePlus2 size={16} />
            {t("New note")}
          </button>
          <button className="new-sheet" data-tip={t("New sheet")} data-keys="Ctrl+Alt+N" aria-label={t("New sheet")} onClick={() => void createSheet()}>
            <FileSpreadsheet size={16} />
          </button>
          <button className="new-sheet" data-tip={t("New board")} data-keys={shortcuts.newBoard} aria-label={t("New board")} onClick={() => void createBoard()}>
            <Presentation size={16} />
          </button>
          <div className="work-more">
            <button className="icon-only" aria-label={t("More")} aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <MoreHorizontal size={17} />
            </button>
            {menu && (
              <div className="work-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                <button role="menuitem" onClick={() => (setMenu(false), void createPlan())}>
                  <DraftingCompass size={15} />
                  {t("New plan (precise drawing)")}
                </button>
                <button role="menuitem" onClick={() => (setMenu(false), setPicking(true))}>
                  <LayoutTemplate size={15} />
                  {t("New note from a template")}
                </button>
                {activePlugins
                  .filter((p) => p.panel)
                  .map((p) => (
                    <button key={p.id} role="menuitem" onClick={() => (setMenu(false), setPluginPanel(p.id))}>
                      <Puzzle size={15} />
                      {p.panel?.title || p.name}
                    </button>
                  ))}
                <button role="menuitem" onClick={() => (setMenu(false), folderInput.current?.click())}>
                  <FolderInput size={15} />
                  {t("Import a folder of notes (Obsidian, Markdown)")}
                </button>
                <button role="menuitem" onClick={() => (setMenu(false), fileInput.current?.click())}>
                  <Upload size={15} />
                  {t("Import documents")}
                </button>
                <button role="menuitem" onClick={() => (setMenu(false), void exportAll())}>
                  <Download size={15} />
                  {t("Export all notes and cards")}
                </button>
                <button role="menuitem" onClick={() => (setMenu(false), void addTutorial())}>
                  <Sparkles size={15} />
                  {t("Add the Work mode tour again")}
                </button>
                <button role="menuitem" onClick={() => (setMenu(false), setView({ kind: "cards" }))}>
                  <GalleryVerticalEnd size={15} />
                  {t("All study cards")}
                </button>
                <div className="work-menu-label">{t("Workspace theme")}</div>
                <div className="work-theme-choices" role="radiogroup" aria-label={t("Workspace theme")}>
                  {(
                    [
                      ["reading", t("Reading room")],
                      ["light", t("Professional light")],
                      ["dark", t("Professional dark")],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} role="radio" aria-checked={theme === id} className={"theme-swatch " + id} onClick={() => onTheme(id)}>
                      <span aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          multiple
          accept={[...NOTE_IMPORTS, ".xlsx", ".csv", ".tsv", ".excalidraw", ".origami-workspace", ".origami-cards", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".epub", ".pdf", ".mobi", ".azw3", ".fb2"].join(",")}
          onChange={(e) => {
            if (e.target.files) void importFiles([...e.target.files]);
            e.target.value = "";
          }}
        />
      </nav>

      <EmbedContext value={embedWorld}>
      <ChartContext value={chartWorld}>
      <PlanContext value={planWorld}>
      <PluginBlockContext value={pluginBlockWorld}>
      <VoiceContext value={voiceWorld}>
      <PictureContext value={pictureMap}>
      {!sidebarOpen && (
        <button className="icon-only sidebar-reopen" data-tip={t("Show sidebar")} data-keys={shortcuts.sidebar} onClick={() => setSidebarOpen(true)}>
          <PanelLeftOpen size={17} />
        </button>
      )}
      <main className={"work-main" + (view.kind === "note" && source ? " split" : "") + (view.kind === "sheet" ? " sheet-mode" : "") + (view.kind === "board" || view.kind === "plan" ? " sheet-mode board-mode" : "")}>
        <PageBoundary resetKey={view.kind + ("id" in view ? view.id : "")}>
        {view.kind === "today" && (
          <Today
            welcomed={welcomed}
            onWelcomed={() => {
              setWelcomed(true);
              try {
                localStorage.setItem(WELCOME_KEY, "1");
              } catch {}
            }}
            recent={[...notes].sort((a, b) => b.updated - a.updated).slice(0, 6)}
            subjects={subjects}
            inboxCount={inbox.length}
            due={queue.length}
            dueMinutes={dueMinutes}
            reviewed={reviewedToday(cards)}
            onOpen={(id) => setView({ kind: "note", id })}
            onInbox={() => setView({ kind: "inbox" })}
            onStudy={() => study(queue, t("Today's cards"))}
            onNew={() => void createNote()}
            onImport={() => fileInput.current?.click()}
            exams={subjects.filter((s) => daysToExam(s) !== null).sort((a, b) => (a.exam || "").localeCompare(b.exam || ""))}
            onPractise={(s) => practise(cards.filter((c) => c.subjectId === s.id), s.name)}
            onOpenSubject={(id) => setView({ kind: "subject", id })}
          />
        )}
        {view.kind === "inbox" && (
          <section className="work-page">
            <header className="work-page-head">
              <div>
                <span className="eyebrow">{t("From your reading")}</span>
                <h1>{t("Inbox")}</h1>
              </div>
            </header>
            {inbox.length === 0 ? (
              <EmptyState icon={<Inbox size={30} />} title={t("Your inbox is clear.")} text={t("Highlights and notes you make while reading land here. Go read something nice.")} />
            ) : (
              <div className="inbox-list">
                {inbox.map((a) => {
                  const book = bookById.get(a.bookId);
                  return (
                    <article key={a.id} className="inbox-item">
                      <Highlighter size={15} className="inbox-icon" />
                      <div>
                        <blockquote>{a.quote}</blockquote>
                        {a.text && <p className="inbox-note">{a.text}</p>}
                        <small>{book?.title}</small>
                      </div>
                      <div className="inbox-actions">
                        <button
                          onClick={() => {
                            const target = notes.find((n) => n.id === lastNote.current) || [...notes].sort((x, y) => y.updated - x.updated)[0];
                            const p = { bookId: a.bookId, paragraphId: a.paragraphId, quote: a.quote, label: book?.title || "" };
                            if (target) {
                              quoteInto(target, p);
                              notify(t('Added to "{title}".', { title: target.title || t("Untitled") }));
                            } else
                              void createNote({ title: t("Notes on {title}", { title: book?.title || "" }) }).then((n) => quoteInto(n, p));
                          }}
                        >
                          <Quote size={14} />
                          {t("Add to note")}
                        </button>
                        <button onClick={() => setComposer({ text: a.quote, source: { bookId: a.bookId, paragraphId: a.paragraphId, start: a.start, end: a.end, quote: a.quote, title: book?.title || "" } })}>
                          <GalleryVerticalEnd size={14} />
                          {t("Card")}
                        </button>
                        <button className="quiet" onClick={() => void put([{ id: pairId("inbox", a.id), kind: "hidden", a: "inbox", b: a.id }])}>
                          <Check size={14} />
                          {t("Done")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
        {view.kind === "subject" && subjectOf(view.id) && (
          <SubjectPage
            subject={subjectOf(view.id)!}
            notes={notes.filter((n) => n.subjectId === view.id).sort((a, b) => b.updated - a.updated)}
            due={queue.filter((c) => c.subjectId === view.id)}
            onOpen={(id) => setView({ kind: "note", id })}
            onNew={() => void createNote({ subjectId: view.id })}
            onStudy={(list) => study(list, subjectOf(view.id)!.name)}
            onRename={() => void renameSubject(subjectOf(view.id)!)}
            onDelete={() => void deleteSubject(subjectOf(view.id)!)}
            onColor={(color) => void put([{ ...subjectOf(view.id)!, color }])}
            sheets={sheets.filter((x) => x.subjectId === view.id).sort((a, b) => b.updated - a.updated)}
            onOpenSheet={(id) => setView({ kind: "sheet", id })}
            onNewSheet={() => void createSheet({ subjectId: view.id })}
            onExam={(exam) => void put([{ ...subjectOf(view.id)!, exam: exam || undefined }])}
            onPractise={() => practise(cards.filter((c) => c.subjectId === view.id), subjectOf(view.id)!.name)}
            onShare={() => shareCards(cards.filter((c) => c.subjectId === view.id), subjectOf(view.id)!.name)}
            cardCount={cards.filter((c) => c.subjectId === view.id).length}
            parents={subjects.filter((x) => !x.parent && x.id !== view.id && !subjects.some((c) => c.parent === view.id && c.id === x.id))}
            onParent={(parent) => {
              const me = subjectOf(view.id)!;
              // One level only: a subject with subjects inside stays at the top.
              if (parent && subjects.some((c) => c.parent === me.id)) return notify(t("This subject has subjects inside it, so it stays at the top level."));
              const { parent: _p, ...rest } = me;
              void put([parent ? { ...rest, parent } : rest]);
            }}
          />
        )}
        {view.kind === "schedule" && (
          <SchedulePage
            notes={notes}
            cards={cards}
            logs={data.logs}
            onStudy={() => study(queue, t("Today's cards"))}
            onOpen={(id) => setView({ kind: "note", id })}
            onToggle={(task) => {
              const n = notes.find((x) => x.id === task.noteId);
              if (!n) return;
              changeNote(n.id, { html: setTaskDone(n.html, task.index, !task.done) });
              bump(n.id);
            }}
          />
        )}
        {view.kind === "cards" && (
          <CardsPage
            cards={cards}
            subjects={subjects}
            queue={queue}
            onStudy={(list, title) => study(list, title)}
            onDelete={deleteCard}
            onSuspend={(c) => void put([{ ...c, suspended: !c.suspended }])}
            onPractise={(list, title) => practise(list, title)}
            onShare={(list, title) => shareCards(list, title)}
            onImportSet={() => cardSetInput.current?.click()}
            pictures={pictures}
            onNewPicture={() => void createPictureSet()}
            onOpenPicture={(id) => setView({ kind: "picture", id })}
          />
        )}
        {view.kind === "picture" && currentPicture && (
          <PicturePage
            key={currentPicture.id}
            set={currentPicture}
            subjects={subjects}
            cardCount={cards.filter((c) => c.picture?.set === currentPicture.id).length}
            onChange={(patch) => changePicture(currentPicture.id, patch)}
            onDelete={() => void deletePicture(currentPicture)}
            onStudy={() =>
              // After the last edit has reached the cards.
              window.setTimeout(() => study(pictureCards(currentPicture).filter((c) => !c.suspended), pictureTitle(currentPicture)), 60)
            }
            onBack={() => setView({ kind: "cards" })}
            fail={fail}
          />
        )}
        {view.kind === "practice" && (
          <PracticeTest
            key={view.title + view.cards.length}
            cards={view.cards}
            title={view.title}
            onStudy={(list, title) => study(list, title)}
            onClose={() => setView(view.back)}
          />
        )}
        {view.kind === "study" && (
          <StudySession
            key={view.title + view.cards.length}
            cards={view.cards}
            title={view.title}
            fourButtons={fourButtons}
            speak={speak}
            onSave={(c, grade) => put([c, logAnswer(dataRef.current?.logs || [], grade !== "again")])}
            onShowInBook={(c) => c.source && onOpenPassage(c.source.bookId, c.source.paragraphId)}
            onClose={() => setView(view.back)}
          />
        )}
        {view.kind === "note" && current && (
          <>
            {source && (
              <SourcePane
                bookId={source.bookId}
                paragraphId={source.paragraphId}
                annotations={annotations}
                onClose={() => setSource(null)}
                onQuote={(p) => quoteInto(current, p)}
                onCard={(text, src) => setComposer({ text, source: src, noteId: current.id })}
                onOpenInReader={onOpenPassage}
              />
            )}
            <section className="note-page">
              <header className="note-head">
                <div className="note-crumbs">
                  <select
                    aria-label={t("Subject")}
                    value={current.subjectId || ""}
                    onChange={(e) => changeNote(current.id, { subjectId: e.target.value || undefined })}
                  >
                    <option value="">{t("No subject")}</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <small>{t("Saved {time}", { time: new Date(current.updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</small>
                </div>
                <div className="note-head-actions">
                  <button className="icon-only" data-tip={t("Sticky note")} data-keys={shortcuts.sticky} onClick={() => addSticky(current)}>
                    <StickyIcon size={16} />
                  </button>
                  <VaultMenu vaults={vaults} onUnlock={onUnlockVault} current={current.vault} onChoose={(v) => void vaultDoc(current, v)} />
                  {speak && (
                    <button
                      className={"icon-only" + (aloud.reading ? " active" : "")}
                      data-tip={aloud.reading ? t("Stop reading ({index} of {total})", { index: aloud.reading.index + 1, total: aloud.reading.total }) : t("Read aloud")}
                      onClick={() => (aloud.reading ? aloud.stop() : void aloud.start([current.title, ...noteText(current.html).split("\n")]))}
                    >
                      {aloud.reading ? <Square size={15} /> : <Volume2 size={16} />}
                    </button>
                  )}
                  <button className="icon-only" data-tip={t("History")} onClick={() => setHistory(true)}>
                    <History size={16} />
                  </button>
                  <button className="icon-only" aria-label={t("Delete note")} onClick={() => void deleteNote(current)}>
                    <Trash2 size={16} />
                  </button>
                  <button
                    className="icon-only"
                    data-tip={connectionsOpen ? t("Hide connections") : t("Show connections")}
                    data-keys={shortcuts.connections}
                    onClick={() => setConnectionsOpen(!connectionsOpen)}
                  >
                    {connectionsOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
                  </button>
                </div>
              </header>
              <div className="note-sheet" data-paper={current.paper || undefined} ref={noteSheet}>
                <StickyLayer
                  notes={stickies.filter((s) => s.doc === current.id)}
                  focusId={newStickyId}
                  onChange={changeSticky}
                  onDelete={(s) => void put([], [s.id])}
                />
                <NoteHeader
                  note={current}
                  words={noteText(current.html).split(/\s+/).filter(Boolean).length}
                  onChange={(patch) => changeNote(current.id, patch)}
                >
                <textarea
                  className="note-title"
                  rows={1}
                  aria-label={t("Title")}
                  placeholder={t("Untitled")}
                  value={current.title}
                  autoFocus={!current.title}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.currentTarget.parentElement?.querySelector(".note-prose") as HTMLElement | null)?.focus();
                    }
                  }}
                  onFocus={() => (titleAtFocus.current = current.title)}
                  onChange={(e) => changeNote(current.id, { title: e.target.value.replace(/\s*\n\s*/g, " ") })}
                  onBlur={() => renamed(current.id, titleAtFocus.current)}
                />
                </NoteHeader>
                <NoteEditor
                  preview={(target) => {
                    if (target.kind === "note") {
                      const n = noteByTitle(target.title);
                      const sh = n ? undefined : sheets.find((x) => same(x.title, target.title));
                      if (sh) return { title: sh.title, icon: "▦", meta: t("Sheet"), text: workbookText(sh.data, 260) };
                      const bd = n ? undefined : boards.find((x) => same(x.title, target.title));
                      if (bd) return { title: bd.title, icon: "◇", meta: t("Board"), text: boardText(bd, 260) };
                      if (!n) return { title: target.title, text: t("Not written yet. Click to start it.") };
                      return {
                        title: n.title || t("Untitled"),
                        icon: n.icon,
                        meta: subjects.find((x) => x.id === n.subjectId)?.name,
                        text: noteText(n.html).slice(0, 260),
                      };
                    }
                    const b = bookById.get(target.bookId);
                    return b ? { title: b.title, meta: b.author, text: t("Click to open this passage beside the note.") } : null;
                  }}
                  note={current}
                  revision={revisions[current.id] || 0}
                  titles={titles}
                  onChange={(id, html) => changeNote(id, { html })}
                  onOpenNote={openTitle}
                  onOpenPassage={(bookId, paragraphId) => setSource({ bookId, paragraphId })}
                  onCard={(text) => setComposer({ text, noteId: current.id })}
                  onReady={(e) => (noteEditor.current = e)}
                  onEmbed={startEmbed}
                  onPlan={() => setPlanPick(true)}
                  onPhoto={() => photoInput.current?.click()}
                  commands={pluginCommands.map((c) =>
                    c.block
                      ? {
                          id: `${c.plugin}-block-${c.id}`,
                          label: c.label,
                          run: () => noteEditor.current?.chain().focus().insertContent([{ type: "pluginBlock", attrs: { plugin: c.plugin, type: c.id } }, { type: "paragraph" }]).run(),
                        }
                      : { id: `${c.plugin}-${c.id}`, label: c.label, run: () => pluginHost.current?.run(c.plugin, c.id) },
                  )}
                  embedsAllowed={embedsOn}
                  onChart={(rows) => {
                    const tables = tablesFromHtml(current.html);
                    newChart({ rows: rows || tables[0] || [], insertInto: current.id, tables });
                  }}
                />
              </div>
            </section>
          </>
        )}
        {view.kind === "plan" && currentPlan && (
          <div className="doc-with-stickies">
            <PlanPage
              key={currentPlan.id}
              plan={currentPlan}
              subjects={subjects}
              onChange={(patch) => changePlan(currentPlan.id, patch)}
              onDelete={() => void deletePlan(currentPlan)}
              onSave={(name, content, ext) => saveFile(name, content, ext)}
              onAddToNote={() => setPlanTarget(currentPlan.id)}
              extra={
                <>
                  <button className="icon-only" data-tip={t("Sticky note")} data-keys={shortcuts.sticky} onClick={() => addSticky(currentPlan)}>
                    <StickyIcon size={16} />
                  </button>
                  <VaultMenu vaults={vaults} onUnlock={onUnlockVault} current={currentPlan.vault} onChoose={(v) => void vaultDoc(currentPlan, v)} />
                </>
              }
            />
            <StickyLayer
              notes={stickies.filter((x) => x.doc === currentPlan.id)}
              focusId={newStickyId}
              onChange={changeSticky}
              onDelete={(x) => void put([], [x.id])}
            />
          </div>
        )}
        {view.kind === "board" && currentBoard && (
          <div className="doc-with-stickies">
            <BoardPage
              key={currentBoard.id}
              board={currentBoard}
              subjects={subjects}
              dark={theme === "dark" || (theme === "reading" && lookFrom(document.querySelector(".work-mode")).dark)}
              language={language || "en"}
              embedsAllowed={embedsOn}
              onChange={(patch) => changeBoard(currentBoard.id, patch)}
              onDelete={() => void deleteBoard(currentBoard)}
              extra={
                <>
                  <button className="icon-only" data-tip={t("Sticky note")} data-keys={shortcuts.sticky} onClick={() => addSticky(currentBoard)}>
                    <StickyIcon size={16} />
                  </button>
                  <VaultMenu vaults={vaults} onUnlock={onUnlockVault} current={currentBoard.vault} onChoose={(v) => void vaultDoc(currentBoard, v)} />
                </>
              }
              onSave={(name, content, ext) => saveFile(name, content, ext)}
              onOpenLink={(url) => void openUrl(url).catch(fail)}
            />
            <StickyLayer
              notes={stickies.filter((x) => x.doc === currentBoard.id)}
              focusId={newStickyId}
              onChange={changeSticky}
              onDelete={(x) => void put([], [x.id])}
            />
          </div>
        )}
        {view.kind === "sheet" && currentSheet && (
          <div className="doc-with-stickies">
            <SheetPage
              key={currentSheet.id}
              sheet={currentSheet}
              subjects={subjects}
              charts={charts}
              dark={theme === "dark" || (theme === "reading" && lookFrom(document.querySelector(".work-mode")).dark)}
              french={(language || currentLanguage()).startsWith("fr")}
              locale={language || undefined}
              rowsFor={rowsFor}
              onChange={(patch) => changeSheet(currentSheet.id, patch)}
              onNewChart={(range) => newChart({ sheet: currentSheet, range })}
              onEditChart={(id) => chartWorld.onEdit(id)}
              onDeleteChart={(id) => {
                if (window.confirm(t("Delete this chart? Notes that show it will say it is no longer available."))) void put([], [id]);
              }}
              onInsertChart={(id) => setChartTarget(id)}
              onExport={(format) => void exportSheet(currentSheet, format)}
              onDelete={() => void deleteSheet(currentSheet)}
              extra={
                <>
                  <button className="icon-only" data-tip={t("Sticky note")} data-keys={shortcuts.sticky} onClick={() => addSticky(currentSheet)}>
                    <StickyIcon size={16} />
                  </button>
                  <VaultMenu vaults={vaults} onUnlock={onUnlockVault} current={currentSheet.vault} onChoose={(v) => void vaultDoc(currentSheet, v)} />
                </>
              }
            />
            <StickyLayer
              notes={stickies.filter((x) => x.doc === currentSheet.id)}
              focusId={newStickyId}
              onChange={changeSticky}
              onDelete={(x) => void put([], [x.id])}
            />
          </div>
        )}
        </PageBoundary>
      </main>
      </PictureContext>
      </VoiceContext>
      </PluginBlockContext>
      </PlanContext>
      </ChartContext>
      </EmbedContext>

      {showConnections && (
        <Connections
          key={current.id}
          note={current}
          outgoing={panel.outgoing}
          backlinks={panel.backlinks}
          suggestions={panel.suggestions}
          mentions={panel.mentions}
          cards={cards.filter((c) => c.noteId === current.id)}
          batch={lastBatch}
          modelName={modelName}
          modelActive={Boolean(activeModel)}
          indexing={indexing}
          onGetModel={onSettings}
          onOpen={(id) => (id.startsWith("new:") ? openTitle(id.slice(4)) : setView({ kind: "note", id }))}
          onOpenPassage={(bookId, paragraphId) => setSource({ bookId, paragraphId })}
          onLink={linkDoc}
          onHide={hide}
          onLinkMentions={(title) => {
            changeNote(current.id, { html: linkMentions(current.html, title) });
            bump(current.id);
          }}
          onLinkForMe={() => setLinkForMe(true)}
          onUndoBatch={() => void undoBatch()}
          onStudy={() => study(cards.filter((c) => c.noteId === current.id && !c.suspended), current.title || t("This note"))}
          onAddCard={() => setComposer({ text: noteText(current.html).split("\n")[0] || current.title, noteId: current.id })}
        />
      )}

      {composer && (
        <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setComposer(null)}>
          <div className="quick-dialog composer-dialog" role="dialog" aria-modal="true" aria-label={t("New study card")}>
            <CardComposer
              text={composer.text}
              source={composer.source}
              subjects={subjects}
              subjectId={composer.noteId ? notes.find((n) => n.id === composer.noteId)?.subjectId : current?.subjectId}
              onSave={(d) => saveCard(d, composer)}
              onCancel={() => setComposer(null)}
            />
          </div>
        </div>
      )}
      {consent && (
        <ConsentDialog
          onChoice={(allow) => {
            const then = consent;
            setConsent(null);
            onEmbedsChoice(allow);
            if (allow) then();
          }}
        />
      )}
      {embedDialog && (
        <EmbedDialog
          onClose={() => setEmbedDialog(false)}
          onInsert={(url, page) => {
            setEmbedDialog(false);
            noteEditor.current?.chain().focus().insertContent({ type: "mediaEmbed", attrs: { url, page } }).run();
          }}
        />
      )}
      <TipCard enabled={tipsOn} quiet={view.kind === "study" || Boolean(builder) || palette || linkForMe} onNever={onTipsOff} />
      {builder && (
        <ChartBuilder
          initial={builder.spec}
          sheets={sheets}
          tables={builder.tables}
          locale={language || undefined}
          onSave={(spec) => void saveChart(spec, builder.insertInto)}
          onClose={() => setBuilder(null)}
          saveFile={(name, d, kind) => saveFile(name, d, kind)}
        />
      )}
      {planPick && (
        <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setPlanPick(false)}>
          <section className="quick-dialog pick-note" role="dialog" aria-modal="true" aria-label={t("Add a plan")}>
            <h2>{t("Add a plan to this note")}</h2>
            <div className="pick-note-list">
              {[...plans]
                .sort((a, b) => b.updated - a.updated)
                .map((p) => (
                  <button key={p.id} onClick={() => (setPlanPick(false), insertPlan(p.id))}>
                    <DraftingCompass size={14} />
                    <span>{p.title || t("Untitled plan")}</span>
                  </button>
                ))}
              {!plans.length && <p className="conn-empty">{t("No plans yet in this workspace.")}</p>}
            </div>
            <div className="dialog-actions">
              <button onClick={() => setPlanPick(false)}>{t("Cancel")}</button>
              <button
                className="primary"
                onClick={async () => {
                  setPlanPick(false);
                  const plan = await createPlan({}, false);
                  insertPlan(plan.id);
                  setView({ kind: "plan", id: plan.id });
                }}
              >
                {t("New plan")}
              </button>
            </div>
          </section>
        </div>
      )}
      {planTarget && (
        <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setPlanTarget(null)}>
          <section className="quick-dialog pick-note" role="dialog" aria-modal="true" aria-label={t("Add to a note")}>
            <h2>{t("Add the plan to a note")}</h2>
            <div className="pick-note-list">
              {[...notes]
                .sort((a, b) => b.updated - a.updated)
                .slice(0, 40)
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      const id = planTarget;
                      setPlanTarget(null);
                      changeNote(n.id, { html: n.html + `<div data-plan="${id}" class="plan-block"></div><p></p>` });
                      bump(n.id);
                      setView({ kind: "note", id: n.id });
                    }}
                  >
                    {n.icon ? <span className="note-glyph">{n.icon}</span> : <FileText size={14} />}
                    <span>{n.title || t("Untitled")}</span>
                  </button>
                ))}
            </div>
            <div className="dialog-actions">
              <button onClick={() => setPlanTarget(null)}>{t("Cancel")}</button>
              <button
                className="primary"
                onClick={() => {
                  const plan = plans.find((p) => p.id === planTarget);
                  setPlanTarget(null);
                  if (plan) void createNote({ title: plan.title || t("Plan"), html: `<div data-plan="${plan.id}" class="plan-block"></div><p></p>` });
                }}
              >
                {t("New note with this plan")}
              </button>
            </div>
          </section>
        </div>
      )}
      {chartTarget && (
        <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setChartTarget(null)}>
          <section className="quick-dialog pick-note" role="dialog" aria-modal="true" aria-label={t("Add to a note")}>
            <h2>{t("Add the chart to a note")}</h2>
            <div className="pick-note-list">
              {[...notes]
                .sort((a, b) => b.updated - a.updated)
                .slice(0, 40)
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      const id = chartTarget;
                      setChartTarget(null);
                      const spec = charts.find((c) => c.id === id);
                      if (spec) void saveChart(spec, n.id).then(() => setView({ kind: "note", id: n.id }));
                    }}
                  >
                    {n.icon ? <span className="note-glyph">{n.icon}</span> : <FileText size={14} />}
                    <span>{n.title || t("Untitled")}</span>
                  </button>
                ))}
            </div>
            <div className="dialog-actions">
              <button onClick={() => setChartTarget(null)}>{t("Cancel")}</button>
              <button
                className="primary"
                onClick={() => {
                  const spec = charts.find((c) => c.id === chartTarget);
                  setChartTarget(null);
                  if (spec)
                    void createNote({ title: spec.title || t("Chart"), html: `<div data-chart="${spec.id}" class="chart-block"></div>` });
                }}
              >
                {t("New note with this chart")}
              </button>
            </div>
          </section>
        </div>
      )}
      {activePlugins.length > 0 && (
        <PluginHost
          ref={pluginHost}
          plugins={activePlugins}
          dark={theme === "dark" || (theme === "reading" && lookFrom(document.querySelector(".work-mode")).dark)}
          calls={pluginCalls}
          panel={pluginPanel}
          noteId={view.kind === "note" && current && !current.vault ? current.id : null}
          onClosePanel={() => setPluginPanel(null)}
          onCommands={setPluginCommands}
        />
      )}
      {naming && (
        <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && setNaming(null)}>
          <form
            className="quick-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={naming.title}
            onSubmit={(e) => {
              e.preventDefault();
              const name = naming.value.trim().slice(0, 60);
              if (!name) return;
              naming.run(name);
              setNaming(null);
            }}
          >
            <h2>{naming.title}</h2>
            <label className="card-field">
              <span>{t("Name")}</span>
              <input autoFocus value={naming.value} onChange={(e) => setNaming({ ...naming, value: e.target.value })} />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setNaming(null)}>
                {t("Cancel")}
              </button>
              <button className="primary" type="submit" disabled={!naming.value.trim()}>
                {t("Save")}
              </button>
            </div>
          </form>
        </div>
      )}
      {picking && (
        <TemplatePicker
          onClose={() => setPicking(false)}
          onPick={(tpl) => {
            setPicking(false);
            void createNote(tpl ? { title: tpl.title, html: tpl.html } : {});
          }}
        />
      )}
      {history && current && <HistoryDialog note={current} onRestore={(v) => void restoreVersion(current, v)} onClose={() => setHistory(false)} />}
      {linkForMe && (
        <LinkForMe hasSubject={Boolean(current?.subjectId)} propose={propose} onConfirm={confirmLinks} onClose={() => setLinkForMe(false)} />
      )}
      {palette && (
        <Palette
          notes={notes}
          sheets={sheets}
          onSheet={(id) => setView({ kind: "sheet", id })}
          boards={boards}
          onBoard={(id) => setView({ kind: "board", id })}
          plans={plans}
          onPlan={(id) => setView({ kind: "plan", id })}
          stickyText={new Map(stickies.reduce((m, s) => m.set(s.doc, (m.get(s.doc) || "") + " " + s.text.toLowerCase()), new Map<string, string>()))}
          subjects={subjects}
          books={books.filter((b) => !b.deleted)}
          onClose={() => setPalette(false)}
          onNote={(id) => setView({ kind: "note", id })}
          onSubject={(id) => setView({ kind: "subject", id })}
          onBook={(id) => {
            const b = bookById.get(id);
            if (b && !b.work) onMarkSource(b);
            setSource({ bookId: id });
            if (view.kind !== "note") void createNote({ title: t("Notes on {title}", { title: bookById.get(id)?.title || "" }) });
          }}
          commands={[
            { id: "new", label: t("New note"), run: () => void createNote() },
            { id: "new-sheet", label: t("New sheet"), run: () => void createSheet() },
            { id: "new-board", label: t("New board"), run: () => void createBoard() },
            { id: "new-plan", label: t("New plan (precise drawing)"), run: () => void createPlan() },
            { id: "new-picture", label: t("New picture cards"), run: () => void createPictureSet() },
            ...activePlugins
              .filter((p) => p.panel)
              .map((p) => ({ id: "plugin-panel-" + p.id, label: t("Open {name}", { name: p.panel?.title || p.name }), run: () => setPluginPanel(p.id) })),
            ...pluginCommands.filter((c) => !c.block).map((c) => ({
              id: `plugin-${c.plugin}-${c.id}`,
              label: `${activePlugins.find((p) => p.id === c.plugin)?.name || c.plugin}: ${c.label}`,
              run: () => pluginHost.current?.run(c.plugin, c.id),
            })),
            { id: "new-template", label: t("New note from a template"), run: () => setPicking(true) },
            { id: "new-chart", label: t("New chart"), run: () => newChart(sheets[0] ? { sheet: sheets[0] } : { rows: [] }) },
            { id: "today", label: t("Today"), run: () => setView({ kind: "today" }) },
            { id: "study", label: t("Study today's cards"), run: () => study(queue, t("Today's cards")) },
            { id: "inbox", label: t("Inbox"), run: () => setView({ kind: "inbox" }) },
            { id: "import", label: t("Import documents"), run: () => fileInput.current?.click() },
            { id: "export", label: t("Export all notes and cards"), run: () => void exportAll() },
          ]}
        />
      )}
    </div>
  );
}

function NoteGlyph({ note }: { note: Note }) {
  return note.icon ? <span className="note-glyph">{note.icon}</span> : <FileText size={13} />;
}

function NavButton({
  icon,
  label,
  count,
  active,
  soft,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  soft?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={"work-nav-button" + (active ? " active" : "")} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {!!count && <span className={"badge" + (soft ? " soft" : "")}>{count}</span>}
    </button>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="work-empty">
      {icon}
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? t("Working late") : h < 12 ? t("Good morning") : h < 18 ? t("Good afternoon") : t("Good evening");
}

function Today({
  welcomed,
  onWelcomed,
  recent,
  subjects,
  inboxCount,
  due,
  dueMinutes,
  reviewed,
  onOpen,
  onInbox,
  onStudy,
  onNew,
  onImport,
  exams,
  onPractise,
  onOpenSubject,
}: {
  exams: Subject[];
  onPractise: (s: Subject) => void;
  onOpenSubject: (id: string) => void;
  welcomed: boolean;
  onWelcomed: () => void;
  recent: Note[];
  subjects: Subject[];
  inboxCount: number;
  due: number;
  dueMinutes: number;
  reviewed: number;
  onOpen: (id: string) => void;
  onInbox: () => void;
  onStudy: () => void;
  onNew: () => void;
  onImport: () => void;
}) {
  const last = recent[0];
  return (
    <section className="work-page today">
      <header className="work-page-head">
        <div>
          <span className="eyebrow">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</span>
          <h1>{greeting()}</h1>
        </div>
      </header>
      {!welcomed && (
        <div className="welcome-card">
          <div className="welcome-steps">
            <div>
              <Highlighter size={18} />
              <strong>{t("Highlights land in your Inbox")}</strong>
              <span>{t("Everything you mark while reading waits here to be sorted.")}</span>
            </div>
            <div>
              <GalleryVerticalEnd size={18} />
              <strong>{t("Any sentence can become a card")}</strong>
              <span>{t("Select text and choose Card. Origami brings it back before you forget.")}</span>
            </div>
            <div>
              <Check size={18} />
              <strong>{t("Your notes stay on this computer")}</strong>
              <span>{t("No account, no cloud. Export everything as HTML or Markdown at any time.")}</span>
            </div>
          </div>
          <button className="primary" onClick={onWelcomed}>
            {t("Got it")}
          </button>
        </div>
      )}
      {exams.length > 0 && (
        <div className="exam-strip">
          {exams.map((s) => {
            const left = daysToExam(s)!;
            return (
              <div key={s.id} className="exam-card" style={{ ["--subject" as string]: s.color }}>
                <CalendarClock size={18} />
                <button className="text-button" onClick={() => onOpenSubject(s.id)}>
                  <strong>{s.name}</strong>
                </button>
                <span>{left === 0 ? t("Exam today") : left === 1 ? t("Exam tomorrow") : t("Exam in {count} days", { count: left })}</span>
                <button className="mini" onClick={() => onPractise(s)}>
                  <ClipboardCheck size={13} />
                  {t("Practice test")}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="today-cards">
        <button className="today-card" onClick={last ? () => onOpen(last.id) : onNew}>
          <FileText size={20} />
          <span className="today-label">{last ? t("Continue") : t("Start writing")}</span>
          <strong>{last ? last.title || t("Untitled") : t("Your first note")}</strong>
          <small>{last ? noteText(last.html).slice(0, 90) || t("Empty note") : t("Notes save as you type.")}</small>
        </button>
        <button className="today-card" onClick={onInbox}>
          <Inbox size={20} />
          <span className="today-label">{t("Inbox")}</span>
          <strong>{inboxCount ? t("{count} highlights to sort", { count: inboxCount }) : t("All sorted")}</strong>
          <small>{t("From your reading")}</small>
        </button>
        <button className="today-card study" onClick={onStudy} disabled={!due}>
          <CalendarCheck size={20} />
          <span className="today-label">{t("Study")}</span>
          <strong>{due ? t("{count} cards ready", { count: due }) : t("Nothing due")}</strong>
          <small>
            {due
              ? t("About {minutes} min", { minutes: dueMinutes })
              : reviewed
                ? t("{count} reviewed today. Well done.", { count: reviewed })
                : t("New cards appear as you make them.")}
          </small>
        </button>
      </div>
      {recent.length > 0 && (
        <>
          <h2 className="work-subhead">{t("Recent notes")}</h2>
          <div className="note-grid">
            {recent.map((n) => (
              <button key={n.id} className="note-tile" onClick={() => onOpen(n.id)}>
                {n.subjectId && (
                  <span className="note-tile-subject" style={{ color: subjects.find((s) => s.id === n.subjectId)?.color }}>
                    {subjects.find((s) => s.id === n.subjectId)?.name}
                  </span>
                )}
                <strong>{n.title || t("Untitled")}</strong>
                <span>{noteText(n.html).slice(0, 140)}</span>
                <small>{new Date(n.updated).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {recent.length === 0 && (
        <div className="today-start">
          <button onClick={onNew}>
            <Plus size={16} />
            {t("New note")}
          </button>
          <button onClick={onImport}>
            <Upload size={16} />
            {t("Import a document")}
          </button>
          <p className="hint">{t("Word, HTML pages (including ones made by AI tools), Markdown and text become notes. PDF and EPUB join your library as sources.")}</p>
        </div>
      )}
    </section>
  );
}

function SubjectPage({
  subject,
  notes,
  due,
  onOpen,
  onNew,
  onStudy,
  onRename,
  onDelete,
  onColor,
  sheets,
  onOpenSheet,
  onNewSheet,
  onExam,
  onPractise,
  onShare,
  cardCount,
  parents,
  onParent,
}: {
  parents: Subject[];
  onParent: (parent: string) => void;
  onExam: (date: string) => void;
  onPractise: () => void;
  onShare: () => void;
  cardCount: number;
  subject: Subject;
  sheets: SheetDoc[];
  onOpenSheet: (id: string) => void;
  onNewSheet: () => void;
  notes: Note[];
  due: StudyCard[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onStudy: (cards: StudyCard[]) => void;
  onRename: () => void;
  onDelete: () => void;
  onColor: (color: string) => void;
}) {
  return (
    <section className="work-page">
      <header className="work-page-head">
        <div>
          <span className="eyebrow" style={{ color: subject.color }}>
            {t("Subject")}
          </span>
          <h1>{subject.name}</h1>
        </div>
        <div className="work-page-actions">
          <div className="color-dots" role="radiogroup" aria-label={t("Colour")}>
            {subjectColors.map((c) => (
              <button key={c} role="radio" aria-checked={subject.color === c} aria-label={c} style={{ background: c }} onClick={() => onColor(c)} />
            ))}
          </div>
          <button onClick={onRename}>{t("Rename")}</button>
          <button className="icon-only" aria-label={t("Delete subject")} onClick={onDelete}>
            <Trash2 size={16} />
          </button>
          <button disabled={!due.length} onClick={() => onStudy(due)}>
            <Sparkles size={15} />
            {due.length ? t("Study {count}", { count: due.length }) : t("Nothing due")}
          </button>
          <button disabled={!cardCount} onClick={onPractise} data-tip={t("Questions from this subject's cards, without changing when they come back")}>
            <ClipboardCheck size={15} />
            {t("Practice test")}
          </button>
          <button className="icon-only" disabled={!cardCount} data-tip={t("Share these cards as a file")} onClick={onShare}>
            <Share2 size={16} />
          </button>
          <select className="subject-parent" value={subject.parent || ""} aria-label={t("Inside")} data-tip={t("Put this subject inside another")} onChange={(e) => onParent(e.target.value)}>
            <option value="">{t("Top level")}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {t("Inside {name}", { name: p.name })}
              </option>
            ))}
          </select>
          <label className="exam-date" data-tip={t("Reviews are spread so every card is seen before this date")}>
            <CalendarClock size={15} />
            <input type="date" value={subject.exam || ""} aria-label={t("Exam date")} onChange={(e) => onExam(e.target.value)} />
          </label>
          <button onClick={onNewSheet}>
            <FileSpreadsheet size={15} />
            {t("New sheet")}
          </button>
          <button className="primary" onClick={onNew}>
            <Plus size={15} />
            {t("New note")}
          </button>
        </div>
      </header>
      {sheets.length > 0 && (
        <>
          <h2 className="work-subhead">{t("Spreadsheets")}</h2>
          <div className="note-grid sheet-tiles">
            {sheets.map((x) => (
              <button key={x.id} className="note-tile sheet-tile" onClick={() => onOpenSheet(x.id)}>
                <FileSpreadsheet size={18} className="sheet-glyph" />
                <strong>{x.title || t("Untitled")}</strong>
                <span>{workbookText(x.data, 160)}</span>
                <small>{new Date(x.updated).toLocaleDateString()}</small>
              </button>
            ))}
            <button className="note-tile new-tile" onClick={onNewSheet}>
              <Plus size={18} />
              <strong>{t("New sheet")}</strong>
            </button>
          </div>
          <h2 className="work-subhead">{t("Notes")}</h2>
        </>
      )}
      {notes.length === 0 ? (
        <EmptyState icon={<FileText size={30} />} title={t("No notes here yet")} text={t("Start one, or drag a highlight from a book into a note.")} />
      ) : (
        <div className="note-grid">
          {notes.map((n) => (
            <button key={n.id} className="note-tile" onClick={() => onOpen(n.id)}>
              <strong>{n.title || t("Untitled")}</strong>
              <span>{noteText(n.html).slice(0, 160)}</span>
              <small>{new Date(n.updated).toLocaleDateString()}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CardsPage({
  cards,
  subjects,
  queue,
  onStudy,
  onDelete,
  onSuspend,
  onPractise,
  onShare,
  onImportSet,
  pictures,
  onNewPicture,
  onOpenPicture,
}: {
  cards: StudyCard[];
  subjects: Subject[];
  queue: StudyCard[];
  onStudy: (cards: StudyCard[], title: string) => void;
  onDelete: (c: StudyCard) => void;
  onSuspend: (c: StudyCard) => void;
  onPractise: (cards: StudyCard[], title: string) => void;
  onShare: (cards: StudyCard[], title: string) => void;
  onImportSet: () => void;
  pictures: PictureSet[];
  onNewPicture: () => void;
  onOpenPicture: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const q = query.trim().toLowerCase();
  const shown = cards
    .filter((c) => (!subject || c.subjectId === subject) && (!q || (c.front + " " + c.back).toLowerCase().includes(q)))
    .sort((a, b) => b.created - a.created);
  const pictureSets = pictures.filter((p) => (!subject || p.subjectId === subject) && (!q || p.title.toLowerCase().includes(q) || p.masks.some((m) => m.label.toLowerCase().includes(q))));
  return (
    <section className="work-page">
      <header className="work-page-head">
        <div>
          <span className="eyebrow">{t("{count} cards", { count: cards.length })}</span>
          <h1>{t("Study cards")}</h1>
        </div>
        <div className="work-page-actions">
          <button onClick={onNewPicture} data-tip={t("Cover parts of a diagram, map or photo and learn what is under them")}>
            <ImagePlus size={15} />
            {t("Picture cards")}
          </button>
          <button onClick={onImportSet} data-tip={t("Add cards from an .origami-cards file")}>
            <Upload size={15} />
            {t("Import a card set")}
          </button>
          <button
            disabled={!shown.length}
            onClick={() => onShare(shown, subjects.find((s) => s.id === subject)?.name || t("Study cards"))}
            data-tip={t("Save the cards shown as a file to share (without your review history)")}
          >
            <Share2 size={15} />
            {t("Share")}
          </button>
          <button disabled={!shown.length} onClick={() => onPractise(shown, subjects.find((s) => s.id === subject)?.name || t("Study cards"))}>
            <ClipboardCheck size={15} />
            {t("Practice test")}
          </button>
          <button className="primary" disabled={!queue.length} onClick={() => onStudy(queue, t("Today's cards"))}>
            <Sparkles size={15} />
            {queue.length ? t("Study {count}", { count: queue.length }) : t("Nothing due")}
          </button>
        </div>
      </header>
      <div className="cards-tools">
        <div className="search-field">
          <Search size={15} />
          <input placeholder={t("Find a card")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("Find a card")} />
        </div>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={t("Subject")}>
          <option value="">{t("All subjects")}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {pictureSets.length > 0 && (
        <div className="picture-sets" aria-label={t("Picture cards")}>
          {pictureSets.map((p) => (
            <button key={p.id} className="picture-set" onClick={() => onOpenPicture(p.id)}>
              {p.image ? <img src={p.image} alt="" /> : <ImagePlus size={22} />}
              <strong>{pictureTitle(p)}</strong>
              <small>{t("{count} boxes", { count: p.masks.length })}</small>
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState
          icon={<GalleryVerticalEnd size={30} />}
          title={cards.length ? t("No cards match") : t("No cards yet")}
          text={t("Select any sentence while reading or writing and choose Card.")}
        />
      ) : (
        <div className="cards-list">
          {shown.map((c) => (
            <div key={c.id} className={"mini-card wide" + (c.suspended ? " suspended" : "")}>
              <strong>{c.type === "cloze" ? c.front.replace(/\{\{([\s\S]+?)\}\}/g, "[$1]") : c.front.includes("$$") ? <MathText text={c.front} /> : c.front}</strong>
              {c.back && (
                  <span>
                    <MathText text={c.back} />
                  </span>
                )}
              <small>
                {c.source?.title || subjects.find((s) => s.id === c.subjectId)?.name || ""}
                {" · "}
                {c.schedule.reps === 0 ? t("New") : t("Next {date}", { date: new Date(c.schedule.due).toLocaleDateString() })}
              </small>
              <div className="mini-card-actions">
                {c.picture && (
                  <button className="mini" onClick={() => onOpenPicture(c.picture!.set)}>
                    {t("Edit picture")}
                  </button>
                )}
                <button className="mini" onClick={() => onSuspend(c)}>
                  {c.suspended ? t("Resume") : t("Pause")}
                </button>
                <button className="mini quiet" aria-label={t("Delete card")} onClick={() => window.confirm(t("Delete this card?")) && onDelete(c)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type Command = { id: string; label: string; run: () => void };
function Palette({
  notes,
  sheets,
  onSheet,
  boards,
  onBoard,
  plans,
  onPlan,
  stickyText,
  subjects,
  books,
  commands,
  onClose,
  onNote,
  onSubject,
  onBook,
}: {
  notes: Note[];
  sheets: SheetDoc[];
  onSheet: (id: string) => void;
  boards: BoardDoc[];
  onBoard: (id: string) => void;
  plans: PlanDoc[];
  onPlan: (id: string) => void;
  stickyText?: Map<string, string>;
  subjects: Subject[];
  books: BookMeta[];
  commands: Command[];
  onClose: () => void;
  onNote: (id: string) => void;
  onSubject: (id: string) => void;
  onBook: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    type R = { key: string; label: string; hint: string; icon: React.ReactNode; run: () => void };
    const out: R[] = [];
    const match = (x: string) => !s || x.toLowerCase().includes(s);
    for (const c of commands) if (match(c.label)) out.push({ key: "c" + c.id, label: c.label, hint: t("Action"), icon: <ChevronRight size={14} />, run: c.run });
    const ranked = notes
      .map((n) => {
        const title = n.title.toLowerCase();
        const score = !s
          ? n.updated
          : title.startsWith(s)
            ? 3e13
            : title.includes(s)
              ? 2e13
              : noteText(n.html).toLowerCase().includes(s) || stickyText?.get(n.id)?.includes(s)
                ? 1e13
                : -1;
        return { n, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    for (const { n } of ranked)
      out.push({ key: "n" + n.id, label: n.title || t("Untitled"), hint: t("Note"), icon: <FileText size={14} />, run: () => onNote(n.id) });
    for (const sh of sheets.filter((x) => s && (match(x.title) || workbookText(x.data, 2000).toLowerCase().includes(s))).slice(0, 5))
      out.push({ key: "x" + sh.id, label: sh.title || t("Untitled"), hint: t("Sheet"), icon: <FileSpreadsheet size={14} />, run: () => onSheet(sh.id) });
    for (const pl of plans.filter((x) => s && (match(x.title) || planText(x).toLowerCase().includes(s))).slice(0, 5))
      out.push({ key: "p" + pl.id, label: pl.title || t("Untitled"), hint: t("Plan"), icon: <DraftingCompass size={14} />, run: () => onPlan(pl.id) });
    for (const bd of boards.filter((x) => s && (match(x.title) || boardText(x).toLowerCase().includes(s))).slice(0, 5))
      out.push({ key: "w" + bd.id, label: bd.title || t("Untitled"), hint: t("Board"), icon: <Presentation size={14} />, run: () => onBoard(bd.id) });
    for (const sub of subjects.filter((x) => match(x.name)).slice(0, 4))
      out.push({ key: "s" + sub.id, label: sub.name, hint: t("Subject"), icon: <span className="subject-dot" style={{ background: sub.color }} />, run: () => onSubject(sub.id) });
    for (const b of books.filter((x) => s && (match(x.title) || match(x.author))).slice(0, 5))
      out.push({ key: "b" + b.id, label: b.title, hint: t("Open beside a note"), icon: <BookOpen size={14} />, run: () => onBook(b.id) });
    return out.slice(0, 14);
  }, [q, notes, sheets, boards, plans, subjects, books, commands, onNote, onSheet, onBoard, onPlan, onSubject, onBook]);
  const pick = (i: number) => {
    results[i]?.run();
    onClose();
  };
  return (
    <div className="modal-scrim palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("Search")}>
        <div className="palette-input">
          <Search size={17} />
          <input
            autoFocus
            value={q}
            placeholder={t("Search notes, subjects, books or actions")}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(results.length - 1, a + 1)));
              if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
              if (e.key === "Enter") pick(active);
            }}
          />
          <button className="icon-only" aria-label={t("Close")} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="palette-results" role="listbox">
          {results.map((r, i) => (
            <button key={r.key} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}>
              {r.icon}
              <span>{r.label}</span>
              <small>{r.hint}</small>
            </button>
          ))}
          {results.length === 0 && <p className="conn-empty">{t("Nothing found.")}</p>}
        </div>
      </div>
    </div>
  );
}
