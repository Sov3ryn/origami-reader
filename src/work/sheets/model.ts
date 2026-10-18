// Spreadsheets in Work Mode. A sheet stores Univer's workbook snapshot
// (IWorkbookData) as plain JSON; these helpers read it without loading Univer,
// so charts, search and Related work on any sheet.

export type CellValue = string | number | boolean | null;
export type Cell = { v?: CellValue; f?: string; s?: string | object | null; t?: number };
export type SheetData = {
  id: string;
  name: string;
  rowCount?: number;
  columnCount?: number;
  cellData?: Record<string, Record<string, Cell>>;
  mergeData?: { startRow: number; endRow: number; startColumn: number; endColumn: number }[];
  freeze?: { xSplit: number; ySplit: number; startRow: number; startColumn: number };
  columnData?: Record<string, { w?: number; hd?: number }>;
  rowData?: Record<string, { h?: number; hd?: number }>;
  [key: string]: unknown;
};
export type WorkbookData = {
  id: string;
  name: string;
  appVersion?: string;
  locale?: string;
  styles?: Record<string, object>;
  sheetOrder: string[];
  sheets: Record<string, SheetData>;
  [key: string]: unknown;
};
export type SheetDoc = {
  id: string;
  kind: "sheet";
  title: string;
  data: WorkbookData;
  subjectId?: string;
  icon?: string;
  pinned?: boolean;
  created: number;
  updated: number;
  vault?: string;
};

const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export function blankWorkbook(name: string, sheetName = "Sheet1", rows: CellValue[][] = []): WorkbookData {
  const sid = "s" + uid();
  return {
    id: "w" + uid(),
    name,
    appVersion: "1.0.4",
    locale: "enUS",
    styles: {},
    sheetOrder: [sid],
    sheets: { [sid]: sheetFromRows(sid, sheetName, rows) },
  };
}
export function sheetFromRows(id: string, name: string, rows: CellValue[][]): SheetData {
  const cellData: SheetData["cellData"] = {};
  rows.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === null || v === "") return;
      (cellData[r] ||= {})[c] = typeof v === "string" && v.startsWith("=") ? { f: v } : { v };
    }),
  );
  return {
    id,
    name,
    rowCount: Math.max(1000, rows.length + 100),
    columnCount: Math.max(26, ...rows.map((r) => r.length + 5)),
    cellData,
  };
}

