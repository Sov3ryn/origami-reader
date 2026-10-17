import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { History, LoaderCircle, RotateCcw, X } from "lucide-react";
import { t } from "../i18n";
import { noteExtensions } from "./editorExtensions";
import { noteVersions } from "./store";
import { noteText } from "./text";
import type { Note, NoteVersion } from "./types";

const words = (html: string) => noteText(html).split(/\s+/).filter(Boolean).length;

function when(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return t("Today, {time}", { time });
  if (d.toDateString() === yesterday.toDateString()) return t("Yesterday, {time}", { time });
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" }) + ", " + time;
}

// Earlier versions of a note: kept automatically while you write (one every
// ten minutes of editing, the last 50), previewed here and restored in one
// click. Restoring keeps the current text as a version too.
export function HistoryDialog({ note, onRestore, onClose }: { note: Note; onRestore: (v: NoteVersion) => void; onClose: () => void }) {
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [picked, setPicked] = useState<NoteVersion | null>(null);
  useEffect(() => {
    let live = true;
    void noteVersions(note.id)
      .then((list) => {
        if (!live) return;
        setVersions(list);
        setPicked(list[0] || null);
      })
      .catch(() => live && setVersions([]));
    return () => {
      live = false;
    };
  }, [note.id]);
  const extensions = useMemo(() => noteExtensions("", true), []);
  const preview = useEditor({ extensions, editable: false, content: picked?.html || "", immediatelyRender: false, editorProps: { attributes: { class: "note-prose" } } });
  useEffect(() => {
    if (preview && picked) preview.commands.setContent(picked.html, { emitUpdate: false });
  }, [preview, picked]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const nowWords = useMemo(() => words(note.html), [note.html]);

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <header>
          <History size={18} />
          <h2 id="history-title">{t("History of “{title}”", { title: note.title || t("Untitled") })}</h2>
          <span className="ink-spacer" />
          <button className="icon-only" aria-label={t("Close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {!versions ? (
          <div className="history-empty">
            <LoaderCircle className="spin" />
          </div>
        ) : !versions.length ? (
          <div className="history-empty">
            <p>{t("No earlier versions yet.")}</p>
            <p className="hint">{t("Origami keeps a version every ten minutes while you edit, and the last 50 of them.")}</p>
          </div>
        ) : (
          <div className="history-body">
            <ol className="history-list">
              {versions.map((v) => {
                const diff = words(v.html) - nowWords;
                return (
                  <li key={v.id}>
                    <button className={picked?.id === v.id ? "active" : ""} onClick={() => setPicked(v)}>
                      <strong>{when(v.saved)}</strong>
                      <small>
                        {t("{count} words", { count: words(v.html) })}
                        {diff !== 0 && <span className={diff > 0 ? "more" : "less"}>{diff > 0 ? ` +${diff}` : ` ${diff}`}</span>}
                        {v.title !== note.title && v.title ? ` · ${v.title}` : ""}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="history-preview">
              <div className="history-preview-head">
                <span className="hint">{picked ? t("Version from {time}", { time: when(picked.saved) }) : ""}</span>
                <span className="ink-spacer" />
                <button className="primary" disabled={!picked} onClick={() => picked && onRestore(picked)}>
                  <RotateCcw size={15} />
                  {t("Restore this version")}
                </button>
              </div>
              <div className="history-page note-sheet">{preview && <EditorContent editor={preview} />}</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
