import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookMarked, Check, LockKeyhole, X } from "lucide-react";
import { t } from "../i18n";
import { annotationColors } from "../themes";
import { bindingOf, edgeFinishes, type BindingPart, type FinishId } from "../binding";
import { readingStats } from "../places";
import { isOpen, rewardHint } from "../rewards";
import { UnlockNote } from "./ThemeGallery";
import type { BookMeta, Preferences } from "../types";
import { BookmarkAppearance } from "./BookmarkAppearance";
import "./bookmarks.css";
import { recordFeat } from "../feats";

// The 3D book's binding (page edges, spine and cover gilding) and the
// bookmarks, in their own window apart from the app's theme. With a book, its
// binding can differ from the one for all books.
export function BindingMenu({
  prefs,
  book,
  finishedBooks,
  onPrefs,
  onBook,
  onClose,
}: {
  prefs: Preferences;
  book?: BookMeta;
  // Finished books count toward unlocking finishes and ribbons.
  finishedBooks: number;
  onPrefs: (patch: Partial<Preferences>) => void;
  onBook: (meta: BookMeta) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"book" | "all">(book ? "book" : "all");
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("[aria-pressed='true'], button")?.focus();
  }, []);
  const stats = readingStats(prefs.readingStats);
  const forBook = scope === "book" && book;
  const shown = bindingOf(prefs.binding, forBook ? book.binding : undefined);
  const choose = (part: BindingPart, id: FinishId | undefined) => {
    recordFeat("binding");
    if (forBook) {
      const next = { ...(book.binding || {}) };
      if (id) next[part] = id;
      else delete next[part];
      onBook({ ...book, binding: Object.keys(next).length ? next : undefined });
    } else onPrefs({ binding: { ...prefs.binding, [part]: id } });
  };
  const parts: [BindingPart, string, string][] = [
    ["edges", t("Page edges"), t("Paper, or the cut edges of the pages gilded in metal.")],
    ["spine", t("Spine"), t("The title, bands and ornaments printed in ink or gilded.")],
    ["cover", t("Cover"), t("A gilded frame with corner rosettes, or the cover as it is.")],
  ];
  const content = (
    <div className="modal-scrim gallery-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section
        ref={dialog}
        className="quick-dialog theme-gallery binding-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="gallery-heading">
          <BookMarked size={18} aria-hidden="true" />
          <h2 id={titleId}>{t("Binding and bookmarks")}</h2>
          {book && (
            <div className="segmented gallery-tabs" role="tablist" aria-label={t("Binding for")}>
              <button role="tab" aria-selected={scope === "book"} className={scope === "book" ? "active" : ""} onClick={() => setScope("book")}>
                {t("This book")}
              </button>
              <button role="tab" aria-selected={scope === "all"} className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
                {t("All books")}
              </button>
            </div>
          )}
          <button className="icon-button" aria-label={t("Close")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="gallery-body">
          <UnlockNote />
          <p className="hint">
            {forBook
              ? t("How {title} looks in book mode. Parts left as for all books follow those choices.", { title: book.title })
              : t("How every book looks in book mode, unless a book has its own binding.")}
          </p>
          {parts.map(([part, title, hint]) => {
            const own = forBook ? book.binding?.[part] : undefined;
            return (
              <div key={part} className="binding-row">
                <h3>
                  {title}
                  {forBook && own && (
                    <button className="text-button" onClick={() => choose(part, undefined)}>
                      {t("Same as all books")}
                    </button>
                  )}
                </h3>
                <p className="hint">{hint}</p>
                <div className="gallery-grid edge-grid">
                  {edgeFinishes.map((f) => {
                    const chosen = shown[part] === f.id;
                    const locked = !chosen && !isOpen("finish", f.id, stats);
                    const hint = locked ? rewardHint("finish", f.id, stats, finishedBooks) : null;
                    return (
                      <button
                        key={f.id}
                        className={"edge-tile binding-" + part + (chosen ? " chosen" : "") + (locked ? " locked" : "")}
                        aria-pressed={locked ? undefined : chosen}
                        aria-disabled={locked ? true : undefined}
                        aria-describedby={locked ? `binding-hint-${part}-${f.id}` : undefined}
                        onClick={() => !locked && choose(part, f.id)}
                        style={{ ["--edge-hi" as string]: f.hi, ["--edge-mid" as string]: f.mid, ["--edge-lo" as string]: f.lo }}
                      >
                        <span className={"edge-book " + part} aria-hidden="true">
                          <span className="edge-spine" />
                          <span className="edge-cover" />
                          <span className="edge-pages" />
                        </span>
                        <strong>{f.id === "plain" ? (part === "edges" ? t("Plain") : t("Ink")) : t(f.name)}</strong>
                        {locked && (
                          <span className="gallery-lock" aria-hidden="true">
                            <LockKeyhole size={16} />
                          </span>
                        )}
                        {chosen && (
                          <span className="gallery-check" aria-hidden="true">
                            <Check size={13} />
                          </span>
                        )}
                        {hint && (
                          <span className="gallery-hint" id={`binding-hint-${part}-${f.id}`} role="tooltip">
                            <strong>{hint.how}</strong>
                            <span>{hint.progress}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="binding-row">
            <h3>{t("Bookmarks")}</h3>
            <p className="hint">{t("Appearance for new bookmarks. Existing bookmarks can be changed in Notes.")}</p>
            <BookmarkAppearance value={prefs.bookmarkDesign} still={prefs.bookmarkStill} prefs={prefs} finishedBooks={finishedBooks} onChange={(bookmarkDesign, bookmarkStill) => onPrefs({ bookmarkDesign, bookmarkStill })} />
            <p className="hint">{t("The ribbon colour of new bookmarks.")}</p>
            <div className="ribbon-choices" role="radiogroup" aria-label={t("Ribbon colour")}>
              <button role="radio" aria-checked={!prefs.ribbonColor} className="ribbon-choice same" onClick={() => onPrefs({ ribbonColor: "" })}>
                {t("Highlight colour")}
              </button>
              {annotationColors.map((c) => {
                const chosen = prefs.ribbonColor === c.id;
                const hint = !chosen && !isOpen("ribbon", c.id, stats) ? rewardHint("ribbon", c.id, stats, finishedBooks) : null;
                const tip = hint ? t("{name}, locked. {how} {progress}", { name: t(c.label), how: hint.how, progress: hint.progress }) : t(c.label);
                return (
                  <button
                    key={c.id}
                    role="radio"
                    aria-checked={chosen}
                    aria-disabled={hint ? true : undefined}
                    aria-label={tip}
                    data-tip={tip}
                    className={"ribbon-choice" + (hint ? " locked" : "")}
                    style={{ ["--ribbon" as string]: c.value }}
                    onClick={() => { if (hint) return; recordFeat("binding"); onPrefs({ ribbonColor: c.id }); }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
  return createPortal(content, document.querySelector(".app") || document.body);
}
