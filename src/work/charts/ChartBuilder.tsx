import { useMemo, useRef, useState } from "react";
import {
  ChartArea,
  ChartBar,
  ChartBarStacked,
  ChartCandlestick,
  ChartColumn,
  ChartColumnStacked,
  ChartColumnIncreasing,
  ChartLine,
  ChartNoAxesCombined,
  ChartPie,
  ChartScatter,
  CircleDot,
  Copy,
  Donut,
  Download,
  Flower2,
  Funnel,
  Gauge,
  Grid3x3,
  LayoutDashboard,
  Minus,
  Percent,
  Plus,
  Radar,
  X,
} from "lucide-react";
import { t } from "../../i18n";
import { parseCell, parseRange, readRange, usedRange, findSheet, rangeText, type CellValue } from "../sheets/model";
import type { SheetDoc } from "../sheets/model";
import { ChartView, type ChartHandle } from "./ChartView";
import { chartTypes, palettes, type ChartSpec, type ChartType } from "./spec";

const typeIcon: Record<ChartType, React.ReactNode> = {
  column: <ChartColumn size={18} />,
  bar: <ChartBar size={18} />,
  line: <ChartLine size={18} />,
  area: <ChartArea size={18} />,
  "stacked-column": <ChartColumnStacked size={18} />,
  "stacked-bar": <ChartBarStacked size={18} />,
  "stacked-area": <ChartArea size={18} />,
  "percent-column": <Percent size={18} />,
  combo: <ChartNoAxesCombined size={18} />,
  waterfall: <ChartColumnIncreasing size={18} />,
  pie: <ChartPie size={18} />,
  donut: <Donut size={18} />,
  rose: <Flower2 size={18} />,
  scatter: <ChartScatter size={18} />,
  bubble: <CircleDot size={18} />,
  radar: <Radar size={18} />,
  heatmap: <Grid3x3 size={18} />,
  funnel: <Funnel size={18} />,
  gauge: <Gauge size={18} />,
  treemap: <LayoutDashboard size={18} />,
  candlestick: <ChartCandlestick size={18} />,
};
const typeLabels = (): Record<ChartType, string> => ({
  column: t("Column"),
  bar: t("Bar"),
  line: t("Line"),
  area: t("Area"),
  "stacked-column": t("Stacked column"),
  "stacked-bar": t("Stacked bar"),
  "stacked-area": t("Stacked area"),
  "percent-column": t("100% column"),
  combo: t("Column and line"),
  waterfall: t("Waterfall"),
  pie: t("Pie"),
  donut: t("Donut"),
  rose: t("Rose"),
  scatter: t("Scatter"),
  bubble: t("Bubble"),
  radar: t("Radar"),
  heatmap: t("Heatmap"),
  funnel: t("Funnel"),
  gauge: t("Gauge"),
  treemap: t("Treemap"),
  candlestick: t("Candlestick"),
});
const typeHints = (): Partial<Record<ChartType, string>> => ({
  scatter: t("Two number columns: x, then y."),
  bubble: t("Three number columns: x, y and size."),
  candlestick: t("Four columns: open, close, low and high."),
  gauge: t("One number (the first value)."),
  waterfall: t("One column of changes, positive or negative."),
  combo: t("Two or more series: the first as columns, the rest as lines on a second axis."),
  heatmap: t("A grid: categories across, series down."),
});

export const chartTypeLabel = (type: ChartType) => typeLabels()[type];

const sample: CellValue[][] = [
  ["", "2024", "2025"],
  ["Q1", 120, 140],
  ["Q2", 150, 180],
  ["Q3", 135, 210],
  ["Q4", 190, 240],
];

