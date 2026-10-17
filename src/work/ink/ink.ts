import { getStroke } from "perfect-freehand";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../../storage";

// Ink is stored as vector strokes in a 1000-unit-wide space, so it scales with
// the page. Points are [x, y, pressure]; colours are names so themes can tune
// them (exports use the hex values below).
export const INK_WIDTH = 1000;
export type InkTool = "pen" | "marker" | "highlighter";
export type InkStroke = { tool: InkTool; c: string; s: number; p: number[][] };
export type InkData = { h: number; strokes: InkStroke[] };

export const inkColors: Record<string, { light: string; dark: string }> = {
  ink: { light: "#1f2430", dark: "#e9e7ef" },
  blue: { light: "#2554c7", dark: "#7aa2ff" },
  red: { light: "#c63b32", dark: "#ff7b70" },
  green: { light: "#23804f", dark: "#5fd197" },
  violet: { light: "#6a4bc4", dark: "#b49cff" },
  orange: { light: "#c86a12", dark: "#ffb061" },
};
export const highlighterColors: Record<string, string> = {
  yellow: "#ffe14d",
  green: "#8ef0a7",
  pink: "#ff9fd0",
  blue: "#8fd3ff",
};
export const penSizes = { fine: 2.2, medium: 3.6, bold: 6 } as const;

export const emptyInk = (h = 320): InkData => ({ h, strokes: [] });

export function parseInk(text: string | null | undefined): InkData {
  if (!text) return emptyInk();
  try {
    const v = JSON.parse(text) as Partial<InkData>;
    const strokes = Array.isArray(v.strokes)
      ? v.strokes.filter(
          (s): s is InkStroke =>
            Boolean(s) &&
            Array.isArray(s.p) &&
            ["pen", "marker", "highlighter"].includes(s.tool) &&
            typeof s.c === "string" &&
            typeof s.s === "number",
        )
      : [];
    const h = Math.min(6000, Math.max(80, Number(v.h) || 320));
    return { h, strokes };
  } catch {
    return emptyInk();
  }
}
const round = (n: number) => Math.round(n * 10) / 10;
export function serializeInk(ink: InkData) {
  return JSON.stringify({
    h: Math.round(ink.h),
    strokes: ink.strokes.map((s) => ({ ...s, p: s.p.map(([x, y, pr]) => [round(x), round(y), Math.round((pr ?? 0.5) * 100) / 100]) })),
  });
}

