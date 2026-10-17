import { describe, expect, it } from "vitest";
import {
  blankWorkbook,
  columnIndex,
  columnName,
  parseCell,
  parseDelimited,
  parseRange,
  rangeText,
  readRange,
  tablesFromHtml,
  toDelimited,
  usedRange,
  findSheet,
} from "../src/work/sheets/model";
import { readXlsx, writeXlsx } from "../src/work/sheets/excel";
import { buildOption, chartTypes, defaultSpec, linearTrend, toDataset } from "../src/work/charts/spec";
import { exportFiles } from "../src/work/transfer";
import type { WorkData } from "../src/work/types";

const look = { dark: false, font: "Inter", ink: "#111", muted: "#666", line: "#ddd", locale: "en" };
const rows = [
  ["", "2024", "2025"],
  ["Q1", 120, 140],
  ["Q2", 150, 180],
  ["Q3", 135, 210],
] as (string | number)[][];

describe("sheet references", () => {
  it("names columns and reads A1 ranges with sheet names", () => {
    expect([columnName(0), columnName(25), columnName(26), columnName(701)]).toEqual(["A", "Z", "AA", "ZZ"]);
    expect(columnIndex("AA")).toBe(26);
    expect(parseRange("'My data'!B2:D10")).toEqual({ sheet: "My data", r1: 1, c1: 1, r2: 9, c2: 3 });
    expect(parseRange("$C$5")).toMatchObject({ r1: 4, c1: 2, r2: 4, c2: 2 });
    expect(parseRange("D4:A1")).toMatchObject({ r1: 0, c1: 0, r2: 3, c2: 3 });
    expect(parseRange("nonsense")).toBeNull();
    expect(rangeText({ sheet: "My data", r1: 0, c1: 0, r2: 2, c2: 1 })).toBe("'My data'!A1:B3");
  });
  it("reads values back from a workbook, dropping empty trailing rows", () => {
    const book = blankWorkbook("Sales", "Data", [...rows, ["Total", "=SUM(B2:B4)", null]]);
    const sheet = findSheet(book, "Data")!;
    expect(usedRange(sheet)).toEqual({ sheet: "Data", r1: 0, c1: 0, r2: 4, c2: 2 });
    expect(readRange(book, parseRange("Data!A1:C40")!)).toHaveLength(5);
    expect(sheet.cellData![4][1]).toEqual({ f: "=SUM(B2:B4)" });
  });
  it("parses numbers in English and French styles", () => {
    expect([parseCell("1 234,5"), parseCell("1,234.5"), parseCell("12%"), parseCell("€4"), parseCell("Q1"), parseCell("")]).toEqual([
      1234.5,
      1234.5,
      0.12,
      4,
      "Q1",
      null,
    ]);
  });
  it("reads and writes CSV with quotes and semicolons", () => {
    const back = parseDelimited(toDelimited([["a, b", 'say "hi"', 3]]));
    expect(back).toEqual([["a, b", 'say "hi"', 3]]);
    expect(parseDelimited("x;y\n1;2\n")).toEqual([
      ["x", "y"],
      [1, 2],
    ]);
  });
  it("finds tables in note HTML", () => {
    const html = "<table><tbody><tr><th><p>Day</p></th><th><p>Hours</p></th></tr><tr><td><p>Mon</p></td><td><p>2,5</p></td></tr></tbody></table>";
    expect(tablesFromHtml(html)).toEqual([
      [
        ["Day", "Hours"],
        ["Mon", 2.5],
      ],
    ]);
  });
});

