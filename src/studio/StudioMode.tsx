import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioLines, BookOpen, Clapperboard, FolderOpen, Headphones, Mic2, PanelLeftClose, PanelLeftOpen, Play, Plus, Search, ShieldCheck, Square, Wand2, Wrench, X } from "lucide-react";
import { t } from "../i18n";
import { Cover, IconButton } from "../components/Primitives";
import { Section } from "../components/Section";
import * as store from "../storage";
import type { Book, BookMeta, Preferences, Voice } from "../types";
import { chosenTake, createProduction, deleteProduction, listProductions, newProduction, openPortable, progress, readProduction, takeIssues, typicalPace, verifyFile, type Production, type ProductionInfo, type Verification } from "./production";
import { ProductionView } from "./ProductionView";
import { RecordingDialog } from "./RecordingDialog";
import { StudioSetup } from "./StudioSetup";
import { studioDemo, studioDemoWanted } from "./devPreview";
import { PanelResizer } from "../work/PanelResizer";
import type { SideWidth } from "../components/ModeHeader";
import "./studio.css";

const LANGUAGES: Record<string, string> = { en: "english", fr: "french", de: "german", es: "spanish", it: "italian", pt: "portuguese", ru: "russian", ja: "japanese", ko: "korean", zh: "chinese" };
const languageName = (code?: string) => (code ? LANGUAGES[code.slice(0, 2).toLowerCase()] : undefined);

type Props = {
  open: boolean;
  books: BookMeta[];
  voices: Voice[];
  prefs: Preferences;
  // The side panel's top, shared with the other modes (ModeHeader).
  modeHeader: (tools?: ReactNode) => ReactNode;
  // The side panel's width, shared with Read and Work.
  side: SideWidth;
};

