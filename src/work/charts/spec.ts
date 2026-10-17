// Charts in Work Mode: what a chart is (ChartSpec), where its numbers come
// from, and how it becomes an Apache ECharts option. Pure functions, so the
// same chart renders in a note, beside a sheet and in exports.
import type { CellValue } from "../sheets/model";

export const chartTypes = [
  "column",
  "bar",
  "line",
  "area",
  "stacked-column",
  "stacked-bar",
  "stacked-area",
  "percent-column",
  "combo",
  "waterfall",
  "pie",
  "donut",
  "rose",
  "scatter",
  "bubble",
  "radar",
  "heatmap",
  "funnel",
  "gauge",
  "treemap",
  "candlestick",
] as const;
export type ChartType = (typeof chartTypes)[number];

export type ChartSource =
  | { kind: "sheet"; sheetId: string; range: string }
  | { kind: "data"; rows: CellValue[][] };

export type ChartSpec = {
  id: string;
  kind: "chart";
  title: string;
  subtitle?: string;
  type: ChartType;
  source: ChartSource;
  // The first row names the series, the first column labels the categories.
  headers: boolean;
  seriesIn: "columns" | "rows";
  palette: string;
  legend: "top" | "bottom" | "right" | "none";
  labels: boolean;
  smooth: boolean;
  xTitle?: string;
  yTitle?: string;
  yMin?: number;
  yMax?: number;
  format: "number" | "percent" | "currency" | "compact";
  currency?: string;
  zoom: boolean;
  trend: boolean;
  sort?: "none" | "asc" | "desc";
  created: number;
  updated: number;
  vault?: string;
};

export const palettes: Record<string, string[]> = {
  origami: ["#8f7bd8", "#5aa6d6", "#4fb58a", "#d6a24f", "#d56f6f", "#c779b8", "#7f8a99", "#6fc3c0"],
  professional: ["#2f6fde", "#16a3a3", "#7c5cd6", "#e08a2e", "#d4495b", "#5d6b82", "#3fae5a", "#c9a227"],
  ocean: ["#0b4f6c", "#01baef", "#20bf55", "#0b6e4f", "#5aa9e6", "#7fc8f8", "#1d3557", "#94d2bd"],
  forest: ["#2d6a4f", "#40916c", "#74c69d", "#b7e4c7", "#d8a657", "#99582a", "#606c38", "#283618"],
  sunset: ["#f94144", "#f3722c", "#f8961e", "#f9c74f", "#90be6d", "#43aa8b", "#577590", "#9d4edd"],
  pastel: ["#a0c4ff", "#bdb2ff", "#ffc6ff", "#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff"],
  mono: ["#1f2937", "#374151", "#4b5563", "#6b7280", "#9ca3af", "#cbd5e1", "#475569", "#94a3b8"],
};

export function defaultSpec(fields: Partial<ChartSpec> & { source: ChartSource }, now = Date.now()): ChartSpec {
  return {
    id: crypto.randomUUID(),
    kind: "chart",
    title: "",
    type: "column",
    headers: true,
    seriesIn: "columns",
    palette: "origami",
    legend: "top",
    labels: false,
    smooth: true,
    format: "number",
    zoom: false,
    trend: false,
    sort: "none",
    created: now,
    updated: now,
    ...fields,
  };
}

// --- Data ------------------------------------------------------------------------
export type Series = { name: string; values: (number | null)[] };
export type Dataset = { categories: string[]; series: Series[] };

const num = (v: CellValue): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(",", ".")))) return Number(v.replace(",", "."));
  return null;
};
const label = (v: CellValue) => (v === null || v === undefined ? "" : String(v));

