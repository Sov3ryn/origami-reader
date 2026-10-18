import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, Clapperboard, Headphones, Mic2, Play, Plus, Search, Square, Wand2, X } from "lucide-react";
import { t } from "../i18n";
import * as store from "../storage";
import type { Book, BookMeta, Preferences, Voice } from "../types";
import { createProduction, deleteProduction, listProductions, newProduction, progress, readProduction, type Production, type ProductionInfo } from "./production";
import { ProductionView } from "./ProductionView";
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
        <button className="primary" onClick={() => setCreating(true)} disabled={!store.desktop}>
          <Plus size={16} /> {t("New production")}
        </button>
      </header>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      <div className="studio-home-body">
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
      {creating && (
        <NewProduction
          books={books}
          voices={usable}
          defaultVoice={prefs.voice}
          onCancel={() => setCreating(false)}
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
}: {
  books: BookMeta[];
  voices: Voice[];
  defaultVoice: string;
  onCancel: () => void;
  onCreate: (bookId: string, voice: string) => Promise<void>;
}) {
  const sorted = useMemo(() => [...books].filter((b) => !b.deleted).sort((a, b) => a.title.localeCompare(b.title)), [books]);
  const [query, setQuery] = useState("");
  const [bookId, setBookId] = useState(sorted[0]?.id || "");
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