// Studio mode: productions made from library books, each opened in the editor.
export function StudioMode({ open, books, voices, prefs, modeHeader, side }: Props) {
  const [list, setList] = useState<ProductionInfo[] | null>(null);
  const [current, setCurrent] = useState<Production | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [creating, setCreating] = useState(false);
  // "Make an audiobook in Studio" from a book's menu in Read mode.
  const [startWith, setStartWith] = useState("");
  useEffect(() => {
    const start = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      setStartWith(id);
      setCreating(true);
    };
    window.addEventListener("origami:studio-book", start);
    return () => window.removeEventListener("origami:studio-book", start);
  }, []);
  const [verifying, setVerifying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const [verified, setVerified] = useState<Verification | null>(null);
  const [error, setError] = useState("");
  // Home as Read's library: the side panel can fold away, and a search filters the productions.
  const [navOpen, setNavOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  // The last production, read in full for its chapter bars on the Continue card.
  const [latestFull, setLatestFull] = useState<Production | null>(null);
  const usable = useMemo(() => voices.filter((v) => v.available), [voices]);
  const covers = useMemo(() => new Map(books.map((b) => [b.id, b.coverImage])), [books]);

  async function refresh() {
    if (demoRef.current) return;
    try {
      setList(await listProductions());
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (open && list === null) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Development only (devPreview.ts): the editor on a book, in a browser.
  const demoRef = useRef<Production | null>(null);
  useEffect(() => {
    if (!open || current || !studioDemoWanted() || !books.length) return;
    const pick = books.find((b) => /monte cristo/i.test(b.title)) || books[0];
    void store.readBook(pick.id).then((b) => {
      const demo = studioDemo(b, prefs);
      demoRef.current = demo;
      setBook(b);
      setCurrent(demo);
      setList([{ ...demo.info, units: demo.units.length, rendered: demo.takes.length }]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, books.length]);

  useEffect(() => {
    const first = [...(list || [])].sort((a, b) => b.updated - a.updated)[0];
    if (!first || current) return;
    if (demoRef.current?.info.id === first.id) return setLatestFull(demoRef.current);
    let live = true;
    void readProduction(first.id)
      .then((p) => live && setLatestFull(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, current]);
  // Per chapter: the share of lines generated and approved; and the lines to review.
  const latestStats = useMemo(() => {
    if (!latestFull) return null;
    const typical = typicalPace(latestFull.takes);
    const byChapter = new Map<number, { total: number; heard: number; approved: number }>();
    let review = 0;
    for (const u of latestFull.units) {
      const c = byChapter.get(u.chapter) || { total: 0, heard: 0, approved: 0 };
      c.total++;
      if (u.take && u.status !== "pending") c.heard++;
      if (u.status === "approved") c.approved++;
      else if (takeIssues(chosenTake(latestFull, u), u, typical).length) review++;
      byChapter.set(u.chapter, c);
    }
    return { id: latestFull.info.id, chapters: [...byChapter.values()], review };
  }, [latestFull]);

  async function openProduction(id: string) {
    setError("");
    if (demoRef.current?.info.id === id) return setCurrent(demoRef.current);
    try {
      const p = await readProduction(id);
      setCurrent(p);
      setBook(await store.readBook(p.info.bookId).catch(() => null));
    } catch (e) {
      setError(String(e));
    }
  }

  if (!open) return null;
  if (current)
    return (
      <ProductionView
        production={current}
        book={book}
        voices={usable}
        prefs={prefs}
        modeHeader={modeHeader}
        side={side}
        onBack={() => {
          setCurrent(null);
          void refresh();
        }}
        onChange={setCurrent}
        onDelete={async () => {
          await deleteProduction(current.info.id);
          setCurrent(null);
          void refresh();
        }}
      />
    );
  const voiceName = (id: string) => usable.find((v) => v.id === id)?.name || "";
  const verify = async () => {
    setVerifying(true);
    try {
      const r = await verifyFile();
      if (!r.cancelled) setVerified(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setVerifying(false);
    }
  };
  const openCopy = async () => {
    setError("");
    setNotice("");
    setOpening(true);
    try {
      const r = await openPortable();
      if (!r) return;
      if (r.bookAdded) window.dispatchEvent(new CustomEvent("origami:library-changed"));
      await refresh();
      await openProduction(r.id);
      const names = r.missingVoices.map((v) => voices.find((x) => x.id === v)?.name || v);
      if (names.length) setNotice(t("Opened. Voices not on this computer: {voices}. Lines already generated keep their audio; choose other voices for new takes.", { voices: names.join(", ") }));
    } catch (e) {
      setError(String(e));
    } finally {
      setOpening(false);
    }
  };
  const metaOf = (id: string) => books.find((b) => b.id === id);
  const recent = [...(list || [])].sort((a, b) => b.updated - a.updated);
  const sorted = sort === "title" ? [...recent].sort((a, b) => a.title.localeCompare(b.title)) : recent;
  const q = query.trim().toLowerCase();
  const shown = q ? sorted.filter((p) => (p.title + " " + p.author).toLowerCase().includes(q)) : sorted;
  const latest = !q ? recent[0] : undefined;
  const lines = (p: ProductionInfo) =>
    progress(p) >= 1
      ? t("All {total} lines generated", { total: String(p.units || 0) })
      : t("{done} of {total} lines generated", { done: String(p.rendered || 0), total: String(p.units || 0) });
  const cover = (p: ProductionInfo) => {
    const meta = metaOf(p.bookId);
    return meta ? (
      <Cover book={meta} />
    ) : (
      <span className="studio-cover">
        <BookOpen size={28} />
      </span>
    );
  };
  return (
    <div className={"studio-mode studio-home" + (navOpen ? "" : " no-nav")} style={{ "--studio-left": `${side.width}px` } as React.CSSProperties}>
      {navOpen && (
        <PanelResizer side="left" width={side.width} min={side.min} max={side.max} fallback={side.fallback} inset={{ edge: 0, gap: 0 }} label={t("Resize the sidebar")} onChange={side.onChange} />
      )}
      {/* The side panel, as Read's: the modes, the page, the productions and the tools. */}
      {navOpen && (
        <nav className="studio-nav" aria-label={t("Studio navigation")}>
          {modeHeader()}
          <div className="main-nav">
            <button className="active">
              <Clapperboard size={20} />
              {t("Productions")}
              <span className="count">{list?.length ?? ""}</span>
            </button>
          </div>
          <div className="sidebar-sections">
            {sorted.length > 0 && (
              <Section id="studio-productions" title={t("Recently opened")} icon={<Clapperboard size={15} />} meta={sorted.length}>
                <ul className="studio-nav-list">
                  {sorted.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => void openProduction(p.id)}>
                        <span className="studio-nav-cover" style={covers.get(p.bookId) ? { backgroundImage: `url("${covers.get(p.bookId)}")` } : undefined} />
                        <span className="studio-nav-text">
                          <strong>{p.title}</strong>
                          <span className="studio-progress" aria-hidden="true">
                            <i style={{ width: `${Math.round(progress(p) * 100)}%` }} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section id="studio-tools" title={t("Tools")} icon={<Wrench size={15} />}>
              <div className="studio-nav-tools">
                <button onClick={() => setRecording(true)} disabled={!store.desktop} data-tip={t("Make a book from an audiobook or a recording")}>
                  <AudioLines size={16} /> {t("From a recording")}
                </button>
                <button onClick={() => void openCopy()} disabled={!store.desktop || opening} data-tip={t("Continue a production saved on another computer")}>
                  <FolderOpen size={16} /> {opening ? t("Opening") : t("Open a portable copy")}
                </button>
                <button onClick={() => void verify()} disabled={!store.desktop || verifying} data-tip={t("Check whether an audio file was made with Origami Reader")}>
                  <ShieldCheck size={16} /> {verifying ? t("Checking") : t("Verify a file")}
                </button>
              </div>
            </Section>
          </div>
        </nav>
      )}
      <main className="studio-main">
        <header className="topbar">
          <div className="header-left">
            <IconButton label={navOpen ? t("Collapse navigation") : t("Expand navigation")} onClick={() => setNavOpen(!navOpen)}>
              {navOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </IconButton>
            <span className="breadcrumb">{t("Studio")}</span>
          </div>
        </header>
        <div className="workspace studio-home-body">
          <div className="page-heading library-heading studio-heading">
            <h1>{t("Productions")}</h1>
            <div className="heading-actions">
              <button onClick={() => setRecording(true)} disabled={!store.desktop}>
                <AudioLines size={17} /> {t("From a recording")}
              </button>
              <button className="primary" onClick={() => setCreating(true)} disabled={!store.desktop && !demoRef.current}>
                <Plus size={17} /> {t("New production")}
              </button>
            </div>
          </div>
          {/* Search and order, as the library's toolbar. */}
          <div className="library-controls">
            <div className="search-field library-search">
              <Search size={18} />
              <input aria-label={t("Search productions")} placeholder={t("Search productions")} value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <IconButton label={t("Clear search")} onClick={() => setQuery("")}>
                  <X size={14} />
                </IconButton>
              )}
            </div>
            <select aria-label={t("Sort productions")} value={sort} onChange={(e) => setSort(e.target.value as "recent" | "title")}>
              <option value="recent">{t("Recently edited")}</option>
              <option value="title">{t("Title A to Z")}</option>
            </select>
          </div>
          {error && (
            <p className="studio-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="studio-notice" role="status">
              {notice}
            </p>
          )}
          <StudioSetup />
          {list && !list.length && (
            <section className="continue-section">
              <h2>{t("Turn a book into an audiobook")}</h2>
              <div className="continue-card studio-welcome">
                <p>{t("Studio reads a book from your library with the voices on this computer, line by line, so you can review every sentence before exporting.")}</p>
                <ol className="studio-welcome-steps">
                  <li>
                    <BookOpen size={20} />
                    <strong>{t("Pick a book")}</strong>
                    <span>{t("Any book in your library.")}</span>
                  </li>
                  <li>
                    <Mic2 size={20} />
                    <strong>{t("Choose a narrator")}</strong>
                    <span>{t("Listen to voices on the book's own lines.")}</span>
                  </li>
                  <li>
                    <Wand2 size={20} />
                    <strong>{t("Generate and review")}</strong>
                    <span>{t("Regenerate any line, approve, then export.")}</span>
                  </li>
                  <li>
                    <Headphones size={20} />
                    <strong>{t("Export")}</strong>
                    <span>{t("M4B or MP3, EPUB and a print PDF.")}</span>
                  </li>
                </ol>
              </div>
            </section>
          )}
          {latest && (
            <section className="continue-section">
              <h2>{t("Continue")}</h2>
              <div className="continue-card">
                {cover(latest)}
                <button className="continue-body" onClick={() => void openProduction(latest.id)}>
                  <span className="continue-info">
                    <strong>{latest.title}</strong>
                    <span>{latest.author}</span>
                    {voiceName(latest.voice) && (
                      <span className="studio-tag">
                        <Mic2 size={12} /> {voiceName(latest.voice)}
                      </span>
                    )}
                    {latestStats?.id === latest.id ? (
                      <span className="studio-chapter-bars" aria-label={t("Chapters")}>
                        {latestStats.chapters.map((c, i) => (
                          <i key={i}>
                            <b style={{ height: `${(c.approved / Math.max(1, c.total)) * 100}%` }} />
                            <s style={{ height: `${((c.heard - c.approved) / Math.max(1, c.total)) * 100}%` }} />
                          </i>
                        ))}
                      </span>
                    ) : (
                      <span className="book-progress">
                        <progress value={progress(latest)} max={1} />
                        {Math.round(progress(latest) * 100)}%
                      </span>
                    )}
                    <span className="continue-stats">
                      {lines(latest)}
                      {latestStats?.id === latest.id && latestStats.review > 0 && " · " + t("To review ({n})", { n: String(latestStats.review) })}
                    </span>
                  </span>
                  <span className="continue-open">
                    <Clapperboard size={17} />
                    {t("Open")}
                  </span>
                </button>
              </div>
            </section>
          )}
          {shown.length > 0 && (
            <section>
              <div className="shelf-heading">
                <h2>{t("All productions")}</h2>
              </div>
              <ul className="studio-cards">
                {shown.map((p) => (
                  <li key={p.id}>
                    <button className="studio-card" onClick={() => void openProduction(p.id)}>
                      {cover(p)}
                      <span className="studio-card-body">
                        <strong>{p.title}</strong>
                        <span className="muted">{p.author}</span>
                        {voiceName(p.voice) && (
                          <span className="studio-tag">
                            <Mic2 size={12} /> {voiceName(p.voice)}
                          </span>
                        )}
                        {(p.cast?.length ?? 0) > 0 && (
                          <span className="studio-cast-faces" aria-label={t("Cast")}>
                            {p.cast!.slice(0, 6).map((c) => (
                              <span key={c.id} className="studio-avatar" style={{ "--who": c.color } as React.CSSProperties} title={c.name}>
                                {c.name.slice(0, 1)}
                              </span>
                            ))}
                          </span>
                        )}
                        <span className="studio-progress" aria-hidden="true">
                          <i style={{ width: `${Math.round(progress(p) * 100)}%` }} />
                        </span>
                        <span className="muted small">{lines(p)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {list && list.length > 0 && !shown.length && <p className="hint">{t("No productions match this search.")}</p>}
        </div>
      </main>
      {verified && <VerifyResult result={verified} onClose={() => setVerified(null)} />}
      {recording && <RecordingDialog onClose={() => setRecording(false)} onMade={() => setNotice(t("The book is in your library."))} />}
      {creating && (
        <NewProduction
          initial={startWith}
          books={books}
          voices={usable}
          defaultVoice={prefs.voice}
          onCancel={() => {
            setCreating(false);
            setStartWith("");
          }}
          onCreate={async (bookId, voice) => {
            const b = await store.readBook(bookId);
            const p = newProduction(b, prefs, voice);
            await createProduction(p);
            setCreating(false);
            await refresh();
            await openProduction(p.info.id);
          }}
        />
      )}
    </div>
  );
}

function NewProduction({
  books,
  voices,
  defaultVoice,
  onCancel,
  onCreate,
  initial,
}: {
  initial?: string;
  books: BookMeta[];
  voices: Voice[];
  defaultVoice: string;
  onCancel: () => void;
  onCreate: (bookId: string, voice: string) => Promise<void>;
}) {
  const sorted = useMemo(() => [...books].filter((b) => !b.deleted).sort((a, b) => a.title.localeCompare(b.title)), [books]);
  const [query, setQuery] = useState("");
  const [bookId, setBookId] = useState((initial && sorted.some((b) => b.id === initial) ? initial : sorted[0]?.id) || "");
  const [voice, setVoice] = useState(voices.find((v) => v.id === defaultVoice)?.id || voices[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const shown = sorted.filter((b) => !query || (b.title + " " + b.author).toLowerCase().includes(query.toLowerCase()));
  const chosen = books.find((b) => b.id === bookId);
  const language = languageName(chosen?.language);
  const fits = (v: Voice) => !language || v.languages.some((l) => l.toLowerCase() === language);
  // Offer a narrator who speaks the book's language.
  useEffect(() => {
    const current = voices.find((v) => v.id === voice);
    if (current && fits(current)) return;
    const pick = voices.find((v) => v.id === defaultVoice && fits(v)) || voices.find(fits);
    if (pick) setVoice(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);
  useEffect(() => () => audio.current?.pause(), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, onCancel]);

  // An audition on the book's own first lines.
  async function listen() {
    if (listening) {
      audio.current?.pause();
      setListening(false);
      return;
    }
    setListening(true);
    setError("");
    try {
      const b = await store.readBook(bookId);
      const para = b.paragraphs.find((p) => p.kind === "paragraph" && p.text.length > 60) || b.paragraphs[0];
      const sample = (para?.text || b.meta.title).slice(0, 220).replace(/\s+\S*$/, "");
      const result = await store.synthesize(sample, voice);
      const a = new Audio("data:audio/wav;base64," + result.audio);
      audio.current = a;
      a.onended = () => setListening(false);
      await a.play();
    } catch (e) {
      setError(String(e));
      setListening(false);
    }
  }
  const sortedVoices = [...voices].sort((a, b) => Number(fits(b)) - Number(fits(a)) || a.name.localeCompare(b.name));
  return (
    <div className="studio-dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form
        className="studio-dialog studio-new"
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-new-title"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          audio.current?.pause();
          try {
            await onCreate(bookId, voice);
          } catch (err) {
            setError(String(err));
            setBusy(false);
          }
        }}
      >
        <header>
          <h2 id="studio-new-title">{t("New production")}</h2>
          <button type="button" className="icon-only" onClick={onCancel} aria-label={t("Close")}>
            <X size={17} />
          </button>
        </header>
        <div className="studio-new-grid">
          <div className="studio-book-pick">
            <label className="studio-search">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search your library")} aria-label={t("Search your library")} />
            </label>
            <ul role="listbox" aria-label={t("Book")}>
              {shown.map((b) => (
                <li key={b.id}>
                  <button type="button" role="option" aria-selected={b.id === bookId} onClick={() => setBookId(b.id)}>
                    <span className="studio-mini-cover" style={b.coverImage ? { backgroundImage: `url("${b.coverImage}")` } : undefined} />
                    <span>
                      <strong>{b.title}</strong>
                      <small>{b.author}</small>
                    </span>
                  </button>
                </li>
              ))}
              {!shown.length && <li className="muted">{t("No book matches.")}</li>}
            </ul>
          </div>
          <div className="studio-new-side">
            {chosen && (
              <div className="studio-chosen-book">
                <span className="studio-cover" style={chosen.coverImage ? { backgroundImage: `url("${chosen.coverImage}")` } : undefined} />
                <strong>{chosen.title}</strong>
                <span className="muted">{chosen.author}</span>
                <span className="muted small">{t("{n} words", { n: chosen.wordCount.toLocaleString() })}</span>
              </div>
            )}
            <label className="studio-field">
              <span>{t("Narrator")}</span>
              <select value={voice} onChange={(e) => setVoice(e.target.value)} required>
                {sortedVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {!fits(v) ? " " + t("(other language)") : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void listen()} disabled={!voice || !bookId}>
              {listening ? <Square size={14} /> : <Play size={14} />} {listening ? t("Stop") : t("Listen on this book")}
            </button>
            {voices.length ? (
              <p className="studio-hint">{t("You can change the narrator later; lines generated before keep their voice until you regenerate them.")}</p>
            ) : (
              <p className="studio-warn">{t("No voice is installed yet, so a production cannot be created. Add one in Settings, Voices and speech.")}</p>
            )}
          </div>
        </div>
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        <div className="studio-row end">
          <button type="button" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button type="submit" className="primary" disabled={busy || !bookId || !voice}>
            {busy ? t("Preparing") : t("Create production")}
          </button>
        </div>
      </form>
    </div>
  );
}

function VerifyResult({ result, onClose }: { result: Verification; onClose: () => void }) {
  const w = result.watermark;
  const labels = Object.entries(result.labels || {});
  return (
    <div className="studio-dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="studio-dialog studio-verify" role="dialog" aria-modal="true" aria-labelledby="studio-verify-title">
        <header>
          <h2 id="studio-verify-title">{t("Verify a file")}</h2>
          <button className="icon-only" onClick={onClose} aria-label={t("Close")}>
            <X size={17} />
          </button>
        </header>
        <p>
          <strong>{result.file}</strong>
        </p>
        {w?.missing ? (
          <p className="studio-warn">{t("The watermark detector is not installed, so only the file's labels can be read.")}</p>
        ) : w?.detected ? (
          <div className="studio-verdict yes">
            <ShieldCheck size={20} />
            <div>
              <strong>{t("Made with Origami Reader")}</strong>
              <p>{t("This audio carries the Origami Reader watermark: it was narrated with AI-generated voices.")}</p>
              {w.match ? (
                <p className="muted small">
                  {t("Export {id} of {title}, {date}.", { id: w.match.export, title: w.match.title, date: new Date(w.match.date).toLocaleDateString() })}
                </p>
              ) : (
                <p className="muted small">{t("Made on another computer (mark {m}).", { m: w.message || "" })}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="studio-verdict no">
            <strong>{t("No Origami Reader watermark found.")}</strong>
            <p className="muted small">{t("Short or heavily changed audio (sped up, cut very short) can lose it.")}</p>
          </div>
        )}
        {labels.length > 0 && (
          <>
            <h3>{t("Labels in the file")}</h3>
            <dl className="studio-labels">
              {labels.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <div className="studio-row end">
          <button className="primary" onClick={onClose}>
            {t("Done")}
          </button>
        </div>
      </section>
    </div>
  );
}
