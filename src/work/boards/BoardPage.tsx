import { lazy, Suspense, useRef, useState } from "react";
import { Download, FileDown, LoaderCircle, Presentation, Trash2 } from "lucide-react";
import { t } from "../../i18n";
import type { Subject } from "../types";
import type { BoardApi } from "./BoardEditor";
import { toExcalidrawFile, type BoardDoc } from "./model";
import { boardPaper, papers, type PaperId } from "../papers";

const BoardEditor = lazy(() => import("./BoardEditor"));

// A whiteboard page: shapes, arrows, sticky text, freehand drawing with a pen
// (pressure and palm rejection come with it), images and frames.
export function BoardPage({
  board,
  subjects,
  dark,
  language,
  embedsAllowed,
  onChange,
  onDelete,
  onSave,
  onOpenLink,
  extra,
}: {
  board: BoardDoc;
  subjects: Subject[];
  dark: boolean;
  language: string;
  embedsAllowed: boolean;
  onChange: (patch: Partial<BoardDoc>) => void;
  onDelete: () => void;
  onSave: (name: string, content: string, ext: "png" | "svg" | "excalidraw") => void;
  onOpenLink: (url: string) => void;
  extra?: React.ReactNode;
}) {
  const api = useRef<BoardApi | null>(null);
  const [title, setTitle] = useState(board.title);
  const exportImage = async (kind: "svg" | "png") => {
    if (!api.current) return;
    if (kind === "svg") onSave(board.title || "board", await api.current.svg(), "svg");
    else {
      const blob = await api.current.png();
      if (!blob) return;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      onSave(board.title || "board", btoa(bin), "png");
    }
  };
  return (
    <section className="board-page">
      <header className="sheet-head">
        <Presentation size={18} className="sheet-head-icon" />
        <input
          className="sheet-title"
          aria-label={t("Title")}
          value={title}
          placeholder={t("Untitled")}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== board.title && onChange({ title: title.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <select aria-label={t("Subject")} value={board.subjectId || ""} onChange={(e) => onChange({ subjectId: e.target.value || undefined })}>
          <option value="">{t("No subject")}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Paper")}
          value={board.paper || "default"}
          onChange={(e) => {
            const id = e.target.value as PaperId;
            onChange({ paper: id === "default" ? undefined : id });
            api.current?.setPaper(boardPaper[id].bg, boardPaper[id].grid);
          }}
        >
          {papers().map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === "default" ? t("White") : p.label}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button onClick={() => void exportImage("png")} data-tip={t("Export as an image")}>
          <FileDown size={15} />
          .png
        </button>
        <button onClick={() => void exportImage("svg")} data-tip={t("Export as a drawing that scales")}>
          <FileDown size={15} />
          .svg
        </button>
        <button onClick={() => onSave(board.title || "board", toExcalidrawFile({ ...board, scene: api.current?.scene() ?? board.scene }), "excalidraw")} data-tip={t("Opens in Excalidraw and Obsidian")}>
          <Download size={15} />
          .excalidraw
        </button>
        {extra}
        <button className="icon-only" aria-label={t("Delete board")} onClick={onDelete}>
          <Trash2 size={16} />
        </button>
      </header>
      <div className="board-body">
        <Suspense
          fallback={
            <div className="sheet-loading">
              <LoaderCircle className="spin" />
              {t("Opening the board…")}
            </div>
          }
        >
          <BoardEditor
            key={board.id}
            scene={board.scene}
            dark={dark}
            language={language}
            embedsAllowed={embedsAllowed}
            onChange={(scene) => onChange({ scene })}
            onReady={(a) => (api.current = a)}
            onOpenLink={onOpenLink}
          />
        </Suspense>
      </div>
    </section>
  );
}
