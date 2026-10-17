import { t } from "../i18n";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bookmark,
  Copy,
  GalleryVerticalEnd,
  MessageSquare,
  PenLine,
  Play,
  StickyNote,
  Underline,
} from "lucide-react";
import { annotationColors } from "../themes";

export type ReaderMenuAction =
  | { kind: "readSelection" }
  | { kind: "readFromHere" }
  | { kind: "underline"; color: string }
  | { kind: "note" }
  | { kind: "bookmark" }
  | { kind: "copy" }
  | { kind: "spoken" }
  | { kind: "card" }
  | { kind: "sticky" };

// The reader's own right-click menu, in place of the browser's. With text
// selected it offers reading, annotating and copying that passage; on a
// paragraph without a selection it offers that paragraph.
export function ReaderMenu({
  x,
  y,
  selected,
  color,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  // Whether text is selected; otherwise the actions apply to the paragraph.
  selected: boolean;
  color: string;
  onAction: (action: ReaderMenuAction) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  // Kept inside the window, opening upward or leftward near the edges.
  useLayoutEffect(() => {
    const r = menu.current?.getBoundingClientRect();
    if (!r) return;
    setPlace({
      left: x + r.width > window.innerWidth - 8 ? Math.max(8, x - r.width) : x,
      top:
        y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y,
    });
  }, [x, y]);
  useEffect(() => {
    menu.current
      ?.querySelector<HTMLElement>("[role=menuitem]")
      ?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) onClose();
    };
    const away = () => onClose();
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", away);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("blur", away);
    };
  }, [onClose]);
  const run = (action: ReaderMenuAction) => {
    onClose();
    onAction(action);
  };
  const swatches = annotationColors.slice(0, 6);
  const current = annotationColors.find((c) => c.id === color);
  return (
    <div
      ref={menu}
      className="book-menu-popup reader-menu"
      role="menu"
      aria-label={selected ? t("Selected text") : t("Paragraph")}
      style={place}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const list = Array.from(
          menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") || [],
        );
        const i = list.indexOf(document.activeElement as HTMLElement);
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const step = e.key === "ArrowDown" ? 1 : -1;
          list[(i + step + list.length) % list.length]?.focus();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          // Move along the color swatches.
          const row = (document.activeElement as HTMLElement)?.closest(
            ".reader-menu-swatches",
          );
          if (!row) return;
          e.preventDefault();
          const step = e.key === "ArrowRight" ? 1 : -1;
          list[(i + step + list.length) % list.length]?.focus();
        }
      }}
    >
      {selected && (
        <button role="menuitem" onClick={() => run({ kind: "readSelection" })}>
          <Play size={15} />
          {t("Read selection")}
        </button>
      )}
      <button role="menuitem" onClick={() => run({ kind: "readFromHere" })}>
        <BookOpen size={15} />
        {t("Read from here")}
      </button>
      <div className="book-menu-separator" role="separator" />
      {selected && (
        <>
          <button
            role="menuitem"
            onClick={() => run({ kind: "underline", color })}
          >
            <Underline size={15} />
            <span className="reader-menu-label">{t("Underline")}</span>
            {current && (
              <span
                className="reader-menu-dot"
                style={{ background: current.value }}
                aria-hidden="true"
              />
            )}
          </button>
          <div
            className="reader-menu-swatches"
            role="group"
            aria-label={t("Underline color")}
          >
            {swatches.map((c) => (
              <button
                key={c.id}
                role="menuitem"
                className={c.id === color ? "active" : ""}
                aria-label={t("Underline in {color}", { color: t(c.label) })}
                title={t(c.label)}
                style={{ ["--swatch" as string]: c.value }}
                onClick={() => run({ kind: "underline", color: c.id })}
              />
            ))}
          </div>
          <button role="menuitem" onClick={() => run({ kind: "note" })}>
            <MessageSquare size={15} />
            {t("Add note")}
          </button>
        </>
      )}
      <button role="menuitem" onClick={() => run({ kind: "card" })}>
        <GalleryVerticalEnd size={15} />
        {selected ? t("Make a study card") : t("Make a study card from this paragraph")}
      </button>
      <button role="menuitem" onClick={() => run({ kind: "sticky" })}>
        <StickyNote size={15} />
        {t("Add a sticky note")}
      </button>
      <button role="menuitem" onClick={() => run({ kind: "bookmark" })}>
        <Bookmark size={15} />
        {selected ? t("Bookmark") : t("Bookmark this paragraph")}
      </button>
      <div className="book-menu-separator" role="separator" />
      <button role="menuitem" onClick={() => run({ kind: "copy" })}>
        <Copy size={15} />
        <span className="reader-menu-label">
          {selected ? t("Copy") : t("Copy paragraph")}
        </span>
        {selected && (
          <kbd>{/Mac/i.test(navigator.platform) ? "⌘C" : "Ctrl+C"}</kbd>
        )}
      </button>
      {selected && (
        <button role="menuitem" onClick={() => run({ kind: "spoken" })}>
          <PenLine size={15} />
          {t("Change how it is read")}
        </button>
      )}
    </div>
  );
}
