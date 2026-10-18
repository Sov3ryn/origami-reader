import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioLines, BookOpen, Clapperboard, FolderOpen, Headphones, Mic2, Play, Plus, Search, ShieldCheck, Square, Wand2, X } from "lucide-react";
import { t } from "../i18n";
import * as store from "../storage";
import type { Book, BookMeta, Preferences, Voice } from "../types";
import { createProduction, deleteProduction, listProductions, newProduction, openPortable, progress, readProduction, verifyFile, type Production, type ProductionInfo, type Verification } from "./production";
import { ProductionView } from "./ProductionView";
import { RecordingDialog } from "./RecordingDialog";
import { StudioSetup } from "./StudioSetup";
import "./studio.css";

const LANGUAGES: Record<string, string> = { en: "english", fr: "french", de: "german", es: "spanish", it: "italian", pt: "portuguese", ru: "russian", ja: "japanese", ko: "korean", zh: "chinese" };
const languageName = (code?: string) => (code ? LANGUAGES[code.slice(0, 2).toLowerCase()] : undefined);

type Props = {
  open: boolean;
  books: BookMeta[];
  voices: Voice[];
  prefs: Preferences;
  modeSwitch: ReactNode;
};

// Studio mode: productions made from library books, each opened in the editor.
export function StudioMode({ open, books, voices, prefs, modeSwitch }: Props) {
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
  const usable = useMemo(() => voices.filter((v) => v.available), [voices]);
  const covers = useMemo(() => new Map(books.map((b) => [b.id, b.coverImage])), [books]);

  async function refresh() {
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

  async function openProduction(id: string) {
    setError("");
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
        modeSwitch={modeSwitch}
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
  return (
    <div className="studio-mode studio-home">
      <header className="studio-bar-top">
        {modeSwitch}
        <div className="studio-title">
          <strong>
            <Clapperboard size={17} /> {t("Studio")}
          </strong>
          <span>{t("Audiobooks and books made from your library")}</span>
        </div>
        <span className="studio-spacer" />
        <button
          onClick={async () => {
            setVerifying(true);
            try {
              const r = await verifyFile();
              if (!r.cancelled) setVerified(r);
            } catch (e) {
              setError(String(e));
            } finally {
              setVerifying(false);
            }
          }}
          disabled={!store.desktop || verifying}
          data-tip={t("Check whether an audio file was made with Origami Studio")}
        >
          <ShieldCheck size={16} /> {verifying ? t("Checking") : t("Verify a file")}
        </button>
        <button
          onClick={async () => {
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
          }}
          disabled={!store.desktop || opening}
          data-tip={t("Continue a production saved on another computer")}
        >
          <FolderOpen size={16} /> {opening ? t("Opening") : t("Open a portable copy")}
        </button>
        <button onClick={() => setRecording(true)} disabled={!store.desktop} data-tip={t("Make a book from an audiobook or a recording")}>
          <AudioLines size={16} /> {t("From a recording")}
        </button>
        <button className="primary" onClick={() => setCreating(true)} disabled={!store.desktop}>
          <Plus size={16} /> {t("New production")}
        </button>
      </header>
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
      <div className="studio-home-body">
        <StudioSetup />
        {list && !list.length && (
          <section className="studio-welcome">
            <h1>{t("Turn a book into an audiobook")}</h1>
            <p>{t("Studio reads a book from your library with the voices on this computer, line by line, so you can review every sentence before exporting.")}</p>
            <ol className="studio-steps">
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
            <button className="primary" onClick={() => setCreating(true)} disabled={!store.desktop}>
              <Plus size={16} /> {t("New production")}
            </button>
          </section>
        )}
        {list && list.length > 0 && (
          <>
            <h2 className="studio-section-title">{t("Productions")}</h2>
            <ul className="studio-cards">
              {list.map((p) => {
                const cover = covers.get(p.bookId);
                const share = progress(p);
                return (
                  <li key={p.id}>
                    <button className="studio-card" onClick={() => void openProduction(p.id)}>
                      <span className="studio-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
                        {!cover && <BookOpen size={28} />}
                      </span>
                      <span className="studio-card-body">
                        <strong>{p.title}</strong>
                        <span className="muted">{p.author}</span>
                        {voiceName(p.voice) && (
                          <span className="studio-tag">
                            <Mic2 size={12} /> {voiceName(p.voice)}
                          </span>
                        )}
                        <span className="studio-progress" aria-hidden="true">
                          <i style={{ width: `${Math.round(share * 100)}%` }} />
                        </span>
                        <span className="muted small">
                          {share >= 1
                            ? t("All {total} lines generated", { total: String(p.units || 0) })
                            : t("{done} of {total} lines generated", { done: String(p.rendered || 0), total: String(p.units || 0) })}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
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
            <p className="studio-hint">{t("You can change the narrator later; lines generated before keep their voice until you regenerate them.")}</p>
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
              <strong>{t("Made with Origami Studio")}</strong>
              <p>{t("This audio carries the Origami Studio watermark: it was narrated with AI-generated voices.")}</p>
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
            <strong>{t("No Origami Studio watermark found.")}</strong>
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