// --- A1 references ---------------------------------------------------------------
export function columnName(index: number) {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function columnIndex(name: string) {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export type Range = { sheet?: string; r1: number; c1: number; r2: number; c2: number };
export function parseRange(text: string): Range | null {
  const m = /^\s*(?:(?:'([^']+)'|([^!]+))!)?\$?([A-Za-z]{1,3})\$?(\d{1,7})(?::\$?([A-Za-z]{1,3})\$?(\d{1,7}))?\s*$/.exec(text);
  if (!m) return null;
  const c1 = columnIndex(m[3]);
  const r1 = +m[4] - 1;
  const c2 = m[5] ? columnIndex(m[5]) : c1;
  const r2 = m[6] ? +m[6] - 1 : r1;
  return {
    sheet: m[1] ?? m[2]?.trim(),
    r1: Math.min(r1, r2),
    c1: Math.min(c1, c2),
    r2: Math.max(r1, r2),
    c2: Math.max(c1, c2),
  };
}
export function rangeText(r: Range) {
  const a = `${columnName(r.c1)}${r.r1 + 1}`;
  const b = `${columnName(r.c2)}${r.r2 + 1}`;
  const body = a === b ? a : `${a}:${b}`;
  return r.sheet ? `${/[^A-Za-z0-9_]/.test(r.sheet) ? `'${r.sheet}'` : r.sheet}!${body}` : body;
}

export function findSheet(book: WorkbookData, name?: string): SheetData | undefined {
  const list = book.sheetOrder.map((id) => book.sheets[id]).filter(Boolean);
  if (!name) return list[0];
  return list.find((s) => s.name === name || s.id === name) || undefined;
}
// The used area of a sheet, as a range.
export function usedRange(sheet: SheetData): Range | null {
  let r2 = -1;
  let c2 = -1;
  for (const [r, row] of Object.entries(sheet.cellData || {}))
    for (const [c, cell] of Object.entries(row))
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") {
        r2 = Math.max(r2, +r);
        c2 = Math.max(c2, +c);
      }
  return r2 < 0 ? null : { sheet: sheet.name, r1: 0, c1: 0, r2, c2 };
}
export function readRange(book: WorkbookData, range: Range): CellValue[][] {
  const sheet = findSheet(book, range.sheet);
  if (!sheet) return [];
  const rows: CellValue[][] = [];
  const r2 = Math.min(range.r2, range.r1 + 5000);
  const c2 = Math.min(range.c2, range.c1 + 200);
  for (let r = range.r1; r <= r2; r++) {
    const row: CellValue[] = [];
    for (let c = range.c1; c <= c2; c++) {
      const v = sheet.cellData?.[r]?.[c]?.v;
      row.push(v === undefined ? null : v);
    }
    rows.push(row);
  }
  // Trailing empty rows are dropped, so A1:D1000 charts only the filled part.
  while (rows.length && rows[rows.length - 1].every((v) => v === null || v === "")) rows.pop();
  return rows;
}

// Text of a workbook for search and Related: sheet names and filled cells.
export function workbookText(book: WorkbookData, limit = 4000) {
  const parts: string[] = [];
  let size = 0;
  for (const id of book.sheetOrder) {
    const s = book.sheets[id];
    if (!s) continue;
    parts.push(s.name);
    for (const row of Object.values(s.cellData || {}))
      for (const cell of Object.values(row)) {
        if (typeof cell?.v === "string" && cell.v.trim()) {
          parts.push(cell.v);
          size += cell.v.length;
          if (size > limit) return parts.join(" ");
        }
      }
  }
  return parts.join(" ");
}

/** The top-left corner of a workbook's first sheet that holds values, for a tile preview. */
export function sheetCorner(book: WorkbookData, rows = 4, cols = 4): string[][] {
  const s = book.sheets[book.sheetOrder[0]];
  const data = s?.cellData || {};
  const filled = Object.entries(data).flatMap(([r, row]) =>
    Object.entries(row || {})
      .filter(([, c]) => c?.v !== undefined && c?.v !== null && String(c.v).trim() !== "")
      .map(([col]) => [Number(r), Number(col)] as const),
  );
  if (!filled.length) return [];
  const top = Math.min(...filled.map((x) => x[0]));
  const left = Math.min(...filled.map((x) => x[1]));
  const show = (v: CellValue | undefined) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : v === undefined || v === null ? "" : String(v));
  // Only as wide and tall as the values reach.
  const width = Math.min(cols, Math.max(...filled.map((x) => x[1])) - left + 1);
  const height = Math.min(rows, Math.max(...filled.map((x) => x[0])) - top + 1);
  return Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => show(data[top + i]?.[left + j]?.v)));
}

// Rows of a table written in a note (the editor's HTML), for charts.
export function tablesFromHtml(html: string): CellValue[][][] {
  const tables: CellValue[][][] = [];
  for (const t of html.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
    const rows: CellValue[][] = [];
    for (const tr of t[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      const row: CellValue[] = [];
      for (const td of tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)) row.push(parseCell(td[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()));
      rows.push(row);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}
// "1 234,5", "12%", "$3.50" and "€4" become numbers; other text stays text.
export function parseCell(text: string): CellValue {
  const t = text.trim();
  if (!t) return null;
  const m = /^([-+]?)[$€£¥]?\s?([\d\s.,]+)\s?(%|[$€£¥])?$/.exec(t.replace(/ /g, " "));
  if (m) {
    let num = m[2].replace(/\s/g, "");
    // A comma followed by one or two digits at the end is a decimal comma.
    if (/,\d{1,2}$/.test(num) && !/\.\d/.test(num)) num = num.replace(/\./g, "").replace(",", ".");
    else num = num.replace(/,/g, "");
    const n = Number(m[1] + num);
    if (Number.isFinite(n)) return m[3] === "%" ? n / 100 : n;
  }
  return t;
}

// CSV and TSV, with quotes, for import and export.
export function parseDelimited(text: string, delimiter?: string): CellValue[][] {
  const sep = delimiter ?? (text.split("\n")[0].split("\t").length > text.split("\n")[0].split(",").length ? "\t" : text.split("\n")[0].split(";").length > text.split("\n")[0].split(",").length ? ";" : ",");
  const rows: CellValue[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && !field) quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row.map((f) => (/^=/.test(f) ? f : parseCell(f))));
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row.map((f) => (/^=/.test(f) ? f : parseCell(f))));
  }
  return rows;
}
export function toDelimited(rows: CellValue[][], sep = ",") {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null ? "" : String(v);
          return /[",\n\r;\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(sep),
    )
    .join("\r\n");
}
