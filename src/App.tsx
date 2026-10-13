import {
  IconButton,
  Cover,
  CoverControl,
  CoverTextContext,
} from "./components/Primitives";
import {
  bookFinished,
  matchesLibraryFilters,
  sortLibrary,
} from "./libraryFilters";
import { CoverDialog } from "./components/CoverDialog";
import { coverPrompt, starterCover } from "./covers";
import { useCovers } from "./useCovers";
import { startupVoice } from "./voiceCatalog";
import {
  checkedCollectionName,
  collectionNames,
  builtInCollections,
} from "./collections";
import { AppearancePanel } from "./components/AppearancePanel";
import { BackgroundScene } from "./components/BackgroundScene";
import { changeAppearance, startupBackground } from "./backgrounds";
import { useSeasonalBackground } from "./useSeasonalBackground";
import { VoiceCatalog } from "./components/VoiceCatalog";
import { VoicePortraitDialog } from "./components/VoicePortrait";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Bookmark,
  AudioLines,
  Settings2,
  Search,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  Upload,
  FolderOpen,
  Check,
  X,
  Trash2,
  Star,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
  Underline,
  MessageSquare,
  Palette,
  SlidersHorizontal,
  Pin,
  RotateCcw,
  Copy,
  Library,
  Grid2X2,
  List,
  LoaderCircle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type {
  Book,
  BookMeta,
  Annotation,
  Preferences,
  Page,
  InspectorTab,
  TextSelection,
  Voice,
  SpokenEdit,
} from "./types";
import { defaultPreferences } from "./types";
import { themes, annotationColors } from "./themes";
import {
  createBook,
  importDocument,
  paragraphsFromText,
  selectionFromRange,
} from "./documents";
import {
  expandSpokenRange,
  replaceSpokenRange,
  spokenText,
} from "./spokenText";
import {
  annotationViews,
  filterAnnotations,
  type AnnotationOrder,
} from "./annotations";
import * as store from "./storage";
import { usePlayer } from "./usePlayer";
const fmt = (s: number) =>
  Math.floor(s / 60) +
  ":" +
  Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
