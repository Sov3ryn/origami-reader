import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AudioLines, BookPlus, FileAudio, FolderOpen, X } from "lucide-react";
import { t } from "../i18n";
import { importDocument } from "../documents";
import * as store from "../storage";
import { clock } from "./production";
import { asrReady, bookMarkdown, cancelTranscribe, doubtful, pickRecordings, prettyName, structure, transcribe, type AsrDone, type AsrProgress, type HeardFile } from "./recording";

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
        {heard ? (
          <>
            <p className="studio-hint">
              {t("{n} chapters from {time} of audio.", { n: String(chapters.length), time: clock(seconds) })}{" "}
              {unsure > 0 && t("{n} words were hard to hear; check them while reading.", { n: String(unsure) })}
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
