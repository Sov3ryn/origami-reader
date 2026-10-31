import { useEffect, useRef, useState } from "react";
import type { CellValue } from "../sheets/model";
import { buildOption, type ChartSpec, type Look } from "./spec";

// ECharts is loaded the first time a chart is drawn.
type ECharts = typeof import("echarts");
let loading: Promise<ECharts> | null = null;
export const loadECharts = () => (loading ??= import("echarts"));

// Colours and font from the surrounding theme.
export function lookFrom(el: Element | null, locale?: string): Look {
  const css = el ? getComputedStyle(el) : null;
  const get = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  const panel = get("--panel", "#1d1b24");
  const rgb = panel.startsWith("rgb") ? panel.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) : null;
  const hex = /^#([0-9a-f]{6})$/i.exec(panel)?.[1];
  const [r, g, b] = rgb && rgb.length === 3 ? rgb : hex ? [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [30, 30, 36];
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  return {
    dark,
    font: "Inter, Segoe UI, system-ui, sans-serif",
    ink: get("--ink", dark ? "#e8e6ef" : "#1b2130"),
    muted: get("--muted", dark ? "#9a96a8" : "#687185"),
    line: dark ? "rgba(255,255,255,0.09)" : "rgba(16,24,40,0.1)",
    locale,
  };
}

// A chart as SVG text, without a screen, for exports.
export async function renderChartSvg(spec: ChartSpec, rows: CellValue[][], look: Look, width = 820, height = 460) {
  const echarts = await loadECharts();
  const chart = echarts.init(null as unknown as HTMLElement, undefined, { renderer: "svg", ssr: true, width, height });
  chart.setOption({ ...buildOption(spec, rows, look), animation: false });
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

export type ChartHandle ={ png: () => string | null; svg: () => Promise<string | null> };

export function ChartView({
  spec,
  rows,
  height = 340,
  locale,
  onReady,
}: {
  spec: ChartSpec;
  rows: CellValue[][];
  height?: number;
  locale?: string;
  onReady?: (handle: ChartHandle) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<import("echarts").ECharts | null>(null);
  const [error, setError] = useState("");
  // The current props, for the handle and the first draw, which are made once.
  const latest = useRef({ spec, rows, locale, height });
  latest.current = { spec, rows, locale, height };

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    void loadECharts().then((echarts) => {
      if (disposed || !box.current) return;
      chart.current = echarts.init(box.current, undefined, { renderer: "canvas" });
      observer = new ResizeObserver(() => chart.current?.resize());
      observer.observe(box.current);
      draw();
      onReady?.({
        png: () => chart.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: lookFrom(box.current).dark ? "#16181d" : "#ffffff" }) ?? null,
        svg: async () => {
          const { spec, rows, locale, height } = latest.current;
          const look = lookFrom(box.current, locale);
          const holder = document.createElement("div");
          const svgChart = echarts.init(holder, undefined, { renderer: "svg", ssr: true, width: box.current?.clientWidth || 720, height });
          svgChart.setOption({ ...buildOption(spec, rows, look), animation: false });
          const out = svgChart.renderToSVGString();
          svgChart.dispose();
          return out;
        },
      });
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    if (!chart.current) return;
    const { spec, rows, locale } = latest.current;
    try {
      chart.current.setOption(buildOption(spec, rows, lookFrom(box.current, locale)), true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(draw, [spec, rows, locale]);

  return (
    <div className="chart-view" style={{ height }}>
      <div ref={box} className="chart-canvas" />
      {error && <p className="chart-error">{error}</p>}
    </div>
  );
}
