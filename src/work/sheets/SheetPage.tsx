import { lazy, Suspense, useMemo, useRef, useState } from "react";
import {
  ChartColumn,
  Download,
  FileDown,
  FileSpreadsheet,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { t } from "../../i18n";
import { ChartView } from "../charts/ChartView";
import type { ChartSpec } from "../charts/spec";
import { chartTypeLabel } from "../charts/ChartBuilder";
import type { Subject } from "../types";
import type { SheetApi } from "./SheetEditor";
import type { CellValue, SheetDoc, WorkbookData } from "./model";

const SheetEditor = lazy(() => import("./SheetEditor"));

// A spreadsheet page: the grid, its title and subject, and the charts made
// from it on the right, which update as the numbers change.
export function SheetPage({
  sheet,
  subjects,
  charts,
  dark,
  french,
  locale,
  rowsFor,
  onChange,
  onNewChart,
  onEditChart,
  onDeleteChart,
  onInsertChart,
  onExport,
  onDelete,
  extra,
}: {
  sheet: SheetDoc;
  subjects: Subject[];
  charts: ChartSpec[];
  dark: boolean;
  french: boolean;
  locale?: string;
  rowsFor: (spec: ChartSpec) => CellValue[][];
  onChange: (patch: Partial<SheetDoc>) => void;
  onNewChart: (range: string | null) => void;
  onEditChart: (id: string) => void;
  onDeleteChart: (id: string) => void;
  onInsertChart: (id: string) => void;
  onExport: (format: "xlsx" | "csv") => void;
  onDelete: () => void;
  extra?: React.ReactNode;
}) {
  const api = useRef<SheetApi | null>(null);
  const [panel, setPanel] = useState(true);
  const [title, setTitle] = useState(sheet.title);
  const mine = useMemo(() => charts.filter((c) => c.source.kind === "sheet" && c.source.sheetId === sheet.id), [charts, sheet.id]);
  return (
    <section className={"sheet-page" + (panel ? " with-charts" : "")}>
      <header className="sheet-head">
        <FileSpreadsheet size={18} className="sheet-head-icon" />
        <input
          className="sheet-title"
          aria-label={t("Title")}
          value={title}
          placeholder={t("Untitled")}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== sheet.title && onChange({ title: title.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <select aria-label={t("Subject")} value={sheet.subjectId || ""} onChange={(e) => onChange({ subjectId: e.target.value || undefined })}>
          <option value="">{t("No subject")}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="primary" onClick={() => onNewChart(api.current?.selection() ?? null)}>
          <ChartColumn size={15} />
          {t("Chart from selection")}
        </button>
        <button onClick={() => onExport("xlsx")} title={t("Export as Excel")}>
          <FileDown size={15} />
          .xlsx
        </button>
        <button onClick={() => onExport("csv")} title={t("Export as CSV")}>
          <Download size={15} />
          .csv
        </button>
        {extra}
        <button className="icon-only" aria-label={t("Delete sheet")} onClick={onDelete}>
          <Trash2 size={16} />
        </button>
        <button className="icon-only" aria-label={panel ? t("Hide charts") : t("Show charts")} onClick={() => setPanel(!panel)}>
          {panel ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </button>
      </header>
      <div className="sheet-body">
        <div className="sheet-grid">
          <Suspense
            fallback={
              <div className="sheet-loading">
                <LoaderCircle className="spin" />
                {t("Opening the spreadsheet…")}
              </div>
            }
          >
            <SheetEditor
              key={sheet.id}
              data={sheet.data}
              dark={dark}
              french={french}
              onChange={(data: WorkbookData) => onChange({ data })}
              onReady={(a) => (api.current = a)}
            />
          </Suspense>
        </div>
        {panel && (
          <aside className="sheet-charts" aria-label={t("Charts from this sheet")}>
            <div className="sheet-charts-head">
              <strong>{t("Charts")}</strong>
              <button className="mini" onClick={() => onNewChart(api.current?.selection() ?? null)}>
                <Plus size={13} />
                {t("New chart")}
              </button>
            </div>
            {mine.length === 0 && (
              <p className="conn-empty">{t("Select cells with numbers, then choose Chart from selection. Charts here follow the sheet as it changes.")}</p>
            )}
            {mine.map((c) => (
              <article key={c.id} className="sheet-chart-card">
                <header>
                  <strong>{c.title || chartTypeLabel(c.type)}</strong>
                  <small>{c.source.kind === "sheet" ? c.source.range : ""}</small>
                </header>
                <div onDoubleClick={() => onEditChart(c.id)}>
                  <ChartView spec={c} rows={rowsFor(c)} height={210} locale={locale} />
                </div>
                <footer>
                  <button className="mini" onClick={() => onEditChart(c.id)}>
                    <PencilLine size={13} />
                    {t("Edit")}
                  </button>
                  <button className="mini" onClick={() => onInsertChart(c.id)}>
                    <StickyNote size={13} />
                    {t("Add to a note")}
                  </button>
                  <button className="mini quiet" aria-label={t("Delete chart")} onClick={() => onDeleteChart(c.id)}>
                    <Trash2 size={13} />
                  </button>
                </footer>
              </article>
            ))}
          </aside>
        )}
      </div>
    </section>
  );
}