// Make or edit a chart: data from a sheet or typed in, 21 chart types, and
// titles, colours, legend, labels, formats and axes, with a live preview.
export function ChartBuilder({
  initial,
  sheets,
  tables,
  locale,
  onSave,
  onClose,
  saveFile,
}: {
  initial: ChartSpec;
  sheets: SheetDoc[];
  // Tables found in the open note, to chart one of them.
  tables?: CellValue[][][];
  locale?: string;
  onSave: (spec: ChartSpec) => void;
  onClose: () => void;
  saveFile: (name: string, data: string, kind: "png" | "svg") => void;
}) {
  const [spec, setSpec] = useState<ChartSpec>(initial);
  const [grid, setGrid] = useState<CellValue[][]>(initial.source.kind === "data" && initial.source.rows.length ? initial.source.rows : sample);
  const handle = useRef<ChartHandle | null>(null);
  // Bumped when the whole grid is replaced, so the inputs show the new values.
  const [gridVersion, setGridVersion] = useState(0);
  const patch = (p: Partial<ChartSpec>) => setSpec((s) => ({ ...s, ...p }));
  const sheet = spec.source.kind === "sheet" ? sheets.find((s) => s.id === (spec.source as { sheetId: string }).sheetId) : undefined;
  const rows = useMemo(() => {
    if (spec.source.kind === "data") return grid;
    if (!sheet) return [];
    const r = parseRange(spec.source.range);
    return r ? readRange(sheet.data, r) : [];
  }, [spec.source, grid, sheet]);
  const valid = rows.length > 0;
  const rangeOk = spec.source.kind !== "sheet" || Boolean(parseRange(spec.source.range));

  function setCell(r: number, c: number, text: string) {
    setGrid((g) => {
      const next = g.map((row) => [...row]);
      next[r][c] = parseCell(text);
      return next;
    });
  }
  const preview = useMemo(() => ({ ...spec, source: spec.source.kind === "data" ? { kind: "data" as const, rows: grid } : spec.source }), [spec, grid]);

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="chart-builder" role="dialog" aria-modal="true" aria-label={t("Chart")}>
        <header className="cb-head">
          <h2>{initial.created === initial.updated && !initial.title ? t("New chart") : t("Edit chart")}</h2>
          <div className="cb-head-actions">
            <button className="mini" disabled={!valid} onClick={() => { const d = handle.current?.png(); if (d) saveFile(spec.title || "chart", d, "png"); }}>
              <Download size={13} />
              PNG
            </button>
            <button className="mini" disabled={!valid} onClick={() => void handle.current?.svg().then((d) => d && saveFile(spec.title || "chart", d, "svg"))}>
              <Download size={13} />
              SVG
            </button>
            <button
              className="mini"
              disabled={!valid}
              onClick={() => {
                const d = handle.current?.png();
                if (!d) return;
                void fetch(d)
                  .then((r) => r.blob())
                  .then((b) => navigator.clipboard.write([new ClipboardItem({ "image/png": b })]))
                  .catch(() => {});
              }}
            >
              <Copy size={13} />
              {t("Copy image")}
            </button>
            <button className="icon-only" aria-label={t("Close")} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="cb-body">
          <div className="cb-settings">
            <label className="cb-field">
              <span>{t("Title")}</span>
              <input value={spec.title} placeholder={t("Chart title")} onChange={(e) => patch({ title: e.target.value })} />
            </label>
            <label className="cb-field">
              <span>{t("Subtitle")}</span>
              <input value={spec.subtitle || ""} onChange={(e) => patch({ subtitle: e.target.value })} />
            </label>

            <h3>{t("Type")}</h3>
            <div className="cb-types" role="radiogroup" aria-label={t("Chart type")}>
              {chartTypes.map((type) => (
                <button key={type} role="radio" aria-checked={spec.type === type} title={typeLabels()[type]} onClick={() => patch({ type })}>
                  {typeIcon[type]}
                  <span>{typeLabels()[type]}</span>
                </button>
              ))}
            </div>
            {typeHints()[spec.type] && <p className="hint">{typeHints()[spec.type]}</p>}

            <h3>{t("Data")}</h3>
            <div className="segmented cb-source" role="radiogroup">
              <button
                role="radio"
                aria-checked={spec.source.kind === "sheet"}
                disabled={!sheets.length}
                onClick={() => {
                  const s = sheets[0];
                  const sh = s && findSheet(s.data);
                  const used = sh ? usedRange(sh) : null;
                  if (s) patch({ source: { kind: "sheet", sheetId: s.id, range: used ? rangeText(used) : `${sh?.name || "Sheet1"}!A1:C10` } });
                }}
              >
                {t("From a sheet")}
              </button>
              <button role="radio" aria-checked={spec.source.kind === "data"} onClick={() => patch({ source: { kind: "data", rows: grid } })}>
                {t("Type the data")}
              </button>
            </div>
            {spec.source.kind === "sheet" ? (
              <>
                <label className="cb-field">
                  <span>{t("Sheet")}</span>
                  <select
                    value={spec.source.sheetId}
                    onChange={(e) => {
                      const s = sheets.find((x) => x.id === e.target.value);
                      const sh = s && findSheet(s.data);
                      const used = sh ? usedRange(sh) : null;
                      patch({ source: { kind: "sheet", sheetId: e.target.value, range: used ? rangeText(used) : "A1:C10" } });
                    }}
                  >
                    {sheets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title || t("Untitled")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={"cb-field" + (rangeOk ? "" : " invalid")}>
                  <span>{t("Range")}</span>
                  <input
                    value={spec.source.range}
                    placeholder="Sheet1!A1:D12"
                    onChange={(e) => patch({ source: { kind: "sheet", sheetId: (spec.source as { sheetId: string }).sheetId, range: e.target.value } })}
                  />
                </label>
                <p className="hint">{t("The chart follows the sheet: change a number and the chart changes too.")}</p>
              </>
            ) : (
              <div className="cb-grid-wrap">
                {tables && tables.length > 0 && (
                  <select
                    className="cb-table-pick"
                    value=""
                    onChange={(e) => {
                      const tb = tables[+e.target.value];
                      if (tb) {
                        setGrid(tb);
                        setGridVersion((v) => v + 1);
                        patch({ source: { kind: "data", rows: tb } });
                      }
                    }}
                  >
                    <option value="">{t("Use a table from this note…")}</option>
                    {tables.map((tb, i) => (
                      <option key={i} value={i}>
                        {t("Table {number}", { number: i + 1 })} · {tb.length} × {tb[0]?.length ?? 0}
                      </option>
                    ))}
                  </select>
                )}
                <div className="cb-grid" style={{ gridTemplateColumns: `repeat(${grid[0]?.length || 1}, minmax(64px, 1fr))` }}>
                  {grid.map((row, r) =>
                    row.map((v, c) => (
                      <input
                        key={gridVersion + ":" + r + ":" + c}
                        className={(r === 0 && spec.headers) || c === 0 ? "head" : ""}
                        defaultValue={v === null ? "" : String(v)}
                        aria-label={`${r + 1}, ${c + 1}`}
                        onChange={(e) => setCell(r, c, e.target.value)}
                      />
                    )),
                  )}
                </div>
                <div className="cb-grid-tools">
                  <button className="mini" onClick={() => setGrid((g) => [...g, g[0].map(() => null)])}>
                    <Plus size={12} />
                    {t("Row")}
                  </button>
                  <button className="mini" onClick={() => setGrid((g) => g.map((r) => [...r, null]))}>
                    <Plus size={12} />
                    {t("Column")}
                  </button>
                  <button className="mini" disabled={grid.length < 3} onClick={() => setGrid((g) => g.slice(0, -1))}>
                    <Minus size={12} />
                    {t("Row")}
                  </button>
                  <button className="mini" disabled={(grid[0]?.length || 0) < 3} onClick={() => setGrid((g) => g.map((r) => r.slice(0, -1)))}>
                    <Minus size={12} />
                    {t("Column")}
                  </button>
                </div>
              </div>
            )}
            <div className="cb-row">
              <label className="check-label">
                <input type="checkbox" checked={spec.headers} onChange={(e) => patch({ headers: e.target.checked })} />
                {t("First row names the series")}
              </label>
              <label className="check-label">
                <input type="checkbox" checked={spec.seriesIn === "rows"} onChange={(e) => patch({ seriesIn: e.target.checked ? "rows" : "columns" })} />
                {t("Series in rows")}
              </label>
            </div>

            <h3>{t("Style")}</h3>
            <div className="cb-palettes" role="radiogroup" aria-label={t("Colours")}>
              {Object.entries(palettes).map(([id, colors]) => (
                <button key={id} role="radio" aria-checked={spec.palette === id} title={id} onClick={() => patch({ palette: id })}>
                  {colors.slice(0, 5).map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </button>
              ))}
            </div>
            <div className="cb-row">
              <label className="cb-field small">
                <span>{t("Legend")}</span>
                <select value={spec.legend} onChange={(e) => patch({ legend: e.target.value as ChartSpec["legend"] })}>
                  <option value="top">{t("Top")}</option>
                  <option value="bottom">{t("Bottom")}</option>
                  <option value="right">{t("Right")}</option>
                  <option value="none">{t("Hidden")}</option>
                </select>
              </label>
              <label className="cb-field small">
                <span>{t("Numbers")}</span>
                <select value={spec.format} onChange={(e) => patch({ format: e.target.value as ChartSpec["format"] })}>
                  <option value="number">1 234,5</option>
                  <option value="compact">1,2 k</option>
                  <option value="percent">45 %</option>
                  <option value="currency">{t("Currency")}</option>
                </select>
              </label>
              {spec.format === "currency" && (
                <label className="cb-field small">
                  <span>{t("Currency")}</span>
                  <select value={spec.currency || "EUR"} onChange={(e) => patch({ currency: e.target.value })}>
                    {["EUR", "USD", "CAD", "GBP", "CHF", "JPY", "CNY", "INR", "BRL", "KRW"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="cb-field small">
                <span>{t("Sort")}</span>
                <select value={spec.sort || "none"} onChange={(e) => patch({ sort: e.target.value as ChartSpec["sort"] })}>
                  <option value="none">{t("As in the data")}</option>
                  <option value="desc">{t("Largest first")}</option>
                  <option value="asc">{t("Smallest first")}</option>
                </select>
              </label>
            </div>
            <div className="cb-row checks">
              <label className="check-label">
                <input type="checkbox" checked={spec.labels} onChange={(e) => patch({ labels: e.target.checked })} />
                {t("Value labels")}
              </label>
              <label className="check-label">
                <input type="checkbox" checked={spec.smooth} onChange={(e) => patch({ smooth: e.target.checked })} />
                {t("Smooth lines")}
              </label>
              <label className="check-label">
                <input type="checkbox" checked={spec.trend} onChange={(e) => patch({ trend: e.target.checked })} />
                {t("Trend line")}
              </label>
              <label className="check-label">
                <input type="checkbox" checked={spec.zoom} onChange={(e) => patch({ zoom: e.target.checked })} />
                {t("Zoom slider")}
              </label>
            </div>
            <details className="cb-axes">
              <summary>{t("Axes")}</summary>
              <div className="cb-row">
                <label className="cb-field small">
                  <span>{t("Horizontal title")}</span>
                  <input value={spec.xTitle || ""} onChange={(e) => patch({ xTitle: e.target.value })} />
                </label>
                <label className="cb-field small">
                  <span>{t("Vertical title")}</span>
                  <input value={spec.yTitle || ""} onChange={(e) => patch({ yTitle: e.target.value })} />
                </label>
                <label className="cb-field small">
                  <span>{t("Minimum")}</span>
                  <input type="number" value={spec.yMin ?? ""} onChange={(e) => patch({ yMin: e.target.value === "" ? undefined : +e.target.value })} />
                </label>
                <label className="cb-field small">
                  <span>{t("Maximum")}</span>
                  <input type="number" value={spec.yMax ?? ""} onChange={(e) => patch({ yMax: e.target.value === "" ? undefined : +e.target.value })} />
                </label>
              </div>
            </details>
          </div>
          <div className="cb-preview">
            {valid ? (
              <ChartView spec={preview} rows={rows} height={440} locale={locale} onReady={(h) => (handle.current = h)} />
            ) : (
              <p className="conn-empty">{rangeOk ? t("No numbers in this range yet.") : t("Write a range like A1:D12 or Sheet1!A1:D12.")}</p>
            )}
          </div>
        </div>
        <footer className="dialog-actions">
          <button onClick={onClose}>{t("Cancel")}</button>
          <button
            className="primary"
            disabled={!valid}
            onClick={() => onSave({ ...preview, updated: Date.now() })}
          >
            {t("Save chart")}
          </button>
        </footer>
      </section>
    </div>
  );
}