export function toDataset(rows: CellValue[][], spec: Pick<ChartSpec, "headers" | "seriesIn" | "sort">): Dataset {
  let grid = rows.filter((r) => r.some((v) => v !== null && v !== ""));
  if (spec.seriesIn === "rows" && grid.length) {
    const width = Math.max(...grid.map((r) => r.length));
    grid = Array.from({ length: width }, (_, c) => grid.map((r) => r[c] ?? null));
  }
  if (!grid.length) return { categories: [], series: [] };
  const width = Math.max(...grid.map((r) => r.length));
  // A first column of text labels the categories.
  const body = spec.headers ? grid.slice(1) : grid;
  // An empty top-left corner is the usual table layout: labels down the side,
  // even when they look like numbers (years, for example).
  const corner = spec.headers && (grid[0][0] === null || grid[0][0] === "");
  const textFirst = width > 1 && (corner || body.some((r) => r[0] !== null && num(r[0]) === null));
  const head = spec.headers ? grid[0] : [];
  const start = textFirst ? 1 : 0;
  const categories = body.map((r, i) => (textFirst ? label(r[0]) : String(i + 1)));
  const series: Series[] = [];
  for (let c = start; c < width; c++)
    series.push({
      name: label(head[c] ?? null) || `Series ${c - start + 1}`,
      values: body.map((r) => num(r[c] ?? null)),
    });
  const data = { categories, series };
  if (spec.sort && spec.sort !== "none" && series.length) {
    const order = categories.map((_, i) => i).sort((a, b) => {
      const x = series[0].values[a] ?? -Infinity;
      const y = series[0].values[b] ?? -Infinity;
      return spec.sort === "asc" ? x - y : y - x;
    });
    return {
      categories: order.map((i) => categories[i]),
      series: series.map((s) => ({ ...s, values: order.map((i) => s.values[i]) })),
    };
  }
  return data;
}

// Least-squares line through the points, for trend lines.
export function linearTrend(values: (number | null)[]): (number | null)[] {
  const pts = values.map((y, x) => [x, y] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return values.map(() => null);
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const icept = (sy - slope * sx) / n;
  return values.map((_, x) => +(icept + slope * x).toFixed(6));
}

export function formatter(spec: Pick<ChartSpec, "format" | "currency">, locale?: string) {
  const f =
    spec.format === "percent"
      ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 })
      : spec.format === "currency"
        ? new Intl.NumberFormat(locale, { style: "currency", currency: spec.currency || "EUR", maximumFractionDigits: 2 })
        : spec.format === "compact"
          ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
          : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (v: unknown) => (typeof v === "number" ? f.format(v) : String(v ?? ""));
}