type ReadingAnchor = {
  bookId: string;
  paragraphId: string;
  position: number;
  offset: number;
  title: string;
};
export default function App() {
  const [ready, setReady] = useState(false);
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  useSeasonalBackground(
    ready,
    prefs.backgroundMode,
    prefs.seasonHemisphere,
    setPrefs,
  );
  const [page, setPage] = useState<Page>("library");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const sort = prefs.librarySort;
  const [collectionFiltersOpen, setCollectionFiltersOpen] = useState(false);
  const [collection, setCollection] = useState("All books");
  const [addingCollection, setAddingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionUndo, setCollectionUndo] = useState<{
    name: string;
    ids: string[];
  } | null>(null);
  const [list, setList] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState("amber");
  const [noteGroup, setNoteGroup] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const [noteFilter, setNoteFilter] = useState("all");
  const [noteColor, setNoteColor] = useState("all");
  const [noteOrder, setNoteOrder] = useState<AnnotationOrder>("book-asc");
  const [noteScope, setNoteScope] = useState("book");
  const [noteBooks, setNoteBooks] = useState<Record<string, Book>>({});
  const noteBooksRef = useRef(noteBooks);
  noteBooksRef.current = noteBooks;
  const [spokenDrafts, setSpokenDrafts] = useState<Record<string, string>>({});
  const [spokenBusy, setSpokenBusy] = useState(false);
  const [returnAnchor, setReturnAnchor] = useState<ReadingAnchor | null>(null);
  const returnRef = useRef<ReadingAnchor | null>(null);
  const readingAnchorRef = useRef<ReadingAnchor | null>(null);
  const [jumping, setJumping] = useState(false);
  const jumpRef = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickTitle, setQuickTitle] = useState("Untitled text");
  const [undo, setUndo] = useState<BookMeta[] | null>(null);
  const [readerPage, setReaderPage] = useState(0);
  const [bookQuery, setBookQuery] = useState("");
  const [editingMeta, setEditingMeta] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [coverEditor, setCoverEditor] = useState<Book | null>(null);
  const [portraitEditor, setPortraitEditor] = useState<Voice | null>(null);
  const portraitFocus = useRef<HTMLElement | null>(null);
  const coverFocus = useRef<HTMLElement | null>(null);
  const resumeVoice = useRef(false);
  const voiceBarrier = useRef<Promise<unknown>>(Promise.resolve());
  const fileInput = useRef<HTMLInputElement>(null);
  const article = useRef<HTMLElement>(null);
  const focusTitle = useRef<HTMLHeadingElement>(null);
  const notify = (s: string) => setNotice(s);
  const player = usePlayer(notify, (voice) =>
    setPrefs((old) => ({ ...old, lastVoice: voice })),
  );
  const covers = useCovers(
    prefs.autoGenerateCovers,
    player.status === "idle",
    prefs.allowMatureCovers,
    (meta) => {
      setBooks((old) => old.map((b) => (b.id === meta.id ? meta : b)));
      setBook((old) => (old?.meta.id === meta.id ? { ...old, meta } : old));
      setCoverEditor((old) =>
        old?.meta.id === meta.id ? { ...old, meta } : old,
      );
    },
    notify,
    {
      auto:
        ready &&
        prefs.autoGenerateVoicePortraits &&
        !portraitEditor &&
        (page === "voices" ||
          (page === "reader" &&
            prefs.rightOpen &&
            prefs.inspector === "voice")),
      voices,
      changed: (voice) => {
        setVoices((old) => old.map((v) => (v.id === voice.id ? voice : v)));
        setPortraitEditor((old) => (old?.id === voice.id ? voice : old));
      },
    },
  );
  const [startupSpeech, setStartupSpeech] = useState("");
  const prefRef = useRef(prefs);
  prefRef.current = prefs;
  const bookRef = useRef(book);
  bookRef.current = book;
  const theme = themes.find((t) => t.id === prefs.theme) || themes[0];
  const inspectorAvailable =
    page !== "library" && page !== "settings" && page !== "bookmarks";
  const focused = page === "reader" && focusMode;
  const navigationOpen = prefs.leftOpen && !focused;
  const inspectorOpen = inspectorAvailable && prefs.rightOpen && !focused;
  const variables = {
    "--bg": theme.bg,
    "--panel": theme.panel,
    "--ink": theme.ink,
    "--muted": theme.muted,
    "--accent": theme.accent,
    "--accent-ink": theme.contrast,
    "--line": theme.line,
    "--left-width": navigationOpen ? prefs.leftWidth + "px" : "0px",
    "--right-width": inspectorOpen ? prefs.rightWidth + "px" : "0px",
    "--reader-size": prefs.fontSize + "px",
    "--reader-leading": prefs.lineHeight,
    "--reader-width": prefs.pageWidth === 0 ? "100%" : prefs.pageWidth + "px",
    "--page-brightness": prefs.pageBrightness / 100,
  } as CSSProperties;
  const error = (e: unknown) =>
    notify(e instanceof Error ? e.message : String(e));
  const patchPrefs = (p: Partial<Preferences>) =>
    setPrefs((old) => changeAppearance(old, p));
  const setSort = (librarySort: string) => patchPrefs({ librarySort });
  const libraryFilters = prefs.libraryFilters;
  const patchLibraryFilters = (
    next: Partial<Preferences["libraryFilters"]>,
  ) => {
    patchPrefs({ libraryFilters: { ...libraryFilters, ...next } });
    setSelected(new Set());
  };
  const filtersActive = Object.values(libraryFilters).some((v) => v !== "all");
  async function refresh() {
    setBooks(await store.listBooks());
  }
  async function refreshVoices(retry = false) {
    const current = await store.getVoices();
    setVoices(current);
    if (retry) covers.retryPortraits();
  }
  useEffect(() => {
    if (!ready || !store.desktop) return;
    const refresh = () => {
      if (!document.hidden) void refreshVoices().catch(error);
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [ready]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await store.initializeLibrary();
        const saved = await store.readSettings();
        const available = await store.getVoices();
        if (active) {
          setBooks(rows);
          const merged = { ...defaultPreferences, ...saved };
          merged.collections = collectionNames(merged.collections, rows);
          if (available.length && !available.some((v) => v.id === merged.voice))
            merged.voice = available[0].id;
          setPrefs(startupBackground(startupVoice(merged, available)));
          setVoices(available);
          setAnnotations(await store.listAnnotations());
          setReady(true);
        }
      } catch (e) {
        if (active) error(e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    void store.saveSettings(prefs).catch(error);
  }, [prefs, ready]);
  useEffect(() => {
    if (
      !ready ||
      (page !== "bookmarks" &&
        !(prefs.rightOpen && prefs.inspector === "notes"))
    )
      return;
    let active = true;
    const missing = [...new Set(annotations.map((a) => a.bookId))].filter(
      (id) => id !== book?.meta.id && !noteBooksRef.current[id],
    );
    void Promise.allSettled(missing.map((id) => store.readBook(id))).then(
      (results) => {
        if (!active) return;
        const loaded: Record<string, Book> = {};
        for (const result of results)
          if (result.status === "fulfilled")
            loaded[result.value.meta.id] = result.value;
        if (Object.keys(loaded).length)
          setNoteBooks((old) => ({ ...old, ...loaded }));
      },
    );
    return () => {
      active = false;
    };
  }, [
    ready,
    page,
    prefs.rightOpen,
    prefs.inspector,
    annotations,
    book?.meta.id,
  ]);
  useEffect(() => {
    if (page !== "reader" || !book) return;
    const frame = requestAnimationFrame(() => rememberReadingLocation());
    return () => cancelAnimationFrame(frame);
  }, [page, book?.meta.id, readerPage]);
  useEffect(() => {
    if (!ready || !store.desktop || !prefs.preloadAtStartup) return;
    const available = voices.filter((voice) => voice.available);
    const voice =
      available.find((v) => v.id === prefs.lastVoice) ||
      available.find((v) => v.id === prefs.voice) ||
      available[0];
    if (!voice) return;
    let active = true;
    setStartupSpeech("Preparing " + voice.name + " for playback...");
    void store
      .prepareVoice(voice.id)
      .then(() => {
        if (active) setStartupSpeech("Loaded " + voice.name + " at startup.");
      })
      .catch(() => {
        if (active)
          setStartupSpeech(
            "Startup preload failed. Playback will retry when needed.",
          );
      });
    return () => {
      active = false;
    };
    // Startup only; changing appearance or voice preferences must not reload the engine.
  }, [ready]);
  useEffect(() => {
    const visibility = () => {
      document.documentElement.dataset.hidden = String(document.hidden);
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 9000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  useEffect(() => {
    player.setPlayback(prefs.speed, prefs.volume);
  }, [prefs.speed, prefs.volume]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        fileInput.current?.click();
      }
      if (e.key === "Escape") {
        setQuick(false);
        setSelection(null);
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  async function updateMeta(meta: BookMeta) {
    setBooks((old) => old.map((b) => (b.id === meta.id ? meta : b)));
    setBook((old) => (old?.meta.id === meta.id ? { ...old, meta } : old));
    await store.saveMeta(meta);
  }
  const namedCollections = collectionNames(prefs.collections, books);
  function addCollection() {
    try {
      const name = checkedCollectionName(collectionName, namedCollections);
      patchPrefs({ collections: [...namedCollections, name] });
      setCollection(name);
      setPage("library");
      setSelected(new Set());
      setAddingCollection(false);
      setCollectionName("");
      setCollectionError("");
    } catch (e) {
      setCollectionError(e instanceof Error ? e.message : String(e));
    }
  }
  async function deleteCollection(name: string) {
    if (builtInCollections.includes(name) || collectionBusy) return;
    setCollectionBusy(true);
    try {
      const current = await store.listBooks();
      const affected = current.filter((b) => b.collection === name);
      for (const meta of affected)
        await updateMeta({ ...meta, collection: "Unsorted" });
      patchPrefs({ collections: namedCollections.filter((c) => c !== name) });
      setCollectionUndo({ name, ids: affected.map((b) => b.id) });
      setUndo(null);
      if (collection === name) setCollection("All books");
      setSelected(new Set());
      notify('Deleted "' + name + '". Its books are in Unsorted.');
    } finally {
      setCollectionBusy(false);
    }
  }
  async function undoCollectionDeletion() {
    if (!collectionUndo || collectionBusy) return;
    setCollectionBusy(true);
    try {
      const current = await store.listBooks();
      for (const meta of current.filter(
        (b) => collectionUndo.ids.includes(b.id) && b.collection === "Unsorted",
      )) {
        await updateMeta({ ...meta, collection: collectionUndo.name });
      }
      patchPrefs({
        collections: [...new Set([...namedCollections, collectionUndo.name])],
      });
      setCollectionUndo(null);
      notify("Collection restored.");
    } finally {
      setCollectionBusy(false);
    }
  }
  async function editCover(meta: BookMeta) {
    coverFocus.current = document.activeElement as HTMLElement;
    setCoverEditor(await store.readBook(meta.id));
  }
  function closeCoverEditor() {
    setCoverEditor(null);
    requestAnimationFrame(() => coverFocus.current?.focus());
  }
  async function chooseCoverImage(image: string) {
    if (!coverEditor) return;
    const current = (await store.readBook(coverEditor.meta.id)).meta;
    const meta = {
      ...current,
      coverImage: image,
      coverOrigin: "custom" as const,
    };
    await updateMeta(meta);
    setCoverEditor((old) => (old ? { ...old, meta } : old));
  }
  function editPortrait(voice: Voice) {
    portraitFocus.current = document.activeElement as HTMLElement;
    setPortraitEditor(voice);
  }
  function closePortraitEditor() {
    setPortraitEditor(null);
    requestAnimationFrame(() => portraitFocus.current?.focus());
  }
  async function choosePortraitImage(image: string) {
    if (!portraitEditor) return;
    await store.saveVoicePortrait(portraitEditor.id, image, "", "custom");
    const updated = {
      ...portraitEditor,
      portrait: image,
      portraitPrompt: "",
      portraitOrigin: "custom" as const,
    };
    setVoices((old) => old.map((v) => (v.id === updated.id ? updated : v)));
    setPortraitEditor(updated);
  }
  async function saveAuthor(author: string, createCollection: boolean) {
    if (!book) return;
    const name = author.trim() || "Unknown author";
    let destination = book.meta.collection;
    if (createCollection) {
      destination =
        namedCollections.find(
          (c) => c.toLocaleLowerCase() === name.toLocaleLowerCase(),
        ) || checkedCollectionName(name, namedCollections);
    }
    await updateMeta({ ...book.meta, author: name, collection: destination });
    if (createCollection)
      patchPrefs({
        collections: [...new Set([...namedCollections, destination])],
      });
    notify(
      createCollection
        ? "Author saved. Document added to " + destination + "."
        : "Author saved.",
    );
  }
  function selectVoice(id: string, documentScope: boolean) {
    const chosen = voices.find((v) => v.id === id);
    if (!chosen?.available) return;
    const current = book ? book.meta.voice || prefs.voice : prefs.voice;
    if (current === id && (documentScope || prefs.voice === id)) return;
    if (current !== id) {
      resumeVoice.current = true;
      voiceBarrier.current = player.changeVoice();
    }
    const language = chosen.languages.includes(prefs.voiceLanguage)
      ? prefs.voiceLanguage
      : chosen.languages[0] || prefs.voiceLanguage;
    patchPrefs({ voiceLanguage: language });
    setStartupSpeech("");
    if (book) {
      const meta = { ...book.meta, voice: id };
      setBook({ ...book, meta });
      setBooks((old) => old.map((b) => (b.id === meta.id ? meta : b)));
      void store.saveMeta(meta).catch(error);
    }
    if (!documentScope || !book) patchPrefs({ voice: id });
  }
  async function openBook(id: string, position?: number) {
    if (draft && !window.confirm("Discard the unfinished note?")) return false;
    await player.stop();
    resumeVoice.current = false;
    setFocusMode(false);
    const b = await store.readBook(id);
    b.meta.opened = Date.now();
    if (position !== undefined) b.meta.position = position;
    await store.saveMeta(b.meta);
    setBook(b);
    setReaderPage(Math.floor(b.meta.position / 30));
    setPage("reader");
    setSelection(null);
    setDraft("");
    setEditing(null);
    setBookQuery("");
    await refresh();
    return true;
  }
  async function importFiles(files: FileList | File[]) {
    setBusy(true);
    let count = 0;
    const failures: string[] = [];
    try {
      let known = await store.listBooks();
      for (const file of Array.from(files)) {
        try {
          const b = await importDocument(file);
          if (namedCollections.includes(collection))
            b.meta.collection = collection;
          const existing = known.find(
            (k) => k.sourceHash === b.meta.sourceHash,
          );
          if (existing) {
            failures.push(
              file.name +
                ": already in library" +
                (existing.deleted ? " (in Trash)" : ""),
            );
            continue;
          }
          await store.saveBook(b);
          covers.enqueue(b.meta);
          known = [...known, b.meta];
          count++;
        } catch (e) {
          failures.push(
            file.name + ": " + String(e instanceof Error ? e.message : e),
          );
        }
      }
      await refresh();
      notify((count ? count + " imported. " : "") + failures.join(" "));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function addQuick() {
    if (!quickText.trim()) return;
    const b = createBook(
      quickTitle.trim() || "Untitled text",
      paragraphsFromText(quickText),
      "Text",
    );
    if (namedCollections.includes(collection)) b.meta.collection = collection;
    await store.saveBook(b);
    covers.enqueue(b.meta);
    setQuick(false);
    setQuickText("");
    await openBook(b.meta.id);
  }
  async function moveToTrash(ids: Set<string>) {
    const affected = books.filter((b) => ids.has(b.id));
    for (const b of affected) await store.saveMeta({ ...b, deleted: true });
    if (book && ids.has(book.meta.id)) {
      await player.stop();
      setBook(null);
      setPage("library");
    }
    setUndo(affected);
    setSelected(new Set());
    await refresh();
    notify(affected.length + " moved to Trash. Saved exports are untouched.");
  }
  async function restore(items: BookMeta[]) {
    for (const b of items) await store.saveMeta({ ...b, deleted: false });
    setUndo(null);
    await refresh();
    notify("Restored to the library.");
  }
  function chooseTab(tab: InspectorTab) {
    setFocusMode(false);
    if (tab === "appearance" && !inspectorAvailable) {
      setPage("settings");
      return;
    }
    if (!inspectorAvailable && book) setPage("reader");
    patchPrefs({ rightOpen: true, inspector: tab });
  }
  function captureSelection() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    const range = s.getRangeAt(0);
    const node =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement;
    const p = node?.closest<HTMLElement>("[data-paragraph]");
    if (!p || !article.current?.contains(p)) return;
    const value = selectionFromRange(range, p);
    if (!value || !value.text.trim()) {
      notify("Select text within one paragraph for passage tools.");
      return;
    }
    const paragraph = book?.paragraphs.find(
      (q) => q.id === p.dataset.paragraph,
    );
    const spokenRange = paragraph ? expandSpokenRange(paragraph, value) : value;
    setSelection({
      ...spokenRange,
      text: paragraph
        ? paragraph.text.slice(spokenRange.start, spokenRange.end)
        : value.text,
      paragraphId: p.dataset.paragraph!,
    });
    if (!pinned && !draft && prefs.rightOpen)
      patchPrefs({ inspector: "selection" });
  }
  async function addAnnotation(
    kind: Annotation["kind"],
    currentPosition = false,
  ) {
    if (!book) return;
    const location = currentPosition ? rememberReadingLocation() : null;
    const currentParagraph = location
      ? book.paragraphs.find((p) => p.id === location.paragraphId)
      : book.paragraphs[book.meta.position];
    const p = (!currentPosition && selection) || {
      paragraphId: currentParagraph?.id || book.paragraphs[0].id,
      start: 0,
      end: 0,
      text: currentParagraph?.text || "",
    };
    const a: Annotation = {
      id: editing || crypto.randomUUID(),
      bookId: book.meta.id,
      paragraphId: p.paragraphId,
      start: p.start,
      end: p.end,
      quote: p.text,
      kind,
      color,
      text: draft,
      group: noteGroup.trim(),
      created: Date.now(),
    };
    const previous = annotations.find((n) => n.id === editing);
    const item = previous
      ? { ...previous, text: draft, color, group: noteGroup.trim() }
      : a;
    await store.saveAnnotation(item);
    setAnnotations((old) => [item, ...old.filter((n) => n.id !== item.id)]);
    setDraft("");
    setEditing(null);
    notify(
      kind === "underline"
        ? "Underline saved."
        : kind === "bookmark"
          ? "Bookmark saved."
          : "Note saved.",
    );
    chooseTab("notes");
  }
  async function removeAnnotation(a: Annotation) {
    await store.deleteAnnotation(a.id);
    setAnnotations((old) => old.filter((n) => n.id !== a.id));
    notify("Annotation deleted.");
  }
  async function jumpAnnotation(a: Annotation) {
    if (jumpRef.current) return;
    jumpRef.current = true;
    setJumping(true);
    const origin =
      page === "reader" ? rememberReadingLocation() : readingAnchorRef.current;
    try {
      const b =
        bookRef.current?.meta.id === a.bookId
          ? bookRef.current
          : await store.readBook(a.bookId);
      const pos = b.paragraphs.findIndex((p) => p.id === a.paragraphId);
      if (pos < 0) {
        notify("This passage is no longer available. Your note is preserved.");
        return;
      }
      if (!(await openBook(a.bookId, pos))) return;
      if (!returnRef.current && origin) {
        returnRef.current = origin;
        setReturnAnchor(origin);
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document
            .getElementById("passage-" + a.paragraphId)
            ?.scrollIntoView({ block: "center" }),
        ),
      );
    } finally {
      jumpRef.current = false;
      setJumping(false);
    }
  }
  function rememberReadingLocation(): ReadingAnchor | null {
    const current = bookRef.current;
    if (!current) return null;
    const region = article.current?.parentElement;
    const box = region?.getBoundingClientRect();
    const visible = Array.from(
      article.current?.querySelectorAll<HTMLElement>("[data-paragraph]") || [],
    ).find((el) => {
      const rect = el.getBoundingClientRect();
      return box && rect.bottom > box.top + 12 && rect.top < box.bottom;
    });
    const paragraph =
      visible?.dataset.paragraph ||
      current.paragraphs[current.meta.position]?.id;
    if (!paragraph) return null;
    const visibleIndex = current.paragraphs.findIndex(
      (p) => p.id === paragraph,
    );
    const position =
      Math.floor(current.meta.position / 30) === readerPage
        ? current.meta.position
        : Math.max(0, visibleIndex);
    const anchor = {
      bookId: current.meta.id,
      paragraphId: paragraph,
      position,
      offset:
        visible && box ? visible.getBoundingClientRect().top - box.top : 0,
      title: current.meta.title,
    };
    readingAnchorRef.current = anchor;
    return anchor;
  }
  async function returnToReading() {
    const anchor = returnRef.current;
    if (!anchor || jumpRef.current) return;
    jumpRef.current = true;
    setJumping(true);
    try {
      const original = await store.readBook(anchor.bookId);
      const position = original.paragraphs.findIndex(
        (p) => p.id === anchor.paragraphId,
      );
      if (position < 0)
        throw new Error("Your original reading passage is unavailable.");
      if (
        !(await openBook(
          anchor.bookId,
          Math.floor(anchor.position / 30) === Math.floor(position / 30)
            ? anchor.position
            : position,
        ))
      )
        return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const paragraph = document
            .getElementById("passage-" + anchor.paragraphId)
            ?.querySelector<HTMLElement>("[data-paragraph]");
          const region = article.current?.parentElement;
          if (paragraph && region)
            region.scrollTop +=
              paragraph.getBoundingClientRect().top -
              region.getBoundingClientRect().top -
              anchor.offset;
          rememberReadingLocation();
        }),
      );
      returnRef.current = null;
      setReturnAnchor(null);
    } finally {
      jumpRef.current = false;
      setJumping(false);
    }
  }
  function positionChanged(n: number) {
    const b = bookRef.current;
    if (!b) return;
    void updateMeta({ ...b.meta, position: n }).catch(error);
    if (prefRef.current.follow) {
      setReaderPage(Math.floor(n / 30));
      setTimeout(
        () =>
          document
            .getElementById("passage-" + b.paragraphs[n].id)
            ?.scrollIntoView({ block: "center", behavior: "smooth" }),
        70,
      );
    }
  }
  async function readSelection() {
    if (book && selection) {
      const n = book.paragraphs.findIndex(
        (p) => p.id === selection.paragraphId,
      );
      await covers.cancel();
      await voiceBarrier.current;
      resumeVoice.current = false;
      await player.start(
        bookRef.current!,
        n,
        prefRef.current,
        () => {},
        selection,
      );
    }
  }
  const selectedParagraph =
    selection && book
      ? book.paragraphs.find((p) => p.id === selection.paragraphId)
      : undefined;
  const spokenKey =
    book && selection
      ? `${book.meta.id}:${selection.paragraphId}:${selection.start}:${selection.end}`
      : "";
  const savedSpoken =
    selectedParagraph && selection
      ? spokenText(selectedParagraph, prefs, selection)
      : "";
  const spokenDraft = spokenDrafts[spokenKey] ?? savedSpoken;
  const spokenChanged = spokenDraft !== savedSpoken;
  const hasSpokenEdit =
    selectedParagraph && selection
      ? (selectedParagraph.spokenEdits || []).some(
          (edit) => edit.start < selection.end && edit.end > selection.start,
        )
      : false;
  async function acceptSpoken(reset = false) {
    if (!book || !selection || !selectedParagraph || spokenBusy) return;
    const bookId = book.meta.id,
      paragraphId = selection.paragraphId,
      key = spokenKey;
    const edits: SpokenEdit[] = replaceSpokenRange(
      selectedParagraph,
      selection,
      reset ? null : spokenDraft,
    );
    setSpokenBusy(true);
    try {
      await player.stop();
      resumeVoice.current = false;
      await store.saveSpokenEdits(bookId, paragraphId, edits);
      const update = (old: Book): Book => ({
        ...old,
        paragraphs: old.paragraphs.map((p) =>
          p.id === paragraphId
            ? { ...p, spokenEdits: edits.length ? edits : undefined }
            : p,
        ),
      });
      if (bookRef.current?.meta.id === bookId) {
        const next = update(bookRef.current);
        bookRef.current = next;
        setBook(next);
      }
      setNoteBooks((old) =>
        old[bookId] ? { ...old, [bookId]: update(old[bookId]) } : old,
      );
      setSpokenDrafts((old) => {
        const next = { ...old };
        delete next[key];
        return next;
      });
      notify(
        reset
          ? "Saved replacement removed. Automatic speech rules apply."
          : "Spoken version saved. Future readings will use it.",
      );
    } finally {
      setSpokenBusy(false);
    }
  }
  async function previewSpoken() {
    if (!book || !selection) return;
    const position = book.paragraphs.findIndex(
      (p) => p.id === selection.paragraphId,
    );
    await covers.cancel();
    await voiceBarrier.current;
    resumeVoice.current = false;
    await player.start(
      bookRef.current!,
      position,
      prefRef.current,
      () => {},
      spokenDraft,
    );
  }
  async function startBook() {
    if (book) {
      await covers.cancel();
      await voiceBarrier.current;
      const current = bookRef.current!;
      const resume = resumeVoice.current;
      resumeVoice.current = false;
      await player.start(
        current,
        current.meta.position,
        prefRef.current,
        positionChanged,
        undefined,
        resume,
      );
    }
  }
  async function startFrom(position: number) {
    await covers.cancel();
    await voiceBarrier.current;
    resumeVoice.current = false;
    if (bookRef.current)
      await player.start(
        bookRef.current,
        position,
        prefRef.current,
        positionChanged,
      );
  }
  function paragraphText(p: Book["paragraphs"][number]) {
    const marks = annotations.filter(
      (n) =>
        n.bookId === book?.meta.id && n.paragraphId === p.id && n.end > n.start,
    );
    const cuts = [
      ...new Set([
        0,
        p.text.length,
        ...marks.flatMap((n) => [
          Math.max(0, n.start),
          Math.min(p.text.length, n.end),
        ]),
      ]),
    ].sort((a, b) => a - b);
    return cuts.slice(0, -1).map((start, i) => {
      const end = cuts[i + 1];
      const mark = marks.find((n) => n.start <= start && n.end >= end);
      const c = annotationColors.find((c) => c.id === mark?.color);
      return (
        <span
          key={start}
          style={
            mark
              ? {
                  textDecoration: "underline",
                  textDecorationColor: c?.value,
                  textDecorationThickness: "2px",
                  textUnderlineOffset: "5px",
                }
              : undefined
          }
        >
          {p.text.slice(start, end)}
        </span>
      );
    });
  }
  function resize(
    side: "left" | "right",
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    const start = event.clientX;
    const initial = side === "left" ? prefs.leftWidth : prefs.rightWidth;
    event.currentTarget.setPointerCapture(event.pointerId);
    const el = event.currentTarget;
    const move = (e: PointerEvent) =>
      patchPrefs({
        [side === "left" ? "leftWidth" : "rightWidth"]: Math.max(
          side === "left" ? 180 : 280,
          Math.min(
            side === "left" ? 330 : 430,
            initial + (e.clientX - start) * (side === "left" ? 1 : -1),
          ),
        ),
      });
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
  }
  const filteredBooks = books.filter((b) =>
    matchesLibraryFilters(b, libraryFilters),
  );
  const visible = sortLibrary(
    filteredBooks
      .filter((b) => (collection === "Trash" ? b.deleted : !b.deleted))
      .filter(
        (b) =>
          collection === "All books" ||
          collection === "Trash" ||
          (collection === "Favorites"
            ? b.favorite
            : b.collection === collection),
      )
      .filter(
        (b) =>
          filter === "All" ||
          (filter === "Books"
            ? ["EPUB", "Sample"].includes(b.format)
            : !["EPUB", "Sample"].includes(b.format)),
      )
      .filter((b) =>
        (b.title + " " + b.author + " " + b.collection)
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    sort,
  );
  const latest = books
    .filter((b) => !b.deleted)
    .sort((a, b) => b.opened - a.opened)[0];
  const noteMetadataKey = JSON.stringify(books.map((b) => [b.id, b.title]));
  const noteViews = useMemo(
    () => annotationViews(annotations, books, noteBooks, book),
    [annotations, noteMetadataKey, noteBooks, book?.meta.id, book?.paragraphs],
  );
  const currentAnnotations = filterAnnotations(
    noteViews,
    noteQuery,
    noteFilter,
    noteColor,
    noteOrder,
    page === "bookmarks" || noteScope === "all"
      ? undefined
      : book?.meta.id || "no-book",
  );
  const activeParagraphs =
    book?.paragraphs.slice(readerPage * 30, (readerPage + 1) * 30) || [];
  const inspectorTabs: { id: InspectorTab; label: string; icon: ReactNode }[] =
    [
      ...(selection
        ? [
            {
              id: "selection" as const,
              label: "Selection",
              icon: <SlidersHorizontal size={16} />,
            },
          ]
        : []),
      { id: "notes", label: "Notes", icon: <Bookmark size={16} /> },
      { id: "voice", label: "Voice", icon: <AudioLines size={16} /> },
      { id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
      { id: "document", label: "Document", icon: <FileText size={16} /> },
    ];
  const activeTab =
    prefs.inspector === "selection" && !selection ? "notes" : prefs.inspector;
  function notesPanel() {
    return (
      <div className="inspector-content">
        <div className="section-row">
          <h3>Notes & bookmarks</h3>
          <IconButton
            label="Export annotations"
            onClick={() => {
              void store
                .exportText(
                  "annotations.txt",
                  currentAnnotations
                    .map(({ annotation: a, title, line, context, paragraph }) =>
                      [
                        title,
                        paragraph >= 0 ? "Paragraph " + (paragraph + 1) : "",
                        a.group,
                        line,
                        context !== line ? context : "",
                        a.text,
                      ]
                        .filter(Boolean)
                        .join("\n"),
                    )
                    .join("\n\n"),
                )
                .catch(error);
            }}
          >
            <Download size={17} />
          </IconButton>
        </div>
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Search annotations"
            placeholder="Search annotations"
            value={noteQuery}
            onChange={(e) => setNoteQuery(e.target.value)}
          />
        </div>
        <div className="annotation-filters">
          {page !== "bookmarks" && (
            <select
              aria-label="Annotation scope"
              value={noteScope}
              onChange={(e) => setNoteScope(e.target.value)}
            >
              <option value="book">Current book</option>
              <option value="all">All books</option>
            </select>
          )}
          <select
            aria-label="Annotation type"
            value={noteFilter}
            onChange={(e) => setNoteFilter(e.target.value)}
          >
            <option value="all">All annotations</option>
            <option value="note">Notes</option>
            <option value="bookmark">Bookmarks</option>
            <option value="underline">Underlines</option>
          </select>
          <select
            aria-label="Annotation color filter"
            value={noteColor}
            onChange={(e) => setNoteColor(e.target.value)}
          >
            <option value="all">All colors</option>
            {annotationColors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Annotation order"
            value={noteOrder}
            onChange={(e) => setNoteOrder(e.target.value as AnnotationOrder)}
          >
            <option value="book-asc">Book order: first to last</option>
            <option value="book-desc">Book order: last to first</option>
            <option value="text-asc">Alphabetical: A to Z</option>
            <option value="text-desc">Alphabetical: Z to A</option>
            <option value="newest">Recently added</option>
          </select>
        </div>
        <p className="annotation-count" role="status">
          {currentAnnotations.length}{" "}
          {currentAnnotations.length === 1 ? "annotation" : "annotations"}
        </p>
        {(selection || editing) && (
          <div className="note-editor">
            <h4>{editing ? "Edit note" : "Add note"}</h4>
            <textarea
              aria-label="Note text"
              placeholder="Write a note"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <input
              aria-label="Note group"
              placeholder="Group or label"
              value={noteGroup}
              onChange={(e) => setNoteGroup(e.target.value)}
            />
            {colorPicker()}
            <button
              className="primary"
              onClick={() => {
                void addAnnotation("note").catch(error);
              }}
            >
              <Check size={15} />
              Save note
            </button>
          </div>
        )}
        {!currentAnnotations.length && (
          <p className="empty-copy">
            Select a passage to underline it or add a note. Bookmarks can also
            mark your current position.
          </p>
        )}
        {currentAnnotations.map(
          ({ annotation: a, title, line, context, paragraph, heading }) => (
            <div
              key={a.id}
              className="annotation-card"
              style={{
                borderLeftColor: annotationColors.find((c) => c.id === a.color)
                  ?.value,
              }}
            >
              <div className="section-row">
                <span className="eyebrow">{a.group || a.kind}</span>
                <IconButton
                  label="Delete annotation"
                  onClick={() => {
                    void removeAnnotation(a).catch(error);
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
              <div className="annotation-location">
                {title}
                {heading && heading !== title ? ` · ${heading}` : ""}
                {paragraph >= 0 ? ` · Paragraph ${paragraph + 1}` : ""}
              </div>
              <button
                className="quote"
                disabled={jumping}
                onClick={() => {
                  void jumpAnnotation(a).catch(error);
                }}
              >
                <span>{line}</span>
                {a.text && <span className="note-body">{a.text}</span>}
              </button>
              {context && context !== line && (
                <details className="annotation-context">
                  <summary>Full paragraph</summary>
                  <p>{context}</p>
                </details>
              )}
              <button
                className="text-button"
                onClick={() => {
                  setEditing(a.id);
                  setDraft(a.text);
                  setColor(a.color);
                  setNoteGroup(a.group);
                }}
              >
                Edit
              </button>
            </div>
          ),
        )}
      </div>
    );
  }
  function colorPicker() {
    return (
      <div className="color-options" role="group" aria-label="Annotation color">
        {annotationColors.map((c) => (
          <button
            key={c.id}
            aria-label={c.label + " annotation"}
            title={c.label}
            aria-pressed={color === c.id}
            style={{ background: c.value }}
            onClick={() => setColor(c.id)}
          >
            {color === c.id && <Check size={13} />}
          </button>
        ))}
      </div>
    );
  }
  function selectionPanel() {
    return (
      <div className="inspector-content">
        <h3>Selected passage</h3>
        <blockquote className="selected-quote">{selection?.text}</blockquote>
        <div className="selection-actions">
          <button
            className="primary"
            onClick={() => {
              void readSelection();
            }}
          >
            <Play size={16} />
            Read selection
          </button>
          <button
            onClick={() => {
              if (book && selection) {
                const n = book.paragraphs.findIndex(
                  (p) => p.id === selection.paragraphId,
                );
                void startFrom(n);
              }
            }}
          >
            <BookOpen size={16} />
            Read from here
          </button>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(selection?.text || "")
                .then(() => notify("Copied."))
                .catch(error);
            }}
          >
            <Copy size={16} />
            Copy text
          </button>
        </div>
        <h4>Annotate</h4>
        {colorPicker()}
        <div className="annotation-actions">
          <button
            onClick={() => {
              void addAnnotation("underline").catch(error);
            }}
          >
            <Underline size={17} />
            Underline
          </button>
          <button onClick={() => chooseTab("notes")}>
            <MessageSquare size={17} />
            Note
          </button>
          <button
            onClick={() => {
              void addAnnotation("bookmark").catch(error);
            }}
          >
            <Bookmark size={17} />
            Bookmark
          </button>
        </div>
        <h4>Spoken version</h4>
        <textarea
          className="spoken-preview spoken-editor"
          aria-label="Spoken version"
          value={spokenDraft}
          disabled={spokenBusy}
          onChange={(e) =>
            setSpokenDrafts((old) => ({ ...old, [spokenKey]: e.target.value }))
          }
        />
        <div className="spoken-actions">
          <button
            className="primary"
            disabled={spokenBusy || (!spokenChanged && hasSpokenEdit)}
            onClick={() => {
              void acceptSpoken().catch(error);
            }}
          >
            <Check size={15} />
            Save spoken version
          </button>
          <button
            disabled={spokenBusy || !hasSpokenEdit}
            onClick={() => {
              void acceptSpoken(true).catch(error);
            }}
          >
            <RotateCcw size={15} />
            Reset spoken version
          </button>
          {spokenChanged && (
            <button
              disabled={spokenBusy}
              onClick={() =>
                setSpokenDrafts((old) => {
                  const next = { ...old };
                  delete next[spokenKey];
                  return next;
                })
              }
            >
              Discard edits
            </button>
          )}
          <button
            disabled={spokenBusy || !spokenDraft.trim()}
            onClick={() => {
              void previewSpoken().catch(error);
            }}
          >
            <Play size={15} />
            Preview spoken version
          </button>
        </div>
        <p className="hint" role="status">
          {spokenChanged
            ? "Unsaved changes"
            : hasSpokenEdit
              ? savedSpoken
                ? "Saved replacement"
                : "Saved: skip this passage"
              : "Automatic spoken version"}
        </p>
        <p className="hint">
          Save to use this wording whenever the passage is read again. Leave it
          blank to skip the passage. The book text and annotations are
          preserved.
        </p>
      </div>
    );
  }
  function documentPanel() {
    return (
      <div className="inspector-content">
        <h3>Document</h3>
        {book ? (
          <>
            <CoverControl
              book={book.meta}
              onEdit={() => {
                void editCover(book.meta).catch(error);
              }}
              always
            />
            {covers.active === book.meta.id && (
              <p className="hint" role="status">
                Generating cover...
              </p>
            )}
            <button
              onClick={() => {
                void editCover(book.meta).catch(error);
              }}
            >
              Change cover
            </button>
            <h4>{book.meta.title}</h4>
            <p className="hint">{book.meta.author}</p>
            <form
              key={book.meta.id + book.meta.author}
              className="author-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void saveAuthor(
                  String(data.get("author") || ""),
                  data.get("authorCollection") === "on",
                ).catch(error);
              }}
            >
              <label>
                Author name
                <input
                  name="author"
                  aria-label="Author name"
                  defaultValue={book.meta.author}
                  maxLength={200}
                />
              </label>
              <label className="check-label">
                <input name="authorCollection" type="checkbox" />
                Create collection with author's name
              </label>
              <p className="hint">
                Adds this document to the author's collection, creating it if
                needed.
              </p>
              <button type="submit">Save author</button>
            </form>
            <label>
              Cover text
              <select
                aria-label="Document cover text"
                value={book.meta.coverText || "auto"}
                onChange={(e) => {
                  void updateMeta({
                    ...book.meta,
                    coverText: e.target.value as BookMeta["coverText"],
                  }).catch(error);
                }}
              >
                <option value="auto">Automatic</option>
                <option value="show">Show title and author</option>
                <option value="hide">Hide title and author</option>
              </select>
            </label>
            <p className="hint">
              Automatic leaves imported artwork without added text. The global
              Cover art switch can hide overlays on every cover.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={bookFinished(book.meta)}
                onChange={(e) => {
                  void updateMeta({
                    ...book.meta,
                    finished: e.target.checked,
                  }).catch(error);
                }}
              />
              Finished reading
            </label>
            <dl>
              <dt>Format</dt>
              <dd>{book.meta.format}</dd>
              <dt>Words</dt>
              <dd>{book.meta.wordCount.toLocaleString()}</dd>
              <dt>Paragraphs</dt>
              <dd>{book.meta.paragraphCount}</dd>
            </dl>
            <button onClick={() => setEditingMeta(!editingMeta)}>
              <FileText size={16} />
              Edit details
            </button>
            {editingMeta && (
              <form
                className="metadata-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void updateMeta({
                    ...book.meta,
                    title: String(data.get("title")).trim() || book.meta.title,
                    collection:
                      String(data.get("collection")).trim() || "Unsorted",
                  })
                    .then(() => {
                      setEditingMeta(false);
                      notify("Details saved.");
                    })
                    .catch(error);
                }}
              >
                <label>
                  Title
                  <input name="title" defaultValue={book.meta.title} />
                </label>
                <label>
                  Collection
                  <select
                    aria-label="Collection"
                    name="collection"
                    defaultValue={book.meta.collection}
                  >
                    {[
                      ...new Set([
                        "Unsorted",
                        ...namedCollections,
                        book.meta.collection,
                      ]),
                    ].map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="primary">
                  Save details
                </button>
              </form>
            )}
            <button
              onClick={() => {
                void store
                  .exportText(
                    book.meta.title + ".txt",
                    book.paragraphs.map((p) => p.text).join("\n\n"),
                  )
                  .catch(error);
              }}
            >
              <Download size={16} />
              Export text
            </button>
            <p className="hint">
              Audiobook export follows persistent generation jobs. Source files
              and manual exports remain separate from the library.
            </p>
          </>
        ) : (
          <p className="empty-copy">Open a document to view its details.</p>
        )}
      </div>
    );
  }
  return (
    <CoverTextContext value={prefs.showCoverText}>
      <div
        className="app"
        style={variables}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length)
            void importFiles(e.dataTransfer.files);
        }}
      >
        <BackgroundScene prefs={prefs} />
        <input
          className="hidden"
          ref={fileInput}
          type="file"
          accept=".txt,.md,.markdown,.epub"
          multiple
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
          }}
        />
        <aside
          className={"sidebar " + (!navigationOpen ? "collapsed" : "")}
          aria-hidden={!navigationOpen}
          inert={!navigationOpen}
        >
          <button
            className="brand"
            onClick={() => {
              setPage("library");
              setQuery("");
            }}
          >
            <img src="/crane.png" alt="" />
            Origami
          </button>
          {page === "reader" && book ? (
            <>
              <button
                className="back-library"
                onClick={() => setPage("library")}
              >
                <ArrowLeft size={16} />
                Library
              </button>
              <div className="nav-label">Contents</div>
              <div className="search-field small-search">
                <Search size={15} />
                <input
                  aria-label="Search book"
                  placeholder="Find in book"
                  value={bookQuery}
                  onChange={(e) => setBookQuery(e.target.value)}
                />
              </div>
              <nav className="chapters">
                {(bookQuery
                  ? book.paragraphs.filter((p) =>
                      p.text.toLowerCase().includes(bookQuery.toLowerCase()),
                    )
                  : book.paragraphs.filter((p) => p.kind === "heading")
                ).map((p) => (
                  <button
                    key={p.id}
                    className={
                      book.paragraphs[book.meta.position]?.chapter === p.chapter
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      const i = book.paragraphs.findIndex((q) => q.id === p.id);
                      positionChanged(i);
                      setReaderPage(Math.floor(i / 30));
                    }}
                  >
                    {p.text}
                  </button>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <span className="hint">
                  {Math.round(
                    (book.meta.position /
                      Math.max(1, book.meta.paragraphCount - 1)) *
                      100,
                  )}
                  % through text
                </span>
                <progress
                  value={book.meta.position}
                  max={Math.max(1, book.meta.paragraphCount - 1)}
                />
                <button onClick={() => chooseTab("appearance")}>
                  <Palette size={17} />
                  {theme.name}
                </button>
              </div>
            </>
          ) : (
            <>
              <nav className="main-nav" aria-label="Workspace pages">
                {(
                  [
                    {
                      id: "library",
                      label: "Library",
                      icon: <BookOpen size={20} />,
                    },
                    {
                      id: "bookmarks",
                      label: "Bookmarks",
                      icon: <Bookmark size={20} />,
                    },
                    {
                      id: "voices",
                      label: "Voices",
                      icon: <AudioLines size={20} />,
                    },
                  ] as const
                ).map((n) => (
                  <button
                    key={n.id}
                    className={page === n.id ? "active" : ""}
                    onClick={() => {
                      setPage(n.id);
                      if (n.id === "library") setCollection("All books");
                    }}
                  >
                    {n.icon}
                    {n.label}
                  </button>
                ))}
              </nav>
              <div className="collection-filter-section">
                <button
                  className="collection-filter-toggle"
                  aria-expanded={collectionFiltersOpen}
                  aria-controls="collection-filters"
                  onClick={() =>
                    setCollectionFiltersOpen(!collectionFiltersOpen)
                  }
                >
                  <SlidersHorizontal size={15} />
                  Filters{" "}
                  {filtersActive && (
                    <span
                      className="filter-active-dot"
                      aria-label="Filters active"
                    />
                  )}
                  {collectionFiltersOpen ? (
                    <ChevronLeft size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
                {collectionFiltersOpen && (
                  <div id="collection-filters" className="collection-filters">
                    <label>
                      Author
                      <select
                        aria-label="Filter collections by author"
                        value={libraryFilters.author}
                        onChange={(e) =>
                          patchLibraryFilters({ author: e.target.value })
                        }
                      >
                        <option value="all">All authors</option>
                        {[...new Set(books.map((b) => b.author))]
                          .sort((a, b) => a.localeCompare(b))
                          .map((author) => (
                            <option key={author} value={author}>
                              {author}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Type
                      <select
                        aria-label="Filter collections by type"
                        value={libraryFilters.type}
                        onChange={(e) =>
                          patchLibraryFilters({ type: e.target.value })
                        }
                      >
                        <option value="all">All types</option>
                        <option value="Books">Books</option>
                        <option value="Documents">Documents</option>
                        {[...new Set(books.map((b) => b.format))]
                          .sort()
                          .map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Reading status
                      <select
                        aria-label="Filter collections by reading status"
                        value={libraryFilters.status}
                        onChange={(e) =>
                          patchLibraryFilters({ status: e.target.value })
                        }
                      >
                        <option value="all">All reading statuses</option>
                        <option value="finished">Finished</option>
                        <option value="unfinished">Unfinished</option>
                        <option value="reading">In progress</option>
                        <option value="unread">Not started</option>
                      </select>
                    </label>
                    <label>
                      Order
                      <select
                        aria-label="Collection reading order"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">Last read, newest first</option>
                        <option value="oldest-read">
                          Last read, oldest first
                        </option>
                        <option value="added">Added, newest first</option>
                        <option value="oldest-added">
                          Added, oldest first
                        </option>
                        <option value="title">Title A to Z</option>
                        <option value="title-desc">Title Z to A</option>
                        <option value="author">Author A to Z</option>
                      </select>
                    </label>
                    <button
                      className="text-button"
                      onClick={() => {
                        patchLibraryFilters({
                          author: "all",
                          type: "all",
                          status: "all",
                        });
                        setSort("recent");
                        setFilter("All");
                      }}
                    >
                      Reset library filters
                    </button>
                  </div>
                )}
              </div>
              <div className="collection-heading">
                <div className="nav-label">Collections</div>
                <IconButton
                  label="Add collection"
                  disabled={collectionBusy}
                  onClick={() => {
                    setAddingCollection(!addingCollection);
                    setCollectionError("");
                  }}
                >
                  <Plus size={16} />
                </IconButton>
              </div>
              {addingCollection && (
                <form
                  className="collection-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCollection();
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Collection name"
                    placeholder="Collection name"
                    maxLength={64}
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                  />
                  <div>
                    <IconButton
                      label="Save collection"
                      onClick={addCollection}
                      disabled={collectionBusy}
                    >
                      <Check size={16} />
                    </IconButton>
                    <IconButton
                      label="Cancel adding collection"
                      onClick={() => {
                        setAddingCollection(false);
                        setCollectionError("");
                      }}
                    >
                      <X size={16} />
                    </IconButton>
                  </div>
                  {collectionError && (
                    <p className="hint" role="alert">
                      {collectionError}
                    </p>
                  )}
                </form>
              )}
              <nav className="collections" aria-label="Library collections">
                {[
                  "All books",
                  "Favorites",
                  ...namedCollections,
                  "Unsorted",
                  "Trash",
                ].map((c, i) => (
                  <div
                    key={c}
                    className={
                      "collection-row" +
                      (page === "library" && collection === c
                        ? " selected"
                        : "")
                    }
                  >
                    <button
                      className={
                        page === "library" && collection === c ? "active" : ""
                      }
                      onClick={() => {
                        setCollection(c);
                        setPage("library");
                        setSelected(new Set());
                      }}
                    >
                      {c === "Trash" ? (
                        <Trash2 size={15} />
                      ) : (
                        <span className={"collection-dot dot-" + (i % 4)} />
                      )}
                      <span className="collection-title">{c}</span>
                      <span className="count">
                        {
                          filteredBooks.filter((b) =>
                            c === "Trash"
                              ? b.deleted
                              : !b.deleted &&
                                (c === "All books" ||
                                  (c === "Favorites"
                                    ? b.favorite
                                    : b.collection === c)),
                          ).length
                        }
                      </span>
                    </button>
                    {!builtInCollections.includes(c) && (
                      <IconButton
                        label={"Delete collection " + c}
                        disabled={collectionBusy}
                        onClick={() => {
                          void deleteCollection(c).catch(error);
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    )}
                  </div>
                ))}
              </nav>
              {collectionUndo && (
                <button
                  className="collection-undo"
                  disabled={collectionBusy}
                  onClick={() => {
                    void undoCollectionDeletion().catch(error);
                  }}
                >
                  <RotateCcw size={14} />
                  Undo collection deletion
                </button>
              )}
              <div className="sidebar-bottom">
                <button
                  className={page === "settings" ? "active" : ""}
                  onClick={() => setPage("settings")}
                >
                  <Settings2 size={18} />
                  Settings
                </button>
                <button onClick={() => chooseTab("appearance")}>
                  <Palette size={17} />
                  {theme.name}
                </button>
                <div className="local-status">
                  <i />
                  {store.desktop ? "Local workspace" : "Browser preview"}
                </div>
                <span className="version">0.1.0 · Development</span>
              </div>
            </>
          )}
        </aside>
        {navigationOpen && (
          <div
            role="separator"
            aria-label="Resize navigation"
            aria-orientation="vertical"
            aria-valuenow={prefs.leftWidth}
            tabIndex={0}
            className="resize-handle left-resize"
            onPointerDown={(e) => resize("left", e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft")
                patchPrefs({
                  leftWidth: Math.max(
                    180,
                    Math.min(
                      330,
                      prefs.leftWidth + (e.key === "ArrowRight" ? 10 : -10),
                    ),
                  ),
                });
            }}
          />
        )}
        <div className="center">
          <header className="topbar">
            <div className="header-left">
              <IconButton
                label={
                  navigationOpen ? "Collapse navigation" : "Expand navigation"
                }
                onClick={() => {
                  if (focused) setFocusMode(false);
                  else patchPrefs({ leftOpen: !prefs.leftOpen });
                }}
              >
                {navigationOpen ? (
                  <PanelLeftClose size={19} />
                ) : (
                  <PanelLeftOpen size={19} />
                )}
              </IconButton>
              {!navigationOpen && (
                <img className="mini-crane" src="/crane.png" alt="Origami" />
              )}
              <span className="breadcrumb">
                {page === "reader" ? (
                  <>
                    <button onClick={() => setPage("library")}>Library</button>
                    <ChevronRight size={13} />
                    <span>{book?.meta.title}</span>
                  </>
                ) : page === "library" ? (
                  "Library"
                ) : page === "bookmarks" ? (
                  "Bookmarks"
                ) : page === "voices" ? (
                  "Voices"
                ) : (
                  "Settings"
                )}
              </span>
            </div>
            <div className="header-actions">
              {returnAnchor && (
                <div className="return-bookmark">
                  <button
                    title={"Temporary bookmark: " + returnAnchor.title}
                    disabled={jumping}
                    onClick={() => {
                      void returnToReading().catch(error);
                    }}
                  >
                    <Bookmark size={16} />
                    Return to reading
                  </button>
                  <IconButton
                    label="Dismiss temporary bookmark"
                    onClick={() => {
                      returnRef.current = null;
                      setReturnAnchor(null);
                    }}
                  >
                    <X size={14} />
                  </IconButton>
                </div>
              )}
              {page === "reader" && (
                <>
                  <IconButton
                    label="Bookmark current position"
                    onClick={() => {
                      void addAnnotation("bookmark", true).catch(error);
                    }}
                  >
                    <Bookmark size={18} />
                  </IconButton>
                  <IconButton
                    label={focused ? "Exit focus mode" : "Focus mode"}
                    active={focused}
                    onClick={() => setFocusMode(!focusMode)}
                  >
                    {focused ? (
                      <Minimize2 size={18} />
                    ) : (
                      <Maximize2 size={18} />
                    )}
                  </IconButton>
                </>
              )}
              <IconButton
                label="Appearance settings"
                onClick={() => chooseTab("appearance")}
              >
                <Palette size={18} />
              </IconButton>
              {inspectorAvailable && (
                <IconButton
                  label={
                    inspectorOpen ? "Collapse inspector" : "Expand inspector"
                  }
                  onClick={() => {
                    if (focused) {
                      setFocusMode(false);
                      patchPrefs({ rightOpen: true });
                    } else patchPrefs({ rightOpen: !prefs.rightOpen });
                  }}
                >
                  {prefs.rightOpen ? (
                    <PanelRightClose size={19} />
                  ) : (
                    <PanelRightOpen size={19} />
                  )}
                </IconButton>
              )}
            </div>
          </header>
          {!ready ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Opening library
            </div>
          ) : (
            <main
              className={
                "workspace " + (page === "reader" ? "reader-workspace" : "")
              }
            >
              {page === "library" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {visible.length}{" "}
                        {visible.length === 1 ? "document" : "documents"}
                      </span>
                      <h1 ref={focusTitle}>
                        {collection === "All books" ? "Library" : collection}
                      </h1>
                    </div>
                    <div className="heading-actions">
                      <button onClick={() => setQuick(true)}>
                        <Plus size={17} />
                        Quick Read
                      </button>
                      <button
                        className="primary"
                        onClick={() => fileInput.current?.click()}
                        disabled={busy}
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Upload size={17} />
                        )}
                        Import
                      </button>
                    </div>
                  </div>
                  <div className="library-controls">
                    <div className="search-field library-search">
                      <Search size={18} />
                      <input
                        aria-label="Search library"
                        placeholder="Search title, author or collection"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {query && (
                        <IconButton
                          label="Clear search"
                          onClick={() => setQuery("")}
                        >
                          <X size={14} />
                        </IconButton>
                      )}
                    </div>
                    <select
                      aria-label="Sort library"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Recently opened</option>
                      <option value="oldest-read">
                        Last read, oldest first
                      </option>
                      <option value="added">Date added</option>
                      <option value="oldest-added">Added, oldest first</option>
                      <option value="title">Title A to Z</option>
                      <option value="title-desc">Title Z to A</option>
                      <option value="author">Author A to Z</option>
                    </select>
                    <div className="segmented view-switch">
                      <IconButton
                        label="Grid view"
                        active={!list}
                        onClick={() => setList(false)}
                      >
                        <Grid2X2 size={17} />
                      </IconButton>
                      <IconButton
                        label="List view"
                        active={list}
                        onClick={() => setList(true)}
                      >
                        <List size={17} />
                      </IconButton>
                    </div>
                  </div>
                  <div className="filter-row">
                    <div className="chips">
                      {["All", "Books", "Documents"].map((f) => (
                        <button
                          className={filter === f ? "active" : ""}
                          key={f}
                          onClick={() => setFilter(f)}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        setSelected(
                          selected.size === visible.length
                            ? new Set()
                            : new Set(visible.map((b) => b.id)),
                        )
                      }
                    >
                      {selected.size ? "Clear selection" : "Select all"}
                    </button>
                  </div>
                  {selected.size > 0 && (
                    <div className="bulk-bar">
                      <span>{selected.size} selected</span>
                      <button
                        onClick={() => {
                          if (collection === "Trash")
                            void restore(
                              books.filter((b) => selected.has(b.id)),
                            ).catch(error);
                          else void moveToTrash(selected).catch(error);
                        }}
                      >
                        {collection === "Trash" ? (
                          <RotateCcw size={16} />
                        ) : (
                          <Trash2 size={16} />
                        )}{" "}
                        {collection === "Trash" ? "Restore" : "Move to Trash"}
                      </button>
                    </div>
                  )}
                  {latest &&
                    !query &&
                    !filtersActive &&
                    collection === "All books" &&
                    filter === "All" && (
                      <section className="continue-section">
                        <h2>Continue reading</h2>
                        <div className="continue-card">
                          <CoverControl
                            book={latest}
                            small
                            onOpen={() => {
                              void openBook(latest.id).catch(error);
                            }}
                            onEdit={() => {
                              void editCover(latest).catch(error);
                            }}
                          />
                          <button
                            className="continue-body"
                            onClick={() => {
                              void openBook(latest.id).catch(error);
                            }}
                          >
                            <span className="continue-info">
                              <strong>{latest.title}</strong>
                              <span>{latest.author}</span>
                              <span className="book-progress">
                                <progress
                                  value={latest.position}
                                  max={Math.max(1, latest.paragraphCount - 1)}
                                />
                                {Math.round(
                                  (latest.position /
                                    Math.max(1, latest.paragraphCount - 1)) *
                                    100,
                                )}
                                %
                              </span>
                            </span>
                            <span className="continue-open">
                              <BookOpen size={17} />
                              Open book
                            </span>
                          </button>
                        </div>
                      </section>
                    )}
                  <div className="section-row shelf-heading">
                    <h2>
                      {collection === "Trash"
                        ? "Deleted documents"
                        : "On your shelf"}
                    </h2>
                    <span className="hint">TXT · Markdown · EPUB</span>
                  </div>
                  <div className={"book-grid " + (list ? "list-view" : "")}>
                    {visible.map((b) => (
                      <article key={b.id} className="book-card">
                        <div className="book-card-controls">
                          <input
                            type="checkbox"
                            aria-label={"Select " + b.title}
                            checked={selected.has(b.id)}
                            onChange={() =>
                              setSelected((old) => {
                                const n = new Set(old);
                                n.has(b.id) ? n.delete(b.id) : n.add(b.id);
                                return n;
                              })
                            }
                          />
                          <IconButton
                            label={
                              (b.favorite ? "Unfavorite " : "Favorite ") +
                              b.title
                            }
                            active={b.favorite}
                            onClick={() => {
                              void updateMeta({
                                ...b,
                                favorite: !b.favorite,
                              }).catch(error);
                            }}
                          >
                            <Star
                              size={16}
                              fill={b.favorite ? "currentColor" : "none"}
                            />
                          </IconButton>
                        </div>
                        <div className="book-entry">
                          <CoverControl
                            book={b}
                            onOpen={() => {
                              if (b.deleted) void restore([b]).catch(error);
                              else void openBook(b.id).catch(error);
                            }}
                            onEdit={() => {
                              void editCover(b).catch(error);
                            }}
                          />
                          <button
                            className="book-open"
                            onClick={() => {
                              if (b.deleted) void restore([b]).catch(error);
                              else void openBook(b.id).catch(error);
                            }}
                          >
                            <div className="book-card-info">
                              <h3>{b.title}</h3>
                              <p>{b.author}</p>
                              <span className="format-badge">{b.format}</span>
                              <div className="book-progress">
                                <progress
                                  value={b.position}
                                  max={Math.max(1, b.paragraphCount - 1)}
                                />
                                <span>
                                  {Math.round(
                                    (b.position /
                                      Math.max(1, b.paragraphCount - 1)) *
                                      100,
                                  )}
                                  %
                                </span>
                              </div>
                              <small>
                                {b.wordCount.toLocaleString()} words
                              </small>
                            </div>
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!visible.length && (
                    <div className="empty">
                      <FolderOpen size={38} />
                      <h2>
                        {query
                          ? "No matching documents"
                          : collection === "Trash"
                            ? "Trash is empty"
                            : "No documents here"}
                      </h2>
                      <p>
                        {query
                          ? "Try another title or author."
                          : "Import a file or add text with Quick Read."}
                      </p>
                    </div>
                  )}
                </>
              )}
              {page === "reader" && book && (
                <>
                  <div
                    className="reading-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Book text"
                    onScroll={() => rememberReadingLocation()}
                    onMouseUp={captureSelection}
                    onKeyUp={captureSelection}
                  >
                    <article
                      ref={article}
                      className={
                        "reading-page surface-" +
                        prefs.surface +
                        (!prefs.texture ? " texture-off" : "")
                      }
                    >
                      <div className="reading-kicker">
                        {book.meta.author}
                        <span>{book.meta.format}</span>
                      </div>
                      {activeParagraphs.map((p, index) => (
                        <div
                          key={p.id}
                          className={
                            "passage " +
                            (player.current === readerPage * 30 + index &&
                            player.status !== "idle"
                              ? "speaking"
                              : "")
                          }
                          id={"passage-" + p.id}
                        >
                          <div className="margin-tools">
                            {annotations
                              .filter(
                                (a) =>
                                  a.bookId === book.meta.id &&
                                  a.paragraphId === p.id,
                              )
                              .slice(0, 3)
                              .map((a) => (
                                <button
                                  key={a.id}
                                  title={a.text || a.kind}
                                  aria-label={"Open " + a.kind}
                                  style={{
                                    color: annotationColors.find(
                                      (c) => c.id === a.color,
                                    )?.value,
                                  }}
                                  onClick={() => {
                                    chooseTab("notes");
                                    setEditing(a.id);
                                    setDraft(a.text);
                                    setNoteGroup(a.group);
                                    setColor(a.color);
                                  }}
                                >
                                  {a.kind === "bookmark" ? (
                                    <Bookmark size={17} />
                                  ) : (
                                    <MessageSquare size={17} />
                                  )}
                                </button>
                              ))}
                          </div>
                          {p.kind === "heading" ? (
                            <h2 data-paragraph={p.id}>{paragraphText(p)}</h2>
                          ) : (
                            <p data-paragraph={p.id}>{paragraphText(p)}</p>
                          )}
                        </div>
                      ))}
                      <div className="page-footer">
                        <IconButton
                          label="Previous reading page"
                          disabled={readerPage === 0}
                          onClick={() => setReaderPage((p) => p - 1)}
                        >
                          <ChevronLeft size={18} />
                        </IconButton>
                        <span>
                          Paragraphs {readerPage * 30 + 1} to{" "}
                          {Math.min(
                            (readerPage + 1) * 30,
                            book.paragraphs.length,
                          )}{" "}
                          of {book.paragraphs.length}
                        </span>
                        <IconButton
                          label="Next reading page"
                          disabled={
                            (readerPage + 1) * 30 >= book.paragraphs.length
                          }
                          onClick={() => setReaderPage((p) => p + 1)}
                        >
                          <ChevronRight size={18} />
                        </IconButton>
                      </div>
                    </article>
                  </div>
                  {selection && (
                    <div
                      className="selection-toolbar"
                      aria-label="Passage actions"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <button
                        onClick={() => {
                          void readSelection();
                        }}
                      >
                        <Play size={16} />
                        Read
                      </button>
                      <IconButton
                        label="Underline selection"
                        onClick={() => {
                          void addAnnotation("underline").catch(error);
                        }}
                      >
                        <Underline size={17} />
                      </IconButton>
                      <IconButton
                        label="Add note to selection"
                        onClick={() => chooseTab("notes")}
                      >
                        <MessageSquare size={17} />
                      </IconButton>
                      <IconButton
                        label="Bookmark selection"
                        onClick={() => {
                          void addAnnotation("bookmark").catch(error);
                        }}
                      >
                        <Bookmark size={17} />
                      </IconButton>
                      <button onClick={() => chooseTab("selection")}>
                        More
                        <ChevronRight size={14} />
                      </button>
                      <IconButton
                        label="Clear passage selection"
                        onClick={() => {
                          setSelection(null);
                          window.getSelection()?.removeAllRanges();
                        }}
                      >
                        <X size={16} />
                      </IconButton>
                    </div>
                  )}
                </>
              )}
              {page === "bookmarks" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {annotations.length} saved
                      </span>
                      <h1>Bookmarks & notes</h1>
                    </div>
                  </div>
                  <div className="wide-notes">{notesPanel()}</div>
                </>
              )}
              {page === "voices" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">Local speech</span>
                      <h1>Voices</h1>
                    </div>
                  </div>
                  <div className="wide-voices">
                    {
                      <VoiceCatalog
                        headingLevel={2}
                        voices={voices}
                        onPortrait={editPortrait}
                        onRefresh={() => {
                          void refreshVoices(true).catch(error);
                        }}
                        portraitActive={covers.portraitActive}
                        selected={prefs.voice}
                        favorites={prefs.voiceFavorites}
                        documentScope={false}
                        onSelect={(id) => selectVoice(id, false)}
                        language={prefs.voiceLanguage}
                        onLanguage={(voiceLanguage) =>
                          patchPrefs({ voiceLanguage })
                        }
                        onFavorite={(id) =>
                          patchPrefs({
                            voiceFavorites: prefs.voiceFavorites.includes(id)
                              ? prefs.voiceFavorites.filter((x) => x !== id)
                              : [...prefs.voiceFavorites, id],
                          })
                        }
                      />
                    }
                  </div>
                </>
              )}
              {page === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">Origami 0.1.0</span>
                      <h1>Settings</h1>
                    </div>
                  </div>
                  <div className="settings-grid">
                    {<AppearancePanel prefs={prefs} onChange={patchPrefs} />}
                    <div className="inspector-content">
                      <h3>Speech</h3>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={prefs.romanNumeralHeadings}
                          onChange={(e) => {
                            resumeVoice.current = false;
                            void player.stop();
                            patchPrefs({
                              romanNumeralHeadings: e.target.checked,
                            });
                          }}
                        />
                        Read Roman numerals as numbers in headings
                      </label>
                      <p className="hint">
                        For example, Chapter XVI is read as Chapter 16. Saved
                        spoken edits take priority, and body text keeps its
                        original wording.
                      </p>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={prefs.preloadAtStartup}
                          onChange={(e) =>
                            patchPrefs({ preloadAtStartup: e.target.checked })
                          }
                        />
                        Preload last used voice at startup
                      </label>
                      <p className="hint">
                        Loads the local model and voice into memory when Origami
                        opens. Changes apply the next time you open the app.
                        Closing Origami releases the model.
                      </p>
                      {startupSpeech && (
                        <p className="hint" role="status">
                          {startupSpeech}
                        </p>
                      )}
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={prefs.randomVoiceAtStartup}
                          onChange={(e) =>
                            patchPrefs({
                              randomVoiceAtStartup: e.target.checked,
                            })
                          }
                        />
                        Randomize voice at startup
                      </label>
                      <label>
                        Startup voice language
                        <select
                          aria-label="Startup voice language"
                          value={prefs.voiceLanguage}
                          onChange={(e) =>
                            patchPrefs({ voiceLanguage: e.target.value })
                          }
                        >
                          {[
                            ...new Set([
                              prefs.voiceLanguage,
                              ...voices.flatMap((v) => v.languages),
                            ]),
                          ]
                            .sort()
                            .map((language) => (
                              <option key={language}>{language}</option>
                            ))}
                        </select>
                      </label>
                      <p className="hint">
                        Uses an installed voice in your last selected language
                        when Origami opens. The selected voice is loaded at
                        startup only if preloading is enabled.
                      </p>
                      <h3>Cover art</h3>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={prefs.showCoverText}
                          onChange={(e) =>
                            patchPrefs({ showCoverText: e.target.checked })
                          }
                        />
                        Show title and author on covers
                      </label>
                      <p className="hint">
                        Turn off to hide all text added by Origami. Automatic
                        mode already leaves imported and chosen cover images
                        without an overlay. Document details can override
                        individual covers while this setting is on.
                      </p>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={prefs.autoGenerateVoicePortraits}
                          onChange={(e) => {
                            if (covers.portraitActive) void covers.cancel();
                            patchPrefs({
                              autoGenerateVoicePortraits: e.target.checked,
                            });
                          }}
                        />
                        Generate missing voice portraits automatically
                      </label>
                      <p className="hint">
                        Creates small character portraits when the voice catalog
                        is open and playback is stopped. Existing and chosen
                        images are kept. Portraits use standard content
                        guidance.
                      </p>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={prefs.allowMatureCovers}
                          onChange={(e) => {
                            void covers.cancel();
                            patchPrefs({ allowMatureCovers: e.target.checked });
                          }}
                        />
                        Allow mature cover artwork (NSFW)
                      </label>
                      <p className="hint">
                        Off by default. Standard mode requests clothed,
                        non-explicit artwork. Mature mode allows adult themes
                        with non-explicit imagery. Starter-library covers always
                        use standard mode.
                      </p>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={prefs.autoGenerateCovers}
                          onChange={(e) =>
                            patchPrefs({ autoGenerateCovers: e.target.checked })
                          }
                        />
                        Generate missing covers automatically
                      </label>
                      <p className="hint">
                        Creates artwork for new imports and pasted documents
                        without a cover. Imported artwork is kept. Generation
                        runs while playback is stopped and unloads afterward.
                      </p>
                      <p className="hint">
                        {covers.installed
                          ? covers.engine.name + " is installed."
                          : "Cover engine setup is required for local generation. See docs/COVER-GENERATION.md."}{" "}
                        {covers.engine.attribution}
                      </p>
                      <h3>Workspace</h3>
                      <p>
                        Library data, notes and preferences are stored{" "}
                        {store.desktop
                          ? "in Origami’s own local SQLite database."
                          : "in this browser’s IndexedDB storage."}
                      </p>
                      <h4>Development build</h4>
                      <p>
                        TXT, Markdown and EPUB import, reading, notes, themes
                        and local passage playback are available. PDF/DOCX
                        import, persistent audio jobs, audiobook export and
                        integrations follow the approved plan.
                      </p>
                      <p>
                        Maeve’s files, hooks and settings are independent of
                        this workspace.
                      </p>
                      <h4>Open source</h4>
                      <p>
                        MPL 2.0 app code. Model weights and voice recordings
                        retain their own terms and are not bundled with the
                        source.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </main>
          )}
        </div>
        {inspectorOpen && (
          <div
            role="separator"
            aria-label="Resize inspector"
            aria-orientation="vertical"
            aria-valuenow={prefs.rightWidth}
            tabIndex={0}
            className="resize-handle right-resize"
            onPointerDown={(e) => resize("right", e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft")
                patchPrefs({
                  rightWidth: Math.max(
                    280,
                    Math.min(
                      430,
                      prefs.rightWidth + (e.key === "ArrowLeft" ? 10 : -10),
                    ),
                  ),
                });
            }}
          />
        )}
        {inspectorAvailable && (
          <aside
            className={"inspector " + (!inspectorOpen ? "collapsed" : "")}
            aria-hidden={!inspectorOpen}
            inert={!inspectorOpen}
          >
            <div className="inspector-header">
              <span>Inspector</span>
              <IconButton
                label="Pin inspector tab"
                active={pinned}
                onClick={() => setPinned(!pinned)}
              >
                <Pin size={14} />
              </IconButton>
              <IconButton
                label="Close inspector"
                onClick={() => patchPrefs({ rightOpen: false })}
              >
                <X size={17} />
              </IconButton>
            </div>
            <div
              className="inspector-tabs"
              role="tablist"
              aria-label="Inspector tabs"
            >
              {inspectorTabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  id={"inspector-tab-" + t.id}
                  aria-controls="inspector-panel"
                  tabIndex={activeTab === t.id ? 0 : -1}
                  onKeyDown={(e) => {
                    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
                    if (!keys.includes(e.key)) return;
                    e.preventDefault();
                    const i = inspectorTabs.findIndex((x) => x.id === t.id);
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? inspectorTabs.length - 1
                          : (i +
                              (e.key === "ArrowRight" ? 1 : -1) +
                              inspectorTabs.length) %
                            inspectorTabs.length;
                    chooseTab(inspectorTabs[next].id);
                    setTimeout(
                      () =>
                        document
                          .getElementById(
                            "inspector-tab-" + inspectorTabs[next].id,
                          )
                          ?.focus(),
                      0,
                    );
                  }}
                  aria-selected={activeTab === t.id}
                  className={activeTab === t.id ? "active" : ""}
                  title={t.label}
                  onClick={() => patchPrefs({ inspector: t.id })}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="inspector-panel"
              aria-labelledby={"inspector-tab-" + activeTab}
              className="inspector-scroll"
            >
              {activeTab === "appearance" ? (
                <AppearancePanel prefs={prefs} onChange={patchPrefs} />
              ) : activeTab === "voice" ? (
                <VoiceCatalog
                  voices={voices}
                  onPortrait={editPortrait}
                  onRefresh={() => {
                    void refreshVoices(true).catch(error);
                  }}
                  portraitActive={covers.portraitActive}
                  selected={
                    page === "reader" && book
                      ? book.meta.voice || prefs.voice
                      : prefs.voice
                  }
                  favorites={prefs.voiceFavorites}
                  documentScope={page === "reader" && Boolean(book)}
                  onSelect={(id) =>
                    selectVoice(id, page === "reader" && Boolean(book))
                  }
                  language={prefs.voiceLanguage}
                  onLanguage={(voiceLanguage) => patchPrefs({ voiceLanguage })}
                  onFavorite={(id) =>
                    patchPrefs({
                      voiceFavorites: prefs.voiceFavorites.includes(id)
                        ? prefs.voiceFavorites.filter((x) => x !== id)
                        : [...prefs.voiceFavorites, id],
                    })
                  }
                />
              ) : activeTab === "selection" ? (
                selectionPanel()
              ) : activeTab === "document" ? (
                documentPanel()
              ) : (
                notesPanel()
              )}
            </div>
          </aside>
        )}
        <footer className="player">
          <div className="now-playing">
            {book ? (
              <>
                <Cover book={book.meta} small />
                <div>
                  <strong>{book.meta.title}</strong>
                  <button
                    className="voice-link"
                    onClick={() => chooseTab("voice")}
                  >
                    {voices.find(
                      (v) => v.id === (book.meta.voice || prefs.voice),
                    )?.name ||
                      (store.desktop ? "Choose a voice" : "Desktop playback")}
                    <ChevronRight size={12} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <img className="dock-crane" src="/crane.png" alt="" />
                <div>
                  <strong>No document open</strong>
                  <span>Open a book or use Quick Read</span>
                </div>
              </>
            )}
          </div>
          <div className="transport">
            <IconButton
              label="Previous paragraph"
              disabled={!book}
              onClick={() => {
                if (book) {
                  const n = Math.max(0, book.meta.position - 1);
                  positionChanged(n);
                  if (player.status !== "idle") void startFrom(n);
                }
              }}
            >
              <SkipBack size={20} />
            </IconButton>
            <button
              className="play-button"
              aria-label={
                player.status === "playing"
                  ? "Pause playback"
                  : player.status === "paused"
                    ? "Resume playback"
                    : "Read aloud"
              }
              disabled={!book || player.status === "generating"}
              onClick={() => {
                if (player.status === "playing" || player.status === "paused")
                  player.toggle();
                else void startBook();
              }}
            >
              {player.status === "generating" ? (
                <LoaderCircle className="spin" size={22} />
              ) : player.status === "playing" ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" />
              )}
            </button>
            <IconButton
              label="Next paragraph"
              disabled={!book}
              onClick={() => {
                if (book) {
                  const n = Math.min(
                    book.paragraphs.length - 1,
                    book.meta.position + 1,
                  );
                  positionChanged(n);
                  if (player.status !== "idle") void startFrom(n);
                }
              }}
            >
              <SkipForward size={20} />
            </IconButton>
            <IconButton
              label="Stop playback"
              disabled={player.status === "idle"}
              onClick={() => {
                void player.stop();
              }}
            >
              <Square size={15} />
            </IconButton>
          </div>
          <div className="seek-control">
            <div>
              <span>
                {player.status === "generating"
                  ? "Generating passage"
                  : player.status === "idle"
                    ? "Passage playback"
                    : player.status === "paused"
                      ? "Paused"
                      : "Reading aloud"}
              </span>
              <span>
                {fmt(player.time)} / {fmt(player.duration)}
              </span>
            </div>
            <input
              type="range"
              aria-label="Seek in current passage"
              min="0"
              max={player.duration || 1}
              step=".1"
              disabled={!player.duration}
              value={player.time}
              onChange={(e) => player.seek(+e.target.value)}
            />
          </div>
          <div className="playback-options">
            <select
              aria-label="Playback speed"
              value={prefs.speed}
              onChange={(e) => patchPrefs({ speed: +e.target.value })}
            >
              {[0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                <option value={s} key={s}>
                  {s.toFixed(2).replace(/0$/, "")}×
                </option>
              ))}
            </select>
            <Volume2 size={18} />
            <input
              type="range"
              aria-label="Volume"
              min="0"
              max="1"
              step=".05"
              value={prefs.volume}
              onChange={(e) => patchPrefs({ volume: +e.target.value })}
            />
          </div>
        </footer>
        {notice && (
          <div className="toast" role="status">
            <span>{notice}</span>
            {undo && (
              <button
                onClick={() => {
                  void restore(undo).catch(error);
                }}
              >
                Undo
              </button>
            )}
            <IconButton label="Dismiss notice" onClick={() => setNotice("")}>
              <X size={15} />
            </IconButton>
          </div>
        )}
        {coverEditor && (
          <CoverDialog
            book={coverEditor.meta}
            prompt={coverPrompt(coverEditor)}
            allowMature={prefs.allowMatureCovers}
            starter={starterCover(coverEditor.meta)}
            onMature={(allowMatureCovers) => patchPrefs({ allowMatureCovers })}
            installed={covers.installed}
            active={covers.active === coverEditor.meta.id}
            busy={covers.busy}
            onText={(coverText) => {
              void updateMeta({ ...coverEditor.meta, coverText })
                .then(() =>
                  setCoverEditor((old) =>
                    old ? { ...old, meta: { ...old.meta, coverText } } : old,
                  ),
                )
                .catch(error);
            }}
            idle={player.status === "idle"}
            onClose={closeCoverEditor}
            onImage={chooseCoverImage}
            onGenerate={(prompt) =>
              covers.generate(coverEditor.meta.id, prompt)
            }
            onCancel={covers.cancel}
          />
        )}
        {portraitEditor && (
          <VoicePortraitDialog
            key={portraitEditor.id}
            voice={portraitEditor}
            installed={covers.installed}
            active={covers.portraitActive === portraitEditor.id}
            busy={covers.busy}
            idle={player.status === "idle"}
            onClose={closePortraitEditor}
            onImage={choosePortraitImage}
            onGenerate={(prompt) =>
              covers.generatePortrait(portraitEditor.id, prompt)
            }
            onCancel={covers.cancel}
          />
        )}
        {quick && (
          <div
            className="modal-scrim"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setQuick(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-title"
              className="quick-dialog"
              onKeyDown={(e) => {
                if (e.key !== "Tab") return;
                const els = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input,textarea",
                  ),
                );
                const first = els[0],
                  last = els[els.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }}
            >
              <div className="section-row">
                <h2 id="quick-title">Quick Read</h2>
                <IconButton
                  label="Close Quick Read"
                  onClick={() => setQuick(false)}
                >
                  <X size={20} />
                </IconButton>
              </div>
              <label>
                Title
                <input
                  autoFocus
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                />
              </label>
              <label>
                Text
                <textarea
                  aria-label="Text to read"
                  placeholder="Paste or write text"
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                />
              </label>
              <div className="dialog-actions">
                <span className="hint">
                  {quickText.length.toLocaleString()} characters
                </span>
                <button
                  className="primary"
                  disabled={!quickText.trim()}
                  onClick={() => {
                    void addQuick().catch(error);
                  }}
                >
                  <Library size={17} />
                  Add and open
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </CoverTextContext>
  );
}
