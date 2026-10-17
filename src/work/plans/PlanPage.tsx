import { useState } from "react";
import { DraftingCompass, FileDown, Magnet, StickyNote, Trash2 } from "lucide-react";
import { t } from "../../i18n";
import type { Subject } from "../types";
import { PlanEditor } from "./PlanEditor";
import { gridSteps, metric, planToDxf, planToSvg, type PlanDoc, type Unit } from "./model";

// A plan page: a precise drawing with its units, grid and paper.
export function PlanPage({
  plan,
  subjects,
  onChange,
  onDelete,
  onSave,
  onAddToNote,
  extra,
}: {
  plan: PlanDoc;
  subjects: Subject[];
  onChange: (patch: Partial<PlanDoc>) => void;
  onDelete: () => void;
  onSave: (name: string, content: string, ext: "svg" | "dxf") => void;
  onAddToNote: () => void;
  extra?: React.ReactNode;
}) {
  const [title, setTitle] = useState(plan.title);
  const steps = gridSteps(plan.units);
  const units: [Unit, string][] = [
    ["mm", t("Millimetres")],
    ["cm", t("Centimetres")],
    ["m", t("Metres")],
    ["in", t("Inches")],
    ["ft", t("Feet and inches")],
  ];
  const paperBg = plan.paper === "white" || plan.paper === "grid" ? "#ffffff" : "#1f4e8c";
  const paperInk = plan.paper === "white" || plan.paper === "grid" ? "#1d2a44" : "#eef5ff";
  return (
    <section className="board-page plan-page">
      <header className="sheet-head">
        <DraftingCompass size={18} className="sheet-head-icon" />
        <input
          className="sheet-title"
          aria-label={t("Title")}
          value={title}
          placeholder={t("Untitled")}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== plan.title && onChange({ title: title.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <select aria-label={t("Subject")} value={plan.subjectId || ""} onChange={(e) => onChange({ subjectId: e.target.value || undefined })}>
          <option value="">{t("No subject")}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Units")}
          value={plan.units}
          onChange={(e) => {
            const u = e.target.value as Unit;
            const switched = metric(u) !== metric(plan.units);
            onChange({ units: u, ...(switched ? { grid: metric(u) ? 10 : 25.4 } : {}) });
          }}
        >
          {units.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label={t("Grid")} value={String(plan.grid)} onChange={(e) => onChange({ grid: Number(e.target.value) })} data-tip={t("Grid spacing")}>
          {!steps.some((s) => Math.abs(s.mm - plan.grid) < 1e-9) && <option value={String(plan.grid)}>{plan.grid} mm</option>}
          {steps.map((s) => (
            <option key={s.label} value={String(s.mm)}>
              {s.label}
            </option>
          ))}
        </select>
        <button className={"ink-tool" + (plan.snap ? " active" : "")} aria-pressed={plan.snap} data-tip={t("Snap to grid")} onClick={() => onChange({ snap: !plan.snap })}>
          <Magnet size={16} />
        </button>
        <select aria-label={t("Paper")} value={plan.paper || "blueprint"} onChange={(e) => onChange({ paper: e.target.value as PlanDoc["paper"] })}>
          <option value="blueprint">{t("Blueprint")}</option>
          <option value="grid">{t("Math grid")}</option>
          <option value="white">{t("White")}</option>
        </select>
        <span className="spacer" />
        <button onClick={onAddToNote}>
          <StickyNote size={15} />
          {t("Add to a note")}
        </button>
        <button onClick={() => onSave(plan.title || "plan", planToSvg(plan, paperInk, paperBg), "svg")} data-tip={t("A drawing in real size, for printing or other apps")}>
          <FileDown size={15} />
          .svg
        </button>
        <button onClick={() => onSave(plan.title || "plan", planToDxf(plan), "dxf")} data-tip={t("Opens in AutoCAD, LibreCAD, FreeCAD and most CAD apps")}>
          <FileDown size={15} />
          .dxf
        </button>
        {extra}
        <button className="icon-only" aria-label={t("Delete plan")} onClick={onDelete}>
          <Trash2 size={16} />
        </button>
      </header>
      <div className="board-body">
        <PlanEditor key={plan.id} plan={plan} onChange={(shapes) => onChange({ shapes })} />
      </div>
    </section>
  );
}