// --- ECharts option ------------------------------------------------------------------
export type Look = { dark: boolean; font: string; ink: string; muted: string; line: string; locale?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Option = Record<string, any>;

export function buildOption(spec: ChartSpec, rows: CellValue[][], look: Look): Option {
  const data = toDataset(rows, spec);
  const colors = palettes[spec.palette] || palettes.origami;
  const fmt = formatter(spec, look.locale);
  const text = { color: look.ink, fontFamily: look.font };
  const base: Option = {
    color: colors,
    backgroundColor: "transparent",
    textStyle: { fontFamily: look.font, color: look.ink },
    animationDuration: 500,
    title: spec.title
      ? { text: spec.title, subtext: spec.subtitle || "", left: "center", textStyle: { ...text, fontSize: 15, fontWeight: 600 }, subtextStyle: { color: look.muted } }
      : undefined,
    tooltip: { trigger: "axis", valueFormatter: fmt, backgroundColor: look.dark ? "#1d2028" : "#fff", borderColor: look.line, textStyle: { color: look.ink } },
    legend:
      spec.legend === "none"
        ? { show: false }
        : {
            type: "scroll",
            [spec.legend === "right" ? "right" : "left"]: spec.legend === "right" ? 8 : "center",
            ...(spec.legend === "right" ? { orient: "vertical", top: "middle" } : { [spec.legend]: spec.title ? (spec.legend === "top" ? 44 : 4) : 4 }),
            textStyle: { color: look.muted },
          },
  };
  const top = (spec.title ? 52 : 18) + (spec.legend === "top" ? 26 : 0);
  const grid = {
    left: 12,
    right: spec.legend === "right" ? 120 : 20,
    top,
    bottom: (spec.legend === "bottom" ? 34 : 12) + (spec.zoom ? 36 : 0),
    containLabel: true,
  };
  const axisCommon = {
    axisLine: { lineStyle: { color: look.line } },
    axisLabel: { color: look.muted },
    splitLine: { lineStyle: { color: look.line, type: "dashed" as const } },
    nameTextStyle: { color: look.muted },
  };
  const valueAxis = { type: "value", ...axisCommon, name: spec.yTitle, nameLocation: "middle", nameGap: 46, min: spec.yMin, max: spec.yMax, axisLabel: { color: look.muted, formatter: fmt } };
  const categoryAxis = { type: "category", data: data.categories, ...axisCommon, name: spec.xTitle, nameLocation: "middle", nameGap: 30, splitLine: { show: false } };
  const label = { show: spec.labels, formatter: (p: { value: unknown }) => fmt(Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value), color: look.ink, fontSize: 11 };
  const zoom = spec.zoom ? [{ type: "inside" }, { type: "slider", height: 18, bottom: 8, borderColor: look.line, textStyle: { color: look.muted } }] : undefined;
  const t = spec.type;

  if (["column", "bar", "line", "area", "stacked-column", "stacked-bar", "stacked-area", "percent-column", "combo"].includes(t)) {
    const horizontal = t === "bar" || t === "stacked-bar";
    const stacked = t.startsWith("stacked") || t === "percent-column";
    const percent = t === "percent-column";
    const totals = data.categories.map((_, i) => data.series.reduce((a, s) => a + Math.abs(s.values[i] ?? 0), 0) || 1);
    const series: Option[] = data.series.map((s, i) => {
      const asLine = t === "line" || t === "area" || t === "stacked-area" || (t === "combo" && i > 0);
      return {
        name: s.name,
        type: asLine ? "line" : "bar",
        data: percent ? s.values.map((v, j) => (v === null ? null : v / totals[j])) : s.values,
        stack: stacked ? "total" : undefined,
        smooth: asLine && spec.smooth,
        symbolSize: 6,
        areaStyle: t === "area" || t === "stacked-area" ? { opacity: 0.22 } : undefined,
        yAxisIndex: t === "combo" && i > 0 && data.series.length > 1 ? 1 : 0,
        itemStyle: asLine ? undefined : { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        barMaxWidth: 46,
        label: { ...label, position: stacked ? "inside" : horizontal ? "right" : "top" },
        emphasis: { focus: "series" },
      };
    });
    if (spec.trend && data.series[0] && !stacked)
      series.push({
        name: `${data.series[0].name} trend`,
        type: "line",
        data: linearTrend(data.series[0].values),
        symbol: "none",
        lineStyle: { type: "dashed", width: 1.5 },
        tooltip: { show: false },
      });
    const y = percent ? { ...valueAxis, max: 1, axisLabel: { color: look.muted, formatter: formatter({ format: "percent" }, look.locale) } } : valueAxis;
    return {
      ...base,
      grid,
      dataZoom: zoom,
      xAxis: horizontal ? y : { ...categoryAxis, boundaryGap: !(t === "line" || t === "area" || t === "stacked-area") },
      yAxis: horizontal
        ? { ...categoryAxis, inverse: true }
        : t === "combo" && data.series.length > 1
          ? [y, { ...valueAxis, name: undefined, splitLine: { show: false } }]
          : y,
      series,
    };
  }
  if (t === "waterfall") {
    const values = data.series[0]?.values.map((v) => v ?? 0) || [];
    let run = 0;
    const base2: (number | string)[] = [];
    const up: (number | string)[] = [];
    const down: (number | string)[] = [];
    for (const v of values) {
      base2.push(v >= 0 ? run : run + v);
      up.push(v >= 0 ? v : "-");
      down.push(v < 0 ? -v : "-");
      run += v;
    }
    return {
      ...base,
      grid,
      tooltip: { trigger: "axis", formatter: (p: { dataIndex: number }[]) => `${data.categories[p[0].dataIndex]}: ${fmt(values[p[0].dataIndex])}` },
      legend: { show: false },
      xAxis: categoryAxis,
      yAxis: valueAxis,
      series: [
        { type: "bar", stack: "w", data: base2, itemStyle: { color: "transparent" }, emphasis: { disabled: true } },
        { name: "+", type: "bar", stack: "w", data: up, itemStyle: { color: colors[2], borderRadius: 3 }, label: { ...label, position: "top" } },
        { name: "-", type: "bar", stack: "w", data: down, itemStyle: { color: colors[4], borderRadius: 3 }, label: { ...label, position: "bottom" } },
      ],
    };
  }
  if (t === "pie" || t === "donut" || t === "rose") {
    const s = data.series[0];
    return {
      ...base,
      tooltip: { trigger: "item", valueFormatter: fmt },
      series: [
        {
          type: "pie",
          radius: t === "pie" ? ["0%", "68%"] : t === "donut" ? ["42%", "70%"] : ["18%", "72%"],
          roseType: t === "rose" ? "radius" : undefined,
          center: ["50%", spec.title ? "58%" : "54%"],
          itemStyle: { borderColor: look.dark ? "#14161b" : "#fff", borderWidth: 2, borderRadius: t === "donut" ? 6 : 3 },
          label: { show: true, color: look.ink, formatter: spec.labels ? (p: { name: string; percent: number }) => `${p.name}\n${p.percent}%` : "{b}" },
          data: data.categories.map((c, i) => ({ name: c, value: s?.values[i] ?? 0 })),
        },
      ],
    };
  }
  if (t === "scatter" || t === "bubble") {
    // Pairs of columns: x, y (and size for bubbles).
    const xs = data.series[0]?.values || [];
    const ys = data.series[1]?.values || data.series[0]?.values || [];
    const sizes = data.series[2]?.values || [];
    const max = Math.max(1, ...sizes.map((v) => Math.abs(v ?? 0)));
    const points = xs.map((x, i) => [x, ys[i], sizes[i] ?? null, data.categories[i]]).filter((p) => p[0] !== null && p[1] !== null);
    const series: Option[] = [
      {
        name: data.series[1]?.name || data.series[0]?.name || "",
        type: "scatter",
        data: points,
        symbolSize: t === "bubble" ? (v: number[]) => 8 + 42 * Math.sqrt(Math.abs(v[2] ?? 0) / max) : 10,
        itemStyle: { opacity: 0.8 },
        label: { show: spec.labels, formatter: (p: { value: unknown[] }) => String(p.value[3] ?? ""), position: "top", color: look.muted },
      },
    ];
    if (spec.trend && points.length > 1) {
      const px = points.map((p) => p[0] as number);
      const py = points.map((p) => p[1] as number);
      const n = px.length;
      const mx = px.reduce((a, b) => a + b, 0) / n;
      const my = py.reduce((a, b) => a + b, 0) / n;
      const slope = px.reduce((a, x, i) => a + (x - mx) * (py[i] - my), 0) / (px.reduce((a, x) => a + (x - mx) ** 2, 0) || 1);
      const lo = Math.min(...px);
      const hi = Math.max(...px);
      series.push({ type: "line", name: "trend", symbol: "none", data: [[lo, my + slope * (lo - mx)], [hi, my + slope * (hi - mx)]], lineStyle: { type: "dashed" } });
    }
    return {
      ...base,
      grid,
      tooltip: { trigger: "item", formatter: (p: { value: unknown[] }) => `${p.value[3] ?? ""} (${fmt(p.value[0])}, ${fmt(p.value[1])})` },
      xAxis: { type: "value", ...axisCommon, name: spec.xTitle || data.series[0]?.name, nameLocation: "middle", nameGap: 30, scale: true },
      yAxis: { ...valueAxis, name: spec.yTitle || data.series[1]?.name, scale: true },
      series,
    };
  }
  if (t === "radar") {
    const max = Math.max(1, ...data.series.flatMap((s) => s.values.map((v) => v ?? 0)));
    return {
      ...base,
      tooltip: { trigger: "item" },
      radar: {
        indicator: data.categories.map((c) => ({ name: c, max: spec.yMax ?? Math.ceil(max * 1.1) })),
        center: ["50%", "56%"],
        radius: "62%",
        axisName: { color: look.muted },
        splitLine: { lineStyle: { color: look.line } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: look.line } },
      },
      series: [{ type: "radar", data: data.series.map((s) => ({ name: s.name, value: s.values.map((v) => v ?? 0), areaStyle: { opacity: 0.18 } })) }],
    };
  }
  if (t === "heatmap") {
    const cells = data.series.flatMap((s, si) => data.categories.map((_, ci) => [ci, si, s.values[ci] ?? "-"]));
    const vals = data.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
    return {
      ...base,
      tooltip: { trigger: "item", formatter: (p: { value: [number, number, number] }) => `${data.series[p.value[1]]?.name}, ${data.categories[p.value[0]]}: ${fmt(p.value[2])}` },
      grid: { ...grid, bottom: 52 },
      xAxis: { ...categoryAxis, splitArea: { show: true } },
      yAxis: { type: "category", data: data.series.map((s) => s.name), ...axisCommon, splitArea: { show: true } },
      visualMap: {
        min: Math.min(0, ...vals),
        max: Math.max(1, ...vals),
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 4,
        inRange: { color: [look.dark ? "#1f2330" : "#f4f6fb", colors[0]] },
        textStyle: { color: look.muted },
      },
      series: [{ type: "heatmap", data: cells, label: { show: spec.labels, color: look.ink, formatter: (p: { value: number[] }) => fmt(p.value[2]) } }],
    };
  }
  if (t === "funnel") {
    const s = data.series[0];
    return {
      ...base,
      tooltip: { trigger: "item", valueFormatter: fmt },
      series: [
        {
          type: "funnel",
          top: spec.title ? 70 : 30,
          bottom: 20,
          left: "12%",
          width: "76%",
          sort: "descending",
          gap: 3,
          label: { show: true, position: "inside", color: "#fff", formatter: spec.labels ? (p: { name: string; value: number }) => `${p.name}: ${fmt(p.value)}` : "{b}" },
          itemStyle: { borderWidth: 0 },
          data: data.categories.map((c, i) => ({ name: c, value: s?.values[i] ?? 0 })),
        },
      ],
    };
  }
  if (t === "gauge") {
    const v = data.series[0]?.values[0] ?? 0;
    const max = spec.yMax ?? (spec.format === "percent" ? 1 : Math.max(100, Math.ceil(v * 1.25)));
    return {
      ...base,
      tooltip: { show: false },
      series: [
        {
          type: "gauge",
          min: spec.yMin ?? 0,
          max,
          progress: { show: true, width: 14, itemStyle: { color: colors[0] } },
          axisLine: { lineStyle: { width: 14, color: [[1, look.line]] } },
          axisTick: { show: false },
          splitLine: { length: 8, lineStyle: { color: look.muted, width: 1 } },
          axisLabel: { color: look.muted, distance: 18, formatter: fmt },
          pointer: { width: 4, itemStyle: { color: colors[0] } },
          anchor: { show: true, size: 12, itemStyle: { color: colors[0] } },
          title: { color: look.muted, offsetCenter: [0, "72%"] },
          detail: { valueAnimation: true, formatter: fmt, color: look.ink, fontSize: 26, fontWeight: 600, offsetCenter: [0, "42%"] },
          data: [{ value: v, name: data.categories[0] || data.series[0]?.name || "" }],
        },
      ],
    };
  }
  if (t === "treemap") {
    const s = data.series[0];
    return {
      ...base,
      tooltip: { trigger: "item", valueFormatter: fmt },
      series: [
        {
          type: "treemap",
          top: spec.title ? 60 : 10,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: { show: true, formatter: spec.labels ? (p: { name: string; value: number }) => `${p.name}\n${fmt(p.value)}` : "{b}" },
          itemStyle: { borderColor: look.dark ? "#14161b" : "#fff", borderWidth: 2, gapWidth: 2 },
          data: data.categories.map((c, i) => ({ name: c, value: s?.values[i] ?? 0 })),
        },
      ],
    };
  }
  // candlestick: open, close, low, high per category.
  const ohlc = data.categories.map((_, i) => [0, 1, 2, 3].map((k) => data.series[k]?.values[i] ?? 0));
  return {
    ...base,
    grid,
    dataZoom: zoom,
    xAxis: categoryAxis,
    yAxis: { ...valueAxis, scale: true },
    series: [
      {
        type: "candlestick",
        data: ohlc,
        itemStyle: { color: colors[2], color0: colors[4], borderColor: colors[2], borderColor0: colors[4] },
      },
    ],
  };
}

// How many value columns each type wants, for the builder's hints.
export const typeNeeds: Partial<Record<ChartType, string>> = {
  scatter: "Two number columns: x, then y.",
  bubble: "Three number columns: x, y and size.",
  candlestick: "Four columns: open, close, low and high.",
  gauge: "One number (the first value).",
  waterfall: "One column of changes, positive or negative.",
  combo: "Two or more series: the first as columns, the rest as lines on a second axis.",
  heatmap: "A grid: categories across, series down.",
};