describe("Excel files", () => {
  it("keep values, formulas, styles, merges and frozen panes through a round trip", async () => {
    const book = blankWorkbook("Budget", "Budget", rows);
    const sheet = findSheet(book)!;
    sheet.cellData![0][1].s = { bl: 1, bg: { rgb: "#FFEE00" }, ht: 2 };
    sheet.cellData![4] = { 1: { f: "=SUM(B2:B4)", v: 405 } };
    sheet.mergeData = [{ startRow: 6, endRow: 6, startColumn: 0, endColumn: 2 }];
    sheet.freeze = { xSplit: 1, ySplit: 1, startRow: 1, startColumn: 1 };
    sheet.columnData = { 0: { w: 152 } };
    const bytes = await writeXlsx(book);
    const back = await readXlsx(bytes.buffer as ArrayBuffer, "Budget");
    const s = findSheet(back, "Budget")!;
    expect(s.cellData![1][0].v).toBe("Q1");
    expect(s.cellData![1][1].v).toBe(120);
    expect(s.cellData![4][1]).toMatchObject({ f: "=SUM(B2:B4)", v: 405 });
    expect(s.cellData![0][1].s).toMatchObject({ bl: 1, bg: { rgb: "#FFEE00" }, ht: 2 });
    expect(s.mergeData).toEqual([{ startRow: 6, endRow: 6, startColumn: 0, endColumn: 2 }]);
    expect(s.freeze).toMatchObject({ xSplit: 1, ySplit: 1 });
    expect(s.columnData![0].w).toBeGreaterThan(140);
  }, 20000); // ExcelJS loads slowly when many test files run at once.
});

describe("charts", () => {
  it("turns rows into categories and series, in columns or rows, and sorts", () => {
    const d = toDataset(rows, { headers: true, seriesIn: "columns" });
    expect(d.categories).toEqual(["Q1", "Q2", "Q3"]);
    expect(d.series.map((s) => s.name)).toEqual(["2024", "2025"]);
    const r = toDataset(rows, { headers: true, seriesIn: "rows" });
    expect(r.series.map((s) => s.name)).toEqual(["Q1", "Q2", "Q3"]);
    expect(toDataset(rows, { headers: true, seriesIn: "columns", sort: "desc" }).categories).toEqual(["Q2", "Q3", "Q1"]);
  });
  it("fits a straight trend line", () => {
    expect(linearTrend([1, 2, 3, null, 5])).toEqual([1, 2, 3, 4, 5]);
  });
  it("builds a valid option for every chart type", () => {
    const wide = [
      ["", "Open", "Close", "Low", "High"],
      ["Mon", 10, 12, 9, 13],
      ["Tue", 12, 11, 10, 14],
      ["Wed", 11, 15, 10, 16],
    ];
    for (const type of chartTypes) {
      const spec = defaultSpec({ source: { kind: "data", rows: wide }, type, title: "T", labels: true, trend: true, zoom: true });
      const option = buildOption(spec, wide, look);
      expect(Array.isArray(option.series) && option.series.length > 0, type).toBe(true);
      expect(() => JSON.stringify(option), type).not.toThrow();
    }
    const percent = buildOption(defaultSpec({ source: { kind: "data", rows }, type: "percent-column" }), rows, look);
    expect(percent.series[0].data[0] + percent.series[1].data[0]).toBeCloseTo(1);
  });
  it("exports charts as images beside notes, and sheets as Excel files", () => {
    const chart = defaultSpec({ source: { kind: "data", rows }, title: "Sales" });
    const data: WorkData = {
      subjects: [],
      notes: [{ id: "n", kind: "note", title: "Report", html: `<p>Hi</p><div data-chart="${chart.id}" class="chart-block"></div>`, created: 1, updated: 1 }],
      cards: [],
      batches: [],
      hidden: [],
      vectors: [],
      logs: [],
      meta: [],
      sheets: [{ id: "s", kind: "sheet", title: "Budget", data: blankWorkbook("Budget"), created: 1, updated: 1 }],
      charts: [chart],
    };
    const files = Object.fromEntries(exportFiles(data, true, { chartSvgs: new Map([[chart.id, "<svg/>"]]), sheetFiles: new Map([["s", "AAAA"]]) }));
    const svg = Object.keys(files).find((f) => f.startsWith("Charts/"))!;
    expect(files[svg]).toBe("<svg/>");
    expect(files["Report.html"]).toContain(`<img src="${svg}"`);
    expect(files["Report.md"]).toContain(`![Sales](${svg})`);
    expect(files["Budget.xlsx"]).toBe("base64:AAAA");
  });
});
