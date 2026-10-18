import { VoiceStudio } from "./components/VoiceStudio";
import { VoiceLibrary, previewLine } from "./components/VoiceLibrary";
import { LibraryRoom } from "./components/LibraryRoom";
import { LibraryThemePicker } from "./components/LibraryThemePicker";
import { libraryTheme } from "./libraryThemes";
import { ModelManager } from "./components/ModelManager";
import { detectLanguage, loadLanguage, t } from "./i18n";
import {
  IconButton,
  Cover,
  CoverControl,
  CoverTextContext,
  type CoverJob,
} from "./components/Primitives";
import {
  bookFinished,
  matchesLibraryFilters,
  sortLibrary,
} from "./libraryFilters";
import { CoverDialog } from "./components/CoverDialog";
import { coverImage, coverPrompt, starterCover } from "./covers";
import { useCovers } from "./useCovers";
import { starterNotices } from "./starterLibrary";
import { bookGenres, genreColor, normalizeGenres } from "./bookGenres";
import { validateTrashDays } from "./trashRetention";
import { bookVoice, startupVoice } from "./voiceCatalog";
import { hardwareDefaults, recommendedSettings } from "./hardware";
import { autoUiScale } from "./screenFit";
import { comfortOf, readingComfort, splitComfort } from "./comfort";
import { initials, useAuthorNote } from "./authors";
import {
  bookLanguages,
  detectBookLanguage,
  languageName,
} from "./bookLanguage";
import { LanguageFlag } from "./components/LanguageFlag";
import { VoiceDownloads } from "./components/VoiceDownloads";
import { ReaderMenu, type ReaderMenuAction } from "./components/ReaderMenu";
import { BookView, type BookNav } from "./components/BookView";
import { BOOK_MIN_WIDTH } from "./bookLayout";
import { BUILD_DATE, PRIVATE_BETA, STUDIO_ENABLED, VERSION } from "./release";
import type { AuthorNote } from "./authors";
import { fillBookDetails, isUnknownAuthor, loadPack } from "./authorPack";
import fontLicense from "../public/fonts/opendyslexic/OFL.txt?raw";
import appLicense from "../APP-LICENSE.md?raw";
import sourceLicense from "../LICENSE?raw";
import { Section, SectionLevel, SectionState } from "./components/Section";
import { BookMenu, type BookMenuActions } from "./components/BookMenu";
import { Popover } from "./components/Popover";
import { TextMenu } from "./components/TextMenu";
import { FocusOverlay } from "./components/FocusOverlay";
import {
  checkedCollectionName,
  collectionNames,
  builtInCollections,
} from "./collections";
import {
  AppearancePanel,
  readerFontStack,
  readerFonts,
} from "./components/AppearancePanel";
import { BackgroundScene } from "./components/BackgroundScene";
import {
  changeAppearance,
  counterpart,
  detectPaintedArt,
  sceneTime,
  startupBackground,
  toggleTimeOfDay,
} from "./backgrounds";
import {
  contentsEntries,
  currentEntry,
  formatDuration,
  listeningMinutes,
  searchSnippet,
  spokenSentenceRange,
  wordsLeftInChapter,
} from "./contents";
import { ShortcutList, shortcutTarget } from "./components/Shortcuts";
import { SettingsMatches } from "./components/SettingsMatches";
import { LanguagePicker } from "./components/LanguagePicker";
import { PlaybackSeek, PlaybackTimeLabel } from "./components/PlaybackTime";
import { ReadingPage, type ReadingPageActions } from "./components/ReadingPage";
import { useSeasonalBackground } from "./useSeasonalBackground";
import { VoiceCatalog } from "./components/VoiceCatalog";
import { VoicePortraitDialog } from "./components/VoicePortrait";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  Clapperboard,
  Download,
  Underline,
  MessageSquare,
  StickyNote,
  Palette,
  SlidersHorizontal,
  RotateCcw,
  Copy,
  Library,
  Grid2X2,
  List,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  Timer,
  Keyboard,
  Languages,
  Heart,
  GalleryVerticalEnd,
  PenLine as WorkIcon,
  ShieldCheck,
  Gauge,
  Cpu,
  Image as ImageIcon,
  Info,
  Settings as SettingsIcon,
  Filter,
  PenLine,
  Sliders,
  Feather,
  Lock,
  LockOpen,
  BrainCircuit,
  LibraryBig,
  Vault as VaultIcon,
} from "lucide-react";
import { PinDialog, type PinRequest } from "./components/PinDialog";
import { UpdatesPanel } from "./components/UpdatesPanel";
import { UpdateToast } from "./components/UpdateToast";
import { PluginSettings } from "./work/plugins/PluginSettings";
import { HandwritingSettings } from "./work/ink/HandwritingSettings";
import { VoiceSettings } from "./work/voice/VoiceSettings";
import { checkUpdates, checkedToday, markChecked, updateStatus, type UpdateFound } from "./updates";
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
  PronunciationRule,
} from "./types";
import { defaultPreferences } from "./types";
import { themes, annotationColors } from "./themes";
import {
  cleanSpokenText,
  createBook,
  importDocument,
  paragraphsFromText,
  selectionFromRange,
  sentences,
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
import {
  pageAtOffset,
  pageForParagraph,
  readingPages,
  readingWindow,
  spacerHeights,
  VIRTUAL_MIN_PAGES,
} from "./readingPages";
import { droppedFiles } from "./dropFiles";
import { WorkMode, type Handoff } from "./work/WorkMode";
import { ModeSwitch, nextMode, type AppMode } from "./work/ModeSwitch";
import { StudioMode } from "./studio/StudioMode";
import { listProductions, readProduction, type ProductionInfo } from "./studio/production";
import { HoverTips } from "./work/HoverTips";
import "./work/tips.css";
import { CardComposer } from "./work/CardComposer";
import { ConnectionsSettings } from "./work/ConnectionsSettings";
import { makeCard } from "./work/cards";
import { followBooks, loadWork, saveWork } from "./work/store";
import type { Subject as WorkSubject } from "./work/types";
import { paintWord, playedFraction, rangesFor, wordAt } from "./spokenWord";
import { useMedia } from "./useMedia";
import { shelfOf, type Shelf } from "./libraryShelf";
type ReadingAnchor = {
  bookId: string;
  paragraphId: string;
  position: number;
  offset: number;
  title: string;
};
export default function App() {
  const [ready, setReady] = useState(false);
  // A startup failure stays on the loading screen (notices clear themselves).
  const [startupError, setStartupError] = useState("");
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(defaultPreferences);
  useSeasonalBackground(ready, prefs, setPrefs);
  // Settings as the open book is read, including its own comfort profile.
  const reading = useMemo(
    () => readingComfort(prefs, book?.meta),
    [prefs, book?.meta.comfort],
  );
  const [page, setPage] = useState<Page>("library");
  // Work Mode: what to open when switching from a book, a counter that makes
  // it reload after a card is saved here, and the card being made here.
  const [workHandoff, setWorkHandoff] = useState<Handoff | null>(null);
  const [workVersion, setWorkVersion] = useState(0);
  const [readerCard, setReaderCard] = useState<TextSelection | null>(null);
  const [workSubjects, setWorkSubjects] = useState<WorkSubject[]>([]);
  // Tooltips with shortcuts for the whole app (src/work/HoverTips.tsx).
  const appRoot = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const sort = prefs.librarySort;
  const list = prefs.libraryView === "list";
  const setList = (on: boolean) =>
    setPrefs((old) => ({ ...old, libraryView: on ? "list" : "grid" }));
  const [collection, setCollection] = useState("All books");
  const [addingCollection, setAddingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  // Vaults (encrypted shelves) and the PIN prompt shared by vaults and the
  // parental PIN.
  const [vaults, setVaults] = useState<store.Vault[]>([]);
  const [parentalSet, setParentalSet] = useState(false);
  const [pinRequest, setPinRequest] = useState<PinRequest | null>(null);
  const [collectionError, setCollectionError] = useState("");
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionUndo, setCollectionUndo] = useState<{
    name: string;
    ids: string[];
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteCandidates, setDeleteCandidates] = useState<BookMeta[]>([]);
  const [deletingBooks, setDeletingBooks] = useState(false);
  const [trashModeDraft, setTrashModeDraft] = useState("forever");
  const [trashDaysDraft, setTrashDaysDraft] = useState("30");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState("amber");
  const colorRef = useRef(color);
  colorRef.current = color;
  // The reader's right-click menu: where it opened, whether text was
  // selected, and the paragraph under the pointer.
  const [readerMenu, setReaderMenu] = useState<{
    x: number;
    y: number;
    selected: boolean;
    paragraphId: string;
  } | null>(null);
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
  const [voices, setVoices] = useState<Voice[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickTitle, setQuickTitle] = useState("Untitled text");
  const [undo, setUndo] = useState<BookMeta[] | null>(null);
  const [readerPage, setReaderPage] = useState(0);
  const coverPageHeight = useRef(0);
  const [bookQuery, setBookQuery] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [coverEditor, setCoverEditor] = useState<Book | null>(null);
  const [portraitEditor, setPortraitEditor] = useState<Voice | null>(null);
  const portraitFocus = useRef<HTMLElement | null>(null);
  const coverFocus = useRef<HTMLElement | null>(null);
  const resumeVoice = useRef(false);
  const voiceBarrier = useRef<Promise<unknown>>(Promise.resolve());
  const fileInput = useRef<HTMLInputElement>(null);
  const article = useRef<HTMLElement>(null);
  const readingScroll = useRef<HTMLDivElement>(null);
  const readerScrollFrame = useRef(0);
  // Book mode needs room for two pages side by side.
  const bookNav = useRef<BookNav | null>(null);
  const [readerWidth, setReaderWidth] = useState(0);
  const readerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookPages = useMemo(
    () => readingPages(book?.paragraphs || []),
    [book?.paragraphs],
  );
  const contents = useMemo(
    () => contentsEntries(book?.paragraphs || []),
    [book?.paragraphs],
  );
  const annotationsByParagraph = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const a of annotations) {
      if (a.bookId !== book?.meta.id) continue;
      const list = map.get(a.paragraphId);
      if (list) list.push(a);
      else map.set(a.paragraphId, [a]);
    }
    return map;
  }, [annotations, book?.meta.id]);
  const bookmarksByBook = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const a of annotations) {
      if (a.kind !== "bookmark") continue;
      const list = map.get(a.bookId);
      if (list) list.push(a);
      else map.set(a.bookId, [a]);
    }
    for (const list of map.values()) list.sort((x, y) => x.created - y.created);
    return map;
  }, [annotations]);
  // Book mode shows two pages; narrower windows read in the usual layout.
  const bookActive =
    page === "reader" &&
    prefs.readingMode === "book" &&
    readerWidth >= BOOK_MIN_WIDTH;
  useLayoutEffect(() => {
    const el = readingScroll.current;
    if (!el) return;
    const update = () => setReaderWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [page, book?.meta.id]);
  // Book mode pages: the chosen paper and tone, set as a printed book
  // unless the reader prefers their own alignment.
  const bookPageClass =
    "surface-" +
    prefs.surface +
    (!prefs.texture ? " texture-off" : "") +
    (prefs.bookTypeset
      ? " typeset"
      : (reading.justify ? " justify" : "") +
        (reading.hyphenate ? " hyphenate" : "")) +
    (reading.textTone && reading.textTone !== "default"
      ? " tone-" + reading.textTone
      : "");
  const readingPageClass =
    "reading-page surface-" +
    prefs.surface +
    (!prefs.texture ? " texture-off" : "") +
    (reading.justify ? " justify" : "") +
    (reading.hyphenate ? " hyphenate" : "") +
    (reading.textTone && reading.textTone !== "default"
      ? " tone-" + reading.textTone
      : "");
  // Stable callbacks for memoized pages; they always call the latest handlers.
  const pageHandlers = useRef<ReadingPageActions>({
    openAnnotation: () => {},
    retry: () => {},
    sticky: () => {},
    freshSticky: () => null,
  });
  const freshSticky = useRef<string | null>(null);
  const readingPageActions = useMemo<ReadingPageActions>(
    () => ({
      openAnnotation: (a) => pageHandlers.current.openAnnotation(a),
      retry: (n) => pageHandlers.current.retry(n),
      sticky: (a, patch) => pageHandlers.current.sticky(a, patch),
      freshSticky: () => freshSticky.current,
    }),
    [],
  );
  // Long books keep only nearby pages in the document. Rendered pages are
  // measured; unrendered ones are estimated from their text length.
  const virtualPages =
    prefs.readingMode !== "paged" && bookPages.length > VIRTUAL_MIN_PAGES;
  const pageChars = useMemo(
    () =>
      bookPages.map((range) =>
        (book?.paragraphs || [])
          .slice(range.start, range.end)
          .reduce((n, p) => n + p.text.length + 60, 0),
      ),
    [bookPages],
  );
  const measuredPages = useRef(new Map<number, number>());
  const [, setPageMeasureVersion] = useState(0);
  useEffect(() => {
    measuredPages.current.clear();
    setPageMeasureVersion((v) => v + 1);
  }, [
    book?.meta.id,
    reading.fontSize,
    reading.lineHeight,
    prefs.pageWidth,
    reading.readerFont,
    reading.letterSpacing,
    reading.wordSpacing,
  ]);
  // Pixels per character learned from measured pages, or a typographic guess.
  const pageHeight = (() => {
    let height = 0,
      chars = 0;
    for (const [i, h] of measuredPages.current) {
      height += h;
      chars += pageChars[i] || 0;
    }
    const width = Math.min(prefs.pageWidth || 1400, 1400) - 130;
    const perChar =
      chars > 2000
        ? height / chars
        : (reading.fontSize * reading.lineHeight) /
          (width / (reading.fontSize * 0.5));
    return (page: number) =>
      measuredPages.current.get(page) ??
      Math.max(760, Math.round((pageChars[page] || 0) * perChar + 140));
  })();
  useLayoutEffect(() => {
    if (!virtualPages) return;
    let changed = false;
    for (const el of article.current?.querySelectorAll<HTMLElement>(
      "[data-reading-page]",
    ) || []) {
      const index = Number(el.dataset.readingPage);
      const height = el.offsetHeight;
      if (
        height &&
        Math.abs((measuredPages.current.get(index) || 0) - height) > 1
      ) {
        measuredPages.current.set(index, height);
        changed = true;
      }
    }
    if (changed) setPageMeasureVersion((v) => v + 1);
  });
  // Cumulative word counts, for listening time left.
  const wordsBefore = useMemo(() => {
    const counts = [0];
    for (const p of book?.paragraphs || [])
      counts.push(counts.at(-1)! + p.text.split(/\s+/).filter(Boolean).length);
    return counts;
  }, [book?.paragraphs]);
  const currentSection = book
    ? currentEntry(contents, book.meta.position)
    : undefined;
  const chapterPosition = (() => {
    if (!book || !currentSection) return null;
    const chapters = contents.filter(
      (e, i) => !(i === 0 && e.label === book.meta.title),
    );
    const at = chapters.findIndex((e) => e.index === currentSection.index);
    return at < 0 || chapters.length < 2
      ? null
      : { current: at + 1, total: chapters.length };
  })();
  // Keep the current chapter visible in the contents list.
  useEffect(() => {
    if (page !== "reader") return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector(".toc-row.active")
        ?.scrollIntoView({ block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [page, currentSection?.index]);
  const [artVersion, setArtVersion] = useState(0);
  // Re-renders memoized views after the interface language changes.
  const [uiLanguage, setUiLanguage] = useState("en");
  const [sleep, setSleep] = useState<
    | { mode: "minutes"; endsAt: number; minutes: number }
    | { mode: "chapter"; chapter: number }
    | null
  >(null);
  const sleepRef = useRef(sleep);
  sleepRef.current = sleep;
  const [sleepNow, setSleepNow] = useState(Date.now());
  const [sleepMenu, setSleepMenu] = useState(false);
  const sleepMinutesLeft =
    sleep?.mode === "minutes"
      ? Math.max(1, Math.ceil((sleep.endsAt - sleepNow) / 60000))
      : 0;
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [voiceSection, setVoiceSection] = useState<"library" | "create">("library");
  const [studioBusy, setStudioBusy] = useState(false);
  const studioBusyRef = useRef(false);
  function voiceStudioBusy(value: boolean) { studioBusyRef.current = value; setStudioBusy(value); }
  const [settingsQuery, setSettingsQuery] = useState("");
  const [links, setLinks] = useState({ support: "", source: "" });
  // Latest handlers for window-level listeners registered once.
  const actions = useRef({
    keydown: (_e: KeyboardEvent) => {},
    togglePlayback: () => {},
    skipSentence: async (_direction: number) => {},
  });
  const [lexiconDraft, setLexiconDraft] = useState({
    from: "",
    to: "",
    scope: "book",
  });
  const focusTitle = useRef<HTMLHeadingElement>(null);
  // Notices are translated here, so messages from modules, the speech worker
  // and thrown errors use the interface language when a translation exists.
  const notify = (s: string) => setNotice(t(s));
  const player = usePlayer(notify, (voice) =>
    setPrefs((old) => ({ ...old, lastVoice: voice })),
  );
  const playbackStatusRef = useRef(player.status);
  playbackStatusRef.current = player.status;
  const speakingParagraph =
    player.status !== "idle" && prefs.highlight !== "off" ? player.current : -1;
  // The sentence being read aloud, mapped back to the book text.
  const speakingUnit = player.status === "idle" ? null : player.currentUnit;
  // Where the spoken unit sits in the book text, whatever is highlighted.
  const spokenRange = useMemo(() => {
    if (!book || !speakingUnit) return null;
    const p = book.paragraphs[speakingUnit.paragraph];
    // A Studio line knows where it sits in the paragraph.
    if (p && speakingUnit.range) return { paragraph: speakingUnit.paragraph, ...speakingUnit.range };
    if (!p || speakingUnit.first < 0) return null;
    const count = sentences(
      cleanSpokenText(
        spokenText(p, prefs, undefined, book.meta.id),
        prefs.skipSpeechMarkup !== false,
      ),
    ).length;
    const range = spokenSentenceRange(
      p.text,
      count,
      speakingUnit.first,
      speakingUnit.last,
    );
    return range ? { paragraph: speakingUnit.paragraph, ...range } : null;
  }, [
    speakingUnit,
    book?.paragraphs,
    prefs.highlight,
    prefs.romanNumeralHeadings,
    prefs.skipSpeechMarkup,
    prefs.skipCitations,
    prefs.skipAuthorYear,
    prefs.pronunciations,
  ]);
  const sentenceMark = prefs.highlight === "sentence" ? spokenRange : null;
  // A Studio production of the open book, which can read it aloud with its cast.
  const [bookProduction, setBookProduction] = useState<ProductionInfo | null>(null);
  const openBookId = book?.meta.id;
  useEffect(() => {
    setBookProduction(null);
    if (!openBookId || !store.desktop) return;
    let live = true;
    void listProductions()
      .then((list) => {
        const found = list
          .filter((x) => x.bookId === openBookId && (x as ProductionInfo & { rendered?: number }).rendered)
          .sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
        if (live) setBookProduction(found || null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [openBookId]);
  const studioNarration = Boolean(book && bookProduction && book.meta.narration === bookProduction.id);
  useEffect(() => {
    if (book && bookProduction && studioNarration) player.setNarration(book.meta.id, () => readProduction(bookProduction.id));
    else player.setNarration(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.meta.id, bookProduction?.id, studioNarration]);
  // The word being read: estimated as the clip plays, painted when asked for,
  // and passed to the book so a sentence running onto the next page turns it.
  useEffect(() => {
    const paragraph = spokenRange && book?.paragraphs[spokenRange.paragraph];
    if (!spokenRange || !paragraph || !player.duration) {
      paintWord(null);
      return;
    }
    let last = "";
    const tick = () => {
      const word = wordAt(paragraph.text, spokenRange.start, spokenRange.end, playedFraction(player.getTime(), player.duration));
      const key = word ? word.start + ":" + word.end : "";
      if (!word || key === last) return;
      last = key;
      const ranges = rangesFor(paragraph.id, word);
      paintWord(prefs.wordHighlight ? ranges : null);
      bookNav.current?.word(ranges);
    };
    tick();
    const off = player.subscribeTime(tick);
    return () => {
      off();
      paintWord(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenRange, player.duration, prefs.wordHighlight, book?.paragraphs]);
  const covers = useCovers(
    prefs.autoGenerateCovers,
    player.status === "idle" && !studioBusy,
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
      // Voices whose portrait was deleted are left without one.
      voices: voices.filter(
        (v) => v.portrait || !prefs.portraitsRemoved.includes(v.id),
      ),
      changed: (voice) => {
        setVoices((old) => old.map((v) => (v.id === voice.id ? voice : v)));
        setPortraitEditor((old) => (old?.id === voice.id ? voice : old));
      },
    },
    { model: prefs.imageModel, keepSpeech: prefs.keepSpeechDuringArt },
  );
  const [startupSpeech, setStartupSpeech] = useState("");
  const prefRef = useRef(prefs);
  prefRef.current = prefs;
  const bookRef = useRef(book);
  bookRef.current = book;
  // The interface size that suits this window, updated after resizing.
  const [autoScale, setAutoScale] = useState(() =>
    autoUiScale(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    let timer = 0;
    const resized = () => {
      clearTimeout(timer);
      timer = window.setTimeout(
        () => setAutoScale(autoUiScale(window.innerWidth, window.innerHeight)),
        150,
      );
    };
    window.addEventListener("resize", resized);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resized);
    };
  }, []);
  const uiScale = prefs.uiScaleAuto ? autoScale : prefs.uiScale;
  const theme = themes.find((x) => x.id === prefs.theme) || themes[0];
  // Only the reader has the inspector; Library, Bookmarks, Voices and
  // Settings are full-width pages.
  const inspectorAvailable = page === "reader";
  const focused = page === "reader" && focusMode;
  // Narrow windows: the inspector (950 px and less) and then the navigation
  // (760 px and less) slide over the page instead of taking a column. The
  // narrow navigation opens and closes on its own, so resizing the window
  // never changes the saved setting.
  const overlayInspector = useMedia("(max-width: 950px)");
  const overlayNavigation = useMedia("(max-width: 760px)");
  const [compactLeft, setCompactLeft] = useState(false);
  useEffect(() => setCompactLeft(false), [overlayNavigation]);
  const navigationOpen = (overlayNavigation ? compactLeft : prefs.leftOpen) && !focused;
  const setLeftOpen = (open: boolean) => {
    if (overlayNavigation) setCompactLeft(open);
    else patchPrefs({ leftOpen: open });
  };
  const inspectorOpen = inspectorAvailable && prefs.rightOpen && !focused;
  const variables = {
    "--bg": theme.bg,
    "--panel": theme.panel,
    "--ink": theme.ink,
    "--muted": theme.muted,
    "--accent": theme.accent,
    "--accent-ink": theme.contrast,
    "--line": theme.line,
    "--ui-zoom": uiScale / 100,
    "--left-width": navigationOpen
      ? (prefs.leftWidth * uiScale) / 100 + "px"
      : "0px",
    "--right-width": inspectorOpen
      ? (prefs.rightWidth * uiScale) / 100 + "px"
      : "0px",
    "--reader-font": readerFontStack(reading.readerFont),
    "--reader-letter": reading.letterSpacing + "em",
    "--reader-word": reading.wordSpacing + "em",
    "--reader-size": reading.fontSize + "px",
    "--reader-leading": reading.lineHeight,
    "--reader-width": prefs.pageWidth === 0 ? "100%" : prefs.pageWidth + "px",
    "--page-gap": prefs.pageGap + "px",
    "--page-brightness": prefs.pageBrightness / 100,
  } as CSSProperties;
  const error = (e: unknown) =>
    notify(e instanceof Error ? e.message : String(e));
  const patchPrefs = (p: Partial<Preferences>) =>
    setPrefs((old) => changeAppearance(old, p));
  // Comfort settings go to the open book when it has its own profile.
  function patchReading(change: Partial<Preferences>) {
    const { comfort, rest } = splitComfort(change);
    const current = bookRef.current;
    if (current?.meta.comfort && page === "reader") {
      if (Object.keys(comfort).length)
        void updateMeta({
          ...current.meta,
          comfort: { ...current.meta.comfort, ...comfort },
        }).catch(error);
      if (Object.keys(rest).length) patchPrefs(rest);
    } else patchPrefs(change);
  }
  function setBookComfort(on: boolean) {
    const current = bookRef.current;
    if (!current) return;
    void updateMeta({
      ...current.meta,
      comfort: on ? comfortOf(reading) : undefined,
    }).catch(error);
  }
  const sectionState = useMemo(
    () => ({
      open: prefs.openSections,
      toggle: (id: string, open: boolean) =>
        setPrefs((old) => ({
          ...old,
          openSections: { ...old.openSections, [id]: open },
        })),
    }),
    [prefs.openSections],
  );
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
  // --- Vaults -----------------------------------------------------------
  const vaultView = collection.startsWith("vault:")
    ? collection.slice("vault:".length)
    : "";
  async function refreshVaults() {
    setVaults(await store.listVaults());
    setParentalSet(await store.parentalPinSet());
  }
  // Books, notes and vault states after a vault opened, closed or changed.
  async function reloadPrivate() {
    await refreshVaults();
    setBooks(await store.listBooks());
    setAnnotations(await store.listAnnotations());
    // Work Mode reloads too: items from a vault that just locked disappear.
    setWorkVersion((v) => v + 1);
  }
  async function closeVaultBook(id?: string) {
    if (book?.meta.vault && (!id || book.meta.vault === id)) {
      await player.stop();
      setBook(null);
      setPage("library");
    }
  }
  async function lockVaults(id?: string) {
    await closeVaultBook(id);
    await store.lockVault(id);
    await reloadPrivate();
  }
  // Work mode unlocks a vault where you are (no trip to the library).
  function unlockVaultHere(vault: store.Vault) {
    setPinRequest({
      title: t("Unlock {name}", { name: vault.name }),
      mode: "enter",
      submit: t("Unlock"),
      run: async ({ pin }) => {
        await store.unlockVault(vault.id, pin);
        await reloadPrivate();
      },
    });
  }
  // Opens a vault, asking for its PIN when it is locked.
  function openVault(vault: store.Vault) {
    const show = () => {
      setCollection("vault:" + vault.id);
      setPage("library");
      setSelected(new Set());
    };
    if (vault.unlocked) return show();
    setPinRequest({
      title: t("Unlock {name}", { name: vault.name }),
      mode: "enter",
      submit: t("Unlock"),
      run: async ({ pin }) => {
        await store.unlockVault(vault.id, pin);
        // Show the vault first, so it is not taken for one left open.
        show();
        await reloadPrivate();
      },
    });
  }
  function startVault() {
    setAddingCollection(false);
    setPinRequest({
      title: t("Create a vault"),
      body: t(
        "A vault keeps books and documents out of sight until its PIN is entered. Its contents are encrypted on this computer, so they cannot be read from Origami's files.",
      ),
      mode: "create",
      name: "",
      submit: t("Create vault"),
      run: async ({ name, pin }) => {
        const vault = await store.createVault(name, pin);
        setCollection("vault:" + vault.id);
        setPage("library");
        setSelected(new Set());
        await reloadPrivate();
        notify(
          t(
            "Created the vault {name}. Import books here, or select books in the library and choose Move to vault.",
            { name: vault.name },
          ),
        );
      },
    });
  }
  // Moves books into a vault (unlocking it first when needed), or out of
  // one with an empty id.
  async function moveToVault(metas: BookMeta[], id: string) {
    const target = vaults.find((v) => v.id === id);
    const move = async () => {
      for (const meta of metas) {
        const next = { ...meta };
        if (id) next.vault = id;
        else delete next.vault;
        await store.saveMeta(next);
      }
      await followBooks(new Set(metas.map((m) => m.id)), id).catch(error);
      setWorkVersion((v) => v + 1);
      player.forgetBooks(new Set(metas.map((m) => m.id)));
      setSelected(new Set());
      // A vault opened only to move books in closes again.
      if (target && !target.unlocked && vaultView !== id)
        await store.lockVault(id);
      await reloadPrivate();
      notify(
        id
          ? t("Moved {count} to {name}.", {
              count: metas.length,
              name: target?.name ?? "",
            })
          : t("Moved {count} out of the vault.", { count: metas.length }),
      );
    };
    if (!target || target.unlocked) return move();
    setPinRequest({
      title: t("Unlock {name}", { name: target.name }),
      mode: "enter",
      submit: t("Move"),
      run: async ({ pin }) => {
        await store.unlockVault(id, pin);
        await move();
      },
    });
  }
  // Leaving a vault for another shelf locks every vault again. Only the move
  // itself counts, so a vault unlocked from Work mode (where the library is
  // still open underneath) stays open; the idle lock below still applies.
  const lastVaultView = useRef(vaultView);
  useEffect(() => {
    const left = Boolean(lastVaultView.current) && !vaultView;
    lastVaultView.current = vaultView;
    if (otherMode || !left) return;
    if (page === "library" && vaults.some((v) => v.unlocked))
      void lockVaults().catch(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, vaultView]);
  // Open vaults lock after a while without mouse, keyboard or scroll
  // activity. Reading aloud counts as activity, so listening is not cut off.
  const lastActivity = useRef(Date.now());
  const anyUnlocked = vaults.some((v) => v.unlocked);
  useEffect(() => {
    if (!anyUnlocked || !prefs.vaultIdleMinutes) return;
    lastActivity.current = Date.now();
    const seen = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
    events.forEach((e) => window.addEventListener(e, seen, { passive: true }));
    const timer = window.setInterval(() => {
      if (player.status === "playing" || player.status === "generating")
        lastActivity.current = Date.now();
      if (Date.now() - lastActivity.current < prefs.vaultIdleMinutes * 60_000)
        return;
      if (vaultView) setCollection("All books");
      void lockVaults()
        .then(() => notify(t("Vaults locked after a period of inactivity.")))
        .catch(error);
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, seen));
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyUnlocked, prefs.vaultIdleMinutes, player.status, vaultView]);
  // Runs an action guarded by the parental PIN, asking for it when one is set.
  function withParentalPin(title: string, action: () => void) {
    if (!parentalSet) return action();
    setPinRequest({
      title,
      body: t("Enter the parental PIN to continue."),
      mode: "enter",
      submit: t("Continue"),
      run: async ({ pin }) => {
        await store.checkParentalPin(pin);
        action();
      },
    });
  }
  function setMatureCovers(allow: boolean) {
    const apply = () => {
      void covers.cancel();
      patchPrefs({ allowMatureCovers: allow });
    };
    if (allow) withParentalPin(t("Allow mature cover artwork"), apply);
    else apply();
  }
  async function refreshVoices(retry = false) {
    const current = await store.getVoices(prefRef.current.speechModel);
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
        const available = await store.getVoices(saved.speechModel);
        if (active) {
          setBooks(rows);
          const merged = { ...defaultPreferences, ...saved };
          // The first 3D library preview was an on/off switch.
          if ((saved as { libraryScene?: boolean }).libraryScene && !saved.libraryTheme)
            merged.libraryTheme = "mansion";
          merged.collections = collectionNames(merged.collections, rows);
          if (
            available.length &&
            !available.some((v) => v.id === merged.voice && v.available)
          )
            merged.voice = available.find((v) => v.available)?.id || "";
          setUiLanguage(
            await loadLanguage(merged.uiLanguage || detectLanguage()),
          );
          setPrefs(startupBackground(startupVoice(merged, available)));
          setVoices(available);
          setAnnotations(await store.listAnnotations());
          await refreshVaults();
          setReady(true);
        }
      } catch (e) {
        if (active) setStartupError(t(e instanceof Error ? e.message : String(e)));
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
  // Automatic update checks: once a day, only when turned on and configured.
  // An update shows as a small card in the corner with "Download now".
  const [updateOffer, setUpdateOffer] = useState<{ found: UpdateFound; managed: boolean } | null>(null);
  useEffect(() => {
    if (!ready || !prefs.autoUpdate || checkedToday()) return;
    const timer = window.setTimeout(() => {
      void updateStatus()
        .then(async (s) => (s.configured ? { found: await checkUpdates(), managed: s.managed } : null))
        .then((offer) => {
          markChecked();
          if (offer?.found.components.length) setUpdateOffer(offer);
        })
        .catch(() => undefined);
    }, 20000);
    return () => clearTimeout(timer);
  }, [ready, prefs.autoUpdate]);
  useEffect(() => {
    if (!ready) return;
    setTrashModeDraft(prefs.trashRetentionDays === null ? "forever" : "days");
    setTrashDaysDraft(String(prefs.trashRetentionDays ?? 30));
    let active = true;
    const purge = async () => {
      try {
        const removed = await store.purgeTrash(prefs.trashRetentionDays);
        if (!active || !removed.length) return;
        const ids = new Set(removed);
        player.forgetBooks(ids);
        setBooks(await store.listBooks());
        setAnnotations(await store.listAnnotations());
        setNoteBooks((old) =>
          Object.fromEntries(
            Object.entries(old).filter(([id]) => !ids.has(id)),
          ),
        );
        setSelected((old) => new Set([...old].filter((id) => !ids.has(id))));
        setUndo((old) => {
          const kept = old?.filter((b) => !ids.has(b.id));
          return kept?.length ? kept : null;
        });
        setDeleteCandidates((old) => old.filter((b) => !ids.has(b.id)));
        setReturnAnchor((old) => (old && ids.has(old.bookId) ? null : old));
        notify(
          t("{count} expired Trash items permanently deleted.", {
            count: removed.length,
          }),
        );
      } catch (e) {
        if (active) error(e);
      }
    };
    void purge();
    const timer = window.setInterval(() => void purge(), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ready, prefs.trashRetentionDays]);
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
    if (page !== "reader") return;
    const frame = requestAnimationFrame(() => {
      article.current
        ?.querySelector(`[data-reading-page="${readerPage}"]`)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [prefs.readingMode]);
  useEffect(
    () => () => {
      cancelAnimationFrame(readerScrollFrame.current);
      if (readerSaveTimer.current) clearTimeout(readerSaveTimer.current);
    },
    [],
  );
  // Loads the speech model and voice in the background so the first Play
  // starts quickly. One loaded model serves every voice.
  const preloading = useRef(0);
  function preloadVoice(startup = false) {
    const current = prefRef.current;
    if (!store.desktop || !current.preloadAtStartup || studioBusyRef.current) return;
    const available = voices.filter((voice) => voice.available);
    const voice =
      available.find(
        (v) => v.id === bookVoice(bookRef.current?.meta, current),
      ) ||
      available.find((v) => v.id === current.lastVoice) ||
      available[0];
    if (!voice) return;
    const run = ++preloading.current;
    setStartupSpeech(
      t("Preparing {name} for playback...", { name: voice.name }),
    );
    void store
      .prepareVoice(voice.id, current.speechModel)
      .then(() => {
        if (run === preloading.current)
          setStartupSpeech(
            startup
              ? t("Loaded {name} at startup.", { name: voice.name })
              : t("{name} is ready.", { name: voice.name }),
          );
      })
      .catch(() => {
        if (run === preloading.current)
          setStartupSpeech(
            t("Preloading failed. Playback will retry when needed."),
          );
      });
  }
  useEffect(() => {
    if (!ready) return;
    preloadVoice(true);
    // Startup only; changing appearance or voice preferences must not reload the engine.
  }, [ready]);
  // Reading aloud comes first: pressing Play stops a picture being made and
  // puts it back in the queue. Speech and the image model sharing one graphics
  // card crashed AMD cards on Linux, and slowed others.
  const readingAloud = player.status !== "idle";
  useEffect(() => {
    if (!readingAloud || !covers.busy) return;
    const meta = books.find((b) => b.id === covers.active);
    const portrait = Boolean(covers.portraitActive);
    void covers
      .cancel()
      .then(() => {
        if (meta) covers.enqueue(meta);
        if (portrait) covers.retryPortraits();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingAloud, covers.busy]);
  // Artwork jobs release the speech model unless it may stay loaded. Reload it
  // once the job ends, so Play stays quick.
  const artBusy = covers.busy;
  const artWasBusy = useRef(false);
  useEffect(() => {
    if (artBusy) artWasBusy.current = true;
    else if (artWasBusy.current) {
      artWasBusy.current = false;
      if (!prefs.keepSpeechDuringArt && player.status === "idle")
        preloadVoice();
    }
  }, [artBusy]);
  // First launch on this computer: modest graphics keep artwork manual so it
  // never competes with reading aloud.
  useEffect(() => {
    if (!ready || prefs.hardware) return;
    let active = true;
    void store
      .systemProfile()
      .then((profile) => {
        if (!active || !profile) return;
        const defaults = hardwareDefaults(profile);
        patchPrefs(defaults);
        if (!defaults.hardware?.detected)
          notify(
            t(
              "Origami could not read this computer's graphics details, so automatic cover art starts off. Reading aloud is not affected. See Settings, Performance.",
            ),
          );
        else if (defaults.autoGenerateCovers === false)
          notify(
            t(
              "Automatic cover and portrait art is off on this computer so reading aloud stays fast. You can turn it on in Settings.",
            ),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ready]);
  // A voice just saved in the designer, selected once the list includes it.
  const [voiceSoon, setVoiceSoon] = useState("");
  useEffect(() => {
    if (!voiceSoon) return;
    const v = voices.find((x) => x.id === voiceSoon);
    if (!v) return;
    setVoiceSoon("");
    selectVoice(v.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices, voiceSoon]);
  // A voice made for another speech model, waiting for the reader to agree
  // to switch models.
  const [modelSwitch, setModelSwitch] = useState<{
    voice: Voice;
    model: store.ModelVersion;
  } | null>(null);
  const [speechModels, setSpeechModels] = useState<{
    models: store.ModelVersion[];
    default: string;
  }>({ models: [], default: "" });
  useEffect(() => {
    void store
      .speechModels()
      .then(setSpeechModels)
      .catch(() => {});
  }, []);
  // Switches the speech model; a preferred voice made for it is chosen when
  // given, else the current voice when the model has it, else its first voice.
  async function chooseSpeechModel(id: string, preferred?: string) {
    if (id === prefRef.current.speechModel) return;
    resumeVoice.current = false;
    try {
      await player.unload();
      const available = await store.getVoices(id);
      const current = bookVoice(bookRef.current?.meta, prefRef.current);
      const next =
        available.find((v) => v.id === preferred && v.available) ||
        available.find((v) => v.id === current && v.available) ||
        available.find((v) => v.available);
      const voiceLanguage = next?.languages.includes(
        prefRef.current.voiceLanguage,
      )
        ? prefRef.current.voiceLanguage
        : next?.languages[0] || prefRef.current.voiceLanguage;
      const patch = {
        speechModel: id,
        voiceLanguage,
        ...(next ? { voice: next.id, lastVoice: next.id } : {}),
      };
      patchPrefs(patch);
      prefRef.current = { ...prefRef.current, ...patch };
      setVoices(available);
      if (next && bookRef.current?.meta.uniqueVoice)
        await updateMeta({ ...bookRef.current.meta, voice: next.id });
      if (next && prefRef.current.preloadAtStartup)
        await store.prepareVoice(next.id, id);
    } catch (e) {
      error(e);
    }
  }
  async function refreshModels() {
    setSpeechModels(await store.speechModels());
    await covers.refreshModels();
    await refreshVoices();
  }
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
    void store
      .externalLinks()
      .then(setLinks)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!ready || prefs.supportPromptAfter) return;
    // First run: wait a day so people have time to try Origami first.
    patchPrefs({ supportPromptAfter: Date.now() + 86_400_000 });
  }, [ready]);
  // Painted day/night art replaces draft art as soon as it is present.
  useEffect(() => {
    void detectPaintedArt().then((found) => {
      if (found) setArtVersion((v) => v + 1);
    });
  }, []);
  const speeds = [
    0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25,
    1.3, 1.4, 1.5, 1.6, 1.75, 2, 2.25, 2.5, 3,
  ];
  function stepSpeed(direction: number) {
    const i = speeds.findIndex((s) => s >= prefs.speed - 0.001);
    const next =
      speeds[
        Math.max(0, Math.min(speeds.length - 1, (i < 0 ? 8 : i) + direction))
      ];
    patchPrefs({ speed: next });
    notify(t("Speed {next}×", { next: next }));
  }
  async function skipSentence(direction: number) {
    if (player.status !== "idle" && (await player.skip(direction))) return;
    skipParagraph(direction);
  }
  function skipParagraph(direction: number) {
    const b = bookRef.current;
    if (!b) return;
    const n = Math.max(
      0,
      Math.min(b.paragraphs.length - 1, b.meta.position + direction),
    );
    positionChanged(n);
    if (player.status !== "idle") void startFrom(n);
    else revealPassage(n);
  }
  function togglePlayback() {
    if (!bookRef.current) return;
    if (player.status === "idle") void startBook();
    else player.toggle();
  }
  function toggleDayNight() {
    if (!counterpart(prefRef.current.scene)) {
      notify(t("Choose a seasonal scene to switch between day and night."));
      return;
    }
    setPrefs((old) => toggleTimeOfDay(old));
  }
  // Sleep timer: a number of minutes, or the end of the current chapter.
  useEffect(() => {
    if (!sleep || sleep.mode !== "minutes") return;
    // The badge shows whole minutes, so it only needs an occasional refresh.
    const tick = window.setInterval(() => setSleepNow(Date.now()), 15_000);
    const fade = window.setTimeout(
      () => {
        setSleep(null);
        if (playbackStatusRef.current !== "idle") {
          notify(t("Sleep timer: fading out."));
          void player.fadeStop(8000);
        }
      },
      Math.max(0, sleep.endsAt - Date.now() - 8000),
    );
    return () => {
      clearInterval(tick);
      clearTimeout(fade);
    };
  }, [sleep]);
  useEffect(() => {
    if (player.status === "idle" && sleep?.mode === "chapter") setSleep(null);
  }, [player.status]);
  // Windows media keys and the system media overlay.
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const handlers: [MediaSessionAction, () => void][] = [
      ["play", () => actions.current.togglePlayback()],
      ["pause", () => actions.current.togglePlayback()],
      ["stop", () => void player.stop()],
      ["nexttrack", () => void actions.current.skipSentence(1)],
      ["previoustrack", () => void actions.current.skipSentence(-1)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Unsupported actions are ignored by the platform.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Ignored.
        }
      }
    };
  }, []);
  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    session.playbackState =
      player.status === "playing"
        ? "playing"
        : player.status === "idle"
          ? "none"
          : "paused";
    if (book && typeof MediaMetadata !== "undefined")
      session.metadata = new MediaMetadata({
        title: book.meta.title,
        artist: book.meta.author,
        album: currentSection?.label || "Origami",
        artwork: book.meta.coverImage
          ? [{ src: book.meta.coverImage, sizes: "320x448" }]
          : [{ src: "/crane.png", sizes: "256x256", type: "image/png" }],
      });
  }, [
    player.status,
    book?.meta.id,
    book?.meta.coverImage,
    currentSection?.index,
  ]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => actions.current.keydown(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  // Installed voices are remembered, so a removed one can be offered for
  // download again.
  const [voiceDownloads, setVoiceDownloads] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const unseen = voices.filter((v) => v.available && !prefs.seenVoices[v.id]);
    if (!unseen.length) return;
    patchPrefs({
      seenVoices: {
        ...prefs.seenVoices,
        ...Object.fromEntries(
          unseen.map((v) => [v.id, { name: v.name, languages: v.languages }]),
        ),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices, ready]);
  // Saved artwork: deleting a cover keeps automatic artwork from making a
  // new one; deleting a portrait does the same for that voice.
  async function deleteCover(meta: BookMeta) {
    if (covers.status(meta.id)) await covers.pause(meta.id);
    const current = (await store.readBook(meta.id)).meta;
    const rest = { ...current };
    delete rest.coverImage;
    delete rest.coverOrigin;
    await updateMeta({ ...rest, autoCover: false });
  }
  async function deletePortrait(voice: Voice) {
    await store.deleteVoicePortrait(voice.id);
    patchPrefs({
      portraitsRemoved: [...new Set([...prefs.portraitsRemoved, voice.id])],
    });
    setVoices((old) =>
      old.map((v) =>
        v.id === voice.id
          ? {
              ...v,
              portrait: undefined,
              portraitPrompt: undefined,
              portraitOrigin: undefined,
            }
          : v,
      ),
    );
  }
  async function openArtworkFolder() {
    await store.saveArtworkCopies([
      ...books
        .filter((b) => b.coverImage && !b.deleted)
        .map((b) => ({
          folder: "covers" as const,
          name: isUnknownAuthor(b.author)
            ? b.title
            : `${b.title} - ${b.author}`,
          data: b.coverImage!,
        })),
      ...voices
        .filter((v) => v.portrait)
        .map((v) => ({
          folder: "portraits" as const,
          name: v.name,
          data: v.portrait!,
        })),
    ]);
    await store.openArtworkFolder();
  }
  // Books saved before languages were recorded are scanned once, in the
  // background, so the library can show their flags.
  const languageScan = useRef(false);
  useEffect(() => {
    const missing = books.filter((b) => b.language === undefined);
    if (!missing.length || languageScan.current) return;
    languageScan.current = true;
    void (async () => {
      for (const meta of missing) {
        try {
          const full = await store.readBook(meta.id);
          await updateMeta({
            ...full.meta,
            language: detectBookLanguage(full.paragraphs),
          });
        } catch {
          /* Unreadable books stay without a flag and are tried again later. */
        }
      }
    })().finally(() => {
      languageScan.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books]);
  async function updateMeta(meta: BookMeta) {
    setBooks((old) => old.map((b) => (b.id === meta.id ? meta : b)));
    setBook((old) => (old?.meta.id === meta.id ? { ...old, meta } : old));
    await store.saveMeta(meta);
  }
  const namedCollections = collectionNames(
    prefs.collections,
    books.filter((b) => !b.vault),
  );
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
      notify(t('Deleted "{name}". Its books are in Unsorted.', { name: name }));
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
      notify(t("Collection restored."));
    } finally {
      setCollectionBusy(false);
    }
  }
  const [bookMenu, setBookMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const bookMenuActions: BookMenuActions = {
    open: (b) => void openBook(b.id).catch(error),
    favorite: (b) =>
      void updateMeta({ ...b, favorite: !b.favorite }).catch(error),
    editCover: (b) => void editCover(b).catch(error),
    uniqueVoice: (b, unique) => void setUniqueVoice(b, unique).catch(error),
    trash: (b) => void moveToTrash(new Set([b.id])).catch(error),
    restore: (b) => void restore([b]).catch(error),
    startOver: (b) => void startOver(b).catch(error),
    workOpen: (b) => {
      void (b.work ? Promise.resolve() : updateMeta({ ...b, work: true }))
        .then(() => {
          setWorkHandoff({ bookId: b.id, paragraphId: undefined, at: Date.now() });
          patchPrefs({ workMode: true, studioMode: false });
        })
        .catch(error);
    },
    shelf: (b, shelf) => {
      void updateMeta({ ...b, shelf })
        .then(() =>
          notify(
            shelf === "documents"
              ? t("{title} is now in Documents.", { title: b.title })
              : t("{title} is now in Stories.", { title: b.title }),
          ),
        )
        .catch(error);
    },
    ...(STUDIO_ENABLED
      ? {
          studio: (b: BookMeta) => {
            patchPrefs({ studioMode: true, workMode: false });
            window.dispatchEvent(new CustomEvent("origami:studio-book", { detail: { id: b.id } }));
          },
        }
      : {}),
    work: (b, on) => {
      void updateMeta({ ...b, work: on || undefined })
        .then(() =>
          notify(
            on
              ? t("{title} is now a source in Work mode.", { title: b.title })
              : t("{title} no longer shows in Work mode.", { title: b.title }),
          ),
        )
        .catch(error);
    },
  };
  // Back to 0%, as if the book had never been opened. Bookmarks, notes and
  // underlines stay; book mode opens it from the cover again.
  async function startOver(b: BookMeta) {
    if (
      !window.confirm(
        t(
          "Start {title} over from the beginning? Bookmarks, notes and underlines stay.",
          { title: b.title },
        ),
      )
    )
      return;
    if (bookRef.current?.meta.id === b.id && player.status !== "idle")
      await player.stop();
    const current = (await store.readBook(b.id)).meta;
    await updateMeta({ ...current, position: 0, opened: 0, finished: false });
    if (bookRef.current?.meta.id === b.id) setReaderPage(0);
    notify(t("{title} starts from the beginning again.", { title: b.title }));
  }
  // Library cover controls for books without artwork: progress, pause,
  // resume or generate, and importing an image directly.
  function coverJob(meta: BookMeta): CoverJob {
    return {
      status: covers.status(meta.id),
      canGenerate: store.desktop && covers.installed,
      onGenerate: () => covers.resume(meta.id),
      onPause: () => void covers.pause(meta.id).catch(error),
      onImport: (file) => void importCoverFile(meta, file).catch(error),
    };
  }
  async function importCoverFile(meta: BookMeta, file: File) {
    const image = await coverImage(file);
    if (covers.status(meta.id)) await covers.pause(meta.id);
    const current = (await store.readBook(meta.id)).meta;
    await updateMeta({ ...current, coverImage: image, coverOrigin: "custom" });
    notify(t("Cover added."));
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
  // Books share one voice. A book with its own voice keeps that choice.
  function selectVoice(id: string) {
    const chosen = voices.find((v) => v.id === id);
    if (chosen?.otherModel) {
      const model = speechModels.models.find(
        (m) => (m.engine || "qwen") === (chosen.engine || "qwen"),
      );
      if (model) setModelSwitch({ voice: chosen, model });
      else notify(t("The speech model for this voice is not installed."));
      return;
    }
    if (!chosen?.available) return;
    const own = page === "reader" && book?.meta.uniqueVoice ? book : null;
    const before = bookVoice(book?.meta, prefs);
    const target = own ? own.meta.voice : prefs.voice;
    if (target === id) return;
    const after = own ? id : bookVoice(book?.meta, { voice: id });
    if (book && before !== after) {
      resumeVoice.current = true;
      voiceBarrier.current = player.changeVoice();
    }
    const language = chosen.languages.includes(prefs.voiceLanguage)
      ? prefs.voiceLanguage
      : chosen.languages[0] || prefs.voiceLanguage;
    patchPrefs({ voiceLanguage: language });
    setStartupSpeech("");
    if (own) {
      const meta = { ...own.meta, voice: id };
      setBook({ ...own, meta });
      setBooks((old) => old.map((b) => (b.id === meta.id ? meta : b)));
      void store.saveMeta(meta).catch(error);
    } else patchPrefs({ voice: id });
    // Prepare the new voice while the reader is still looking at the list.
    if (player.status === "idle" && prefs.preloadAtStartup)
      void store.prepareVoice(id, prefs.speechModel).catch(() => {});
  }
  async function setUniqueVoice(meta: BookMeta, unique: boolean) {
    const next = {
      ...meta,
      uniqueVoice: unique,
      voice: unique ? prefs.voice : meta.voice,
    };
    if (
      book?.meta.id === meta.id &&
      bookVoice(meta, prefs) !== bookVoice(next, prefs)
    ) {
      resumeVoice.current = true;
      voiceBarrier.current = player.changeVoice();
    }
    await updateMeta(next);
    notify(
      unique
        ? t(
            '"{title}" now has its own voice. Choose it in the Voice tab while reading.',
            {
              title: meta.title,
            },
          )
        : t('"{title}" uses the shared voice again.', { title: meta.title }),
    );
  }
  async function openBook(id: string, position?: number) {
    if (draft && !window.confirm("Discard the unfinished note?")) return false;
    if (readerSaveTimer.current) clearTimeout(readerSaveTimer.current);
    cancelAnimationFrame(readerScrollFrame.current);
    await player.stop();
    resumeVoice.current = false;
    setFocusMode(false);
    const b = await store.readBook(id);
    b.meta.opened = Date.now();
    if (position !== undefined) b.meta.position = position;
    await store.saveMeta(b.meta);
    setBook(b);
    const pages = readingPages(b.paragraphs);
    const startPage = pageForParagraph(pages, b.meta.position);
    setReaderPage(startPage);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // At the start of a page, show the whole page with its header.
        const target =
          b.meta.position === 0
            ? (article.current?.querySelector("[data-reading-cover]") ??
              article.current?.querySelector('[data-reading-page="0"]'))
            : pages[startPage]?.start === b.meta.position
            ? article.current?.querySelector(
                `[data-reading-page="${startPage}"]`,
              )
            : document.getElementById(
                "passage-" + b.paragraphs[b.meta.position]?.id,
              );
        target?.scrollIntoView({ block: "start", behavior: "instant" });
      }),
    );
    setPage("reader");
    setSelection(null);
    setDraft("");
    setEditing(null);
    setBookQuery("");
    await refresh();
    return true;
  }
  // forWork: imported from Work mode, so the documents are work sources.
  async function importFiles(files: FileList | File[], forWork = false) {
    setBusy(true);
    let count = 0;
    const failures: string[] = [];
    try {
      let known = await store.listBooks();
      for (const file of Array.from(files)) {
        try {
          const b = await importDocument(file);
          await fillDetails(b);
          if (namedCollections.includes(collection))
            b.meta.collection = collection;
          if (vaultView) b.meta.vault = vaultView;
          if (forWork) b.meta.work = true;
          // Imported into the library on screen; from elsewhere, the guess decides.
          if (forWork) b.meta.shelf = "documents";
          else if (page === "library") b.meta.shelf = shelf;
          const existing = known.find(
            (k) => k.sourceHash === b.meta.sourceHash,
          );
          if (existing && forWork && !existing.deleted) {
            // Already in the library: it simply becomes a work source too.
            if (!existing.work) await store.saveMeta({ ...existing, work: true });
            count++;
            continue;
          }
          if (existing) {
            failures.push(
              existing.deleted
                ? t("{name}: already in library (in Trash)", {
                    name: file.name,
                  })
                : t("{name}: already in library", { name: file.name }),
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
      notify(
        (count ? t("{count} imported. ", { count: count }) : "") +
          failures.join(" "),
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  // Books that arrive without details get them from their own text and the
  // offline author pack: author, title and genre tags (see fillBookDetails).
  async function fillDetails(b: Book) {
    const pack = await loadPack("en").catch(() => null);
    if (pack) fillBookDetails(pack, b);
  }
  async function addQuick() {
    if (!quickText.trim()) return;
    const b = createBook(
      quickTitle.trim() || "Untitled text",
      paragraphsFromText(quickText),
      "Text",
    );
    if (namedCollections.includes(collection)) b.meta.collection = collection;
    if (vaultView) b.meta.vault = vaultView;
    await fillDetails(b);
    await store.saveBook(b);
    covers.enqueue(b.meta);
    setQuick(false);
    setQuickText("");
    await openBook(b.meta.id);
  }
  async function moveToTrash(ids: Set<string>) {
    const affected = books.filter((b) => ids.has(b.id));
    for (const b of affected)
      await store.saveMeta({
        ...b,
        deleted: true,
        deletedAt: b.deleted ? (b.deletedAt ?? Date.now()) : Date.now(),
      });
    if (book && ids.has(book.meta.id)) {
      await player.stop();
      setBook(null);
      setPage("library");
    }
    setUndo(affected);
    setSelected(new Set());
    await refresh();
    notify(
      t("{count} moved to Trash. Saved exports are untouched.", {
        count: affected.length,
      }),
    );
  }
  async function restore(items: BookMeta[]) {
    for (const b of items)
      await store.saveMeta({ ...b, deleted: false, deletedAt: undefined });
    setUndo(null);
    setSelected(new Set());
    await refresh();
    notify(t("Restored to the library."));
  }
  async function permanentlyDelete() {
    setDeletingBooks(true);
    try {
      const ids = new Set(deleteCandidates.map((b) => b.id));
      // Vault books skip Trash, so they are marked deleted on the way out.
      for (const meta of deleteCandidates)
        if (!meta.deleted)
          await store.saveMeta({
            ...meta,
            deleted: true,
            deletedAt: Date.now(),
          });
      await store.deleteTrashedBooks([...ids]);
      player.forgetBooks(ids);
      if (book && ids.has(book.meta.id)) {
        await player.stop();
        setBook(null);
        setPage("library");
      }
      setAnnotations(await store.listAnnotations());
      setNoteBooks((old) =>
        Object.fromEntries(Object.entries(old).filter(([id]) => !ids.has(id))),
      );
      if (returnAnchor && ids.has(returnAnchor.bookId)) setReturnAnchor(null);
      setSelected(new Set());
      setUndo(null);
      setDeleteCandidates([]);
      await refresh();
      notify(
        t("{count} permanently deleted. Saved exports are untouched.", {
          count: ids.size,
        }),
      );
    } catch (e) {
      error(e);
    } finally {
      setDeletingBooks(false);
    }
  }
  // The tab that was open before selecting text (or annotating) switched the
  // inspector by itself. A plain click in the book goes back to it; picking
  // a tab yourself forgets it.
  const autoTabFrom = useRef<InspectorTab | null>(null);
  function backToEarlierTab() {
    const earlier = autoTabFrom.current;
    autoTabFrom.current = null;
    setSelection(null);
    if (earlier && earlier !== prefRef.current.inspector)
      patchPrefs({ inspector: earlier });
  }
  function chooseTab(tab: InspectorTab) {
    setFocusMode(false);
    if (tab === "appearance" && !inspectorAvailable) {
      setPage("settings");
      patchPrefs({ settingsCategory: "appearance" });
      return;
    }
    if (!inspectorAvailable && !book && tab === "voice") {
      setPage("voices");
      return;
    }
    if (!inspectorAvailable && book) setPage("reader");
    patchPrefs({ rightOpen: true, inspector: tab });
  }
  // --- Work Mode ---------------------------------------------------------------
  const appMode: AppMode = prefs.studioMode && STUDIO_ENABLED ? "studio" : prefs.workMode ? "work" : "read";
  const otherMode = appMode !== "read";
  // On narrow windows only one panel is open at a time, and a click beside it closes it.
  const lastPanel = useRef<"left" | "right">("right");
  useEffect(() => {
    if (compactLeft) lastPanel.current = "left";
  }, [compactLeft]);
  useEffect(() => {
    if (prefs.rightOpen) lastPanel.current = "right";
  }, [prefs.rightOpen]);
  useEffect(() => {
    if (overlayNavigation && navigationOpen && inspectorOpen)
      if (lastPanel.current === "left") patchPrefs({ rightOpen: false });
      else setCompactLeft(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayNavigation, navigationOpen, inspectorOpen]);
  const overlayOpen = !otherMode && ((overlayInspector && inspectorOpen) || (overlayNavigation && navigationOpen));
  // Studio asks for a voice to be designed for a character: open the voice
  // designer, which starts from the draft Studio left for it.
  useEffect(() => {
    const open = () => {
      patchPrefs({ workMode: false, studioMode: false });
      setPage("voices");
      setVoiceSection("create");
    };
    window.addEventListener("origami:design-voice", open);
    return () => window.removeEventListener("origami:design-voice", open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Studio added a book (a recording made into text): show it, and open it when asked.
  useEffect(() => {
    const changed = () => void store.listBooks().then(setBooks).catch(error);
    const openIt = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      patchPrefs({ workMode: false, studioMode: false });
      void store.listBooks().then(setBooks).then(() => openBook(id)).catch(error);
    };
    window.addEventListener("origami:library-changed", changed);
    window.addEventListener("origami:open-book", openIt);
    return () => {
      window.removeEventListener("origami:library-changed", changed);
      window.removeEventListener("origami:open-book", openIt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function switchMode(mode: AppMode) {
    if (mode === appMode) return;
    const work = mode === "work";
    if (work && page === "reader" && book) {
      const at = rememberReadingLocation();
      setWorkHandoff({
        bookId: book.meta.id,
        paragraphId: at?.paragraphId ?? book.paragraphs[book.meta.position]?.id,
        at: Date.now(),
      });
    }
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setFocusMode(false);
    patchPrefs({ workMode: work, studioMode: mode === "studio" });
  }
  // "Show in book" from a note or a study card.
  async function openPassageFromWork(bookId: string, paragraphId?: string) {
    patchPrefs({ workMode: false, studioMode: false });
    try {
      const b = await store.readBook(bookId);
      const pos = Math.max(0, b.paragraphs.findIndex((p) => p.id === paragraphId));
      if (!(await openBook(bookId, pos))) return;
      if (paragraphId)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const el = document.getElementById("passage-" + paragraphId);
            el?.scrollIntoView({ block: "center", behavior: "instant" });
            el?.classList.add("work-flash");
            setTimeout(() => el?.classList.remove("work-flash"), 2000);
          }),
        );
    } catch (e) {
      error(e);
    }
  }
  async function startReaderCard(target = selection) {
    if (!target) return;
    setReaderCard(target);
    try {
      setWorkSubjects((await loadWork()).subjects);
    } catch {}
    if (prefs.inspector !== "selection") patchPrefs({ rightOpen: true, inspector: "selection" });
  }
  async function saveReaderCard(draft: import("./work/CardComposer").CardDraft) {
    if (!book || !readerCard) return;
    const paragraph = book.paragraphs.findIndex((p) => p.id === readerCard.paragraphId);
    const heading = currentEntry(contents, Math.max(0, paragraph))?.label;
    const card = makeCard({
      ...draft,
      vault: book.meta.vault,
      source: {
        bookId: book.meta.id,
        paragraphId: readerCard.paragraphId,
        start: readerCard.start,
        end: readerCard.end,
        quote: readerCard.text,
        title: heading && heading !== book.meta.title ? `${book.meta.title}, ${heading}` : book.meta.title,
      },
    });
    await saveWork([card]);
    setReaderCard(null);
    setWorkVersion((v) => v + 1);
    notify(t("Card saved. Study it in Work mode (Ctrl+Shift+W)."));
  }
  async function speakForStudy(text: string) {
    const result = await store.synthesize(text, prefs.voice, prefs.voiceTemperature, prefs.speechModel);
    return "data:audio/wav;base64," + result.audio;
  }
  function captureSelection() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    const range = s.getRangeAt(0).cloneRange();
    const node =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement;
    const p = node?.closest<HTMLElement>("[data-paragraph]");
    if (!p || !article.current?.contains(p)) return;
    // A triple-click ends at the very start of the next paragraph. Treat it as
    // the whole starting paragraph instead of a two-paragraph selection.
    if (!p.contains(range.endContainer)) {
      const tail = document.createRange();
      tail.setStart(p, p.childNodes.length);
      tail.setEnd(range.endContainer, range.endOffset);
      if (!tail.toString().trim()) range.setEnd(p, p.childNodes.length);
    }
    const value = selectionFromRange(range, p);
    if (!value || !value.text.trim()) {
      setSelection(null);
      notify(
        t(
          "Passage tools work within one paragraph. Use Copy or Read from here for longer passages.",
        ),
      );
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
    if (prefs.selectionOpensTab && !draft && prefs.rightOpen) {
      if (prefs.inspector !== "selection")
        autoTabFrom.current ??= prefs.inspector;
      patchPrefs({ inspector: "selection" });
    }
  }
  async function addAnnotation(
    kind: Annotation["kind"],
    currentPosition = false,
    // A passage other than the current selection, and a color other than
    // the chosen one (both used by the reader's right-click menu).
    options: { target?: TextSelection; color?: string } = {},
  ) {
    if (!book) return;
    const color = options.color || colorRef.current;
    const location = currentPosition ? rememberReadingLocation() : null;
    const currentParagraph = location
      ? book.paragraphs.find((p) => p.id === location.paragraphId)
      : book.paragraphs[book.meta.position];
    const p = options.target ||
      (!currentPosition && selection) || {
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
    if (prefRef.current.inspector !== "notes")
      autoTabFrom.current ??= prefRef.current.inspector;
    chooseTab("notes");
  }
  const closeReaderMenu = useCallback(() => setReaderMenu(null), []);
  function readerMenuAction(action: ReaderMenuAction) {
    if (!book || !readerMenu) return;
    const paragraph = book.paragraphs.find(
      (p) => p.id === readerMenu.paragraphId,
    );
    const passage: TextSelection | undefined =
      readerMenu.selected && selection
        ? selection
        : paragraph && {
            paragraphId: paragraph.id,
            start: 0,
            end: 0,
            text: paragraph.text,
          };
    if (!passage) return;
    switch (action.kind) {
      case "readSelection":
        void readSelection();
        break;
      case "readFromHere":
        void startFrom(
          book.paragraphs.findIndex((p) => p.id === passage.paragraphId),
        );
        break;
      case "underline":
        setColor(action.color);
        void addAnnotation("underline", false, {
          target: passage,
          color: action.color,
        }).catch(error);
        break;
      case "note":
        chooseTab("notes");
        break;
      case "bookmark":
        void addAnnotation("bookmark", false, { target: passage }).catch(error);
        break;
      case "sticky": {
        // A sticky note beside the passage, opened for writing.
        const note: Annotation = {
          id: crypto.randomUUID(),
          bookId: book.meta.id,
          paragraphId: passage.paragraphId,
          start: 0,
          end: 0,
          quote: (paragraph?.text || passage.text).slice(0, 280),
          kind: "sticky",
          color: "yellow",
          text: "",
          group: "",
          created: Date.now(),
        };
        freshSticky.current = note.id;
        void store
          .saveAnnotation(note)
          .then(() => setAnnotations((old) => [note, ...old]))
          .catch(error);
        break;
      }
      case "copy":
        void navigator.clipboard
          .writeText(passage.text)
          .then(() => notify(t("Copied.")))
          .catch(error);
        break;
      case "card": {
        const target =
          passage.end > passage.start
            ? passage
            : { ...passage, start: 0, end: passage.text.length };
        setSelection(target);
        void startReaderCard(target);
        break;
      }
      case "spoken":
        patchPrefs({
          inspector: "selection",
          rightOpen: true,
          openSections: { ...prefs.openSections, "selection-spoken": true },
        });
        break;
    }
  }
  async function removeAnnotation(a: Annotation) {
    await store.deleteAnnotation(a.id);
    setAnnotations((old) => old.filter((n) => n.id !== a.id));
    notify(t("Annotation deleted."));
  }
  const [flashAnnotation, setFlashAnnotation] = useState("");
  async function showBookmark(a: Annotation) {
    await jumpAnnotation(a);
    setNoteScope("book");
    setNoteFilter("bookmark");
    setNoteQuery("");
    chooseTab("notes");
    setFlashAnnotation(a.id);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .getElementById("annotation-" + a.id)
          ?.scrollIntoView({ block: "nearest" }),
      ),
    );
    window.setTimeout(() => setFlashAnnotation(""), 1700);
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
        notify(
          t("This passage is no longer available. Your note is preserved."),
        );
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
            ?.scrollIntoView({ block: "center", behavior: "instant" }),
        ),
      );
    } finally {
      jumpRef.current = false;
      setJumping(false);
    }
  }
  // fromScroll: called for a user scroll. Only then may a long book's page
  // window follow the scroll position; programmatic jumps scroll afterwards.
  function rememberReadingLocation(fromScroll = false): ReadingAnchor | null {
    const current = bookRef.current;
    if (!current) return null;
    const region = article.current?.parentElement;
    const box = region?.getBoundingClientRect();
    const visiblePage = Array.from(
      article.current?.querySelectorAll<HTMLElement>("[data-reading-page]") ||
        [],
    ).find((el) => box && el.getBoundingClientRect().bottom > box.top + 48);
    // Scrolled past the rendered window (a long book's spacer): find the page
    // from the scroll offset so the window moves there.
    if (
      fromScroll &&
      virtualPages &&
      box &&
      article.current &&
      (!visiblePage || visiblePage.getBoundingClientRect().top > box.bottom)
    ) {
      const offset = box.top + 48 - article.current.getBoundingClientRect().top;
      const target = pageAtOffset(
        bookPages.length,
        offset,
        pageHeight,
        prefRef.current.pageGap,
      );
      setReaderPage(target);
      return null;
    }
    const visible = Array.from(
      visiblePage?.querySelectorAll<HTMLElement>("[data-paragraph]") || [],
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
    const position = Math.max(0, visibleIndex);
    if (visiblePage && prefRef.current.readingMode !== "paged") {
      setReaderPage(Number(visiblePage.dataset.readingPage));
    }
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
  function readerScrolled() {
    cancelAnimationFrame(readerScrollFrame.current);
    readerScrollFrame.current = requestAnimationFrame(() => {
      const anchor = rememberReadingLocation(true);
      if (readerSaveTimer.current) clearTimeout(readerSaveTimer.current);
      if (!anchor || jumpRef.current || player.status !== "idle") return;
      readerSaveTimer.current = setTimeout(() => {
        const current = bookRef.current;
        if (
          !jumpRef.current &&
          playbackStatusRef.current === "idle" &&
          current?.meta.id === anchor.bookId &&
          current.meta.position !== anchor.position
        ) {
          void updateMeta({ ...current.meta, position: anchor.position }).catch(
            error,
          );
        }
      }, 350);
    });
  }
  function navigateReadingPage(index: number) {
    if (!bookPages.length) return;
    const next = Math.max(0, Math.min(bookPages.length - 1, index));
    setReaderPage(next);
    if (readerSaveTimer.current) clearTimeout(readerSaveTimer.current);
    const current = bookRef.current;
    if (current && player.status === "idle") {
      void updateMeta({
        ...current.meta,
        position: bookPages[next].start,
      }).catch(error);
    }
    requestAnimationFrame(() => {
      const region = article.current?.parentElement;
      if (prefRef.current.readingMode === "paged")
        region?.scrollTo({ top: 0, behavior: "instant" });
      else
        article.current
          ?.querySelector(`[data-reading-page="${next}"]`)
          ?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
  function scrollFromMargin(event: React.WheelEvent<HTMLButtonElement>) {
    if (event.ctrlKey) return;
    const region = article.current?.parentElement;
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? region?.clientHeight || 700
          : 1;
    region?.scrollBy({ top: event.deltaY * unit, behavior: "instant" });
  }
  function revealPassage(position: number) {
    const current = bookRef.current;
    if (!current) return;
    if (bookActive) {
      bookNav.current?.show(position);
      return;
    }
    setReaderPage(pageForParagraph(bookPages, position));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document
          .getElementById("passage-" + current.paragraphs[position]?.id)
          ?.scrollIntoView({ block: "center", behavior: "instant" });
      }),
    );
  }
  // A window too narrow for the open book falls back to pages (and back):
  // either way the reader stays on the same passage.
  const wasBookActive = useRef(bookActive);
  useEffect(() => {
    if (wasBookActive.current === bookActive) return;
    wasBookActive.current = bookActive;
    if (book) revealPassage(book.meta.position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookActive]);
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
      if (!(await openBook(anchor.bookId, position))) return;
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
    const timer = sleepRef.current;
    if (
      timer?.mode === "chapter" &&
      playbackStatusRef.current !== "idle" &&
      b.paragraphs[n]?.chapter !== timer.chapter
    ) {
      setSleep(null);
      void player.stop();
      notify(t("Sleep timer: stopped at the end of the chapter."));
      return;
    }
    void updateMeta({ ...b.meta, position: n }).catch(error);
    if (prefRef.current.follow) {
      setReaderPage(pageForParagraph(bookPages, n));
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
            initial +
              ((e.clientX - start) * (side === "left" ? 1 : -1) * 100) /
                uiScale,
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
  // The library theme; room themes replace the grid and the background.
  const currentLibraryTheme = libraryTheme(prefs.libraryTheme);
  const roomTheme =
    currentLibraryTheme.kind === "room" ? currentLibraryTheme : null;
  // Vault books show only inside their open vault, never on other shelves.
  const shelf: Shelf = prefs.libraryShelf || "stories";
  const shelfName = (s: Shelf) => (s === "documents" ? t("Documents") : t("Stories"));
  const filteredBooks = books.filter(
    (b) => !b.vault && shelfOf(b) === shelf && matchesLibraryFilters(b, libraryFilters),
  );
  const visible = sortLibrary(
    (vaultView
      ? books.filter(
          (b) =>
            b.vault === vaultView &&
            !b.deleted &&
            matchesLibraryFilters(b, libraryFilters),
        )
      : filteredBooks
          .filter((b) => (collection === "Trash" ? b.deleted : !b.deleted))
          .filter(
            (b) =>
              collection === "All books" ||
              collection === "Trash" ||
              (collection === "Favorites"
                ? b.favorite
                : b.collection === collection),
          )
    )
      .filter((b) =>
        (
          b.title +
          " " +
          b.author +
          " " +
          b.collection +
          " " +
          bookGenres(b).join(" ")
        )
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    sort,
  );
  // The last book opened in the library on screen.
  const latest = books
    .filter((b) => !b.deleted && !b.vault && b.opened > 0 && shelfOf(b) === shelf)
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
  const pageWindow = readingWindow(
    bookPages.length,
    readerPage,
    prefs.readingMode === "paged",
  );
  const visibleReadingPages = bookPages
    .map((range, index) => ({ ...range, index }))
    .slice(pageWindow.start, pageWindow.end);
  const spacers = virtualPages
    ? spacerHeights(bookPages.length, pageWindow, pageHeight, prefs.pageGap)
    : { top: 0, bottom: 0 };
  // The cover page before page 1 keeps its space when scrolled out of view.
  if (pageWindow.start > 0) spacers.top += coverPageHeight.current;
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
    const activeFilters = [
      page !== "bookmarks" && noteScope !== "book",
      noteFilter !== "all",
      noteColor !== "all",
      noteOrder !== "book-asc",
    ].filter(Boolean).length;
    return (
      <div className="inspector-content">
        <div className="panel-toolbar">
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label={t("Search annotations")}
              placeholder={t("Search annotations")}
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
            />
          </div>
          <IconButton
            label={t("Export annotations")}
            onClick={() => {
              void store
                .exportText(
                  "annotations.txt",
                  currentAnnotations
                    .map(({ annotation: a, title, line, context, paragraph }) =>
                      [
                        title,
                        paragraph >= 0
                          ? t("Paragraph {paragraph}", {
                              paragraph: paragraph + 1,
                            })
                          : "",
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
            <Download size={16} />
          </IconButton>
        </div>
        <Section
          id="notes-filters"
          title={t("Filter and sort")}
          icon={<Filter size={15} />}
          meta={
            activeFilters
              ? t("{count} active", { count: activeFilters })
              : undefined
          }
          defaultOpen={false}
        >
          <div className="annotation-filters">
            {page !== "bookmarks" && (
              <select
                aria-label={t("Annotation scope")}
                value={noteScope}
                onChange={(e) => setNoteScope(e.target.value)}
              >
                <option value="book">{t("Current book")}</option>
                <option value="all">{t("All books")}</option>
              </select>
            )}
            <select
              aria-label={t("Annotation type")}
              value={noteFilter}
              onChange={(e) => setNoteFilter(e.target.value)}
            >
              <option value="all">{t("All annotations")}</option>
              <option value="note">{t("Notes")}</option>
              <option value="bookmark">{t("Bookmarks")}</option>
              <option value="underline">{t("Underlines")}</option>
            </select>
            <select
              aria-label={t("Annotation color filter")}
              value={noteColor}
              onChange={(e) => setNoteColor(e.target.value)}
            >
              <option value="all">{t("All colors")}</option>
              {annotationColors.map((c) => (
                <option key={c.id} value={c.id}>
                  {t(c.label)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Annotation order")}
              value={noteOrder}
              onChange={(e) => setNoteOrder(e.target.value as AnnotationOrder)}
            >
              <option value="book-asc">{t("Book order: first to last")}</option>
              <option value="book-desc">
                {t("Book order: last to first")}
              </option>
              <option value="text-asc">{t("Alphabetical: A to Z")}</option>
              <option value="text-desc">{t("Alphabetical: Z to A")}</option>
              <option value="newest">{t("Recently added")}</option>
            </select>
          </div>
        </Section>
        <p className="annotation-count" role="status">
          {currentAnnotations.length === 1
            ? t("1 annotation")
            : t("{count} annotations", { count: currentAnnotations.length })}
        </p>
        {(selection || editing) && (
          <div className="note-editor">
            <h4>{editing ? t("Edit note") : t("Add note")}</h4>
            <textarea
              aria-label={t("Note text")}
              placeholder={t("Write a note")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <input
              aria-label={t("Note group")}
              placeholder={t("Group or label")}
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
              {t("Save note")}
            </button>
          </div>
        )}
        {!currentAnnotations.length && (
          <p className="empty-copy">
            {t(
              "Select a passage to underline it or add a note. Bookmarks can also mark your current position.",
            )}
          </p>
        )}
        {currentAnnotations.map(
          ({ annotation: a, title, line, context, paragraph, heading }) => (
            <div
              key={a.id}
              id={"annotation-" + a.id}
              className={
                "annotation-card kind-" +
                a.kind +
                (flashAnnotation === a.id ? " setting-flash" : "")
              }
              style={{
                ["--mark" as string]: annotationColors.find(
                  (c) => c.id === a.color,
                )?.value,
              }}
            >
              <div className="annotation-head">
                <span className="kind-chip">
                  {a.kind === "note" ? (
                    <MessageSquare size={13} />
                  ) : a.kind === "sticky" ? (
                    <StickyNote size={13} />
                  ) : a.kind === "bookmark" ? (
                    <Bookmark size={13} fill="currentColor" />
                  ) : (
                    <Underline size={13} />
                  )}
                  {a.kind === "note"
                    ? t("Note")
                    : a.kind === "sticky"
                      ? t("Sticky note")
                      : a.kind === "bookmark"
                      ? t("Bookmark")
                      : t("Underline")}
                </span>
                {a.group && <span className="annotation-group">{a.group}</span>}
                <IconButton
                  label={t("Delete annotation")}
                  onClick={() => {
                    void removeAnnotation(a).catch(error);
                  }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
              {(a.kind === "note" || a.kind === "sticky") && a.text && (
                <p className="note-text">{a.text}</p>
              )}
              <button
                className="quote"
                disabled={jumping}
                onClick={() => {
                  void jumpAnnotation(a).catch(error);
                }}
              >
                <span>
                  {a.kind === "sticky" && line.length > 140
                    ? line.slice(0, 140).trimEnd() + "..."
                    : line}
                </span>
                {a.kind !== "note" && a.kind !== "sticky" && a.text && (
                  <span className="note-body">{a.text}</span>
                )}
              </button>
              <div className="annotation-location">
                {title}
                {heading && heading !== title ? ` · ${heading}` : ""}
                {paragraph >= 0
                  ? t(" · Paragraph {paragraph}", { paragraph: paragraph + 1 })
                  : ""}
              </div>
              {context && context !== line && (
                <details className="annotation-context">
                  <summary>{t("Full paragraph")}</summary>
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
                {t("Edit")}
              </button>
            </div>
          ),
        )}
      </div>
    );
  }
  function colorPicker() {
    return (
      <div
        className="color-options"
        role="group"
        aria-label={t("Annotation color")}
      >
        {annotationColors.map((c) => (
          <button
            key={c.id}
            aria-label={t("{label} annotation", { label: t(c.label) })}
            title={t(c.label)}
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
    const word = selection?.text.trim() || "";
    const pronounceable =
      word && word.length <= 40 && word.split(/\s+/).length <= 4;
    return (
      <div className="inspector-content">
        <span className="eyebrow">{t("Selected passage")}</span>
        <blockquote className="selected-quote">{selection?.text}</blockquote>
        <div className="selection-actions">
          <button
            className="primary"
            onClick={() => {
              void readSelection();
            }}
          >
            <Play size={16} />
            {t("Read selection")}
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
            {t("Read from here")}
          </button>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(selection?.text || "")
                .then(() => notify(t("Copied.")))
                .catch(error);
            }}
          >
            <Copy size={16} />
            {t("Copy text")}
          </button>
          <button
            onClick={() => {
              void startReaderCard();
            }}
          >
            <GalleryVerticalEnd size={16} />
            {t("Study card")}
          </button>
        </div>
        {readerCard && selection && readerCard.paragraphId === selection.paragraphId && (
          <CardComposer
            key={readerCard.paragraphId + readerCard.start}
            compact
            text={readerCard.text}
            subjects={workSubjects}
            onSave={(d) => saveReaderCard(d).catch(error)}
            onCancel={() => setReaderCard(null)}
          />
        )}
        <Section
          id="selection-annotate"
          title={t("Annotate")}
          icon={<Underline size={15} />}
        >
          {colorPicker()}
          <div className="annotation-actions">
            <button
              onClick={() => {
                void addAnnotation("underline").catch(error);
              }}
            >
              <Underline size={17} />
              {t("Underline")}
            </button>
            <button onClick={() => chooseTab("notes")}>
              <MessageSquare size={17} />
              {t("Note")}
            </button>
            <button
              onClick={() => {
                void addAnnotation("bookmark").catch(error);
              }}
            >
              <Bookmark size={17} />
              {t("Bookmark")}
            </button>
          </div>
        </Section>
        <Section
          id="selection-spoken"
          title={t("Spoken version")}
          icon={<PenLine size={15} />}
          meta={
            spokenChanged
              ? t("Unsaved")
              : hasSpokenEdit
                ? savedSpoken
                  ? t("Edited")
                  : t("Skipped")
                : t("Automatic")
          }
          defaultOpen={false}
        >
          <textarea
            className="spoken-preview spoken-editor"
            aria-label={t("Spoken version")}
            value={spokenDraft}
            disabled={spokenBusy}
            onChange={(e) =>
              setSpokenDrafts((old) => ({
                ...old,
                [spokenKey]: e.target.value,
              }))
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
              {t("Save spoken version")}
            </button>
            <button
              disabled={spokenBusy || !spokenDraft.trim()}
              onClick={() => {
                void previewSpoken().catch(error);
              }}
            >
              <Play size={15} />
              {t("Preview spoken version")}
            </button>
            <button
              disabled={spokenBusy || !hasSpokenEdit}
              onClick={() => {
                void acceptSpoken(true).catch(error);
              }}
            >
              <RotateCcw size={15} />
              {t("Reset spoken version")}
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
                {t("Discard edits")}
              </button>
            )}
          </div>
          <p className="hint" role="status">
            {spokenChanged
              ? t("Unsaved changes")
              : hasSpokenEdit
                ? savedSpoken
                  ? t("Saved replacement")
                  : t("Saved: skip this passage")
                : t("Automatic spoken version")}
          </p>
          <p className="hint">
            {t(
              "Changes only what is read aloud. Leave it blank to skip the passage.",
            )}
          </p>
        </Section>
        {pronounceable && (
          <Section
            id="selection-pronunciation"
            title={t("Pronunciation")}
            icon={<Languages size={15} />}
            defaultOpen={false}
          >
            <form
              className="pronunciation-form"
              onSubmit={(e) => {
                e.preventDefault();
                addPronunciation(word, lexiconDraft.to, lexiconDraft.scope);
              }}
            >
              <label>
                {t("Always say “{word}” as", { word })}
                <input
                  aria-label={t("Pronounce {word} as", { word: word })}
                  placeholder={t("For example: Dahn-TESS")}
                  value={lexiconDraft.to}
                  onChange={(e) =>
                    setLexiconDraft((d) => ({ ...d, to: e.target.value }))
                  }
                />
              </label>
              <label>
                {t("Applies to")}
                <select
                  aria-label={t("Pronunciation scope")}
                  value={lexiconDraft.scope}
                  onChange={(e) =>
                    setLexiconDraft((d) => ({ ...d, scope: e.target.value }))
                  }
                >
                  <option value="book">{t("This book")}</option>
                  <option value="all">{t("All books")}</option>
                </select>
              </label>
              <div className="spoken-actions">
                <button
                  type="submit"
                  className="primary"
                  disabled={!lexiconDraft.to.trim()}
                >
                  <Check size={15} />
                  {t("Save pronunciation")}
                </button>
                <button
                  type="button"
                  disabled={!lexiconDraft.to.trim()}
                  onClick={() => {
                    void previewText(lexiconDraft.to).catch(error);
                  }}
                >
                  <Play size={15} />
                  {t("Hear it")}
                </button>
              </div>
              <p className="hint">
                {t(
                  "Replaces every whole-word match when reading aloud. Manage saved pronunciations in Settings.",
                )}
              </p>
            </form>
          </Section>
        )}
      </div>
    );
  }
  // The Voices page list: featured voice, previews, filters and deletion.
  function voiceLibrary() {
    const own =
      page === "reader" && book?.meta.uniqueVoice ? book.meta : undefined;
    return (
      <VoiceLibrary
        voices={voices}
        selected={own ? bookVoice(own, prefs) : prefs.voice}
        favorites={prefs.voiceFavorites}
        documentScope={Boolean(own)}
        status={startupSpeech}
        language={prefs.voiceLanguage}
        models={speechModels.models}
        model={prefs.speechModel || speechModels.default}
        portraitActive={covers.portraitActive}
        canPreview={player.status === "idle" && !studioBusy}
        onPreview={async (v) => {
          const result = await store.synthesize(
            previewLine(v),
            v.id,
            prefs.voiceTemperature,
            prefs.speechModel,
          );
          return "data:audio/wav;base64," + result.audio;
        }}
        onSelect={selectVoice}
        onFavorite={(id) =>
          patchPrefs({
            voiceFavorites: prefs.voiceFavorites.includes(id)
              ? prefs.voiceFavorites.filter((x) => x !== id)
              : [...prefs.voiceFavorites, id],
          })
        }
        onLanguage={(voiceLanguage) => patchPrefs({ voiceLanguage })}
        onPortrait={editPortrait}
        onRefresh={() => {
          void refreshVoices(true).catch(error);
        }}
        onDownloads={() => setVoiceDownloads(true)}
        onCreate={() => setVoiceSection("create")}
        onDelete={deleteVoices}
        extra={
          <Section
            id="voice-variation"
            title={t("Voice variation")}
            icon={<Sliders size={15} />}
            meta={prefs.voiceTemperature.toFixed(2)}
            defaultOpen={false}
          >
            {voiceVariation()}
          </Section>
        }
      />
    );
  }
  // Deletes voices, then moves the shared voice and favorites off them.
  async function deleteVoices(ids: string[]) {
    await player.stop();
    await store.deleteVoices(ids);
    const gone = new Set(ids);
    const available = await store.getVoices(prefRef.current.speechModel);
    setVoices(available);
    const patch: Partial<Preferences> = {
      voiceFavorites: prefRef.current.voiceFavorites.filter((v) => !gone.has(v)),
    };
    if (gone.has(prefRef.current.voice)) {
      const next = available.find((v) => v.available);
      if (next) {
        patch.voice = next.id;
        patch.lastVoice = next.id;
      }
    }
    patchPrefs(patch);
    notify(
      ids.length === 1
        ? t("Voice deleted.")
        : t("{count} voices deleted.", { count: ids.length }),
    );
  }
  function voicePanel(wide = false) {
    const own =
      page === "reader" && book?.meta.uniqueVoice ? book.meta : undefined;
    return (
      <VoiceCatalog
        headingLevel={wide ? 2 : 3}
        voices={voices}
        onPortrait={editPortrait}
        onRefresh={() => {
          void refreshVoices(true).catch(error);
        }}
        onDownloads={() => setVoiceDownloads(true)}
        portraitActive={covers.portraitActive}
        selected={own ? bookVoice(own, prefs) : prefs.voice}
        favorites={prefs.voiceFavorites}
        documentScope={Boolean(own)}
        onSelect={selectVoice}
        models={speechModels.models}
        model={prefs.speechModel || speechModels.default}
        language={prefs.voiceLanguage}
        onLanguage={(voiceLanguage) => patchPrefs({ voiceLanguage })}
        onFavorite={(id) =>
          patchPrefs({
            voiceFavorites: prefs.voiceFavorites.includes(id)
              ? prefs.voiceFavorites.filter((x) => x !== id)
              : [...prefs.voiceFavorites, id],
          })
        }
        status={startupSpeech}
        extra={
          <Section
            id="voice-variation"
            title={t("Voice variation")}
            icon={<Sliders size={15} />}
            meta={prefs.voiceTemperature.toFixed(2)}
            defaultOpen={false}
          >
            {voiceVariation()}
          </Section>
        }
      />
    );
  }
  // Model temperature, shown to readers as how much the delivery varies.
  function voiceVariation() {
    const temp = prefs.voiceTemperature;
    return (
      <div className="voice-variation">
        <label>
          {t("Voice variation")}{" "}
          <output>
            {temp.toFixed(2)}
            {temp === defaultPreferences.voiceTemperature ? " (default)" : ""}
          </output>
          <input
            aria-label={t("Voice variation")}
            aria-valuetext={t("Temperature {value}", {
              value: temp.toFixed(2),
            })}
            type="range"
            min="0.5"
            max="1.1"
            step="0.05"
            value={temp}
            onChange={(e) => patchPrefs({ voiceTemperature: +e.target.value })}
          />
          <span className="range-endpoints" aria-hidden="true">
            <span>{t("Steady")}</span>
            <span>{t("Expressive")}</span>
          </span>
        </label>
        <p className="hint">
          {t(
            "The model temperature. Lower values are calmer and more consistent; higher values are livelier but more likely to stumble. If a voice sounds flat, raise it slightly. Applies from the next sentence.",
          )}
        </p>
        {temp !== defaultPreferences.voiceTemperature && (
          <button
            className="text-button"
            onClick={() =>
              patchPrefs({
                voiceTemperature: defaultPreferences.voiceTemperature,
              })
            }
          >
            <RotateCcw size={13} />
            {t("Reset to {value}", {
              value: defaultPreferences.voiceTemperature,
            })}
          </button>
        )}
      </div>
    );
  }
  function addPronunciation(from: string, to: string, scope: string) {
    if (!from.trim() || !to.trim()) return;
    const bookId = scope === "book" ? bookRef.current?.meta.id : undefined;
    const rule: PronunciationRule = {
      id: crypto.randomUUID(),
      from: from.trim(),
      to: to.trim(),
      wholeWord: true,
      ...(bookId ? { bookId } : {}),
    };
    resumeVoice.current = false;
    void player.stop();
    patchPrefs({
      pronunciations: [
        ...prefs.pronunciations.filter(
          (r) =>
            !(
              r.from.toLowerCase() === rule.from.toLowerCase() &&
              r.bookId === rule.bookId
            ),
        ),
        rule,
      ],
    });
    setLexiconDraft((d) => ({ ...d, to: "" }));
    notify(
      bookId
        ? t("Pronunciation saved for this book.")
        : t("Pronunciation saved for all books."),
    );
  }
  function removePronunciation(id: string) {
    resumeVoice.current = false;
    void player.stop();
    patchPrefs({
      pronunciations: prefs.pronunciations.filter((r) => r.id !== id),
    });
  }
  async function previewText(text: string) {
    const current = bookRef.current;
    if (!current || !text.trim()) return;
    await covers.cancel();
    await voiceBarrier.current;
    resumeVoice.current = false;
    await player.start(
      current,
      current.meta.position,
      prefRef.current,
      () => {},
      text,
    );
  }
  async function saveDetails(form: FormData) {
    if (!book) return;
    const author = String(form.get("author") || "").trim() || "Unknown author";
    const genres = normalizeGenres(String(form.get("genres") || ""));
    const toAuthor = form.get("authorCollection") === "on";
    let collection =
      String(form.get("collection") || "").trim() || book.meta.collection;
    if (toAuthor)
      collection =
        namedCollections.find(
          (c) => c.toLocaleLowerCase() === author.toLocaleLowerCase(),
        ) || checkedCollectionName(author, namedCollections);
    await updateMeta({
      ...book.meta,
      title: String(form.get("title") || "").trim() || book.meta.title,
      author,
      genres,
      collection,
      language: String(form.get("language") ?? book.meta.language ?? ""),
    });
    if (toAuthor)
      patchPrefs({
        collections: [...new Set([...namedCollections, collection])],
      });
    notify(
      toAuthor
        ? t("Details saved. Document added to {destination}.", {
            destination: collection,
          })
        : t("Details saved."),
    );
  }
  function documentPanel() {
    if (!book)
      return (
        <div className="inspector-content">
          <p className="empty-copy">
            {t("Open a document to view its details.")}
          </p>
        </div>
      );
    const meta = book.meta;
    const voiceName =
      voices.find((v) => v.id === bookVoice(meta, prefs))?.name ||
      t("No voice selected");
    return (
      <div className="inspector-content">
        <div className="document-summary">
          <CoverControl
            book={meta}
            small
            onEdit={() => {
              void editCover(meta).catch(error);
            }}
            always
          />
          <div>
            <strong>{meta.title}</strong>
            <span>{meta.author}</span>
            <small>
              {t("{format} · {words} words · {time} listening", {
                format: meta.format,
                words: meta.wordCount.toLocaleString(),
                time: formatDuration(
                  listeningMinutes(meta.wordCount, prefs.speed),
                ),
              })}
            </small>
          </div>
        </div>
        {covers.active === meta.id && (
          <p className="hint" role="status">
            {t("Generating cover...")}
          </p>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={bookFinished(meta)}
            onChange={(e) => {
              void updateMeta({
                ...meta,
                finished: e.target.checked,
              }).catch(error);
            }}
          />
          {t("Finished reading")}
        </label>
        {bookAuthor && (
          <Section
            id="document-author"
            title={t("About the author")}
            icon={<Feather size={15} />}
            meta={bookAuthor.name}
          >
            {authorCard(bookAuthor)}
          </Section>
        )}
        <Section
          id="document-details"
          title={t("Details")}
          icon={<FileText size={15} />}
          meta={meta.collection}
        >
          <form
            key={
              meta.id +
              meta.author +
              meta.title +
              meta.collection +
              meta.language
            }
            className="details-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void saveDetails(data).catch(error);
            }}
          >
            <label>
              {t("Title")}
              <input name="title" defaultValue={meta.title} />
            </label>
            <label>
              {t("Author name")}
              <input
                name="author"
                aria-label={t("Author name")}
                defaultValue={meta.author}
                maxLength={200}
              />
            </label>
            <label className="check-label">
              <input name="authorCollection" type="checkbox" />
              {t("Create collection with author's name")}
            </label>
            <label>
              {t("Collection")}
              <select
                aria-label={t("Collection")}
                name="collection"
                defaultValue={meta.collection}
              >
                {[
                  ...new Set([
                    "Unsorted",
                    ...namedCollections,
                    meta.collection,
                  ]),
                ].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              {t("Language")}
              <select
                aria-label={t("Book language")}
                name="language"
                defaultValue={meta.language || ""}
              >
                <option value="">{t("Not set")}</option>
                {[
                  ...new Set([
                    ...bookLanguages,
                    ...(meta.language ? [meta.language] : []),
                  ]),
                ]
                  .map((code) => ({
                    code,
                    name: languageName(code, prefs.uiLanguage),
                  }))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(({ code, name }) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t("Genre tags")}
              <input
                name="genres"
                aria-label={t("Genre tags")}
                defaultValue={bookGenres(meta).join(", ")}
                maxLength={600}
                placeholder={t("Romance, Suspense")}
              />
            </label>
            <p className="hint">{t("Separate tags with commas.")}</p>
            <button type="submit" className="primary">
              {t("Save details")}
            </button>
          </form>
        </Section>
        <Section
          id="document-voice"
          title={t("Voice")}
          icon={<AudioLines size={15} />}
          meta={meta.uniqueVoice ? voiceName : t("Shared")}
          defaultOpen={false}
        >
          <label className="check-label">
            <input
              type="checkbox"
              checked={Boolean(meta.uniqueVoice)}
              onChange={(e) => {
                void setUniqueVoice(meta, e.target.checked).catch(error);
              }}
            />
            {t("Unique voice for this book")}
          </label>
          <p className="hint">
            {meta.uniqueVoice
              ? t(
                  "This book uses {name}. Choose its voice in the Voice tab. Switching to or from this book may take a moment longer to start.",
                  { name: voiceName },
                )
              : t(
                  "This book uses the shared voice, {name}. A unique voice may add loading time when you switch books.",
                  { name: voiceName },
                )}
          </p>
        </Section>
        <Section
          id="document-cover"
          title={t("Cover")}
          icon={<ImageIcon size={15} />}
          defaultOpen={false}
        >
          <button
            onClick={() => {
              void editCover(meta).catch(error);
            }}
          >
            <ImageIcon size={15} />
            {t("Change cover")}
          </button>
          <label>
            {t("Cover text")}
            <select
              aria-label={t("Document cover text")}
              value={meta.coverText || "auto"}
              onChange={(e) => {
                void updateMeta({
                  ...meta,
                  coverText: e.target.value as BookMeta["coverText"],
                }).catch(error);
              }}
            >
              <option value="auto">{t("Automatic")}</option>
              <option value="show">{t("Show title and author")}</option>
              <option value="hide">{t("Hide title and author")}</option>
            </select>
          </label>
          <p className="hint">
            {t("Automatic leaves imported artwork without added text.")}
          </p>
        </Section>
        <Section
          id="document-export"
          title={t("Export")}
          icon={<Download size={15} />}
          defaultOpen={false}
        >
          <button
            onClick={() => {
              void store
                .exportText(
                  meta.title + ".txt",
                  book.paragraphs.map((p) => p.text).join("\n\n"),
                )
                .catch(error);
            }}
          >
            <Download size={16} />
            {t("Export text")}
          </button>
          <dl>
            <dt>{t("Format")}</dt>
            <dd>{meta.format}</dd>
            <dt>{t("Words")}</dt>
            <dd>{meta.wordCount.toLocaleString()}</dd>
            <dt>{t("Paragraphs")}</dt>
            <dd>{meta.paragraphCount}</dd>
          </dl>
        </Section>
      </div>
    );
  }
  async function changeLanguage(code: string) {
    const loaded = await loadLanguage(code || detectLanguage());
    setUiLanguage(loaded);
    patchPrefs({ uiLanguage: code });
  }
  // Pay what you want: one polite request after a day of real use, never
  // shown to people who already support Origami or asked not to be asked.
  // Nothing in the app is ever locked behind a payment.
  const DAY = 86_400_000;
  const [supportNever, setSupportNever] = useState(false);
  const supportDue =
    ready &&
    prefs.supportPrompt !== "never" &&
    prefs.supportPromptAfter > 0 &&
    Date.now() > prefs.supportPromptAfter &&
    books.some((b) => b.opened > 0) &&
    !quick &&
    !showShortcuts &&
    !deleteCandidates.length;
  function closeSupport(choice: "later" | "supported" | "support") {
    patchPrefs(
      choice === "later" && !supportNever && prefs.supportPrompt === "ask"
        ? // Maybe later asks one last time, a month from now.
          { supportPrompt: "later", supportPromptAfter: Date.now() + 30 * DAY }
        : { supportPrompt: "never" },
    );
    setSupportNever(false);
  }
  function openSupport() {
    if (!links.support) {
      notify(
        "Thank you! The support page opens here once Origami Reader is publicly released.",
      );
      return;
    }
    void store.openExternalLink("support").catch(error);
  }
  function collectionRow(c: string) {
    const count = filteredBooks.filter((b) =>
      c === "Trash"
        ? b.deleted
        : !b.deleted &&
          (c === "All books" ||
            (c === "Favorites" ? b.favorite : b.collection === c)),
    ).length;
    const icon =
      c === "Trash" ? (
        <Trash2 size={15} />
      ) : c === "Favorites" ? (
        <Star size={15} />
      ) : c === "All books" ? (
        <BookOpen size={15} />
      ) : c === "Unsorted" ? (
        <FolderOpen size={15} />
      ) : (
        <span
          className={"collection-dot dot-" + (namedCollections.indexOf(c) % 6)}
        />
      );
    return (
      <div
        key={c}
        className={
          "collection-row" +
          (page === "library" && collection === c ? " selected" : "")
        }
      >
        <button
          className={page === "library" && collection === c ? "active" : ""}
          onClick={() => {
            setCollection(c);
            setPage("library");
            setSelected(new Set());
          }}
        >
          {icon}
          <span className="collection-title">
            {c === "All books"
              ? shelf === "documents"
                ? t("All documents")
                : t("All stories")
              : builtInCollections.includes(c)
                ? t(c)
                : c}
          </span>
          <span className="count">{count}</span>
        </button>
        {!builtInCollections.includes(c) && (
          <IconButton
            label={t("Delete collection {name}", { name: c })}
            disabled={collectionBusy}
            onClick={() => {
              void deleteCollection(c).catch(error);
            }}
          >
            <Trash2 size={14} />
          </IconButton>
        )}
      </div>
    );
  }
  // About the author, with one "did you know" fact at a time.
  const [factTurn, setFactTurn] = useState(() =>
    Math.floor(Date.now() / 86_400_000),
  );
  const latestAuthor = useAuthorNote(latest, prefs.uiLanguage);
  const bookAuthor = useAuthorNote(book?.meta, prefs.uiLanguage);
  function authorCard(note: AuthorNote | null) {
    if (!note) return null;
    const fact = note.facts[factTurn % note.facts.length];
    return (
      <aside className="author-note" aria-label={t("About the author")}>
        <div className="author-heading">
          {note.portrait ? (
            <img className="author-portrait" src={note.portrait} alt="" />
          ) : (
            <span
              className="author-portrait author-initials"
              aria-hidden="true"
            >
              {initials(note.name)}
            </span>
          )}
          <div>
            <strong>{note.name}</strong>
            {note.years && <span>{note.years}</span>}
          </div>
        </div>
        <p className="author-bio">{note.bio}</p>
        {fact && (
          <div className="author-fact">
            <span className="eyebrow">{t("Did you know?")}</span>
            <p>{fact}</p>
            {note.facts.length > 1 && (
              <button
                className="text-button"
                onClick={() => setFactTurn((n) => n + 1)}
              >
                {t("Another fact")}
              </button>
            )}
          </div>
        )}
        {(note.source || note.portraitCredit) && (
          <span className="author-source">
            {[note.source, note.portraitCredit].filter(Boolean).join(" · ")}
          </span>
        )}
      </aside>
    );
  }
  // Library card sizes, as steps so each size has exact styles.
  const cardSizes = [75, 90, 100, 115, 130];
  const cardSize = cardSizes.includes(prefs.libraryCardSize)
    ? prefs.libraryCardSize
    : 100;
  // A book's bookmarks as small colored chips that open the book there.
  function bookmarkChips(bookId: string, icons = false) {
    const marks = bookmarksByBook.get(bookId);
    if (!marks?.length) return null;
    const shown = marks.slice(0, icons ? 8 : 6);
    return (
      <div
        className={"bookmark-chips" + (icons ? " bookmark-icons" : "")}
        aria-label={t("Bookmarks")}
      >
        {shown.map((a) => {
          const label =
            a.group || a.quote.replace(/\s+/g, " ").trim().slice(0, 40);
          return (
            <button
              key={a.id}
              className="bookmark-chip"
              style={{
                ["--mark" as string]: annotationColors.find(
                  (c) => c.id === a.color,
                )?.value,
              }}
              title={icons ? undefined : a.quote}
              aria-label={t("Open bookmark: {label}", { label })}
              disabled={jumping}
              onClick={() => {
                void jumpAnnotation(a).catch(error);
              }}
            >
              <Bookmark size={icons ? 17 : 12} fill="currentColor" />
              <span className={icons ? "bookmark-tip" : undefined}>
                {label}
              </span>
            </button>
          );
        })}
        {marks.length > shown.length && (
          <span className="bookmark-more">
            {t("+{count} more", { count: marks.length - shown.length })}
          </span>
        )}
      </div>
    );
  }
  // Settings categories, shown one at a time. Every category stays in the
  // document (hidden) so search can find any setting and jump to it.
  const settingsCategories: {
    id: string;
    label: string;
    description: string;
    icon: ReactNode;
  }[] = [
    {
      id: "general",
      label: t("General"),
      description: t("Language and library storage."),
      icon: <SettingsIcon size={16} />,
    },
    {
      id: "appearance",
      label: t("Appearance"),
      description: t("Scenes, colors, text and pages."),
      icon: <Palette size={16} />,
    },
    {
      id: "listening",
      label: t("Reading aloud"),
      description: t("Pauses, what is skipped and pronunciation."),
      icon: <AudioLines size={16} />,
    },
    {
      id: "voices",
      label: t("Voices and speech"),
      description: t("Speech model, voice variation and startup voice."),
      icon: <Sliders size={16} />,
    },
    {
      id: "artwork",
      label: t("Cover art"),
      description: t("Generated covers and voice portraits."),
      icon: <ImageIcon size={16} />,
    },
    {
      id: "content",
      label: t("Saved artwork"),
      description: t(
        "Covers, portraits and voices: review, delete or open their folder.",
      ),
      icon: <FolderOpen size={16} />,
    },
    ...(store.vaultsAvailable
      ? [
          {
            id: "privacy",
            label: t("Vaults and parental PIN"),
            description: t(
              "PIN-locked vaults and the PIN that guards mature content.",
            ),
            icon: <Lock size={16} />,
          },
        ]
      : []),
    {
      id: "work",
      label: t("Work mode"),
      description: t("Study cards and related notes."),
      icon: <WorkIcon size={16} />,
    },
    {
      id: "models",
      label: t("Models"),
      description: t("Installed readers and image generators."),
      icon: <BrainCircuit size={16} />,
    },
    {
      id: "performance",
      label: t("Performance"),
      description: t("How Origami shares this computer with reading aloud."),
      icon: <Gauge size={16} />,
    },
    {
      id: "shortcuts",
      label: t("Keyboard shortcuts"),
      description: t("Press ? anywhere to see them."),
      icon: <Keyboard size={16} />,
    },
    {
      id: "about",
      label: t("About and support"),
      description: t("Privacy, licenses and supporting Origami."),
      icon: <Info size={16} />,
    },
  ];
  const settingsCategory = settingsCategories.some(
    (c) => c.id === prefs.settingsCategory,
  )
    ? prefs.settingsCategory
    : "general";
  function pickSetting(element: HTMLElement) {
    const category =
      element.closest<HTMLElement>("[data-category]")?.dataset.category;
    const sections = [
      ...(function* () {
        let node = element.closest<HTMLElement>("[data-section]");
        while (node) {
          yield node.dataset.section!;
          node =
            node.parentElement?.closest<HTMLElement>("[data-section]") ?? null;
        }
      })(),
    ];
    setPrefs((old) => ({
      ...old,
      settingsCategory: category || old.settingsCategory,
      openSections: {
        ...old.openSections,
        ...Object.fromEntries(sections.map((id) => [id, true])),
      },
    }));
    setSettingsQuery("");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        element.scrollIntoView({ block: "center" });
        element.classList.remove("setting-flash");
        void element.offsetWidth;
        element.classList.add("setting-flash");
        element
          .querySelector<HTMLElement>("input,select,button")
          ?.focus({ preventScroll: true });
      }),
    );
  }
  // Settings, Performance: run the hardware check again and always say what
  // happened, including when the computer will not report its hardware.
  const [hardwareCheck, setHardwareCheck] = useState({
    busy: false,
    note: "",
    failed: false,
  });
  async function checkHardware() {
    setHardwareCheck({ busy: true, note: "", failed: false });
    try {
      const profile = await Promise.race([
        store.systemProfile(),
        new Promise<never>((_, reject) => setTimeout(() => reject(0), 20_000)),
      ]);
      if (!profile) {
        setHardwareCheck({
          busy: false,
          note: t("Hardware checks are available in the desktop app."),
          failed: true,
        });
        return;
      }
      const check = hardwareDefaults(profile).hardware!;
      patchPrefs({ hardware: check });
      setHardwareCheck(
        check.detected
          ? {
              busy: false,
              note: t("Checked just now: {summary}.", {
                summary: check.summary,
              }),
              failed: false,
            }
          : {
              busy: false,
              note: t(
                "Origami could not read the graphics card or memory. This can happen with some security software, virtual machines or remote desktops. Your settings were not changed.",
              ),
              failed: true,
            },
      );
    } catch {
      setHardwareCheck({
        busy: false,
        note: t(
          "The hardware check did not finish. Origami keeps its current settings, and reading aloud is not affected. Try again later, or choose settings yourself below.",
        ),
        failed: true,
      });
    }
  }
  // Settings > Saved artwork: every cover and portrait in one place.
  const [coverFilter, setCoverFilter] = useState<
    "all" | "generated" | "custom" | "imported"
  >("all");
  function coverSource(meta: BookMeta) {
    return meta.coverOrigin === "generated"
      ? "generated"
      : meta.coverOrigin === "custom"
        ? "custom"
        : "imported";
  }
  function workSettings() {
    return (
      <div className="inspector-content">
        <Section id="settings-work-space" title={t("Workspace")}>
          <label>
            {t("Workspace theme")}
            <select value={prefs.workTheme} onChange={(e) => patchPrefs({ workTheme: e.target.value })}>
              <option value="reading">{t("Reading room")}</option>
              <option value="light">{t("Professional light")}</option>
              <option value="dark">{t("Professional dark")}</option>
            </select>
          </label>
          <p className="hint">
            {t("Reading room keeps your scene and colours. The professional themes are plain, dense and quiet, for work.")}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={prefs.workSources !== "all"}
              onChange={(e) => patchPrefs({ workSources: e.target.checked ? "work" : "all" })}
            />
            {t("Keep leisure reading out of Work mode")}
          </label>
          <p className="hint">
            {t("Only documents imported in Work mode, or books marked “Use in Work mode” from their menu, appear as sources and feed the Inbox and Related.")}
          </p>
          <label className="check-label">
            <input type="checkbox" checked={prefs.workTips} onChange={(e) => patchPrefs({ workTips: e.target.checked })} />
            {t("Show “Did you know?” tips now and then")}
          </label>
          <label className="check-label">
            <input type="checkbox" checked={prefs.onlineEmbeds} onChange={(e) => patchPrefs({ onlineEmbeds: e.target.checked })} />
            {t("Allow online embeds in notes (videos, posts, maps)")}
          </label>
          <p className="hint">
            {t("Embeds load from their own services and need an internet connection; those services see your IP address and may use cookies. When off, embeds show as links. Nothing else goes online.")}
          </p>
        </Section>
        <Section id="settings-work-study" title={t("Study cards")}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={prefs.studyFourButtons}
              onChange={(e) => patchPrefs({ studyFourButtons: e.target.checked })}
            />
            {t("Four answer buttons (Forgot, Hard, Good, Easy)")}
          </label>
          <p className="hint">
            {t("Off, studying asks only Forgot or Got it. Both schedule cards with FSRS, so they return right before you would forget them.")}
          </p>
          <label>
            {t("New cards per day")}
            <input
              aria-label={t("New cards per day")}
              type="number"
              min="0"
              max="200"
              step="1"
              value={prefs.studyNewPerDay}
              onChange={(e) =>
                patchPrefs({
                  studyNewPerDay: Math.max(0, Math.min(200, Math.round(Number(e.target.value) || 0))),
                })
              }
            />
          </label>
        </Section>
        <Section id="settings-work-connections" title={t("Related notes")}>
          <p className="hint">
            {t("The Connections panel suggests related notes and highlights. It never links anything by itself, and nothing leaves this computer.")}
          </p>
          <ConnectionsSettings
            value={prefs.connectionsModel}
            onChange={(connectionsModel) => patchPrefs({ connectionsModel })}
            notify={notify}
          />
          <p className="hint">
            {t("Both are IBM Granite Embedding models, Apache 2.0 licensed, downloaded from Hugging Face only when you choose and checked before use. They run on the processor, so reading aloud and artwork keep the graphics card.")}
          </p>
        </Section>
        <Section id="settings-work-handwriting" title={t("Handwriting")} defaultOpen={false}>
          <HandwritingSettings notify={notify} />
        </Section>
        <Section id="settings-work-voice" title={t("Voice notes")} defaultOpen={false}>
          <VoiceSettings notify={notify} />
        </Section>
        <Section id="settings-work-plugins" title={t("Plugins")} defaultOpen={false}>
          <PluginSettings
            prefs={prefs.plugins}
            allOff={prefs.pluginsOff}
            onPrefs={(plugins) => patchPrefs({ plugins })}
            onAllOff={(pluginsOff) => patchPrefs({ pluginsOff })}
            onError={error}
          />
        </Section>
      </div>
    );
  }
  function privacySettings() {
    const forgetNote = t(
      "Origami keeps no copy of PINs and cannot reset them. If a vault PIN is forgotten, its contents may be impossible to recover.",
    );
    return (
      <div className="inspector-content">
        <Section
          id="settings-parental-pin"
          title={t("Parental PIN")}
          meta={parentalSet ? t("On") : t("Off")}
        >
          <p className="hint">
            {t(
              "When set, turning on mature cover artwork (NSFW) asks for this PIN.",
            )}
          </p>
          <div className="button-row">
            {parentalSet ? (
              <>
                <button
                  onClick={() =>
                    setPinRequest({
                      title: t("Change the parental PIN"),
                      mode: "change",
                      submit: t("Change PIN"),
                      run: async ({ current, pin }) => {
                        await store.setParentalPin(current, pin);
                        await refreshVaults();
                        notify(t("Parental PIN changed."));
                      },
                    })
                  }
                >
                  {t("Change PIN")}
                </button>
                <button
                  onClick={() =>
                    setPinRequest({
                      title: t("Remove the parental PIN"),
                      body: t(
                        "Mature cover artwork can then be turned on without a PIN.",
                      ),
                      mode: "enter",
                      submit: t("Remove PIN"),
                      run: async ({ pin }) => {
                        await store.setParentalPin(pin, null);
                        await refreshVaults();
                        notify(t("Parental PIN removed."));
                      },
                    })
                  }
                >
                  {t("Remove PIN")}
                </button>
              </>
            ) : (
              <button
                onClick={() =>
                  setPinRequest({
                    title: t("Set a parental PIN"),
                    mode: "create",
                    submit: t("Set PIN"),
                    run: async ({ pin }) => {
                      await store.setParentalPin("", pin);
                      // Mature artwork starts off behind the new PIN.
                      if (prefs.allowMatureCovers) setMatureCovers(false);
                      await refreshVaults();
                      notify(t("Parental PIN set."));
                    },
                  })
                }
              >
                {t("Set parental PIN")}
              </button>
            )}
          </div>
        </Section>
        <Section
          id="settings-vaults"
          title={t("Vaults")}
          meta={vaults.length ? String(vaults.length) : undefined}
        >
          <p className="hint">
            {t(
              "Vaults hold books and documents behind a PIN of 4 to 8 digits. Their text, details and notes are encrypted on this computer, and every vault locks again when you leave it or close Origami.",
            )}{" "}
            {forgetNote}
          </p>
          <label>
            {t("Lock open vaults after inactivity")}
            <select
              value={prefs.vaultIdleMinutes}
              onChange={(e) =>
                patchPrefs({ vaultIdleMinutes: Number(e.target.value) })
              }
            >
              {[1, 5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m === 1
                    ? t("1 minute")
                    : t("{count} minutes", { count: m })}
                </option>
              ))}
              <option value={0}>{t("Never (only when leaving or closing)")}</option>
            </select>
          </label>
          <div className="vault-list">
            {vaults.map((v) => (
              <div className="vault-item" key={v.id}>
                {v.unlocked ? <LockOpen size={16} /> : <Lock size={16} />}
                <strong>{v.name}</strong>
                <button
                  onClick={() =>
                    setPinRequest({
                      title: t("Rename {name}", { name: v.name }),
                      mode: "enter",
                      name: v.name,
                      submit: t("Rename"),
                      run: async ({ name, pin }) => {
                        await store.unlockVault(v.id, pin);
                        await store.renameVault(v.id, name);
                        if (vaultView !== v.id) await store.lockVault(v.id);
                        await reloadPrivate();
                      },
                    })
                  }
                >
                  {t("Rename")}
                </button>
                <button
                  onClick={() =>
                    setPinRequest({
                      title: t("Change the PIN of {name}", { name: v.name }),
                      body: forgetNote,
                      mode: "change",
                      submit: t("Change PIN"),
                      run: async ({ current, pin }) => {
                        await store.changeVaultPin(v.id, current, pin);
                        if (vaultView !== v.id) await store.lockVault(v.id);
                        await reloadPrivate();
                        notify(t("Vault PIN changed."));
                      },
                    })
                  }
                >
                  {t("Change PIN")}
                </button>
                <button
                  onClick={() =>
                    setPinRequest({
                      title: t("Delete {name}?", { name: v.name }),
                      body: t(
                        "The vault is removed and the books in it return to your library, readable by anyone using Origami. To remove the books too, delete them inside the vault first.",
                      ),
                      mode: "enter",
                      submit: t("Delete vault"),
                      run: async ({ pin }) => {
                        await closeVaultBook(v.id);
                        const ids = await store.deleteVault(v.id, pin);
                        if (vaultView === v.id) setCollection("All books");
                        await reloadPrivate();
                        notify(
                          t("Vault deleted. {count} returned to the library.", {
                            count: ids.length,
                          }),
                        );
                      },
                    })
                  }
                >
                  {t("Delete vault")}
                </button>
              </div>
            ))}
          </div>
          <div className="button-row">
            <button onClick={startVault}>
              <VaultIcon size={15} />
              {t("Create a vault")}
            </button>
            {vaults.some((v) => v.unlocked) && (
              <button
                onClick={() => {
                  if (vaultView) setCollection("All books");
                  void lockVaults().catch(error);
                }}
              >
                <Lock size={15} />
                {t("Lock all vaults")}
              </button>
            )}
          </div>
        </Section>
      </div>
    );
  }
  function savedContent() {
    const withCovers = books.filter(
      (b) => b.coverImage && !b.deleted && !b.vault,
    );
    const shownCovers = withCovers.filter(
      (b) => coverFilter === "all" || coverSource(b) === coverFilter,
    );
    const generatedCovers = withCovers.filter(
      (b) => coverSource(b) === "generated",
    );
    const portraits = voices.filter((v) => v.portrait);
    const generatedPortraits = portraits.filter(
      (v) => v.portraitOrigin === "generated",
    );
    const sourceLabel = {
      generated: t("Generated"),
      custom: t("Your image"),
      imported: t("From the book"),
    };
    return (
      <div className="inspector-content">
        <Section
          id="settings-saved-covers"
          title={t("Book covers")}
          meta={String(withCovers.length)}
        >
          <div className="saved-art-toolbar">
            <label>
              {t("Show")}
              <select
                value={coverFilter}
                onChange={(e) =>
                  setCoverFilter(e.target.value as typeof coverFilter)
                }
              >
                <option value="all">{t("All covers")}</option>
                <option value="generated">{t("Generated")}</option>
                <option value="custom">{t("Your image")}</option>
                <option value="imported">{t("From the book")}</option>
              </select>
            </label>
            <button
              disabled={!generatedCovers.length}
              onClick={() => {
                if (
                  !window.confirm(
                    t(
                      "Delete all {count} generated covers? Those books go back to the plain cover, and automatic artwork will not replace them.",
                      { count: generatedCovers.length },
                    ),
                  )
                )
                  return;
                void (async () => {
                  for (const b of generatedCovers) await deleteCover(b);
                  notify(t("Generated covers deleted."));
                })().catch(error);
              }}
            >
              <Trash2 size={15} />
              {t("Delete generated covers")}
            </button>
          </div>
          {shownCovers.length ? (
            <ul className="saved-art-grid">
              {shownCovers.map((b) => (
                <li key={b.id}>
                  <Cover book={b} small />
                  <span className="saved-art-name" title={b.title}>
                    {b.title}
                  </span>
                  <span className="hint">{sourceLabel[coverSource(b)]}</span>
                  <button
                    className="icon-button"
                    aria-label={t("Delete cover for {title}", {
                      title: b.title,
                    })}
                    title={t("Delete cover")}
                    onClick={() => {
                      void deleteCover(b)
                        .then(() =>
                          notify(
                            t("Cover deleted for {title}.", { title: b.title }),
                          ),
                        )
                        .catch(error);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">{t("No covers to show.")}</p>
          )}
        </Section>
        <Section
          id="settings-saved-portraits"
          title={t("Voice portraits")}
          meta={String(portraits.length)}
        >
          {store.desktop ? (
            <>
              <div className="saved-art-toolbar">
                <button
                  disabled={!generatedPortraits.length}
                  onClick={() => {
                    if (
                      !window.confirm(
                        t(
                          "Delete all {count} generated voice portraits? Automatic artwork will not replace them.",
                          { count: generatedPortraits.length },
                        ),
                      )
                    )
                      return;
                    void (async () => {
                      for (const v of generatedPortraits)
                        await deletePortrait(v);
                      notify(t("Generated portraits deleted."));
                    })().catch(error);
                  }}
                >
                  <Trash2 size={15} />
                  {t("Delete generated portraits")}
                </button>
              </div>
              {portraits.length ? (
                <ul className="saved-art-grid portraits">
                  {portraits.map((v) => (
                    <li key={v.id}>
                      <img className="saved-portrait" src={v.portrait} alt="" />
                      <span className="saved-art-name">{v.name}</span>
                      <span className="hint">
                        {v.portraitOrigin === "custom"
                          ? t("Your image")
                          : t("Generated")}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={t("Delete portrait for {name}", {
                          name: v.name,
                        })}
                        title={t("Delete portrait")}
                        onClick={() => {
                          void deletePortrait(v)
                            .then(() =>
                              notify(
                                t("Portrait deleted for {name}.", {
                                  name: v.name,
                                }),
                              ),
                            )
                            .catch(error);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">{t("No voice portraits yet.")}</p>
              )}
            </>
          ) : (
            <p className="hint">
              {t("Voice portraits are available in the desktop app.")}
            </p>
          )}
        </Section>
        <Section id="settings-saved-voices" title={t("Created voices")}>
          <p className="empty-copy">
            {t(
              "Voices you create will appear here, ready to rename or delete. Creating voices is coming in a later update.",
            )}
          </p>
          <button onClick={() => setVoiceDownloads(true)}>
            <Download size={15} />
            {t("Download voices")}
          </button>
        </Section>
        {store.desktop && (
          <Section
            id="settings-artwork-folder"
            title={t("Files on this computer")}
          >
            <p className="hint">
              {t(
                "Opens a folder with a copy of every cover and portrait as an image file. The copies are refreshed each time; deleting or editing them does not change the app.",
              )}
            </p>
            <button
              onClick={() => {
                void openArtworkFolder().catch(error);
              }}
            >
              <FolderOpen size={15} />
              {t("Open artwork folder")}
            </button>
          </Section>
        )}
      </div>
    );
  }
  function settingsPage() {
    const hardware = prefs.hardware;
    const currentModel =
      speechModels.models.find(
        (m) => m.id === (prefs.speechModel || speechModels.default),
      ) || speechModels.models[0];
    return (
      <>
        <div className="page-heading settings-heading">
          <div>
            <span className="eyebrow">
              {t("Origami {version}", { version: VERSION })}
            </span>
            <h1>{t("Settings")}</h1>
          </div>
          <div className="search-field settings-search">
            <Search size={16} />
            <input
              aria-label={t("Search settings")}
              placeholder={t("Search settings")}
              value={settingsQuery}
              onChange={(e) => setSettingsQuery(e.target.value)}
            />
            {settingsQuery.trim() && (
              <SettingsMatches query={settingsQuery} onPick={pickSetting} />
            )}
          </div>
        </div>
        <div
          className={
            "settings-layout" +
            (settingsCategory === "models" ? " settings-models" : "")
          }
        >
          <nav className="settings-nav" aria-label={t("Settings sections")}>
            {settingsCategories.map((c) => (
              <button
                key={c.id}
                aria-current={settingsCategory === c.id ? "page" : undefined}
                className={settingsCategory === c.id ? "active" : ""}
                onClick={() => patchPrefs({ settingsCategory: c.id })}
              >
                {c.icon}
                <span>{c.label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-grid">
            {settingsCategories.map((c) => (
              <div
                key={c.id}
                className="settings-category"
                data-category={c.id}
                hidden={settingsCategory !== c.id}
              >
                <header className="settings-category-header">
                  <h2>{c.label}</h2>
                  <p>{c.description}</p>
                </header>
                <SectionLevel value={3}>
                  {settingsContent(c.id, hardware, currentModel)}
                </SectionLevel>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }
  function settingsContent(
    category: string,
    hardware: Preferences["hardware"],
    currentModel: store.ModelVersion | undefined,
  ): ReactNode {
    if (category === "models")
      return (
        <ModelManager
          reader={prefs.speechModel || speechModels.default}
          image={prefs.imageModel || covers.defaultModel}
          onSelect={async (kind, id) => {
            if (kind === "reader") await chooseSpeechModel(id);
            else {
              covers.cancel();
              patchPrefs({ imageModel: id });
            }
          }}
          beforeChange={async () => {
            covers.cancel();
            await player.unload();
          }}
          onChanged={refreshModels}
        />
      );
    if (category === "general")
      return (
        <div className="inspector-content">
          <Section id="settings-language" title={t("Interface language")}>
            <div className="settings-language">
              <LanguagePicker
                value={prefs.uiLanguage}
                onChange={(code) => void changeLanguage(code)}
              />
              <p className="hint">
                {t(
                  "Changes menus and messages. Books and voices keep their own language.",
                )}
              </p>
            </div>
          </Section>
          <Section id="settings-reading" title={t("While reading")}>
            <div className="setting-check">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.selectionOpensTab}
                  onChange={(e) =>
                    patchPrefs({ selectionOpensTab: e.target.checked })
                  }
                />
                {t("Show selection tools when I select text")}
              </label>
              <p className="hint">
                {t(
                  "Switches the inspector to the Selection tab. Turn off to keep the current tab open.",
                )}
              </p>
            </div>
          </Section>
          <Section id="settings-trash" title={t("Trash retention")}>
            <form
              className="author-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const days = validateTrashDays(
                    trashModeDraft === "forever"
                      ? null
                      : Number(trashDaysDraft),
                  );
                  patchPrefs({ trashRetentionDays: days });
                  notify(t("Trash retention saved."));
                } catch (e) {
                  error(e);
                }
              }}
            >
              <label>
                {t("Keep trashed items")}
                <select
                  aria-label={t("Trash retention")}
                  value={trashModeDraft}
                  onChange={(e) => setTrashModeDraft(e.target.value)}
                >
                  <option value="forever">{t("Keep indefinitely")}</option>
                  <option value="days">
                    {t("Purge after a number of days")}
                  </option>
                </select>
              </label>
              {trashModeDraft === "days" && (
                <label>
                  {t("Days in Trash")}
                  <input
                    aria-label={t("Days in Trash")}
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    value={trashDaysDraft}
                    onChange={(e) => setTrashDaysDraft(e.target.value)}
                  />
                </label>
              )}
              <p className="hint">
                {t(
                  "Purging permanently removes expired books and their notes. Saved exports are never touched.",
                )}
              </p>
              <button type="submit">{t("Save Trash settings")}</button>
            </form>
          </Section>
          <p className="hint settings-footnote">
            {store.desktop
              ? t(
                  "Library data, notes and preferences are stored in Origami’s own local SQLite database.",
                )
              : t(
                  "Library data, notes and preferences are stored in this browser’s IndexedDB storage.",
                )}
          </p>
        </div>
      );
    if (category === "appearance")
      return (
        <div id="settings-appearance" className="settings-anchor">
          <AppearancePanel
            prefs={prefs}
            autoScale={autoScale}
            onChange={patchPrefs}
            scope="settings"
          />
          <div className="inspector-content">
            <Section id="settings-library-theme" title={t("Library theme")}>
              <p className="hint">
                {t(
                  "How your library looks. 3D rooms show your books on real shelves, with the light following day and night.",
                )}
              </p>
              <LibraryThemePicker
                value={currentLibraryTheme.id}
                night={sceneTime(prefs.scene) === "night"}
                onChange={(id) => patchPrefs({ libraryTheme: id })}
              />
            </Section>
          </div>
        </div>
      );
    if (category === "listening")
      return (
        <div className="inspector-content">
          <Section id="settings-pauses" title={t("Pauses")}>
            {(
              [
                ["sentencePause", "Between sentences", 0, 800],
                ["paragraphPause", "Between paragraphs", 0, 2000],
                ["headingPause", "After headings", 0, 3000],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {t(label)}{" "}
                <output>
                  {prefs[key]} {t("ms")}
                </output>
                <input
                  aria-label={t("{label} pause", { label: t(label) })}
                  type="range"
                  min={min}
                  max={max}
                  step="50"
                  value={prefs[key]}
                  onChange={(e) => patchPrefs({ [key]: +e.target.value })}
                />
              </label>
            ))}
            <p className="hint">
              {t(
                "Added silence, shortened at faster speeds. Applies from the next sentence.",
              )}
            </p>
          </Section>
          <Section id="settings-skip" title={t("Skip while reading aloud")}>
            {(
              [
                [
                  "skipCitations",
                  "Footnote markers and numbered citations",
                  "For example [12], [3-5], superscript numbers and † ‡ after a word.",
                ],
                [
                  "skipAuthorYear",
                  "Author-year citations",
                  "For example (Smith 2020) or (Lee and Park, 2019, p. 4). Useful for papers.",
                ],
                [
                  "skipSpeechMarkup",
                  "Skip links, markup and decorative symbols",
                  "Keeps link labels, skips web addresses, code and formatting.",
                ],
                [
                  "romanNumeralHeadings",
                  "Read Roman numerals as numbers in headings",
                  "For example, Chapter XVI is read as Chapter 16.",
                ],
              ] as const
            ).map(([key, label, hint]) => (
              <div className="setting-check" key={key}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={
                      key === "skipSpeechMarkup"
                        ? prefs.skipSpeechMarkup !== false
                        : prefs[key]
                    }
                    onChange={(e) => {
                      resumeVoice.current = false;
                      void player.stop();
                      patchPrefs({ [key]: e.target.checked });
                    }}
                  />
                  {t(label)}
                </label>
                <p className="hint">{t(hint)}</p>
              </div>
            ))}
          </Section>
          <Section
            id="settings-pronunciation"
            title={t("Pronunciation")}
            meta={prefs.pronunciations.length || undefined}
          >
            <p className="hint">
              {t(
                "Select a word in a book to add one from the Selection tab, or add one here.",
              )}
            </p>
            <form
              className="lexicon-add"
              onSubmit={(e) => {
                e.preventDefault();
                addPronunciation(lexiconDraft.from, lexiconDraft.to, "all");
                setLexiconDraft((d) => ({ ...d, from: "" }));
              }}
            >
              <input
                aria-label={t("Word or name")}
                placeholder={t("Word or name")}
                value={lexiconDraft.from}
                onChange={(e) =>
                  setLexiconDraft((d) => ({ ...d, from: e.target.value }))
                }
              />
              <input
                aria-label={t("Say it as")}
                placeholder={t("Say it as")}
                value={lexiconDraft.to}
                onChange={(e) =>
                  setLexiconDraft((d) => ({ ...d, to: e.target.value }))
                }
              />
              <button
                type="submit"
                disabled={!lexiconDraft.from.trim() || !lexiconDraft.to.trim()}
              >
                <Plus size={15} />
                {t("Add")}
              </button>
            </form>
            {prefs.pronunciations.length ? (
              <ul className="lexicon-list">
                {prefs.pronunciations.map((rule) => (
                  <li key={rule.id}>
                    <span>
                      <strong>{rule.from}</strong> → {rule.to}
                    </span>
                    <small>
                      {rule.bookId
                        ? books.find((b) => b.id === rule.bookId)?.title ||
                          t("One book")
                        : t("All books")}
                    </small>
                    <IconButton
                      label={t("Hear {to}", { to: rule.to })}
                      disabled={!book}
                      onClick={() => {
                        void previewText(rule.to).catch(error);
                      }}
                    >
                      <Play size={14} />
                    </IconButton>
                    <IconButton
                      label={t("Remove pronunciation for {from}", {
                        from: rule.from,
                      })}
                      onClick={() => removePronunciation(rule.id)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">{t("No saved pronunciations yet.")}</p>
            )}
          </Section>
        </div>
      );
    if (category === "voices")
      return (
        <div className="inspector-content">
          <Section
            id="settings-speech-model"
            title={t("Speech model")}
            meta={currentModel?.name}
          >
            {speechModels.models.length > 1 ? (
              <label>
                {t("Model version")}
                <select
                  aria-label={t("Speech model version")}
                  value={prefs.speechModel || speechModels.default}
                  onChange={(e) => chooseSpeechModel(e.target.value)}
                >
                  {speechModels.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.id === speechModels.default
                        ? " " + t("(default)")
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="setting-value">
                {currentModel?.name ||
                  (store.desktop
                    ? t("No speech model is installed.")
                    : t("Speech runs in the desktop app."))}
              </p>
            )}
            {currentModel?.description && (
              <p className="hint">{currentModel.description}</p>
            )}
            <p className="hint">
              {t(
                "Larger models sound more natural and need a stronger graphics card. Lighter models start and speak faster on laptops. Extra versions can be added with the installer.",
              )}
            </p>
          </Section>
          <Section
            id="settings-voice-variation"
            title={t("Voice variation")}
            meta={prefs.voiceTemperature.toFixed(2)}
          >
            {voiceVariation()}
          </Section>
          <Section id="settings-startup-voice" title={t("Startup voice")}>
            <label className="check-label">
              <input
                type="checkbox"
                checked={prefs.randomVoiceAtStartup}
                onChange={(e) =>
                  patchPrefs({ randomVoiceAtStartup: e.target.checked })
                }
              />
              {t("Randomize voice at startup")}
            </label>
            <label>
              {t("Startup voice language")}
              <select
                aria-label={t("Startup voice language")}
                value={prefs.voiceLanguage}
                onChange={(e) => patchPrefs({ voiceLanguage: e.target.value })}
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
              {t(
                "Picks a different installed voice in this language each time Origami opens.",
              )}
            </p>
          </Section>
        </div>
      );
    if (category === "artwork")
      return (
        <div className="inspector-content">
          <Section id="settings-auto-art" title={t("Automatic artwork")}>
            {hardware && hardware.tier !== "high" && (
              <p className="setting-note">
                <Gauge size={15} />
                {t(
                  "Off by default on this computer, so artwork never slows down reading aloud. You can still create covers and portraits yourself.",
                )}
              </p>
            )}
            <div className="setting-check">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.autoGenerateCovers}
                  onChange={(e) =>
                    patchPrefs({ autoGenerateCovers: e.target.checked })
                  }
                />
                {t("Generate missing covers automatically")}
              </label>
              <p className="hint">
                {t(
                  "For new imports without a cover. Runs while playback is stopped.",
                )}
              </p>
            </div>
            <div className="setting-check">
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
                {t("Generate missing voice portraits automatically")}
              </label>
              <p className="hint">
                {t(
                  "While the voice list is open and playback is stopped. Chosen images are kept.",
                )}
              </p>
            </div>
          </Section>
          <Section id="settings-cover-style" title={t("Cover style")}>
            <div className="setting-check">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.showCoverText}
                  onChange={(e) =>
                    patchPrefs({ showCoverText: e.target.checked })
                  }
                />
                {t("Show title and author on covers")}
              </label>
              <p className="hint">
                {t(
                  "Turn off to hide all text added by Origami. Each book can override this in its details.",
                )}
              </p>
            </div>
            <div className="setting-check">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.allowMatureCovers}
                  onChange={(e) => setMatureCovers(e.target.checked)}
                />
                {t("Allow mature cover artwork (NSFW)")}
                {parentalSet && <Lock size={13} aria-label={t("Needs the parental PIN")} />}
              </label>
              <p className="hint">
                {t(
                  "Off by default. Allows adult themes with non-explicit imagery. Starter-library covers always use standard mode.",
                )}
              </p>
            </div>
          </Section>
          <Section
            id="settings-image-model"
            title={t("Image model")}
            meta={covers.installed ? covers.engine.name : t("Not installed")}
          >
            {covers.models.length > 1 && (
              <label>
                {t("Model version")}
                <select
                  aria-label={t("Image model version")}
                  value={prefs.imageModel}
                  onChange={(e) => {
                    void covers.cancel();
                    patchPrefs({ imageModel: e.target.value });
                  }}
                >
                  <option value="">{t("Default")}</option>
                  {covers.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="hint">
              {covers.installed
                ? t("{name} is installed.", { name: covers.engine.name })
                : t(
                    "Cover engine setup is required for local generation. See docs/COVER-GENERATION.md.",
                  )}{" "}
              {covers.engine.attribution}
            </p>
          </Section>
        </div>
      );
    if (category === "content") return savedContent();
    if (category === "privacy") return privacySettings();
    if (category === "work") return workSettings();
    if (category === "performance")
      return (
        <div className="inspector-content">
          <Section id="settings-computer" title={t("This computer")}>
            {hardware && hardware.detected === false ? (
              <>
                <p className="setting-value">
                  <Cpu size={16} />
                  {t("Hardware details unavailable")}
                </p>
                <p className="hint">
                  {t(
                    "This computer did not report its graphics card or memory, so Origami uses safe settings: reading aloud works as usual and artwork is created only when you ask. If the computer has a strong NVIDIA graphics card, you can turn automatic artwork on in Cover art.",
                  )}
                </p>
              </>
            ) : hardware ? (
              <>
                <p className="setting-value">
                  <Cpu size={16} />
                  {hardware.summary || t("Unknown hardware")}
                </p>
                <p className="hint">
                  {hardware.tier === "high"
                    ? t(
                        "Plenty of graphics memory: reading aloud and artwork can run side by side.",
                      )
                    : hardware.tier === "standard"
                      ? t(
                          "Good for reading aloud. Artwork is created on request so it never slows narration.",
                        )
                      : t(
                          "Reading aloud runs on the processor or a small graphics card. Artwork is created on request, and a lighter speech model helps if one is installed.",
                        )}
                </p>
              </>
            ) : (
              <p className="hint">
                {store.desktop
                  ? t("Not checked yet.")
                  : t("Available in the desktop app.")}
              </p>
            )}
            <div className="button-row">
              <button
                disabled={!store.desktop || hardwareCheck.busy}
                onClick={() => void checkHardware()}
              >
                {hardwareCheck.busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <RotateCcw size={15} />
                )}
                {hardwareCheck.busy ? t("Checking...") : t("Check again")}
              </button>
              {hardware && (
                <button
                  onClick={() => {
                    patchPrefs(recommendedSettings(hardware.tier));
                    notify(t("Recommended settings applied."));
                  }}
                >
                  <Check size={15} />
                  {t("Use recommended settings")}
                </button>
              )}
            </div>
            {hardwareCheck.note && (
              <p
                className={
                  "hint" + (hardwareCheck.failed ? " setting-warning" : "")
                }
                role="status"
              >
                {hardwareCheck.note}
              </p>
            )}
            <p className="hint">
              {t(
                "Checked locally from the graphics card and memory. Nothing is sent anywhere.",
              )}
            </p>
          </Section>
          <Section id="settings-speech-loading" title={t("Speech loading")}>
            <div className="setting-check">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.preloadAtStartup}
                  onChange={(e) =>
                    patchPrefs({ preloadAtStartup: e.target.checked })
                  }
                />
                {t("Load the voice when Origami opens")}
              </label>
              <p className="hint">
                {t(
                  "The first Play starts sooner. Changing books keeps the loaded voice. Closing Origami releases it.",
                )}
              </p>
              {startupSpeech && (
                <p className="hint" role="status">
                  {startupSpeech}
                </p>
              )}
            </div>
            <div className="setting-check">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.keepSpeechDuringArt}
                  onChange={(e) =>
                    patchPrefs({ keepSpeechDuringArt: e.target.checked })
                  }
                />
                {t("Keep the voice loaded while artwork is created")}
              </label>
              <p className="hint">
                {t(
                  "Needs a graphics card with about 12 GB of memory or more. When off, the voice reloads after artwork finishes.",
                )}
              </p>
            </div>
          </Section>
        </div>
      );
    if (category === "shortcuts")
      return (
        <div className="inspector-content">
          <ShortcutList />
        </div>
      );
    return (
      <div className="inspector-content">
        {PRIVATE_BETA && (
          <section className="beta-notice" aria-labelledby="beta-title">
            <h4 id="beta-title">{t("Private beta")}</h4>
            <p>
              {t(
                "This early version was shared privately with trusted testers and is not for redistribution. If you received it from anywhere else, it may have been modified, so please delete it.",
              )}
            </p>
            <p className="hint">
              {t("Version {version}, built {date}.", {
                version: VERSION,
                date: BUILD_DATE,
              })}
            </p>
          </section>
        )}
        <Section id="settings-updates" title={t("Updates")}>
          <UpdatesPanel version={VERSION} auto={prefs.autoUpdate} onAuto={(autoUpdate) => patchPrefs({ autoUpdate })} />
        </Section>
        <section className="donate-card" aria-labelledby="donate-title">
          <div className="donate-crane" aria-hidden="true">
            <img src="/crane.png" alt="" />
          </div>
          <div className="donate-body">
            <h4 id="donate-title">{t("Support Origami Reader")}</h4>
            <p>
              {t(
                "Origami Reader is free, offline and made by one independent developer. There are no ads, no subscriptions and no locked features. If it has become part of your reading, a small contribution helps keep it growing.",
              )}
            </p>
            <ul className="donate-points">
              <li>{t("New voices and languages")}</li>
              <li>{t("Day and night scenes and new atmospheres")}</li>
              <li>{t("Audiobook export and Origami Studio")}</li>
            </ul>
            <div className="donate-actions">
              <button className="donate-button" onClick={openSupport}>
                <Heart size={17} fill="currentColor" />
                {t("Support on Ko-fi")}
              </button>
              {links.source && (
                <button
                  className="text-button"
                  onClick={() =>
                    void store.openExternalLink("source").catch(error)
                  }
                >
                  {t("Source code")}
                </button>
              )}
            </div>
            <small>
              {t(
                "Pay what you want, any time. Origami Reader stays complete and free either way.",
              )}
            </small>
          </div>
        </section>
        <div className="privacy-note">
          <ShieldCheck size={18} />
          <p>
            {t(
              "Origami Reader works offline. It has no account, no ads, no analytics and no tracking, and it never sends your books, notes, recordings or settings anywhere. It only goes online when you click a link, allow embeds in Work mode, download an optional model or check for updates.",
            )}
          </p>
        </div>
        <Section
          id="settings-licenses"
          title={t("Copyright and licenses")}
          defaultOpen={false}
        >
          <p className="hint">
            {t(
              "Origami Reader is made by Sov3ryn. You may use the app for free, at home, school or work, but not share, sell or modify copies of it. Its source code is available to read and audit under the PolyForm Strict License 1.0.0. Models, voices, fonts and books keep their own terms.",
            )}
          </p>
          <p className="hint">Copyright © 2026 Sov3ryn</p>
          <details>
            <summary>{t("Origami Reader app license")}</summary>
            <pre className="license-text">{appLicense}</pre>
          </details>
          <details>
            <summary>{t("Source code license (PolyForm Strict 1.0.0)")}</summary>
            <pre className="license-text">{sourceLicense}</pre>
          </details>
          <details>
            <summary>{t("Starter library credits and licenses")}</summary>
            <p className="hint">
              {t(
                "Book texts retain their separate rights. Original bundled cover illustrations are dedicated under CC0 1.0.",
              )}
            </p>
            {Object.entries(starterNotices).map(([name, text]) => (
              <details key={name}>
                <summary>{name.split("/").at(-1)}</summary>
                <pre className="license-text">{text}</pre>
              </details>
            ))}
          </details>
          <details>
            <summary>{t("Fonts and author portraits")}</summary>
            <p className="hint">
              {t(
                "OpenDyslexic by Abbie Gonzalez is included unmodified under the SIL Open Font License 1.1. Author portraits are public-domain images from Wikimedia Commons: Alexandre Dumas by Nadar (1855), Jane Austen after Cassandra Austen (1870 engraving), Bram Stoker (about 1906), Wilkie Collins by Napoleon Sarony (1874) and Jules Verne by Etienne Carjat (about 1884).",
              )}
            </p>
            <details>
              <summary>OFL.txt</summary>
              <pre className="license-text">{fontLicense}</pre>
            </details>
          </details>
        </Section>
      </div>
    );
  }
  function handleKey(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (ctrl && e.shiftKey && key === "w") {
      e.preventDefault();
      switchMode(nextMode(appMode));
      return;
    }
    // Work Mode has its own keys; only day and night carry over.
    if (otherMode) {
      if (ctrl && e.shiftKey && key === "l") {
        e.preventDefault();
        toggleDayNight();
      }
      return;
    }
    if (e.key === "Escape") {
      setQuick(false);
      // Clear the page selection too, or key-up would capture it again.
      if (selection) window.getSelection()?.removeAllRanges();
      setSelection(null);
      setFocusMode(false);
      setShowShortcuts(false);
      setSleepMenu(false);
      return;
    }
    if (ctrl && key === "o" && !e.shiftKey) {
      e.preventDefault();
      fileInput.current?.click();
      return;
    }
    if (!shortcutTarget(e) || quick || deleteCandidates.length) return;
    const run = (action: () => void) => {
      e.preventDefault();
      action();
    };
    if (ctrl && e.shiftKey && key === "l") return run(toggleDayNight);
    // A study card from the selected passage.
    if (ctrl && e.shiftKey && key === "c" && page === "reader" && selection)
      return run(() => void startReaderCard());
    if (ctrl && key === ",") return run(() => setPage("settings"));
    if (ctrl && key === "\\")
      return run(() => setLeftOpen(!navigationOpen));
    if (ctrl && e.shiftKey && key === "f" && page === "reader")
      return run(() => setFocusMode(!focusMode));
    if (ctrl && key === "f")
      return run(() => {
        if (page === "reader") {
          setFocusMode(false);
          setLeftOpen(true);
        } else if (page !== "library") setPage("library");
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>(
              page === "reader"
                ? 'input[aria-label="Search book"]'
                : 'input[aria-label="Search library"]',
            )
            ?.focus(),
        );
      });
    if (ctrl && key === "b" && page === "reader" && book)
      return run(() => void addAnnotation("bookmark", true).catch(error));
    if (ctrl && (key === "=" || key === "+"))
      return run(() =>
        patchReading({ fontSize: Math.min(32, reading.fontSize + 1) }),
      );
    if (ctrl && key === "-")
      return run(() =>
        patchReading({ fontSize: Math.max(16, reading.fontSize - 1) }),
      );
    if (ctrl && (key === "ArrowRight" || key === "ArrowLeft") && book) {
      const direction = key === "ArrowRight" ? 1 : -1;
      return run(() =>
        e.shiftKey ? skipParagraph(direction) : void skipSentence(direction),
      );
    }
    if (ctrl || e.altKey) return;
    if (key === " " && book) {
      if ((e.target as HTMLElement).closest?.("button,a,summary,[role=slider]"))
        return;
      return run(togglePlayback);
    }
    if (key === ">") return run(() => stepSpeed(1));
    if (key === "<") return run(() => stepSpeed(-1));
    if (key === "?") return run(() => setShowShortcuts(true));
  }
  actions.current = { keydown: handleKey, togglePlayback, skipSentence };
  pageHandlers.current = {
    openAnnotation: (a) => {
      chooseTab("notes");
      setEditing(a.id);
      setDraft(a.text);
      setNoteGroup(a.group);
      setColor(a.color);
    },
    retry: (n) => {
      player.clearUnvoiced(n);
      void startFrom(n);
    },
    sticky: (a, patch) => {
      if (freshSticky.current === a.id) freshSticky.current = null;
      if (!patch) return void removeAnnotation(a).catch(error);
      const next = { ...a, ...patch };
      setAnnotations((old) => old.map((n) => (n.id === a.id ? next : n)));
      void store.saveAnnotation(next).catch(error);
    },
    freshSticky: () => freshSticky.current,
  };
  if (!ready)
    return (
      <main
        style={{
          padding: 48,
          color: "#eee9f3",
          background: "#17161b",
          minHeight: "100vh",
        }}
        aria-busy={!startupError}
      >
        <h1>{t("Origami")}</h1>
        <p role={startupError ? "alert" : "status"}>
          {startupError || t("Preparing your library…")}
        </p>
        {startupError && (
          <button onClick={() => window.location.reload()}>
            {t("Retry loading library")}
          </button>
        )}
      </main>
    );
  return (
    <CoverTextContext value={prefs.showCoverText}>
      <SectionState value={sectionState}>
        <div
          ref={appRoot}
          className={"app" + (otherMode ? " work-active" : "")}
          data-ui-scale={uiScale}
          style={variables}
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer.types.includes("Files") && !dragging)
              setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.relatedTarget) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void droppedFiles(e.dataTransfer)
              .then((files) => {
                if (files.length) return importFiles(files);
                notify(
                  t(
                    "No books or documents Origami can read were found in the drop.",
                  ),
                );
              })
              .catch(error);
          }}
        >
          {ready && page === "library" && roomTheme ? (
            // The 3D library room is the whole background; panels float on it.
            <LibraryRoom
              base={roomTheme.base!}
              books={visible}
              night={sceneTime(prefs.scene) === "night"}
              interfaceLanguage={prefs.uiLanguage}
              onOpen={(id) => {
                void openBook(id).catch(error);
              }}
            />
          ) : (
            <BackgroundScene prefs={prefs} artVersion={artVersion} />
          )}
          <StudioMode
            open={appMode === "studio"}
            books={books.filter((b) => !b.deleted && !b.vault)}
            voices={voices}
            prefs={prefs}
            modeSwitch={<ModeSwitch mode="studio" onChange={switchMode} />}
          />
          <WorkMode
            open={prefs.workMode}
            books={books.filter((b) => !b.deleted)}
            annotations={annotations}
            handoff={workHandoff}
            speak={store.desktop ? speakForStudy : undefined}
            fourButtons={prefs.studyFourButtons}
            newPerDay={prefs.studyNewPerDay}
            connectionsModel={prefs.connectionsModel}
            language={prefs.uiLanguage}
            dataVersion={workVersion}
            modeSwitch={<ModeSwitch mode="work" onChange={switchMode} />}
            onOpenPassage={(bookId, paragraphId) => {
              void openPassageFromWork(bookId, paragraphId);
            }}
            onImportBooks={(files) => {
              void importFiles(files, true);
            }}
            sourcesFilter={prefs.workSources}
            onSourcesFilter={(workSources) => patchPrefs({ workSources })}
            theme={prefs.workTheme}
            onTheme={(workTheme) => patchPrefs({ workTheme })}
            onMarkSource={(b) => {
              void updateMeta({ ...b, work: true }).catch(error);
            }}
            tipsOn={prefs.workTips}
            onTipsOff={() => {
              patchPrefs({ workTips: false });
              notify(t("Tips are off. You can turn them back on in Settings, Work mode."));
            }}
            embedsOn={prefs.onlineEmbeds}
            pluginPrefs={prefs.plugins}
            vaults={vaults}
            onUnlockVault={unlockVaultHere}
            onLockVault={(v) => void lockVaults(v.id).catch(error)}
            pluginsOff={prefs.pluginsOff}
            onEmbedsChoice={(onlineEmbeds) => patchPrefs({ onlineEmbeds })}
            onSettings={() => {
              switchMode("read");
              setPage("settings");
              patchPrefs({ settingsCategory: "work", openSections: { ...prefs.openSections, "settings-work-connections": true } });
            }}
            notify={notify}
          />
          {dragging && (
            <div className="drop-overlay" aria-hidden="true">
              <Upload size={34} />
              <strong>{t("Drop books or folders to import")}</strong>
              <span>
                {t(
                  "EPUB, PDF, Kindle, FB2, Word, OpenDocument, RTF, HTML, Markdown and text. Folders are searched too.",
                )}
              </span>
            </div>
          )}
          <input
            className="hidden"
            ref={fileInput}
            type="file"
            accept=".epub,.pdf,.mobi,.azw,.azw3,.prc,.fb2,.zip,.docx,.odt,.rtf,.html,.htm,.xhtml,.txt,.md,.markdown"
            multiple
            onChange={(e) => {
              if (e.target.files) void importFiles(e.target.files);
            }}
          />
          <aside
            className={"sidebar " + (!navigationOpen ? "collapsed" : "")}
            aria-hidden={!navigationOpen || otherMode}
            inert={!navigationOpen || otherMode}
          >
            {!(page === "reader" && book) && (
              <button
                className="brand"
                onClick={() => {
                  setPage("library");
                  setQuery("");
                }}
              >
                <img src="/crane.png" alt="" />
                {t("Origami")}
              </button>
            )}
            {PRIVATE_BETA && !(page === "reader" && book) && (
              <span className="beta-badge sidebar-beta">
                {t("Private beta")}
              </span>
            )}
            <ModeSwitch mode="read" onChange={switchMode} />
            {page === "reader" && book ? (
              <>
                <button
                  className="back-library"
                  onClick={() => {
                    patchPrefs({ libraryShelf: shelfOf(book.meta) });
                    setPage("library");
                  }}
                >
                  <ArrowLeft size={16} />
                  {shelfName(shelfOf(book.meta))}
                </button>
                <div className="reader-book">
                  <Cover book={book.meta} small />
                  <div className="reader-book-text">
                    <strong>{book.meta.title}</strong>
                    <span>{book.meta.author}</span>
                  </div>
                </div>
                <div className="reader-progress">
                  <progress
                    value={book.meta.position}
                    max={Math.max(1, book.meta.paragraphCount - 1)}
                    aria-labelledby="reader-progress-text"
                  />
                  <span id="reader-progress-text">
                    {[
                      Math.round(
                        (book.meta.position /
                          Math.max(1, book.meta.paragraphCount - 1)) *
                          100,
                      ) + "%",
                      chapterPosition &&
                        t("Chapter {current} of {total}", chapterPosition),
                      t("{time} left", {
                        time: formatDuration(
                          listeningMinutes(
                            (wordsBefore.at(-1) || 0) -
                              (wordsBefore[book.meta.position] || 0),
                            prefs.speed,
                          ),
                        ),
                      }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="sidebar-sections reader-sections">
                  {(bookmarksByBook.get(book.meta.id)?.length ?? 0) > 0 && (
                    <Section
                      id="side-bookmarks"
                      title={t("Bookmarks")}
                      icon={<Bookmark size={15} />}
                      meta={bookmarksByBook.get(book.meta.id)!.length}
                    >
                      <nav
                        className="side-bookmarks"
                        aria-label={t("Bookmarks in this book")}
                      >
                        {bookmarksByBook.get(book.meta.id)!.map((a) => (
                          <div
                            key={a.id}
                            className="side-bookmark"
                            style={{
                              ["--mark" as string]: annotationColors.find(
                                (c) => c.id === a.color,
                              )?.value,
                            }}
                          >
                            <button
                              className="side-bookmark-open"
                              disabled={jumping}
                              onClick={() => {
                                void showBookmark(a);
                              }}
                            >
                              <Bookmark size={13} fill="currentColor" />
                              <span>
                                {a.group && <strong>{a.group}</strong>}
                                {a.quote
                                  .replace(/\s+/g, " ")
                                  .trim()
                                  .slice(0, 80)}
                              </span>
                            </button>
                            <IconButton
                              label={t("Delete bookmark")}
                              onClick={() => {
                                void removeAnnotation(a).catch(error);
                              }}
                            >
                              <Trash2 size={13} />
                            </IconButton>
                          </div>
                        ))}
                      </nav>
                    </Section>
                  )}
                  <Section
                    id="side-contents"
                    title={t("Contents")}
                    icon={<List size={15} />}
                  >
                    <div className="search-field small-search">
                      <Search size={15} />
                      <input
                        aria-label={t("Search book")}
                        placeholder={t("Find in book")}
                        value={bookQuery}
                        onChange={(e) => setBookQuery(e.target.value)}
                      />
                    </div>
                    {bookQuery.trim() ? (
                      <nav
                        className="chapters search-results"
                        aria-label={t("Matches")}
                      >
                        {(() => {
                          const q = bookQuery.trim().toLowerCase();
                          const matches = book.paragraphs
                            .map((p, index) => ({ p, index }))
                            .filter(({ p }) =>
                              p.text.toLowerCase().includes(q),
                            );
                          return (
                            <>
                              <span className="hint match-count" role="status">
                                {matches.length
                                  ? matches.length.toLocaleString() +
                                    (matches.length === 1
                                      ? " match"
                                      : " matches")
                                  : t("No matches")}
                              </span>
                              {matches.slice(0, 200).map(({ p, index }) => {
                                const s = searchSnippet(
                                  p.text,
                                  bookQuery.trim(),
                                );
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      positionChanged(index);
                                      revealPassage(index);
                                    }}
                                  >
                                    <small>
                                      {currentEntry(contents, index)?.label ||
                                        book.meta.title}
                                    </small>
                                    <span>
                                      {s.before}
                                      <mark>{s.match}</mark>
                                      {s.after}
                                    </span>
                                  </button>
                                );
                              })}
                              {matches.length > 200 && (
                                <span className="hint">
                                  {t(
                                    "Showing the first 200. Refine the search to see more.",
                                  )}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </nav>
                    ) : (
                      <nav className="toc" aria-label={t("Contents")}>
                        {contents.map((entry, i) => {
                          const end =
                            contents[i + 1]?.index ?? book.paragraphs.length;
                          const current = currentSection?.index === entry.index;
                          const read = !current && end <= book.meta.position;
                          const titlePage =
                            i === 0 && entry.label === book.meta.title;
                          const minutes = listeningMinutes(
                            (wordsBefore[end] || 0) -
                              (wordsBefore[entry.index] || 0),
                            prefs.speed,
                          );
                          return (
                            <button
                              key={entry.index}
                              data-level={Math.min(4, entry.level)}
                              className={
                                "toc-row" +
                                (current ? " active" : "") +
                                (read ? " read" : "")
                              }
                              aria-current={current ? "location" : undefined}
                              title={entry.label}
                              onClick={() => {
                                positionChanged(entry.index);
                                revealPassage(entry.index);
                              }}
                            >
                              <span className="toc-number">
                                {titlePage ? (
                                  <BookOpen size={13} />
                                ) : entry.title ? (
                                  entry.number
                                ) : null}
                              </span>
                              <span className="toc-text">
                                <span className="toc-title">
                                  {titlePage
                                    ? t("Title page")
                                    : entry.title ||
                                      t("Chapter {number}", {
                                        number: entry.number || "",
                                      })}
                                </span>
                                <span className="toc-meta">
                                  {read ? (
                                    <>
                                      <Check size={12} />
                                      {t("Finished")}
                                    </>
                                  ) : minutes >= 1 ? (
                                    formatDuration(minutes)
                                  ) : null}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </nav>
                    )}
                  </Section>
                </div>
              </>
            ) : (
              <>
                <nav className="main-nav" aria-label={t("Workspace pages")}>
                  {(["stories", "documents"] as const).map((s) => (
                    <button
                      key={s}
                      className={page === "library" && shelf === s ? "active" : ""}
                      onClick={() => {
                        patchPrefs({ libraryShelf: s });
                        setPage("library");
                        setCollection("All books");
                        setSelected(new Set());
                      }}
                    >
                      {s === "stories" ? <BookOpen size={20} /> : <FileText size={20} />}
                      {shelfName(s)}
                      <span className="count">{books.filter((b) => !b.vault && !b.deleted && shelfOf(b) === s).length}</span>
                    </button>
                  ))}
                  {(
                    [
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
                      onClick={() => setPage(n.id)}
                    >
                      {n.icon}
                      {t(n.label)}
                    </button>
                  ))}
                </nav>
                <div className="sidebar-sections">
                  <Section
                    id="side-shelves"
                    title={t("Shelves")}
                    icon={<Library size={15} />}
                  >
                    <nav
                      className="collections"
                      aria-label={t("Library collections")}
                    >
                      {["All books", "Favorites", "Unsorted", "Trash"].map(
                        (c) => collectionRow(c),
                      )}
                    </nav>
                  </Section>
                  <Section
                    id="side-collections"
                    title={t("Collections")}
                    icon={<FolderOpen size={15} />}
                    meta={namedCollections.length || undefined}
                  >
                    <nav
                      className="collections"
                      aria-label={t("Your collections")}
                    >
                      {namedCollections.map((c) => collectionRow(c))}
                      {vaults.map((v) => (
                        <div
                          key={v.id}
                          className={
                            "collection-row vault-row" +
                            (page === "library" && vaultView === v.id
                              ? " selected"
                              : "")
                          }
                        >
                          <button
                            className={
                              page === "library" && vaultView === v.id
                                ? "active"
                                : ""
                            }
                            onClick={() => openVault(v)}
                          >
                            {v.unlocked ? (
                              <LockOpen size={15} />
                            ) : (
                              <Lock size={15} />
                            )}
                            <span className="collection-title">{v.name}</span>
                            {v.unlocked && (
                              <span className="count">
                                {
                                  books.filter(
                                    (b) => b.vault === v.id && !b.deleted,
                                  ).length
                                }
                              </span>
                            )}
                          </button>
                          {v.unlocked && (
                            <IconButton
                              label={t("Lock {name}", { name: v.name })}
                              onClick={() => {
                                if (vaultView === v.id)
                                  setCollection("All books");
                                void lockVaults(v.id).catch(error);
                              }}
                            >
                              <Lock size={14} />
                            </IconButton>
                          )}
                        </div>
                      ))}
                    </nav>
                    {!namedCollections.length && !addingCollection && (
                      <p className="hint sidebar-empty">
                        {t("Group books your way, by series, course or mood.")}
                      </p>
                    )}
                    {addingCollection ? (
                      <form
                        className="collection-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          addCollection();
                        }}
                      >
                        <input
                          autoFocus
                          aria-label={t("Collection name")}
                          placeholder={t("Collection name")}
                          maxLength={64}
                          value={collectionName}
                          onChange={(e) => setCollectionName(e.target.value)}
                        />
                        <div>
                          <IconButton
                            label={t("Save collection")}
                            onClick={addCollection}
                            disabled={collectionBusy}
                          >
                            <Check size={16} />
                          </IconButton>
                          <IconButton
                            label={t("Cancel adding collection")}
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
                        {store.vaultsAvailable && (
                          <button
                            type="button"
                            className="text-button vault-link"
                            onClick={startVault}
                          >
                            <VaultIcon size={14} />
                            {t("Create a PIN-locked vault instead")}
                          </button>
                        )}
                      </form>
                    ) : (
                      <button
                        className="sidebar-add"
                        disabled={collectionBusy}
                        onClick={() => {
                          setAddingCollection(true);
                          setCollectionError("");
                        }}
                      >
                        <Plus size={15} />
                        {t("Add collection")}
                      </button>
                    )}
                    {collectionUndo && (
                      <button
                        className="collection-undo"
                        disabled={collectionBusy}
                        onClick={() => {
                          void undoCollectionDeletion().catch(error);
                        }}
                      >
                        <RotateCcw size={14} />
                        {t("Undo collection deletion")}
                      </button>
                    )}
                  </Section>
                  <Section
                    id="side-filters"
                    title={t("Filter and sort")}
                    icon={<SlidersHorizontal size={15} />}
                    meta={filtersActive ? t("Active") : undefined}
                    defaultOpen={false}
                  >
                    <div id="collection-filters" className="collection-filters">
                      <label>
                        {t("Author")}
                        <select
                          aria-label={t("Filter collections by author")}
                          value={libraryFilters.author}
                          onChange={(e) =>
                            patchLibraryFilters({ author: e.target.value })
                          }
                        >
                          <option value="all">{t("All authors")}</option>
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
                        {t("Type")}
                        <select
                          aria-label={t("Filter collections by type")}
                          value={libraryFilters.type}
                          onChange={(e) =>
                            patchLibraryFilters({ type: e.target.value })
                          }
                        >
                          <option value="all">{t("All types")}</option>
                          {[...new Set(books.map((b) => b.format))]
                            .sort()
                            .map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                        </select>
                      </label>
                      <label>
                        {t("Genre")}
                        <select
                          aria-label={t("Filter library by genre")}
                          value={libraryFilters.genre || "all"}
                          onChange={(e) =>
                            patchLibraryFilters({ genre: e.target.value })
                          }
                        >
                          <option value="all">{t("All genres")}</option>
                          {[
                            ...new Map(
                              books.flatMap((b) =>
                                bookGenres(b).map(
                                  (g) => [g.toLocaleLowerCase(), g] as const,
                                ),
                              ),
                            ).values(),
                          ]
                            .sort((a, b) => a.localeCompare(b))
                            .map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        {t("Reading status")}
                        <select
                          aria-label={t("Filter collections by reading status")}
                          value={libraryFilters.status}
                          onChange={(e) =>
                            patchLibraryFilters({ status: e.target.value })
                          }
                        >
                          <option value="all">
                            {t("All reading statuses")}
                          </option>
                          <option value="finished">{t("Finished")}</option>
                          <option value="unfinished">{t("Unfinished")}</option>
                          <option value="reading">{t("In progress")}</option>
                          <option value="unread">{t("Not started")}</option>
                        </select>
                      </label>
                      <label>
                        {t("Order")}
                        <select
                          aria-label={t("Collection reading order")}
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="recent">
                            {t("Last read, newest first")}
                          </option>
                          <option value="oldest-read">
                            {t("Last read, oldest first")}
                          </option>
                          <option value="added">
                            {t("Added, newest first")}
                          </option>
                          <option value="oldest-added">
                            {t("Added, oldest first")}
                          </option>
                          <option value="title">{t("Title A to Z")}</option>
                          <option value="title-desc">
                            {t("Title Z to A")}
                          </option>
                          <option value="author">{t("Author A to Z")}</option>
                        </select>
                      </label>
                      <button
                        className="text-button"
                        onClick={() => {
                          patchLibraryFilters({
                            author: "all",
                            type: "all",
                            status: "all",
                            genre: "all",
                          });
                          setSort("recent");
                        }}
                      >
                        {t("Reset library filters")}
                      </button>
                    </div>
                  </Section>
                </div>
                <div className="sidebar-bottom">
                  <LanguagePicker
                    compact
                    value={prefs.uiLanguage}
                    onChange={(code) => void changeLanguage(code)}
                  />
                  <button
                    className={page === "settings" ? "active" : ""}
                    onClick={() => setPage("settings")}
                  >
                    <Settings2 size={18} />
                    {t("Settings")}
                  </button>
                  <button
                    className="donate-link"
                    onClick={() => {
                      setPage("settings");
                      patchPrefs({ settingsCategory: "about" });
                      requestAnimationFrame(() =>
                        requestAnimationFrame(() =>
                          document
                            .querySelector(".donate-card")
                            ?.scrollIntoView({ block: "center" }),
                        ),
                      );
                    }}
                  >
                    <Heart size={15} />
                    {t("Donate")}
                  </button>
                </div>
              </>
            )}
          </aside>
          {navigationOpen && (
            <div
              role="separator"
              aria-label={t("Resize navigation")}
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
          <div
            inert={otherMode}
            className={
              "center" +
              (ready && page === "library" && roomTheme
                ? " room-active"
                : "")
            }
          >
            <header className="topbar">
              <div className="header-left">
                <IconButton
                  label={
                    navigationOpen
                      ? t("Collapse navigation")
                      : t("Expand navigation")
                  }
                  onClick={() => {
                    if (focused) setFocusMode(false);
                    else setLeftOpen(!navigationOpen);
                  }}
                >
                  {navigationOpen ? (
                    <PanelLeftClose size={19} />
                  ) : (
                    <PanelLeftOpen size={19} />
                  )}
                </IconButton>
                {!navigationOpen && (
                  <img
                    className="mini-crane"
                    src="/crane.png"
                    alt={t("Origami")}
                  />
                )}
                <span className="breadcrumb">
                  {page === "reader" ? (
                    <>
                      <button
                        onClick={() => {
                          if (book) patchPrefs({ libraryShelf: shelfOf(book.meta) });
                          setPage("library");
                        }}
                      >
                        {book ? shelfName(shelfOf(book.meta)) : t("Library")}
                      </button>
                      <ChevronRight size={13} />
                      <span>{book?.meta.title}</span>
                    </>
                  ) : page === "library" ? (
                    shelfName(shelf)
                  ) : page === "bookmarks" ? (
                    t("Bookmarks")
                  ) : page === "voices" ? (
                    t("Voices")
                  ) : (
                    t("Settings")
                  )}
                </span>
              </div>
              <div className="header-actions">
                {returnAnchor && (
                  <div className="return-bookmark">
                    <button
                      title={t("Temporary bookmark: {title}", {
                        title: returnAnchor.title,
                      })}
                      disabled={jumping}
                      onClick={() => {
                        void returnToReading().catch(error);
                      }}
                    >
                      <Bookmark size={16} />
                      {t("Return to reading")}
                    </button>
                    <IconButton
                      label={t("Dismiss temporary bookmark")}
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
                      label={t("Bookmark current position")}
                      onClick={() => {
                        void addAnnotation("bookmark", true).catch(error);
                      }}
                    >
                      <Bookmark size={18} />
                    </IconButton>
                    <IconButton
                      label={focused ? t("Exit focus mode") : t("Focus mode")}
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
                {(page === "library" || page === "reader") && (
                  <TextMenu
                    prefs={page === "reader" ? reading : prefs}
                    onChange={page === "reader" ? patchReading : patchPrefs}
                    onMore={() => chooseTab("appearance")}
                    book={page === "reader" ? book?.meta : undefined}
                    onBookComfort={setBookComfort}
                    bookFits={readerWidth >= BOOK_MIN_WIDTH}
                  />
                )}
                <IconButton
                  label={
                    counterpart(prefs.scene)
                      ? sceneTime(prefs.scene) === "day"
                        ? t("Switch to night (Ctrl+Shift+L)")
                        : t("Switch to day (Ctrl+Shift+L)")
                      : t("Day and night need a seasonal scene")
                  }
                  disabled={!counterpart(prefs.scene)}
                  onClick={toggleDayNight}
                >
                  {sceneTime(prefs.scene) === "day" ? (
                    <Moon size={18} />
                  ) : (
                    <Sun size={18} />
                  )}
                </IconButton>
                <IconButton
                  label={t("Keyboard shortcuts (?)")}
                  onClick={() => setShowShortcuts(true)}
                >
                  <Keyboard size={18} />
                </IconButton>
                <IconButton
                  label={t("Appearance settings")}
                  onClick={() => chooseTab("appearance")}
                >
                  <Palette size={18} />
                </IconButton>
                {inspectorAvailable && (
                  <IconButton
                    label={
                      inspectorOpen
                        ? t("Collapse inspector")
                        : t("Expand inspector")
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
                {t("Opening library")}
              </div>
            ) : (
              <main
                className={
                  "workspace " +
                  (page === "reader" ? "reader-workspace" : "ui-zoom") +
                  (page === "library" && roomTheme ? " room-mode" : "")
                }
              >
                {page === "library" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">
                          {shelf === "stories"
                            ? visible.length === 1
                              ? t("1 story")
                              : t("{count} stories", { count: visible.length })
                            : visible.length === 1
                              ? t("1 document")
                              : t("{count} documents", { count: visible.length })}
                        </span>
                        <h1 ref={focusTitle}>
                          {collection === "All books"
                            ? shelfName(shelf)
                            : vaultView
                              ? (vaults.find((v) => v.id === vaultView)
                                  ?.name ?? t("Vault"))
                              : collection}
                        </h1>
                      </div>
                      <div className="heading-actions">
                        {vaultView && (
                          <button
                            onClick={() => {
                              setCollection("All books");
                              void lockVaults(vaultView).catch(error);
                            }}
                          >
                            <Lock size={17} />
                            {t("Lock vault")}
                          </button>
                        )}
                        <button onClick={() => setQuick(true)}>
                          <Plus size={17} />
                          {t("Quick Read")}
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
                          {t("Import")}
                        </button>
                      </div>
                    </div>
                    <div className="library-controls">
                      <div className="search-field library-search">
                        <Search size={18} />
                        <input
                          aria-label={t("Search library")}
                          placeholder={t("Search title, author or collection")}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        {query && (
                          <IconButton
                            label={t("Clear search")}
                            onClick={() => setQuery("")}
                          >
                            <X size={14} />
                          </IconButton>
                        )}
                      </div>
                      <select
                        aria-label={t("Sort library")}
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">{t("Recently opened")}</option>
                        <option value="oldest-read">
                          {t("Last read, oldest first")}
                        </option>
                        <option value="added">{t("Date added")}</option>
                        <option value="oldest-added">
                          {t("Added, oldest first")}
                        </option>
                        <option value="title">{t("Title A to Z")}</option>
                        <option value="title-desc">{t("Title Z to A")}</option>
                        <option value="author">{t("Author A to Z")}</option>
                      </select>
                      <div className="segmented view-switch">
                        <IconButton
                          label={t("Grid view")}
                          active={!list}
                          onClick={() => setList(false)}
                        >
                          <Grid2X2 size={17} />
                        </IconButton>
                        <IconButton
                          label={t("List view")}
                          active={list}
                          onClick={() => setList(true)}
                        >
                          <List size={17} />
                        </IconButton>
                      </div>
                      <Popover
                        label={t("Library theme")}
                        icon={<LibraryBig size={17} />}
                        panelClassName="theme-menu"
                      >
                        <LibraryThemePicker
                          compact
                          value={currentLibraryTheme.id}
                          night={sceneTime(prefs.scene) === "night"}
                          onChange={(id) => patchPrefs({ libraryTheme: id })}
                        />
                      </Popover>
                      <Popover
                        label={t("View options")}
                        icon={<SlidersHorizontal size={17} />}
                        panelClassName="view-menu"
                      >
                        <label>
                          {t("Card size")}{" "}
                          <output>
                            {
                              [
                                t("Smallest"),
                                t("Small"),
                                t("Medium"),
                                t("Large"),
                                t("Largest"),
                              ][cardSizes.indexOf(cardSize)]
                            }
                          </output>
                          <input
                            aria-label={t("Card size")}
                            type="range"
                            min="0"
                            max={cardSizes.length - 1}
                            step="1"
                            value={cardSizes.indexOf(cardSize)}
                            onChange={(e) =>
                              patchPrefs({
                                libraryCardSize: cardSizes[+e.target.value],
                              })
                            }
                          />
                          <span className="range-endpoints" aria-hidden="true">
                            <span>{t("Smaller")}</span>
                            <span>{t("Larger")}</span>
                          </span>
                        </label>
                        <div
                          className="segmented"
                          role="group"
                          aria-label={t("Layout")}
                        >
                          <button
                            aria-pressed={!list}
                            className={!list ? "active" : ""}
                            onClick={() => setList(false)}
                          >
                            <Grid2X2 size={14} />
                            {t("Grid")}
                          </button>
                          <button
                            aria-pressed={list}
                            className={list ? "active" : ""}
                            onClick={() => setList(true)}
                          >
                            <List size={14} />
                            {t("List")}
                          </button>
                        </div>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={prefs.libraryDensity === "compact"}
                            onChange={(e) =>
                              patchPrefs({
                                libraryDensity: e.target.checked
                                  ? "compact"
                                  : "comfortable",
                              })
                            }
                          />
                          {t("Compact list")}
                        </label>
                        <span className="view-menu-heading">
                          {t("Show on books")}
                        </span>
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={prefs.libraryBookmarks}
                            onChange={(e) =>
                              patchPrefs({ libraryBookmarks: e.target.checked })
                            }
                          />
                          {t("Bookmarks")}
                        </label>
                        {(
                          [
                            ["libraryCovers", t("Covers")],
                            ["libraryAuthors", t("Author names")],
                            ["libraryGenres", t("Genres")],
                            ["libraryFlags", t("Language flags")],
                          ] as const
                        ).map(([key, label]) => (
                          <label className="check-label" key={key}>
                            <input
                              type="checkbox"
                              checked={prefs[key]}
                              onChange={(e) =>
                                patchPrefs({ [key]: e.target.checked })
                              }
                            />
                            {label}
                          </label>
                        ))}
                        <label className="check-label view-menu-divider">
                          <input
                            type="checkbox"
                            checked={prefs.libraryLargeText}
                            onChange={(e) =>
                              patchPrefs({ libraryLargeText: e.target.checked })
                            }
                          />
                          {t("Larger titles and author names")}
                        </label>

                      </Popover>
                    </div>
                    <div className="filter-row">
                      <div className="chips">
                        {(["stories", "documents"] as const).map((s) => (
                          <button
                            className={shelf === s ? "active" : ""}
                            key={s}
                            onClick={() => {
                              patchPrefs({ libraryShelf: s });
                              setSelected(new Set());
                            }}
                          >
                            {shelfName(s)}
                          </button>
                        ))}
                      </div>
                      <button
                        className="text-button"
                        onClick={() =>
                          setSelected(
                            visible.every((b) => selected.has(b.id))
                              ? new Set()
                              : new Set(visible.map((b) => b.id)),
                          )
                        }
                      >
                        {visible.length > 0 &&
                        visible.every((b) => selected.has(b.id))
                          ? t("Clear selection")
                          : t("Select all")}
                      </button>
                    </div>
                    {collection === "Trash" && (
                      <p className="hint trash-policy">
                        {prefs.trashRetentionDays === null
                          ? t(
                              "Items stay in Trash indefinitely. There is no automatic purge.",
                            )
                          : t(
                              "Items are permanently deleted after {trashRetentionDays} days in Trash. Purging runs when Origami opens and while it is running.",
                              { trashRetentionDays: prefs.trashRetentionDays },
                            )}{" "}
                        {t(
                          "Restore items before they expire, or select items and choose Delete permanently. Saved exports are never deleted. Change retention in Settings.",
                        )}
                      </p>
                    )}
                    {selected.size > 0 && (
                      <div className="bulk-bar">
                        <span>
                          {t("{count} selected", { count: selected.size })}
                        </span>
                        {vaultView ? (
                          <>
                            <button
                              onClick={() =>
                                void moveToVault(
                                  books.filter((b) => selected.has(b.id)),
                                  "",
                                ).catch(error)
                              }
                            >
                              <LockOpen size={16} />
                              {t("Move out of the vault")}
                            </button>
                            <button
                              disabled={deletingBooks}
                              onClick={() =>
                                setDeleteCandidates(
                                  books.filter((b) => selected.has(b.id)),
                                )
                              }
                            >
                              <Trash2 size={16} />
                              {t("Delete permanently")}
                            </button>
                          </>
                        ) : (
                          <>
                        {collection !== "Trash" && vaults.length > 0 && (
                          <select
                            aria-label={t("Move to vault")}
                            value=""
                            onChange={(e) =>
                              void moveToVault(
                                books.filter((b) => selected.has(b.id)),
                                e.target.value,
                              ).catch(error)
                            }
                          >
                            <option value="" disabled>
                              {t("Move to vault")}
                            </option>
                            {vaults.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        )}
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
                          {collection === "Trash"
                            ? t("Restore")
                            : t("Move to Trash")}
                        </button>
                        {collection === "Trash" && (
                          <button
                            disabled={deletingBooks}
                            onClick={() =>
                              setDeleteCandidates(
                                books.filter(
                                  (b) => b.deleted && selected.has(b.id),
                                ),
                              )
                            }
                          >
                            <Trash2 size={16} />
                            {t("Delete permanently")}
                          </button>
                        )}
                          </>
                        )}
                      </div>
                    )}
                    {latest &&
                      !query &&
                      !filtersActive &&
                      collection === "All books" && (
                        <section className="continue-section">
                          <h2>{t("Continue reading")}</h2>
                          <div className="continue-card">
                            <CoverControl
                              book={latest}
                              small={!latestAuthor}
                              onOpen={() => {
                                void openBook(latest.id).catch(error);
                              }}
                              onEdit={() => {
                                void editCover(latest).catch(error);
                              }}
                              job={coverJob(latest)}
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
                                <span
                                  className="genre-tags"
                                  aria-label={t("Book genres")}
                                >
                                  {bookGenres(latest).map((genre) => (
                                    <span
                                      key={genre}
                                      className={
                                        "genre-tag genre-" + genreColor(genre)
                                      }
                                    >
                                      {genre}
                                    </span>
                                  ))}
                                </span>
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
                                {t("Open book")}
                              </span>
                            </button>
                            {authorCard(latestAuthor)}
                          </div>
                        </section>
                      )}
                    <div className="section-row shelf-heading">
                      <h2>
                        {collection === "Trash"
                          ? t("Deleted documents")
                          : t("On your shelf")}
                      </h2>
                      <span className="hint">
                        {t("EPUB · PDF · Kindle · Word · and more")}
                      </span>
                    </div>
                    <div
                      className={
                        "book-grid" +
                        (list ? " list-view" : "") +
                        (list && prefs.libraryDensity === "compact"
                          ? " compact"
                          : "") +
                        (prefs.libraryBookmarks &&
                        visible.some((b) => bookmarksByBook.has(b.id))
                          ? " with-marks"
                          : "") +
                        (prefs.libraryCovers ? "" : " hide-covers") +
                        (prefs.libraryFlags ? "" : " hide-flags") +
                        (prefs.libraryGenres ? "" : " hide-genres") +
                        (prefs.libraryAuthors ? "" : " hide-authors") +
                        (prefs.libraryLargeText ? " large-text" : "")
                      }
                      data-card-size={cardSize}
                    >
                      {visible.map((b) => (
                        <article
                          key={b.id}
                          className="book-card"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setBookMenu({
                              id: b.id,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                        >
                          <div className="book-card-controls">
                            <input
                              type="checkbox"
                              aria-label={t("Select {title}", {
                                title: b.title,
                              })}
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
                                b.favorite
                                  ? t("Remove {title} from favorites", {
                                      title: b.title,
                                    })
                                  : t("Add {title} to favorites", {
                                      title: b.title,
                                    })
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
                            <BookMenu
                              book={b}
                              voiceName={
                                voices.find((v) => v.id === bookVoice(b, prefs))
                                  ?.name || t("No voice selected")
                              }
                              actions={bookMenuActions}
                              openAt={
                                bookMenu?.id === b.id
                                  ? { x: bookMenu.x, y: bookMenu.y }
                                  : null
                              }
                              onClosed={() => setBookMenu(null)}
                            />
                          </div>
                          <div className="book-entry">
                            <div className="cover-column">
                              <CoverControl
                                book={b}
                                onTrash={
                                  b.deleted
                                    ? undefined
                                    : () => {
                                        void moveToTrash(new Set([b.id])).catch(
                                          error,
                                        );
                                      }
                                }
                                onOpen={() => {
                                  if (b.deleted) void restore([b]).catch(error);
                                  else void openBook(b.id).catch(error);
                                }}
                                onEdit={() => {
                                  void editCover(b).catch(error);
                                }}
                                job={b.deleted ? undefined : coverJob(b)}
                              />
                              {!list &&
                                prefs.libraryCovers &&
                                prefs.libraryBookmarks &&
                                !b.deleted &&
                                bookmarkChips(b.id, true)}
                            </div>
                            <button
                              className="book-open"
                              onClick={() => {
                                if (b.deleted) void restore([b]).catch(error);
                                else void openBook(b.id).catch(error);
                              }}
                            >
                              <div className="book-card-info">
                                <div className="book-title-row">
                                  {b.language && (
                                    <LanguageFlag
                                      code={b.language}
                                      interfaceLanguage={prefs.uiLanguage}
                                    />
                                  )}
                                  <h3>{b.title}</h3>
                                </div>
                                <p>{b.author}</p>
                                <span className="format-badge">{b.format}</span>
                                <div
                                  className="genre-tags"
                                  aria-label={t("Book genres")}
                                >
                                  {bookGenres(b).map((genre) => (
                                    <span
                                      key={genre}
                                      className={
                                        "genre-tag genre-" + genreColor(genre)
                                      }
                                    >
                                      {genre}
                                    </span>
                                  ))}
                                </div>
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
                                  {t("{words} words · {time} listening", {
                                    words: b.wordCount.toLocaleString(),
                                    time: formatDuration(
                                      listeningMinutes(
                                        b.wordCount,
                                        prefs.speed,
                                      ),
                                    ),
                                  })}
                                </small>
                              </div>
                            </button>
                            {(list || !prefs.libraryCovers) &&
                              prefs.libraryBookmarks &&
                              !b.deleted &&
                              bookmarkChips(b.id, !list)}
                          </div>
                        </article>
                      ))}
                    </div>
                    {!visible.length && (
                      <div className="empty">
                        <FolderOpen size={38} />
                        <h2>
                          {query
                            ? shelf === "stories"
                              ? t("No matching stories")
                              : t("No matching documents")
                            : collection === "Trash"
                              ? t("Trash is empty")
                              : shelf === "stories"
                                ? t("No stories here")
                                : t("No documents here")}
                        </h2>
                        <p>
                          {query
                            ? t("Try another title or author.")
                            : collection !== "All books"
                              ? t("Import a file or add text with Quick Read.")
                              : shelf === "stories"
                                ? t("Novels, tales and plays: EPUB, Kindle and FB2 books, or any file you import here.")
                                : t("PDFs, Word files, web pages, notes and course material. They stay apart from your stories, and Work mode can use them.")}
                        </p>
                        {!query && collection === "All books" && (
                          <button className="primary" onClick={() => fileInput.current?.click()} disabled={busy}>
                            <Upload size={17} />
                            {shelf === "stories" ? t("Import stories") : t("Import documents")}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
                {page === "reader" && book && (
                  <>
                    {!bookActive &&
                      (reading.focusTool === "line" ||
                        reading.focusTool === "strip") && (
                        <FocusOverlay
                          mode={reading.focusTool}
                          container={readingScroll}
                          lineHeight={reading.fontSize * reading.lineHeight}
                        />
                      )}
                    <div
                      ref={readingScroll}
                      className={
                        "reading-scroll mode-" +
                        prefs.readingMode +
                        (bookActive ? " book-active" : "") +
                        (reading.focusTool === "paragraph"
                          ? " focus-paragraph"
                          : "")
                      }
                      onKeyDown={(e) => {
                        if (bookActive) {
                          const field = (e.target as HTMLElement).closest(
                            "input, select, textarea, [role=menu]",
                          );
                          const keys: Record<string, 1 | -1> = {
                            ArrowRight: 1,
                            PageDown: 1,
                            ArrowLeft: -1,
                            PageUp: -1,
                          };
                          let direction = keys[e.key];
                          if (e.key === " ") direction = e.shiftKey ? -1 : 1;
                          if (
                            field ||
                            window.getSelection()?.isCollapsed === false
                          )
                            return;
                          if (direction) {
                            e.preventDefault();
                            bookNav.current?.turn(direction);
                          } else if (e.key === "Home" || e.key === "End") {
                            e.preventDefault();
                            bookNav.current?.edge(e.key === "End");
                          }
                          return;
                        }
                        if (
                          (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
                          e.target === e.currentTarget &&
                          window.getSelection()?.isCollapsed !== false
                        ) {
                          e.preventDefault();
                          navigateReadingPage(
                            readerPage + (e.key === "ArrowRight" ? 1 : -1),
                          );
                        }
                      }}
                      tabIndex={0}
                      role="region"
                      aria-label={t("Book text")}
                      onScroll={readerScrolled}
                      onMouseUp={(e) => {
                        const s = window.getSelection();
                        if (
                          e.button === 0 &&
                          (!s || s.isCollapsed) &&
                          autoTabFrom.current &&
                          !(e.target as HTMLElement).closest(
                            "button, a, input, select, textarea",
                          )
                        )
                          backToEarlierTab();
                        else captureSelection();
                      }}
                      onKeyUp={captureSelection}
                      onContextMenu={(e) => {
                        const target = (
                          e.target as HTMLElement
                        ).closest<HTMLElement>("[data-paragraph]");
                        // The browser's own menu has nothing for a book.
                        e.preventDefault();
                        if (!target) return;
                        const s = window.getSelection();
                        const selected = Boolean(
                          s &&
                          !s.isCollapsed &&
                          s.rangeCount &&
                          s.getRangeAt(0).intersectsNode(target),
                        );
                        if (selected) captureSelection();
                        setReaderMenu({
                          x: e.clientX,
                          y: e.clientY,
                          selected,
                          paragraphId: target.dataset.paragraph!,
                        });
                      }}
                    >
                      {bookActive ? (
                        <BookView
                          key={book.meta.id}
                          rootRef={article}
                          book={book}
                          position={book.meta.position}
                          playing={player.status !== "idle"}
                          onPosition={(n) => {
                            const current = bookRef.current;
                            if (
                              current &&
                              playbackStatusRef.current === "idle" &&
                              current.meta.position !== n
                            )
                              void updateMeta({
                                ...current.meta,
                                position: n,
                              }).catch(error);
                          }}
                          annotationsByParagraph={annotationsByParagraph}
                          speaking={speakingParagraph}
                          sentence={sentenceMark}
                          follow={prefs.follow}
                          pageClass={bookPageClass}
                          fontSize={reading.fontSize}
                          lineHeight={reading.lineHeight}
                          layoutKey={[
                            reading.readerFont,
                            reading.letterSpacing,
                            reading.wordSpacing,
                            prefs.bookTypeset,
                          ].join("|")}
                          fontName={t(
                            (
                              readerFonts.find(
                                (f) => f.id === reading.readerFont,
                              ) || readerFonts[0]
                            ).name,
                          )}
                          opening={prefs.bookOpening}
                          sound={prefs.bookSound}
                          interfaceLanguage={prefs.uiLanguage}
                          navRef={bookNav}
                        />
                      ) : (
                        <section
                          ref={article}
                          className={
                            "reading-pages" +
                            (prefs.pageGap === 0 ? " seamless-pages" : "") +
                            (virtualPages ? " virtual-pages" : "")
                          }
                          aria-label={t("Reading pages")}
                        >
                          {spacers.top > 0 && (
                            <div
                              className="page-spacer"
                              style={{ height: spacers.top }}
                              aria-hidden="true"
                            />
                          )}
                          {pageWindow.start === 0 && (
                            <article
                              className={readingPageClass + " reading-cover"}
                              data-reading-cover
                              aria-label={t("Cover")}
                              ref={(el) => {
                                if (el)
                                  coverPageHeight.current =
                                    el.offsetHeight + prefs.pageGap;
                              }}
                            >
                              <div className="reading-cover-art">
                                <div className="reading-cover-scale">
                                  <Cover book={book.meta} />
                                </div>
                              </div>
                              <h1>{book.meta.title}</h1>
                              {!isUnknownAuthor(book.meta.author) && (
                                <p>{book.meta.author}</p>
                              )}
                            </article>
                          )}
                          {visibleReadingPages.map((readingPage) => {
                            const inPage = (n: number) =>
                              n >= readingPage.start && n < readingPage.end;
                            return (
                              <ReadingPage
                                language={uiLanguage}
                                key={readingPage.index}
                                index={readingPage.index}
                                total={bookPages.length}
                                start={readingPage.start}
                                end={readingPage.end}
                                paragraphs={book.paragraphs}
                                author={book.meta.author}
                                format={book.meta.format}
                                className={readingPageClass}
                                progress={prefs.readingProgress}
                                annotationsByParagraph={annotationsByParagraph}
                                speaking={
                                  inPage(speakingParagraph)
                                    ? speakingParagraph
                                    : -1
                                }
                                sentence={
                                  sentenceMark && inPage(sentenceMark.paragraph)
                                    ? sentenceMark
                                    : null
                                }
                                unvoiced={
                                  player.unvoiced.bookId === book.meta.id
                                    ? player.unvoiced.paragraphs
                                        .filter(inPage)
                                        .join(",")
                                    : ""
                                }
                                actions={readingPageActions}
                              />
                            );
                          })}
                          {spacers.bottom > 0 && (
                            <div
                              className="page-spacer"
                              style={{ height: spacers.bottom }}
                              aria-hidden="true"
                            />
                          )}
                        </section>
                      )}
                    </div>
                    <button
                      className="reader-edge-nav previous"
                      aria-label={t("Previous reading page")}
                      title={t("Previous page")}
                      onWheel={scrollFromMargin}
                      disabled={readerPage === 0}
                      onClick={() => navigateReadingPage(readerPage - 1)}
                    >
                      <span>
                        <ChevronLeft size={32} />
                      </span>
                    </button>
                    <button
                      className="reader-edge-nav next"
                      aria-label={t("Next reading page")}
                      title={t("Next page")}
                      onWheel={scrollFromMargin}
                      disabled={readerPage >= bookPages.length - 1}
                      onClick={() => navigateReadingPage(readerPage + 1)}
                    >
                      <span>
                        <ChevronRight size={32} />
                      </span>
                    </button>
                    {selection && (
                      <div
                        className="selection-toolbar"
                        aria-label={t("Passage actions")}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <button
                          onClick={() => {
                            void readSelection();
                          }}
                        >
                          <Play size={16} />
                          {t("Read")}
                        </button>
                        <IconButton
                          label={t("Underline selection")}
                          onClick={() => {
                            void addAnnotation("underline").catch(error);
                          }}
                        >
                          <Underline size={17} />
                        </IconButton>
                        <IconButton
                          label={t("Add note to selection")}
                          onClick={() => chooseTab("notes")}
                        >
                          <MessageSquare size={17} />
                        </IconButton>
                        <IconButton
                          label={t("Bookmark selection")}
                          onClick={() => {
                            void addAnnotation("bookmark").catch(error);
                          }}
                        >
                          <Bookmark size={17} />
                        </IconButton>
                        <button onClick={() => chooseTab("selection")}>
                          {t("More")}
                          <ChevronRight size={14} />
                        </button>
                        <IconButton
                          label={t("Clear passage selection")}
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
                          {t("{count} saved", { count: annotations.length })}
                        </span>
                        <h1>{t("Bookmarks & notes")}</h1>
                      </div>
                    </div>
                    <div className="wide-notes">{notesPanel()}</div>
                  </>
                )}
                {page === "voices" && (
                  <div className="voices-page">
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">{t("Local speech")}</span>
                        <h1>{t("Voices")}</h1>
                      </div>
                    </div>
                    <div className="voice-workspace-tabs" role="tablist" aria-label={t("Voice workspace")}>
                      <button role="tab" id="voice-library-tab" aria-controls="voice-library-panel" aria-selected={voiceSection === "library"} onClick={() => setVoiceSection("library")}><AudioLines size={17}/>{t("My voices")}</button>
                      <button role="tab" id="voice-create-tab" aria-controls="voice-create-panel" aria-selected={voiceSection === "create"} onClick={() => setVoiceSection("create")}><Plus size={17}/>{t("Create a voice")}{studioBusy && " · " + t("Creating")}</button>
                    </div>
                    <div id="voice-library-panel" role="tabpanel" aria-labelledby="voice-library-tab" hidden={voiceSection !== "library"}>{voiceLibrary()}</div>
                    <div id="voice-create-panel" role="tabpanel" aria-labelledby="voice-create-tab" hidden={voiceSection !== "create"}>
                      <VoiceStudio active={voiceSection === "create"} onBusy={voiceStudioBusy} beforeGenerate={async () => { await player.unload(); await covers.cancel(); }} onSaved={async () => { await refreshVoices(); }} onUse={(id) => { setVoiceSoon(id); setVoiceSection("library"); void refreshVoices().catch(error); }} onModels={() => { patchPrefs({ settingsCategory: "models" }); setPage("settings"); }}/>
                    </div>
                  </div>
                )}
                {page === "settings" && settingsPage()}
              </main>
            )}
          </div>
          {inspectorOpen && (
            <div
              role="separator"
              aria-label={t("Resize inspector")}
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
          {overlayOpen && (
            <div
              className="panel-scrim"
              aria-hidden="true"
              onClick={() => {
                if (overlayInspector && inspectorOpen) patchPrefs({ rightOpen: false });
                if (overlayNavigation && navigationOpen) setCompactLeft(false);
              }}
            />
          )}
          {inspectorAvailable && (
            <aside
              className={"inspector " + (!inspectorOpen ? "collapsed" : "")}
              aria-hidden={!inspectorOpen || otherMode}
              inert={!inspectorOpen || otherMode}
            >
              <div className="inspector-header">
                <div
                  className="inspector-tabs"
                  data-count={inspectorTabs.length}
                  role="tablist"
                  aria-label={t("Inspector tabs")}
                >
                  {inspectorTabs.map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      id={"inspector-tab-" + tab.id}
                      aria-controls="inspector-panel"
                      tabIndex={activeTab === tab.id ? 0 : -1}
                      onKeyDown={(e) => {
                        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
                        if (!keys.includes(e.key)) return;
                        e.preventDefault();
                        const i = inspectorTabs.findIndex(
                          (x) => x.id === tab.id,
                        );
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
                      aria-selected={activeTab === tab.id}
                      className={activeTab === tab.id ? "active" : ""}
                      title={t(tab.label)}
                      onClick={() => {
                        autoTabFrom.current = null;
                        patchPrefs({ inspector: tab.id });
                      }}
                    >
                      {tab.icon}
                      <span>{t(tab.label)}</span>
                    </button>
                  ))}
                </div>
                <IconButton
                  label={t("Close inspector")}
                  onClick={() => patchPrefs({ rightOpen: false })}
                >
                  <X size={16} />
                </IconButton>
              </div>
              <div
                role="tabpanel"
                id="inspector-panel"
                aria-labelledby={"inspector-tab-" + activeTab}
                className="inspector-scroll"
              >
                {activeTab === "appearance" ? (
                  <AppearancePanel
                    prefs={reading}
                    autoScale={autoScale}
                    onChange={patchReading}
                  />
                ) : activeTab === "voice" ? (
                  voicePanel()
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
          {updateOffer && (
            <UpdateToast
              found={updateOffer.found}
              managed={updateOffer.managed}
              onLater={() => setUpdateOffer(null)}
              onSettings={() => {
                setUpdateOffer(null);
                patchPrefs({ workMode: false, studioMode: false });
                setPage("settings");
              }}
            />
          )}
          <footer className="player" inert={otherMode}>
            <div className="now-playing">
              {page === "reader" && book ? (
                <button
                  className="brand player-brand"
                  title={t("Library")}
                  onClick={() => {
                    setPage("library");
                    setQuery("");
                  }}
                >
                  <img src="/crane.png" alt="" />
                  {t("Origami")}
                </button>
              ) : book ? (
                <>
                  <Cover book={book.meta} small />
                  <div>
                    <strong>{book.meta.title}</strong>
                    <button
                      className="voice-link"
                      onClick={() => chooseTab("voice")}
                    >
                      {voices.find((v) => v.id === bookVoice(book.meta, prefs))
                        ?.name ||
                        (store.desktop
                          ? t("Choose a voice")
                          : t("Desktop playback"))}
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <img className="dock-crane" src="/crane.png" alt="" />
                  <div>
                    <strong>{t("No document open")}</strong>
                    <span>{t("Open a book or use Quick Read")}</span>
                  </div>
                </>
              )}
            </div>
            <div className="player-center">
              <div className="transport">
                <IconButton
                  label={
                    player.status === "idle"
                      ? t("Previous paragraph")
                      : t("Previous sentence (Ctrl+Left)")
                  }
                  disabled={!book}
                  onClick={() => void skipSentence(-1)}
                >
                  <SkipBack size={20} />
                </IconButton>
                <button
                  className="play-button"
                  aria-label={
                    player.status === "playing"
                      ? t("Pause playback")
                      : player.status === "paused"
                        ? t("Resume playback")
                        : t("Read aloud")
                  }
                  disabled={!book}
                  title={
                    player.status === "idle" && book
                      ? currentSection
                        ? t("Read aloud from {section} (Space)", {
                            section: currentSection.label,
                          })
                        : t("Read aloud from the current position (Space)")
                      : t("Pause or resume (Space)")
                  }
                  onClick={togglePlayback}
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
                  label={
                    player.status === "idle"
                      ? t("Next paragraph")
                      : t("Next sentence (Ctrl+Right)")
                  }
                  disabled={!book}
                  onClick={() => void skipSentence(1)}
                >
                  <SkipForward size={20} />
                </IconButton>
                <IconButton
                  label={t("Stop playback")}
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
                  <span className="seek-status">
                    {player.status === "generating"
                      ? t("Preparing voice")
                      : player.status === "paused"
                        ? t("Paused")
                        : player.status === "playing"
                          ? t("Reading")
                          : book
                            ? t("Ready")
                            : t("Nothing playing")}
                    {book &&
                      currentSection &&
                      currentSection.label !== book.meta.title && (
                        <> · {currentSection.label}</>
                      )}
                    {book && (
                      <em>
                        {" · "}
                        {t("{time} left in chapter", {
                          time: formatDuration(
                            listeningMinutes(
                              wordsLeftInChapter(
                                book.paragraphs,
                                book.meta.position,
                              ),
                              prefs.speed,
                            ),
                          ),
                        })}
                      </em>
                    )}
                  </span>
                  <PlaybackTimeLabel clock={player} />
                </div>
                <PlaybackSeek clock={player} />
              </div>
            </div>
            <div className="playback-options">
              {page === "reader" && book && bookProduction && (
                <button
                  className={"voice-chip studio-cast-chip" + (studioNarration ? " active" : "")}
                  aria-pressed={studioNarration}
                  title={
                    studioNarration
                      ? t("Read by the Studio cast. Choose to go back to the live voice.")
                      : t("Read this book with its Studio production: the cast and the takes made in Studio.")
                  }
                  onClick={() => {
                    void player.stop();
                    void updateMeta({ ...book.meta, narration: studioNarration ? undefined : bookProduction.id }).catch(error);
                  }}
                >
                  <Clapperboard size={14} />
                  <span>{t("Studio cast")}</span>
                </button>
              )}
              {page === "reader" && book && !studioNarration && (
                <button
                  className="voice-link voice-chip"
                  title={t("Choose a voice")}
                  onClick={() => chooseTab("voice")}
                >
                  <AudioLines size={14} />
                  <span>
                    {voices.find((v) => v.id === bookVoice(book.meta, prefs))
                      ?.name ||
                      (store.desktop
                        ? t("Choose a voice")
                        : t("Desktop playback"))}
                  </span>
                </button>
              )}
              <select
                aria-label={t("Playback speed")}
                value={prefs.speed}
                onChange={(e) => patchPrefs({ speed: +e.target.value })}
              >
                {[...new Set([...speeds, prefs.speed])]
                  .sort((a, b) => a - b)
                  .map((s) => (
                    <option value={s} key={s}>
                      {s.toFixed(2).replace(/0$/, "")}×
                    </option>
                  ))}
              </select>
              <div className="sleep-control">
                <IconButton
                  label={
                    sleep
                      ? sleep.mode === "chapter"
                        ? t("Sleep timer: end of chapter")
                        : t("Sleep timer: {sleepMinutesLeft} min left", {
                            sleepMinutesLeft: sleepMinutesLeft,
                          })
                      : t("Sleep timer")
                  }
                  active={Boolean(sleep)}
                  onClick={() => setSleepMenu(!sleepMenu)}
                >
                  <Timer size={18} />
                  {sleep && (
                    <span className="sleep-badge" aria-hidden="true">
                      {sleep.mode === "chapter" ? t("Ch") : sleepMinutesLeft}
                    </span>
                  )}
                </IconButton>
                {sleepMenu && (
                  <div
                    className="sleep-menu"
                    role="menu"
                    aria-label={t("Sleep timer")}
                  >
                    {[15, 30, 45, 60, 90].map((minutes) => (
                      <button
                        key={minutes}
                        role="menuitemradio"
                        aria-checked={
                          sleep?.mode === "minutes" && sleep.minutes === minutes
                        }
                        onClick={() => {
                          setSleep({
                            mode: "minutes",
                            minutes,
                            endsAt: Date.now() + minutes * 60000,
                          });
                          setSleepNow(Date.now());
                          setSleepMenu(false);
                          notify(
                            t("Sleep timer set for {minutes} minutes.", {
                              minutes: minutes,
                            }),
                          );
                        }}
                      >
                        {t("{count} minutes", { count: minutes })}
                      </button>
                    ))}
                    <button
                      role="menuitemradio"
                      aria-checked={sleep?.mode === "chapter"}
                      disabled={!book}
                      onClick={() => {
                        if (!book) return;
                        setSleep({
                          mode: "chapter",
                          chapter:
                            book.paragraphs[book.meta.position]?.chapter ?? 0,
                        });
                        setSleepMenu(false);
                        notify(t("Reading stops at the end of this chapter."));
                      }}
                    >
                      {t("End of chapter")}
                    </button>
                    <button
                      role="menuitemradio"
                      aria-checked={!sleep}
                      onClick={() => {
                        setSleep(null);
                        setSleepMenu(false);
                      }}
                    >
                      {t("Off")}
                    </button>
                  </div>
                )}
              </div>
              <Volume2 size={18} />
              <input
                type="range"
                aria-label={t("Volume")}
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
                  {t("Undo")}
                </button>
              )}
              <IconButton
                label={t("Dismiss notice")}
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </IconButton>
            </div>
          )}
          {readerMenu && page === "reader" && (
            <ReaderMenu
              x={readerMenu.x}
              y={readerMenu.y}
              selected={readerMenu.selected}
              color={color}
              onAction={readerMenuAction}
              onClose={closeReaderMenu}
            />
          )}
          {voiceDownloads && (
            <VoiceDownloads
              voices={voices}
              seen={prefs.seenVoices}
              interfaceLanguage={prefs.uiLanguage}
              onClose={() => setVoiceDownloads(false)}
            />
          )}
          {coverEditor && (
            <CoverDialog
              book={coverEditor.meta}
              prompt={coverPrompt(coverEditor)}
              allowMature={prefs.allowMatureCovers}
              starter={starterCover(coverEditor.meta)}
              onMature={setMatureCovers}
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
          {deleteCandidates.length > 0 && (
            <div className="modal-scrim">
              <section
                className="quick-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-books-title"
                onKeyDown={(e) => {
                  if (e.key === "Escape" && !deletingBooks)
                    setDeleteCandidates([]);
                  if (e.key === "Tab") {
                    const buttons = Array.from(
                      e.currentTarget.querySelectorAll<HTMLButtonElement>(
                        "button:not(:disabled)",
                      ),
                    );
                    const first = buttons[0];
                    const last = buttons.at(-1);
                    if (e.shiftKey && document.activeElement === first) {
                      e.preventDefault();
                      last?.focus();
                    } else if (!e.shiftKey && document.activeElement === last) {
                      e.preventDefault();
                      first?.focus();
                    }
                  }
                }}
              >
                <h2 id="delete-books-title">
                  {deleteCandidates.length === 1
                    ? t("Delete 1 book permanently?")
                    : t("Delete {count} books permanently?", {
                        count: deleteCandidates.length,
                      })}
                </h2>
                <p>
                  {t(
                    "This removes their text, covers, notes and bookmarks from Origami. This cannot be undone. Manually exported files are untouched.",
                  )}
                </p>
                <ul>
                  {deleteCandidates.slice(0, 8).map((b) => (
                    <li key={b.id}>{b.title}</li>
                  ))}
                </ul>
                {deleteCandidates.length > 8 && (
                  <p>
                    {t("And {count} more.", {
                      count: deleteCandidates.length - 8,
                    })}
                  </p>
                )}
                <div className="dialog-actions">
                  <button
                    autoFocus
                    disabled={deletingBooks}
                    onClick={() => setDeleteCandidates([])}
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    disabled={deletingBooks}
                    onClick={() => void permanentlyDelete()}
                  >
                    {deletingBooks ? t("Deleting…") : t("Delete permanently")}
                  </button>
                </div>
              </section>
            </div>
          )}
          {supportDue && (
            <div className="modal-scrim">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="support-dialog-title"
                className="quick-dialog support-dialog"
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSupport("later");
                }}
              >
                <img className="support-dialog-crane" src="/crane.png" alt="" />
                <h2 id="support-dialog-title">
                  {t("Enjoying Origami Reader?")}
                </h2>
                <p>
                  {t(
                    "Thank you for reading with Origami. It is free and made by one independent developer, with no ads and nothing locked. If it has been useful to you, would you consider supporting it?",
                  )}
                </p>
                <p className="hint">
                  {prefs.supportPrompt === "later"
                    ? t(
                        "This is the last time Origami asks. Every feature stays free either way.",
                      )
                    : t("Every feature stays free either way.")}
                </p>
                <div className="support-dialog-actions">
                  <button
                    className="donate-button"
                    autoFocus
                    onClick={() => {
                      openSupport();
                      closeSupport("support");
                    }}
                  >
                    <Heart size={17} fill="currentColor" />
                    {t("Support on Ko-fi")}
                  </button>
                  <button onClick={() => closeSupport("later")}>
                    {t("Maybe later")}
                  </button>
                </div>
                <div className="support-dialog-footer">
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={supportNever}
                      onChange={(e) => setSupportNever(e.target.checked)}
                    />
                    {t("Don't ask again")}
                  </label>
                  <button
                    className="text-button"
                    onClick={() => closeSupport("supported")}
                  >
                    {t("I already support Origami")}
                  </button>
                </div>
              </section>
            </div>
          )}
          <HoverTips root={appRoot} />
          {showShortcuts && (
            <div
              className="modal-scrim"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowShortcuts(false);
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-title"
                className="quick-dialog shortcuts-dialog"
              >
                <div className="section-row">
                  <h2 id="shortcuts-title">{t("Keyboard shortcuts")}</h2>
                  <IconButton
                    label={t("Close keyboard shortcuts")}
                    autoFocus
                    onClick={() => setShowShortcuts(false)}
                  >
                    <X size={20} />
                  </IconButton>
                </div>
                <ShortcutList />
              </section>
            </div>
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
                  <h2 id="quick-title">{t("Quick Read")}</h2>
                  <IconButton
                    label={t("Close Quick Read")}
                    onClick={() => setQuick(false)}
                  >
                    <X size={20} />
                  </IconButton>
                </div>
                <label>
                  {t("Title")}
                  <input
                    autoFocus
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                  />
                </label>
                <label>
                  {t("Text")}
                  <textarea
                    aria-label={t("Text to read")}
                    placeholder={t("Paste or write text")}
                    value={quickText}
                    onChange={(e) => setQuickText(e.target.value)}
                  />
                </label>
                <div className="dialog-actions">
                  <span className="hint">
                    {t("{count} characters", {
                      count: quickText.length.toLocaleString(),
                    })}
                  </span>
                  <button
                    className="primary"
                    disabled={!quickText.trim()}
                    onClick={() => {
                      void addQuick().catch(error);
                    }}
                  >
                    <Library size={17} />
                    {t("Add and open")}
                  </button>
                </div>
              </section>
            </div>
          )}
          {modelSwitch && (
            <div className="modal-scrim">
              <section
                className="quick-dialog model-switch-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="model-switch-title"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setModelSwitch(null);
                }}
              >
                <h2 id="model-switch-title">
                  {t("Switch to {model}?", { name: modelSwitch.voice.name, model: modelSwitch.model.name })}
                </h2>
                <p>
                  {t(
                    "{name} was made for {model}, not the speech model you are using now. Choosing it switches Origami to {model} for reading aloud.",
                    { name: modelSwitch.voice.name, model: modelSwitch.model.name },
                  )}
                </p>
                <ul>
                  <li>
                    {t(
                      "The first sentence takes longer while the new model loads, and loading may take longer than you are used to.",
                    )}
                  </li>
                  <li>
                    {t(
                      "Speed, memory use and sound quality can differ between models.",
                    )}
                  </li>
                  <li>
                    {t(
                      "The voice list then shows the voices made for {model}. Switch back at any time in Settings, Voices and speech.",
                      { model: modelSwitch.model.name },
                    )}
                  </li>
                </ul>
                <div className="dialog-actions">
                  <button autoFocus onClick={() => setModelSwitch(null)}>
                    {t("Cancel")}
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      const { voice, model } = modelSwitch;
                      setModelSwitch(null);
                      void chooseSpeechModel(model.id, voice.id)
                        .then(() =>
                          notify(
                            t("Now reading with {name} on {model}.", {
                              name: voice.name,
                              model: model.name,
                            }),
                          ),
                        )
                        .catch(error);
                    }}
                  >
                    {t("Switch model and use {name}", {
                      name: modelSwitch.voice.name,
                    })}
                  </button>
                </div>
              </section>
            </div>
          )}
          {pinRequest && (
            <PinDialog
              key={pinRequest.title}
              request={pinRequest}
              onClose={() => setPinRequest(null)}
            />
          )}
        </div>
      </SectionState>
    </CoverTextContext>
  );
}
