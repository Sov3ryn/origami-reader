import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, Clapperboard, Play, Plus, Square, Trash2 } from "lucide-react";
import { t } from "../i18n";
import * as store from "../storage";
import type { Book, BookMeta, Preferences, Voice } from "../types";
import {
  chapterTitles,
  createProduction,
  deleteProduction,
  listProductions,
  newProduction,
  progress,
  readProduction,
  saveProductionInfo,
  startRender,
  cancelRender,
  renderRunning,
  takeAudio,
  type RenderDone,
  type RenderProgress,
  type Production,
  type ProductionInfo,
} from "./production";
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

// Studio mode: productions made from library books. This first stage creates a
// production (a snapshot cut into render units) and shows it by chapter.
export function StudioMode({ open, books, voices, prefs, modeSwitch }: Props) {
  const [list, setList] = useState<ProductionInfo[] | null>(null);
  const [current, setCurrent] = useState<Production | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const usable = useMemo(() => voices.filter((v) => v.available), [voices]);

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
  return (
    <div className="studio-mode">
      <header className="studio-top">
        {modeSwitch}
        <h1>
          <Clapperboard size={20} /> {t("Studio")}
        </h1>
        <button className="primary" onClick={() => setCreating(true)} disabled={!store.desktop}>
          <Plus size={16} /> {t("New production")}
        </button>
      </header>
      {error && <p className="studio-error" role="alert">{error}</p>}
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
      {list && !list.length && !creating && (
        <section className="studio-empty">
          <h2>{t("No productions yet")}</h2>
          <p>{t("A production turns a book from your library into an audiobook, chapter by chapter, with takes you can review.")}</p>
        </section>
      )}
      <ul className="studio-grid">
        {list?.map((p) => (
          <li key={p.id}>
            <button className="studio-card" onClick={() => void openProduction(p.id)}>
              <strong>{p.title}</strong>
              <span className="muted">{p.author}</span>
              <span className="studio-bar" aria-hidden="true">
                <i style={{ width: `${Math.round(progress(p) * 100)}%` }} />
              </span>
              <span className="muted">
                {t("{done} of {total} lines rendered", { done: String(p.rendered || 0), total: String(p.units || 0) })}
              </span>
            </button>
          </li>
        ))}
      </ul>
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
  const sorted = useMemo(() => [...books].sort((a, b) => a.title.localeCompare(b.title)), [books]);
  const [bookId, setBookId] = useState(sorted[0]?.id || "");
  const [voice, setVoice] = useState(voices.find((v) => v.id === defaultVoice)?.id || voices[0]?.id || "");
  // Offer a narrator who speaks the book's language.
  useEffect(() => {
    const language = languageName(books.find((b) => b.id === bookId)?.language);
    if (!language) return;
    const fits = (v: Voice) => v.languages.some((l) => l.toLowerCase() === language);
    const current = voices.find((v) => v.id === voice);
    if (current && fits(current)) return;
    const pick = voices.find((v) => v.id === defaultVoice && fits(v)) || voices.find(fits);
    if (pick) setVoice(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="studio-new"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onCreate(bookId, voice);
        } catch (err) {
          setError(String(err));
          setBusy(false);
        }
      }}
    >
      <h2>{t("New production")}</h2>
      <label>
        {t("Book")}
        <select value={bookId} onChange={(e) => setBookId(e.target.value)} required>
          {sorted.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {b.author ? ` (${b.author})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Narrator")}
        <select value={voice} onChange={(e) => setVoice(e.target.value)} required>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="studio-error" role="alert">{error}</p>}
      <div className="studio-actions">
        <button type="button" onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button type="submit" className="primary" disabled={busy || !bookId || !voice}>
          {busy ? t("Preparing") : t("Create production")}
        </button>
      </div>
    </form>
  );
}

function ProductionView({
  production,
  book,
  voices,
  modeSwitch,
  onBack,
  onChange,
  onDelete,
}: {
  production: Production;
  book: Book | null;
  voices: Voice[];
  modeSwitch: ReactNode;
  onBack: () => void;
  onChange: (p: Production) => void;
  onDelete: () => Promise<void>;
}) {
  const { info, units } = production;
  const chapters = useMemo(() => {
    const map = new Map<number, { units: number; rendered: number }>();
    for (const u of units) {
      const c = map.get(u.chapter) ?? { units: 0, rendered: 0 };
      c.units++;
      if (u.status === "rendered" || u.status === "approved") c.rendered++;
      map.set(u.chapter, c);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [units]);
  const titles = useMemo(() => (book ? chapterTitles(book) : new Map<number, string>()), [book]);
  const [chapter, setChapter] = useState(chapters[0]?.[0] ?? 0);
  const shown = units.filter((u) => u.chapter === chapter);
  const [confirming, setConfirming] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [status, setStatus] = useState("");
  const [playing, setPlaying] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const done = units.filter((u) => u.status !== "pending").length;

  async function reload() {
    onChange(await readProduction(info.id));
  }
  useEffect(() => {
    void renderRunning().then(setRendering);
    const off = [
      listen<RenderProgress>("studio-progress", (e) => {
        if (e.payload.id !== info.id) return;
        setStatus(t("{done} of {total} lines rendered", { done: String(e.payload.done), total: String(e.payload.total) }));
        void reload();
      }),
      listen<RenderDone>("studio-render-done", (e) => {
        if (e.payload.id !== info.id) return;
        setRendering(false);
        setStatus(e.payload.ok ? (e.payload.cancelled ? t("Rendering stopped") : t("Rendering finished")) : e.payload.message || t("Rendering failed"));
        void reload();
      }),
    ];
    return () => {
      off.forEach((p) => void p.then((f) => f()));
      audio.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.id]);

  async function render(only?: number) {
    setStatus("");
    try {
      await startRender(info.id, only);
      setRendering(true);
    } catch (e) {
      setStatus(String(e));
    }
  }
  async function play(unitId: string) {
    const take = production.takes.find((x) => x.id === units.find((u) => u.id === unitId)?.take);
    if (!take) return;
    audio.current?.pause();
    if (playing === unitId) {
      setPlaying("");
      return;
    }
    const data = await takeAudio(info.id, take.file);
    const a = new Audio("data:audio/wav;base64," + data);
    audio.current = a;
    setPlaying(unitId);
    a.onended = () => setPlaying("");
    void a.play();
  }
  return (
    <div className="studio-mode studio-production">
      <header className="studio-top">
        {modeSwitch}
        <button onClick={onBack} aria-label={t("All productions")} data-tip={t("All productions")}>
          <ArrowLeft size={16} />
        </button>
        <h1>{info.title}</h1>
        <label className="studio-voice">
          {t("Narrator")}
          <select
            value={info.voice}
            onChange={async (e) => {
              const next = { ...info, voice: e.target.value, updated: Date.now() };
              await saveProductionInfo(next);
              onChange({ ...production, info: next });
            }}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {rendering ? (
          <button onClick={() => void cancelRender()}>
            <Square size={14} /> {t("Stop rendering")}
          </button>
        ) : (
          <>
            <button onClick={() => void render(chapter)}>
              <Play size={14} /> {t("Render this chapter")}
            </button>
            <button className="primary" onClick={() => void render()} disabled={done === units.length}>
              <Play size={14} /> {t("Render the book")}
            </button>
          </>
        )}
        {confirming ? (
          <span className="studio-confirm">
            {t("Delete this production and its takes? Exported files are kept.")}
            <button className="danger" onClick={() => void onDelete()}>
              {t("Delete")}
            </button>
            <button onClick={() => setConfirming(false)}>{t("Cancel")}</button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} aria-label={t("Delete production")} data-tip={t("Delete production")}>
            <Trash2 size={16} />
          </button>
        )}
      </header>
      <p className="studio-status" role="status">
        {status || t("{done} of {total} lines rendered", { done: String(done), total: String(units.length) })}
      </p>
      <nav className="studio-chapters" aria-label={t("Chapters")}>
        {chapters.map(([c, n]) => (
          <button key={c} aria-current={c === chapter} onClick={() => setChapter(c)}>
            <span>{titles.get(c) || t("Chapter {n}", { n: String(c + 1) })}</span>
            <span className="muted">
              {n.rendered}/{n.units}
            </span>
          </button>
        ))}
      </nav>
      <main className="studio-script">
        <ol>
          {shown.map((u) => (
            <li key={u.id} className={"studio-unit " + u.status + (u.heading ? " heading" : "") + (playing === u.id ? " playing" : "")}>
              {u.take ? (
                <button className="studio-dot" onClick={() => void play(u.id)} aria-label={playing === u.id ? t("Stop") : t("Play this line")} />
              ) : (
                <span className="studio-dot" aria-label={t("Not rendered")} />
              )}
              <span>{u.text}</span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