// --- Drawing -----------------------------------------------------------------
function options(stroke: InkStroke, live = false) {
  const pressure = stroke.p.some((p) => p[2] !== undefined && p[2] !== 0.5);
  if (stroke.tool === "highlighter")
    return { size: stroke.s * 5, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, last: !live };
  if (stroke.tool === "marker")
    return { size: stroke.s * 1.8, thinning: 0.1, smoothing: 0.6, streamline: 0.45, simulatePressure: false, last: !live };
  return { size: stroke.s * 1.6, thinning: 0.6, smoothing: 0.55, streamline: 0.4, simulatePressure: !pressure, last: !live };
}
// An SVG path for a stroke's outline (perfect-freehand draws the shape).
export function strokePath(stroke: InkStroke, live = false) {
  const outline = getStroke(stroke.p, options(stroke, live));
  if (!outline.length) return "";
  const d = outline.reduce(
    (acc: (string | number)[], [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(round(x0), round(y0), round((x0 + x1) / 2), round((y0 + y1) / 2));
      return acc;
    },
    ["M", ...outline[0].map(round), "Q"],
  );
  d.push("Z");
  return d.join(" ");
}

export function inkColor(stroke: InkStroke, dark = false) {
  if (stroke.tool === "highlighter") return highlighterColors[stroke.c] || highlighterColors.yellow;
  const c = inkColors[stroke.c] || inkColors.ink;
  return dark ? c.dark : c.light;
}

// A standalone SVG for exports and copying.
export function inkToSvg(ink: InkData, title = "Handwriting") {
  const paths = [...ink.strokes]
    .sort((a, b) => Number(b.tool === "highlighter") - Number(a.tool === "highlighter"))
    .map((s) => {
      const d = strokePath(s);
      if (!d) return "";
      const op = s.tool === "highlighter" ? ' fill-opacity="0.45"' : "";
      return `<path d="${d}" fill="${inkColor(s)}"${op}/>`;
    })
    .join("");
  const safe = title.replace(/[<&>"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${INK_WIDTH} ${Math.round(ink.h)}" width="${INK_WIDTH}" height="${Math.round(ink.h)}" role="img" aria-label="${safe}"><title>${safe}</title>${paths}</svg>`;
}

// --- Erasing -----------------------------------------------------------------
// Strokes within `radius` of the point, for the eraser (whole strokes go).
export function strokesNear(ink: InkData, x: number, y: number, radius: number) {
  const out = new Set<number>();
  ink.strokes.forEach((s, i) => {
    const pad = radius + s.s * (s.tool === "highlighter" ? 2.5 : 1);
    for (let k = 0; k < s.p.length; k++) {
      const [px, py] = s.p[k];
      if ((px - x) ** 2 + (py - y) ** 2 <= pad * pad) {
        out.add(i);
        return;
      }
      const next = s.p[k + 1];
      if (next) {
        // Distance to the segment, so fast strokes with few points still hit.
        const [qx, qy] = next;
        const len = (qx - px) ** 2 + (qy - py) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - px) * (qx - px) + (y - py) * (qy - py)) / len));
        if ((px + t * (qx - px) - x) ** 2 + (py + t * (qy - py) - y) ** 2 <= pad * pad) {
          out.add(i);
          return;
        }
      }
    }
  });
  return out;
}

export function inkBounds(ink: InkData) {
  let bottom = 0;
  for (const s of ink.strokes) for (const [, y] of s.p) bottom = Math.max(bottom, y);
  return { bottom };
}

// --- Recognition (Windows handwriting recogniser, through the app) ---------------
export type RecognizedLine = { candidates: string[]; top: number; left: number; unsure?: boolean };
export const handwritingAvailable = () => desktop;
export async function recognizers(): Promise<string[]> {
  if (!desktop) return [];
  return invoke<string[]>("handwriting_recognizers").catch(() => []);
}
// Highlighter strokes are marks, not writing, so they are left out.
export async function recognize(ink: InkData, recognizer?: string): Promise<RecognizedLine[]> {
  const strokes = ink.strokes.filter((s) => s.tool !== "highlighter").map((s) => ({ p: s.p.map(([x, y, p]) => [x, y, p ?? 0.5]) }));
  if (!strokes.length) return [];
  const lines = await invoke<RecognizedLine[]>("recognize_handwriting", { strokes, recognizer: recognizer || null });
  // Reading order: lines top to bottom (within half a line), then left to right.
  return lines.sort((a, b) => (Math.abs(a.top - b.top) < 24 ? a.left - b.left : a.top - b.top));
}
export function linesText(lines: RecognizedLine[], choice: Record<number, number> = {}) {
  const rows: string[][] = [];
  let lastTop = -Infinity;
  lines.forEach((l, i) => {
    const word = l.candidates[choice[i] ?? 0] || "";
    if (Math.abs(l.top - lastTop) < 24 && rows.length) rows[rows.length - 1].push(word);
    else rows.push([word]);
    lastTop = l.top;
  });
  return rows.map((r) => r.join(" ")).join("\n");
}

// How close a written answer is to the expected one (0 to 1), ignoring case,
// accents and punctuation.
export function answerMatch(written: string, expected: string) {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const a = norm(written);
  const b = norm(expected);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[b.length] / Math.max(a.length, b.length);
}

// --- Origami's own handwriting model (TrOCR, downloaded on request) -------------
export const OWN_READER = "origami-trocr";
export const READER_KEY = "origami.inkRecognizer";
export function savedReader() {
  try {
    return localStorage.getItem(READER_KEY) || "";
  } catch {
    return "";
  }
}
export type HandwritingModelStatus = { id: string; name: string; installed: boolean; bundled?: boolean; bytes: number; downloading: boolean; runtime: boolean };
export const handwritingModelStatus = (): Promise<HandwritingModelStatus | null> =>
  desktop ? invoke<HandwritingModelStatus>("handwriting_model_status") : Promise.resolve(null);
export const downloadHandwritingModel = () => invoke<void>("download_handwriting_model");
export const cancelHandwritingDownload = () => invoke<void>("cancel_handwriting_download");
export const removeHandwritingModel = () => invoke<void>("remove_handwriting_model");
export async function onHandwritingDownload(fn: (e: { received?: number; total?: number; done?: boolean; ok?: boolean }) => void) {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<{ received?: number; total?: number; done?: boolean; ok?: boolean }>("handwriting-download", (e) => fn(e.payload));
}

// --- Photos of handwriting ------------------------------------------------------
// The photo is drawn small enough to read quickly (2000 px at most), turned
// into grey levels and read by Origami's model; a lighter copy (1400 px JPEG)
// goes into the note.
export async function readPhoto(file: Blob): Promise<{ image: string; lines: RecognizedLine[]; error?: string }> {
  const bitmap = await createImageBitmap(file);
  const draw = (max: number) => {
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * k));
    canvas.height = Math.max(1, Math.round(bitmap.height * k));
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { canvas, g };
  };
  const shown = draw(1400).canvas.toDataURL("image/jpeg", 0.82);
  const { canvas, g } = draw(2000);
  const rgba = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  let bin = "";
  for (let i = 0; i < gray.length; i += 0x8000) bin += String.fromCharCode(...gray.subarray(i, i + 0x8000));
  bitmap.close();
  try {
    const lines = await invoke<RecognizedLine[]>("read_handwriting_photo", { width: canvas.width, height: canvas.height, gray: btoa(bin) });
    return { image: shown, lines };
  } catch (e) {
    return { image: shown, lines: [], error: String(e) };
  }
}

// Read lines as note paragraphs; words the reader was unsure of are
// underlined in orange (wavy) so they are easy to check.
export function linesToHtml(lines: RecognizedLine[]) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const rows: RecognizedLine[][] = [];
  let lastTop = -Infinity;
  for (const l of lines) {
    if (Math.abs(l.top - lastTop) < 24 && rows.length) rows[rows.length - 1].push(l);
    else rows.push([l]);
    lastTop = l.top;
  }
  return rows
    .map((row) => `<p>${row.map((w) => (w.unsure ? `<u data-color="orange" data-style="wavy">${esc(w.candidates[0])}</u>` : esc(w.candidates[0]))).join(" ")}</p>`)
    .join("");
}
