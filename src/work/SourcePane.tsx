import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, GalleryVerticalEnd, GripVertical, LoaderCircle, Quote, X } from "lucide-react";
import { t } from "../i18n";
import * as store from "../storage";
import { annotationColors } from "../themes";
import type { Annotation, Book } from "../types";
import { PASSAGE_MIME, type DraggedPassage } from "./NoteEditor";
import type { CardSource } from "./types";

const WINDOW = 160;

// A book or document beside the note: read, drag passages across, quote
// them or turn them into cards.
export function SourcePane({
  bookId,
  paragraphId,
  annotations,
  onClose,
  onQuote,
  onCard,
  onOpenInReader,
}: {
  bookId: string;
  paragraphId?: string;
  annotations: Annotation[];
  onClose: () => void;
  onQuote: (p: DraggedPassage) => void;
  onCard: (text: string, source: CardSource) => void;
  onOpenInReader: (bookId: string, paragraphId?: string) => void;
}) {
  const [book, setBook] = useState<Book | null>(null);
  const [failed, setFailed] = useState("");
  const [range, setRange] = useState<[number, number]>([0, WINDOW]);
  const [picked, setPicked] = useState<{ text: string; source: CardSource; x: number; y: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const target = useRef<string | undefined>(paragraphId);

  useEffect(() => {
    let live = true;
    setBook(null);
    setFailed("");
    store
      .readBook(bookId)
      .then((b) => {
        if (!live) return;
        const at = Math.max(0, b.paragraphs.findIndex((p) => p.id === paragraphId));
        const start = paragraphId ? Math.max(0, at - 40) : Math.max(0, Math.min(b.meta.position, b.paragraphs.length - 1) - 10);
        target.current = paragraphId || b.paragraphs[Math.min(b.meta.position, b.paragraphs.length - 1)]?.id;
        setRange([start, start + WINDOW]);
        setBook(b);
      })
      .catch((e) => live && setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [bookId, paragraphId]);

  useLayoutEffect(() => {
    if (!book || !target.current) return;
    const el = body.current?.querySelector(`[data-pid="${CSS.escape(target.current)}"]`);
    el?.scrollIntoView({ block: "center" });
    el?.classList.add("flash");
    target.current = undefined;
  }, [book]);

  const marked = new Map<string, string>();
  for (const a of annotations) if (a.bookId === bookId && a.kind !== "bookmark") marked.set(a.paragraphId, a.color);

  function label(index: number) {
    if (!book) return "";
    for (let i = index; i >= 0; i--) {
      const p = book.paragraphs[i];
      if (p.kind === "heading" && p.text.length < 90) return `${book.meta.title}, ${p.text}`;
    }
    return book.meta.title;
  }
  function onSelect() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !book) return setPicked(null);
    const node = s.anchorNode?.parentElement?.closest<HTMLElement>("[data-pid]");
    const text = s.toString().replace(/\s+/g, " ").trim();
    if (!node || !text || !body.current?.contains(node)) return setPicked(null);
    const index = book.paragraphs.findIndex((p) => p.id === node.dataset.pid);
    const p = book.paragraphs[index];
    const start = Math.max(0, p.text.replace(/\s+/g, " ").indexOf(text));
    const r = s.getRangeAt(0).getBoundingClientRect();
    setPicked({
      text,
      x: r.left + r.width / 2,
      y: r.top,
      source: { bookId, paragraphId: p.id, start, end: start + text.length, quote: text, title: label(index) },
    });
  }

  if (failed)
    return (
      <section className="source-pane" aria-label={t("Source")}>
        <header className="source-head">
          <BookOpen size={15} />
          <strong>{t("Source")}</strong>
          <button className="icon-only" aria-label={t("Close source")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <p className="conn-empty">
          {t("This book could not be opened.")}
          <br />
          <small>{failed}</small>
        </p>
      </section>
    );
  if (!book)
    return (
      <section className="source-pane loading">
        <LoaderCircle className="spin" />
      </section>
    );
  const [from, to] = range;
  return (
    <section className="source-pane" aria-label={t("Source")}>
      <header className="source-head">
        <BookOpen size={15} />
        <strong title={book.meta.title}>{book.meta.title}</strong>
        <button className="mini" onClick={() => onOpenInReader(bookId, book.paragraphs[from + 10]?.id)}>
          {t("Open in Read mode")}
        </button>
        <button className="icon-only" aria-label={t("Close source")} onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="source-body" ref={body} onMouseUp={onSelect} onScroll={() => setPicked(null)}>
        {from > 0 && (
          <button className="text-button source-more" onClick={() => setRange([Math.max(0, from - WINDOW), to])}>
            {t("Earlier pages")}
          </button>
        )}
        {book.paragraphs.slice(from, to).map((p, i) => {
          const index = from + i;
          const drag: DraggedPassage = { bookId, paragraphId: p.id, quote: p.text, label: label(index) };
          return p.kind === "heading" ? (
            <h3 key={p.id} data-pid={p.id}>
              {p.text}
            </h3>
          ) : (
            <p
              key={p.id}
              data-pid={p.id}
              className={marked.has(p.id) ? "marked" : ""}
              style={marked.has(p.id) ? ({ "--mark": annotationColors.find((c) => c.id === marked.get(p.id))?.value } as React.CSSProperties) : undefined}
            >
              <span
                className="drag-passage"
                draggable
                title={t("Drag into your note")}
                onDragStart={(e) => {
                  e.dataTransfer.setData(PASSAGE_MIME, JSON.stringify(drag));
                  e.dataTransfer.setData("text/plain", p.text);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <GripVertical size={13} />
              </span>
              {p.text}
            </p>
          );
        })}
        {to < book.paragraphs.length && (
          <button className="text-button source-more" onClick={() => setRange([from, to + WINDOW])}>
            {t("Later pages")}
          </button>
        )}
      </div>
      {picked && (
        <div className="note-bubble source-bubble" style={{ left: picked.x, top: picked.y }}>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onQuote({ bookId, paragraphId: picked.source.paragraphId, quote: picked.text, label: picked.source.title });
              setPicked(null);
            }}
          >
            <Quote size={14} />
            {t("Quote in note")}
          </button>
          <button
            className="bubble-card"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onCard(picked.text, picked.source);
              setPicked(null);
            }}
          >
            <GalleryVerticalEnd size={14} />
            {t("Card")}
          </button>
        </div>
      )}
    </section>
  );
}
