import { useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, BriefcaseBusiness, CalendarCheck, FileText, GraduationCap, Languages, LayoutPanelLeft, Microscope, NotebookPen, Users, X } from "lucide-react";
import { useModal } from "../components/useModal";
import { t } from "../i18n";
import { templates, type Template } from "./templates";

const icons: Record<string, React.ReactNode> = {
  cornell: <LayoutPanelLeft size={18} />,
  lecture: <GraduationCap size={18} />,
  book: <BookMarked size={18} />,
  vocabulary: <Languages size={18} />,
  meeting: <Users size={18} />,
  project: <BriefcaseBusiness size={18} />,
  research: <Microscope size={18} />,
  weekly: <CalendarCheck size={18} />,
  exam: <NotebookPen size={18} />,
};

export function TemplatePicker({ onPick, onClose }: { onPick: (tpl: Template | null) => void; onClose: () => void }) {
  const list = useMemo(templates, []);
  const [active, setActive] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  useModal(scrim);
  const focusAt = (i: number) => grid.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[i]?.focus();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  // Focus moves into the picker so keys no longer edit the note underneath;
  // Enter and Space then activate the focused button itself.
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>("[role=option]")?.focus();
  }, []);
  function arrows(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    // Step from the focused option (the highlight may follow the mouse instead).
    const options = Array.from(grid.current?.querySelectorAll("[role=option]") || []);
    const from = options.indexOf(document.activeElement as Element);
    const next = Math.min(list.length, Math.max(0, (from < 0 ? active : from) + step));
    setActive(next);
    focusAt(next);
  }
  return (
    <div ref={scrim} className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-title">
        <header>
          <h2 id="template-title">{t("New note")}</h2>
          <span className="ink-spacer" />
          <button className="icon-only" aria-label={t("Close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="template-grid" role="listbox" aria-label={t("Templates")} ref={grid} onKeyDown={arrows}>
          <button
            role="option"
            aria-selected={active === 0}
            data-autofocus
            className={active === 0 ? "active" : ""}
            onMouseEnter={() => setActive(0)}
            onFocus={() => setActive(0)}
            onClick={() => onPick(null)}
          >
            <FileText size={18} />
            <strong>{t("Blank note")}</strong>
            <small>{t("Start from an empty page.")}</small>
          </button>
          {list.map((tpl, i) => (
            <button
              key={tpl.id}
              role="option"
              aria-selected={active === i + 1}
              className={active === i + 1 ? "active" : ""}
              onMouseEnter={() => setActive(i + 1)}
              onFocus={() => setActive(i + 1)}
              onClick={() => onPick(tpl)}
            >
              {icons[tpl.id]}
              <strong>{tpl.label}</strong>
              <small>{tpl.description}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
