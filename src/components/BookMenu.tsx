import { t } from "../i18n";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AudioLines,
  BookMarked,
  BookOpen,
  Check,
  Ellipsis,
  ImagePlus,
  RotateCcw,
  Star,
  Trash2,
  Undo2,
  BriefcaseBusiness,
  FileText,
  Clapperboard,
} from "lucide-react";
import { shelfOf } from "../libraryShelf";
import type { BookMeta } from "../types";

export type BookMenuActions = {
  open: (book: BookMeta) => void;
  favorite: (book: BookMeta) => void;
  editCover: (book: BookMeta) => void;
  // The 3D book's binding and the bookmarks (BindingMenu).
  binding: (book: BookMeta) => void;
  uniqueVoice: (book: BookMeta, unique: boolean) => void;
  startOver: (book: BookMeta) => void;
  trash: (book: BookMeta) => void;
  restore: (book: BookMeta) => void;
  work: (book: BookMeta, on: boolean) => void;
  shelf: (book: BookMeta, shelf: "stories" | "documents") => void;
  // Open it in Work mode beside its notes (it becomes a Work source).
  workOpen: (book: BookMeta) => void;
  // Make an audiobook of it in Studio (when Studio is available).
  studio?: (book: BookMeta) => void;
};

// The "More" menu on each book. It also opens with a right-click on the card.
export function BookMenu({
  book,
  voiceName,
  actions,
  openAt,
  onClosed,
}: {
  book: BookMeta;
  voiceName: string;
  actions: BookMenuActions;
  // A right-click position, or null for the button.
  openAt: { x: number; y: number } | null;
  onClosed: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Fixed coordinates keep the menu clear of scrolling panels and the player.
  // This is the window position asked for; the menu is placed once it is
  // measured. From the button, x is the right edge the menu lines up with.
  const anchor = useRef({ x: 0, y: 0, above: 0, alignRight: false });
  const [shown, setShown] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openAt) show(openAt.x, openAt.y);
  }, [openAt]);
  function show(x: number, y: number, above = y, alignRight = false) {
    anchor.current = { x, y, above, alignRight };
    setShown((n) => n + 1);
    setOpen(true);
  }
  useLayoutEffect(() => {
    const m = menu.current;
    if (!open || !m) return;
    // The menu sits inside the zoomed library, so window pixels are divided
    // by the interface size before they become its CSS values.
    const zoom = m.getBoundingClientRect().width / (m.offsetWidth || 1) || 1;
    m.style.maxHeight = (window.innerHeight - 16) / zoom + "px";
    m.style.overflowY = "auto";
    const r = m.getBoundingClientRect();
    const { y, above, alignRight } = anchor.current;
    const x = alignRight ? anchor.current.x - r.width : anchor.current.x;
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    // Below the pointer when it fits, otherwise above it, always on screen.
    const top =
      y + r.height <= window.innerHeight - 8
        ? y
        : Math.max(
            8,
            Math.min(above - r.height, window.innerHeight - r.height - 8),
          );
    m.style.left = left / zoom + "px";
    m.style.top = top / zoom + "px";
  }, [open, shown]);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      menu.current
        ?.querySelector<HTMLElement>("[role=menuitem],[role=menuitemcheckbox]")
        ?.focus({ preventScroll: true }),
    );
    const outside = (e: PointerEvent) => {
      if (
        !menu.current?.contains(e.target as Node) &&
        !button.current?.contains(e.target as Node)
      )
        close(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);
  function close(focus = true) {
    setOpen(false);
    onClosed();
    if (focus) button.current?.focus();
  }
  function run(action: () => void) {
    close();
    action();
  }
  const items = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLElement>(
        "[role=menuitem],[role=menuitemcheckbox]",
      ) || [],
    );
  return (
    <div className="book-menu">
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-label={t("More options for {title}", { title: book.title })}
        title={t("More options")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          if (open) return close();
          const r = e.currentTarget.getBoundingClientRect();
          show(r.right, r.bottom + 4, r.top - 4, true);
        }}
      >
        <Ellipsis size={16} />
      </button>
      {open && (
        <div
          ref={menu}
          className="book-menu-popup"
          role="menu"
          aria-label={t("Options for {title}", { title: book.title })}
          onKeyDown={(e) => {
            const list = items();
            const i = list.indexOf(document.activeElement as HTMLElement);
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              list[(i + step + list.length) % list.length]?.focus();
            } else if (e.key === "Tab") close(false);
          }}
        >
          {book.deleted ? (
            <button
              role="menuitem"
              onClick={() => run(() => actions.restore(book))}
            >
              <RotateCcw size={15} />
              {t("Restore")}
            </button>
          ) : (
            <>
              <button
                role="menuitem"
                onClick={() => run(() => actions.open(book))}
              >
                <BookOpen size={15} />
                {t("Open")}
              </button>
              <button
                role="menuitem"
                onClick={() => run(() => actions.favorite(book))}
              >
                <Star
                  size={15}
                  fill={book.favorite ? "currentColor" : "none"}
                />
                {book.favorite
                  ? t("Remove from favorites")
                  : t("Add to favorites")}
              </button>
              <button
                role="menuitem"
                onClick={() => run(() => actions.editCover(book))}
              >
                <ImagePlus size={15} />
                {t("Change cover")}
              </button>
              <button role="menuitem" onClick={() => run(() => actions.binding(book))}>
                <BookMarked size={15} />
                {t("Binding and bookmarks")}
              </button>
              <button
                role="menuitem"
                disabled={!book.position && !book.opened && !book.finished}
                onClick={() => run(() => actions.startOver(book))}
              >
                <Undo2 size={15} />
                {t("Start over")}
              </button>
              <div className="book-menu-separator" role="separator" />
              <button
                role="menuitemcheckbox"
                aria-checked={Boolean(book.uniqueVoice)}
                className="book-menu-voice"
                onClick={() =>
                  run(() => actions.uniqueVoice(book, !book.uniqueVoice))
                }
              >
                <AudioLines size={15} />
                <span>
                  {t("Unique voice for this book")}
                  <small>
                    {book.uniqueVoice
                      ? t(
                          "Uses {name}. Choose it in the Voice tab while reading.",
                          {
                            name: voiceName,
                          },
                        )
                      : t(
                          "May add loading time when you switch to or from this book.",
                        )}
                  </small>
                </span>
                {book.uniqueVoice && <Check size={15} />}
              </button>
              <button
                role="menuitemcheckbox"
                aria-checked={Boolean(book.work)}
                onClick={() => run(() => actions.work(book, !book.work))}
              >
                <BriefcaseBusiness size={15} />
                {t("Use in Work mode")}
                {book.work && <Check size={15} />}
              </button>
              <button role="menuitem" onClick={() => run(() => actions.workOpen(book))}>
                <BriefcaseBusiness size={15} />
                {t("Open in Work mode beside a note")}
              </button>
              {actions.studio && (
                <button role="menuitem" onClick={() => run(() => actions.studio!(book))}>
                  <Clapperboard size={15} />
                  {t("Make an audiobook in Studio")}
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => run(() => actions.shelf(book, shelfOf(book) === "stories" ? "documents" : "stories"))}
              >
                {shelfOf(book) === "stories" ? <FileText size={15} /> : <BookOpen size={15} />}
                {shelfOf(book) === "stories" ? t("Move to Documents") : t("Move to Stories")}
              </button>
              <div className="book-menu-separator" role="separator" />
              <button
                role="menuitem"
                className="danger"
                onClick={() => run(() => actions.trash(book))}
              >
                <Trash2 size={15} />
                {t("Move to Trash")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
