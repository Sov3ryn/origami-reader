import { useEffect, useMemo, useState } from "react";
import { BookMarked, BriefcaseBusiness, CalendarCheck, FileText, GraduationCap, Languages, LayoutPanelLeft, Microscope, NotebookPen, Users, X } from "lucide-react";
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") setActive((a) => Math.min(list.length, a + 1));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
      else if (e.key === "Enter") onPick(active === 0 ? null : list[active - 1]);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, list, onClose, onPick]);
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-title">
        <header>
          <h2 id="template-title">{t("New note")}</h2>
          <span className="ink-spacer" />
          <button className="icon-only" aria-label={t("Close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="template-grid" role="listbox" aria-label={t("Templates")}>
          <button role="option" aria-selected={active === 0} className={active === 0 ? "active" : ""} onMouseEnter={() => setActive(0)} onClick={() => onPick(null)}>
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
