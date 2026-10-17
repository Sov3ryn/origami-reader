// Excel files in and out (ExcelJS, MIT), loaded only when needed. Values,
// formulas with their last results, number formats, fonts, colours, fills,
// borders, alignment, wrapping, merged cells, column widths, row heights and
// frozen panes come across.
import { blankWorkbook, columnName, parseDelimited, readRange, sheetFromRows, toDelimited, usedRange, type Cell, type SheetData, type WorkbookData } from "./model";

type ExcelJS = typeof import("exceljs");
const load = (): Promise<ExcelJS> => import("exceljs").then((m) => ((m as unknown as { default?: ExcelJS }).default ?? m) as ExcelJS);

// Univer style codes.
const H = { left: 1, center: 2, right: 3, justify: 4 } as const;
const V = { top: 1, middle: 2, bottom: 3 } as const;
type Style = {
  bl?: number;
  it?: number;
  ul?: { s: number };
  st?: { s: number };
  fs?: number;
  ff?: string;
  cl?: { rgb: string };
  bg?: { rgb: string };
  ht?: number;
  vt?: number;
  tb?: number;
  n?: { pattern: string };
  bd?: Record<string, { s: number; cl: { rgb: string } }>;
};
const argb = (c?: { argb?: string }) => (c?.argb && /^[0-9A-F]{8}$/i.test(c.argb) ? "#" + c.argb.slice(2) : undefined);
const toArgb = (rgb?: string) => (rgb && /^#[0-9a-f]{6}$/i.test(rgb) ? "FF" + rgb.slice(1).toUpperCase() : undefined);
// Excel stores dates as days since 1899-12-30.
const serial = (d: Date) => (d.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;

export async function readXlsx(bytes: ArrayBuffer, name: string): Promise<WorkbookData> {
  const ExcelJS = await load();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const book = blankWorkbook(name);
  book.sheetOrder = [];
  book.sheets = {};
  wb.eachSheet((ws, index) => {
    const id = "s" + index + Math.random().toString(36).slice(2, 8);
    const sheet: SheetData = sheetFromRows(id, ws.name || `Sheet${index}`, []);
    const cells: Record<string, Record<string, Cell>> = {};
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const out: Cell = {};
        const v = cell.value as unknown;
        if (v instanceof Date) out.v = serial(v);
        else if (v && typeof v === "object") {
          const o = v as { formula?: string; sharedFormula?: string; result?: unknown; richText?: { text: string }[]; text?: string; hyperlink?: string; error?: string };
          if (o.formula) out.f = "=" + o.formula;
          if (o.formula || o.sharedFormula) {
            const res = o.result instanceof Date ? serial(o.result) : o.result;
            if (typeof res === "number" || typeof res === "string" || typeof res === "boolean") out.v = res;
            if (!o.formula && o.sharedFormula) out.v = out.v ?? null;
          } else if (o.richText) out.v = o.richText.map((x) => x.text).join("");
          else if (o.text !== undefined) out.v = o.text;
          else if (o.error) out.v = o.error;
        } else if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") out.v = v;
        const s: Style = {};
        const f = cell.font || {};
        if (f.bold) s.bl = 1;
        if (f.italic) s.it = 1;
        if (f.underline) s.ul = { s: 1 };
        if (f.strike) s.st = { s: 1 };
        if (f.size) s.fs = f.size;
        if (f.name) s.ff = f.name;
        const fc = argb(f.color as { argb?: string });
        if (fc) s.cl = { rgb: fc };
        const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
        const bg = fill?.type === "pattern" ? argb(fill.fgColor) : undefined;
        if (bg) s.bg = { rgb: bg };
        const a = cell.alignment || {};
        if (a.horizontal && a.horizontal in H) s.ht = H[a.horizontal as keyof typeof H];
        if (a.vertical && a.vertical in V) s.vt = V[a.vertical as keyof typeof V];
        if (a.wrapText) s.tb = 3;
        if (cell.numFmt && cell.numFmt !== "General") s.n = { pattern: cell.numFmt };
        else if (v instanceof Date) s.n = { pattern: "yyyy-mm-dd" };
        const b = cell.border || {};
        const sides: Record<string, string> = { top: "t", bottom: "b", left: "l", right: "r" };
        for (const [k, key] of Object.entries(sides)) {
          const side = (b as Record<string, { style?: string; color?: { argb?: string } }>)[k];
          if (side?.style) (s.bd ||= {})[key] = { s: side.style === "thick" ? 9 : side.style === "medium" ? 8 : 1, cl: { rgb: argb(side.color) || "#000000" } };
        }
        if (Object.keys(s).length) out.s = s;
        if (out.v !== undefined || out.f || out.s) (cells[r - 1] ||= {})[c - 1] = out;
      });
      if (row.height) (sheet.rowData ||= {})[r - 1] = { h: Math.round(row.height * 1.333) };
    });
    sheet.cellData = cells;
    const used = usedRange(sheet);
    sheet.rowCount = Math.max(1000, (used?.r2 ?? 0) + 100);
    sheet.columnCount = Math.max(26, (used?.c2 ?? 0) + 6);
    ws.columns?.forEach((col, i) => {
      if (col?.width) (sheet.columnData ||= {})[i] = { w: Math.round(col.width * 7 + 5) };
    });
    const merges = (ws.model as { merges?: string[] }).merges || [];
    sheet.mergeData = merges
      .map((m) => /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => ({
        startRow: +m[2] - 1,
        endRow: +m[4] - 1,
        startColumn: colIndex(m[1]),
        endColumn: colIndex(m[3]),
      }));
    const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined;
    if (view?.state === "frozen" && (view.xSplit || view.ySplit))
      sheet.freeze = { xSplit: view.xSplit || 0, ySplit: view.ySplit || 0, startRow: view.ySplit || 0, startColumn: view.xSplit || 0 };
    book.sheetOrder.push(id);
    book.sheets[id] = sheet;
  });
  if (!book.sheetOrder.length) return blankWorkbook(name);
  return book;
}
const colIndex = (name: string) => {
  let n = 0;
  for (const ch of name) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function writeXlsx(book: WorkbookData): Promise<Uint8Array> {
  const ExcelJS = await load();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Origami";
  const styleOf = (s: Cell["s"]): Style => (typeof s === "string" ? ((book.styles?.[s] as Style) ?? {}) : ((s as Style) ?? {}));
  const hName = ["", "left", "center", "right", "justify"] as const;
  const vName = ["", "top", "middle", "bottom"] as const;
  for (const id of book.sheetOrder) {
    const sheet = book.sheets[id];
    if (!sheet) continue;
    const ws = wb.addWorksheet(sheet.name.slice(0, 31) || "Sheet");
    for (const [r, row] of Object.entries(sheet.cellData || {}))
      for (const [c, cell] of Object.entries(row)) {
        if (!cell) continue;
        const x = ws.getCell(+r + 1, +c + 1);
        if (cell.f) x.value = { formula: cell.f.replace(/^=/, ""), result: (cell.v ?? undefined) as never } as never;
        else if (cell.v !== undefined && cell.v !== null) x.value = cell.v as never;
        const s = styleOf(cell.s);
        const font: Record<string, unknown> = {};
        if (s.bl) font.bold = true;
        if (s.it) font.italic = true;
        if (s.ul?.s) font.underline = true;
        if (s.st?.s) font.strike = true;
        if (s.fs) font.size = s.fs;
        if (s.ff) font.name = s.ff;
        if (toArgb(s.cl?.rgb)) font.color = { argb: toArgb(s.cl?.rgb) };
        if (Object.keys(font).length) x.font = font as never;
        if (toArgb(s.bg?.rgb)) x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toArgb(s.bg?.rgb)! } };
        if (s.ht || s.vt || s.tb === 3)
          x.alignment = {
            horizontal: s.ht ? (hName[s.ht] as never) : undefined,
            vertical: s.vt ? (vName[s.vt] as never) : undefined,
            wrapText: s.tb === 3 || undefined,
          };
        if (s.n?.pattern) x.numFmt = s.n.pattern;
        if (s.bd) {
          const side = (k: string) =>
            s.bd?.[k] ? { style: (s.bd[k].s >= 9 ? "thick" : s.bd[k].s >= 8 ? "medium" : "thin") as never, color: { argb: toArgb(s.bd[k].cl?.rgb) || "FF000000" } } : undefined;
          x.border = { top: side("t"), bottom: side("b"), left: side("l"), right: side("r") };
        }
      }
    for (const [c, col] of Object.entries(sheet.columnData || {})) if (col?.w) ws.getColumn(+c + 1).width = Math.max(2, (col.w - 5) / 7);
    for (const [r, row] of Object.entries(sheet.rowData || {})) if (row?.h) ws.getRow(+r + 1).height = row.h / 1.333;
    for (const m of sheet.mergeData || [])
      ws.mergeCells(`${columnName(m.startColumn)}${m.startRow + 1}:${columnName(m.endColumn)}${m.endRow + 1}`);
    if (sheet.freeze && (sheet.freeze.xSplit || sheet.freeze.ySplit))
      ws.views = [{ state: "frozen", xSplit: sheet.freeze.xSplit, ySplit: sheet.freeze.ySplit }];
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// CSV: the first sheet's used area.
export function readCsv(text: string, name: string): WorkbookData {
  return blankWorkbook(name, name.slice(0, 31) || "Sheet1", parseDelimited(text.replace(/^﻿/, "")));
}
export function writeCsv(book: WorkbookData): string {
  const sheet = book.sheets[book.sheetOrder[0]];
  const used = sheet ? usedRange(sheet) : null;
  return used ? toDelimited(readRange(book, used)) : "";
}
