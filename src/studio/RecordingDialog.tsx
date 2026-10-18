import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AudioLines, BookPlus, Ear, FileAudio, FolderOpen, X } from "lucide-react";
import { t } from "../i18n";
import { importDocument } from "../documents";
import * as store from "../storage";
import { clock } from "./production";
import { asrReady, bookMarkdown, cancelTranscribe, doubtful, guessLanguage, pickRecordings, prettyName, recordingReadalong, structure, transcribe, type AsrDone, type AsrProgress, type HeardFile } from "./recording";
import { revealFile } from "./production";
import { WordReview } from "./WordReview";
import { alignBook } from "./align";
import type { BookMeta } from "../types";

// From a recording: an audiobook or any narrated recording becomes a book in the
// library, with chapters and paragraphs, transcribed on this computer.
export function RecordingDialog({ onClose, onMade }: { onClose: () => void; onMade: (bookId: string) => void }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AsrProgress | null>(null);
  const [heard, setHeard] = useState<HeardFile[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [readalong, setReadalong] = useState("");
  const [checking, setChecking] = useState(false);
  // The read-along can use a library book's own text, timed to the recording.
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [textFrom, setTextFrom] = useState("");
  const [aligned, setAligned] = useState("");
  const started = useRef(0);

  useEffect(() => {
    void asrReady().then(setReady);
    const off = [
      listen<AsrProgress>("studio-asr-progress", (e) => setProgress(e.payload)),
      listen<AsrDone>("studio-asr-done", (e) => {
        setRunning(false);
        if (e.payload.ok && e.payload.files) setHeard(e.payload.files);
        else if (!e.payload.cancelled) setError(e.payload.message || t("The recording could not be transcribed."));
      }),
    ];
    return () => off.forEach((p) => void p.then((f) => f()));
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !running && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [running, onClose]);

  const chapters = useMemo(() => (heard ? structure(heard, { title, author }) : []), [heard, title, author]);
  useEffect(() => {
    if (!heard) return;
    void store
      .listBooks()
      .then((list) => {
        const live = list.filter((b) => !b.deleted).sort((a, b) => a.title.localeCompare(b.title));
        setBooks(live);
        const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        const same = live.find((b) => title && fold(b.title) === fold(title));
        if (same) setTextFrom(same.id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heard]);
  async function makeReadalong() {
    setSaving(true);
    setError("");
    try {
      if (textFrom) {
        const book = await store.readBook(textFrom);
        const a = alignBook(book, heard || []);
        // The share of the recording found in the book (a recording may read only part of it).
        const heardWords = (heard || []).reduce((n, f) => n + f.words.length, 0);
        const share = a.matched / Math.max(1, heardWords);
        if (!a.chapters.length || share < 0.3) throw new Error(t("This recording does not seem to read that book."));
        setAligned(t("{n}% of the recording was found in the book.", { n: String(Math.min(100, Math.round(share * 100))) }));
        const path = await recordingReadalong(files, a.chapters, {
          title: book.meta.title,
          author: book.meta.author,
          language: book.meta.language || guessLanguage(book.paragraphs.slice(0, 40).map((p) => p.text).join(" ")),
          note: "Text from the ebook, timed to the recording with Origami Studio.",
        });
        if (path) setReadalong(path);
      } else {
        const language = guessLanguage(chapters.flatMap((c) => c.paragraphs).slice(0, 40).join(" "));
        const path = await recordingReadalong(files, chapters, { title: title || t("Untitled recording"), author, language });
        if (path) setReadalong(path);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  const unsure = useMemo(() => (heard ? doubtful(heard).length : 0), [heard]);
  const seconds = heard?.reduce((a, f) => a + f.seconds, 0) || 0;
  const elapsed = progress && started.current ? (Date.now() - started.current) / 1000 : 0;
  const eta = progress && progress.value > 0.02 ? elapsed / progress.value - elapsed : 0;

  async function choose() {
    const picked = await pickRecordings();
    if (!picked.length) return;
    setFiles(picked);
    if (!title) {
      const name = picked[0].split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "";
      setTitle(prettyName(name.replace(/\b(?:ch(?:apter)?|chapitre|part)\s*\d+\b/gi, "")).trim());
    }
  }
  async function start() {
    setError("");
    setHeard(null);
    setProgress(null);
    started.current = Date.now();
    try {
      setRunning(true);
      await transcribe(files);
    } catch (e) {
      setRunning(false);
      setError(String(e));
    }
  }
  async function save(open: boolean) {
    setSaving(true);
    try {
      const md = bookMarkdown(title || t("Untitled recording"), author, chapters);
      const book = await importDocument(new File([md], `${title || "recording"}.md`, { type: "text/markdown" }));
      book.meta.title = title || book.meta.title;
      book.meta.author = author || book.meta.author;
      await store.saveBook(book);
      window.dispatchEvent(new CustomEvent("origami:library-changed"));
      if (open) window.dispatchEvent(new CustomEvent("origami:open-book", { detail: { id: book.meta.id } }));
      else onMade(book.meta.id);
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <div className="studio-dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <section className="studio-dialog" role="dialog" aria-modal="true" aria-labelledby="studio-rec-title">
        <header>
          <h2 id="studio-rec-title">{t("Book from a recording")}</h2>
          <button className="icon-only" onClick={onClose} disabled={running} aria-label={t("Close")}>
            <X size={17} />
          </button>
        </header>
        {heard && checking ? (
          <WordReview files={files} heard={heard} onChange={setHeard} onDone={() => setChecking(false)} />
        ) : heard ? (
          <>
            <p className="studio-hint">
              {t("{n} chapters from {time} of audio.", { n: String(chapters.length), time: clock(seconds) })}{" "}
              {unsure > 0 && t("{n} words were hard to hear.", { n: String(unsure) })}{" "}
              {unsure > 0 && (
                <button onClick={() => setChecking(true)}>
                  <Ear size={14} /> {t("Check them")}
                </button>
              )}
            </p>
            <ol className="studio-rec-chapters">
              {chapters.slice(0, 60).map((c, i) => (
                <li key={i}>
                  <strong>{c.title || t("Chapter {n}", { n: String(i + 1) })}</strong>
                  <span className="muted small">
                    {t("{n} paragraphs", { n: String(c.paragraphs.length) })} · {c.paragraphs[0]?.slice(0, 120)}
                  </span>
                </li>
              ))}
            </ol>
            {readalong ? (
              <p className="studio-success">
                {t("Read-along ebook saved.")} {aligned}
                <button onClick={() => void revealFile(readalong)}>
                  <FolderOpen size={14} /> {t("Show in folder")}
                </button>
              </p>
            ) : (
              <p className="studio-hint">
                {t("The recording can also become a read-along EPUB: its own audio, each sentence highlighted as it is heard.")}{" "}
                <span className="studio-inline">
                  <select value={textFrom} onChange={(e) => setTextFrom(e.target.value)} aria-label={t("Text of the read-along")}>
                    <option value="">{t("Text as heard")}</option>
                    {books.length > 0 && (
                      <optgroup label={t("The text of a book in the library")}>
                        {books.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <button disabled={saving || !chapters.length || files.some((f) => !/\.(mp3|m4a|m4b)$/i.test(f))} onClick={() => void makeReadalong()}>
                    <AudioLines size={14} /> {saving ? t("Aligning") : t("Make the read-along EPUB")}
                  </button>
                </span>
              </p>
            )}
            {error && (
              <p className="studio-error" role="alert">
                {error}
              </p>
            )}
            <div className="studio-row end">
              <button onClick={() => void save(false)} disabled={saving || !chapters.length}>
                <BookPlus size={15} /> {t("Add to the library")}
              </button>
              <button className="primary" onClick={() => void save(true)} disabled={saving || !chapters.length}>
                {t("Add and open it")}
              </button>
            </div>
          </>
        ) : running ? (
          <div className="studio-export-running">
            <p>
              <AudioLines size={15} /> {progress?.name ? t("Listening to {name}", { name: progress.name }) : t("Loading the transcription model")}
              {progress && progress.files > 1 ? ` (${progress.file + 1}/${progress.files})` : ""}
            </p>
            <span className="studio-progress" aria-hidden="true">
              <i style={{ width: `${Math.round((progress?.value || 0) * 100)}%` }} />
            </span>
            {eta > 0 && <p className="muted small">{t("About {time} left", { time: clock(eta) })}</p>}
            <div className="studio-row end">
              <button onClick={() => void cancelTranscribe()}>{t("Cancel")}</button>
            </div>
          </div>
        ) : (
          <>
            <p className="studio-hint">
              {t("Turn an audiobook or any narrated recording into a book: Origami listens on this computer, writes the text, and lays it out in chapters and paragraphs. Readers' credits are left out.")}
            </p>
            {ready === false && <p className="studio-warn">{t("The transcription model is not installed on this computer.")}</p>}
            <div className="studio-row">
              <button onClick={() => void choose()} disabled={!ready}>
                <FolderOpen size={15} /> {files.length ? t("Choose other files") : t("Choose the recording")}
              </button>
              <span className="muted small">{t("One file, or one file per chapter (MP3, M4A, M4B, WAV).")}</span>
            </div>
            {files.length > 0 && (
              <ul className="studio-files compact">
                {files.slice(0, 12).map((f) => (
                  <li key={f}>
                    <FileAudio size={14} /> <span title={f}>{f.split(/[\\/]/).pop()}</span>
                  </li>
                ))}
                {files.length > 12 && <li className="muted">{t("and {n} more", { n: String(files.length - 12) })}</li>}
              </ul>
            )}
            <label className="studio-field">
              <span>{t("Title")}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="studio-field">
              <span>{t("Author")}</span>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </label>
            {error && (
              <p className="studio-error" role="alert">
                {error}
              </p>
            )}
            <div className="studio-row end">
              <button onClick={onClose}>{t("Cancel")}</button>
              <button className="primary" disabled={!files.length || !ready} onClick={() => void start()}>
                <AudioLines size={15} /> {t("Transcribe")}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
