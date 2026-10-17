// The spreadsheet editor: Univer (Apache-2.0) with its open-source sheet
// features. This module and its styles load only when a sheet is opened.
import { useEffect, useRef } from "react";
import { createUniver, LocaleType, mergeLocales, CommandType, type FUniver } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import { UniverSheetsConditionalFormattingPreset } from "@univerjs/preset-sheets-conditional-formatting";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import { UniverSheetsHyperLinkPreset } from "@univerjs/preset-sheets-hyper-link";
import { UniverSheetsNotePreset } from "@univerjs/preset-sheets-note";
import { UniverSheetsTablePreset } from "@univerjs/preset-sheets-table";
import { UniverSheetsDrawingPreset } from "@univerjs/preset-sheets-drawing";
import coreEn from "@univerjs/preset-sheets-core/locales/en-US";
import coreFr from "@univerjs/preset-sheets-core/locales/fr-FR";
import sortEn from "@univerjs/preset-sheets-sort/locales/en-US";
import sortFr from "@univerjs/preset-sheets-sort/locales/fr-FR";
import filterEn from "@univerjs/preset-sheets-filter/locales/en-US";
import filterFr from "@univerjs/preset-sheets-filter/locales/fr-FR";
import cfEn from "@univerjs/preset-sheets-conditional-formatting/locales/en-US";
import cfFr from "@univerjs/preset-sheets-conditional-formatting/locales/fr-FR";
import dvEn from "@univerjs/preset-sheets-data-validation/locales/en-US";
import dvFr from "@univerjs/preset-sheets-data-validation/locales/fr-FR";
import findEn from "@univerjs/preset-sheets-find-replace/locales/en-US";
import findFr from "@univerjs/preset-sheets-find-replace/locales/fr-FR";
import linkEn from "@univerjs/preset-sheets-hyper-link/locales/en-US";
import linkFr from "@univerjs/preset-sheets-hyper-link/locales/fr-FR";
import noteEn from "@univerjs/preset-sheets-note/locales/en-US";
import noteFr from "@univerjs/preset-sheets-note/locales/fr-FR";
import tableEn from "@univerjs/preset-sheets-table/locales/en-US";
import tableFr from "@univerjs/preset-sheets-table/locales/fr-FR";
import drawEn from "@univerjs/preset-sheets-drawing/locales/en-US";
import drawFr from "@univerjs/preset-sheets-drawing/locales/fr-FR";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import "@univerjs/preset-sheets-hyper-link/lib/index.css";
import "@univerjs/preset-sheets-note/lib/index.css";
import "@univerjs/preset-sheets-table/lib/index.css";
import "@univerjs/preset-sheets-drawing/lib/index.css";
import type { WorkbookData } from "./model";

export type SheetApi = {
  // The selected range, like "Sheet1!A1:D12", for charts.
  selection: () => string | null;
  // The workbook now, with formulas calculated.
  snapshot: () => WorkbookData | null;
};

export default function SheetEditor({
  data,
  dark,
  french,
  onChange,
  onReady,
}: {
  data: WorkbookData;
  dark: boolean;
  french: boolean;
  onChange: (data: WorkbookData) => void;
  onReady?: (api: SheetApi | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<FUniver | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    // Each mount draws into its own box, so a closing workbook never clears
    // the next one (React may mount twice in development).
    const box = document.createElement("div");
    box.className = "sheet-univer";
    host.current.appendChild(box);
    const locale = french ? LocaleType.FR_FR : LocaleType.EN_US;
    const { univer, univerAPI } = createUniver({
      locale,
      darkMode: dark,
      locales: {
        [locale]: french
          ? mergeLocales(coreFr, sortFr, filterFr, cfFr, dvFr, findFr, linkFr, noteFr, tableFr, drawFr)
          : mergeLocales(coreEn, sortEn, filterEn, cfEn, dvEn, findEn, linkEn, noteEn, tableEn, drawEn),
      },
      presets: [
        UniverSheetsCorePreset({ container: box, header: true, toolbar: true, footer: {} }),
        UniverSheetsSortPreset(),
        UniverSheetsFilterPreset(),
        UniverSheetsConditionalFormattingPreset(),
        UniverSheetsDataValidationPreset(),
        UniverSheetsFindReplacePreset(),
        UniverSheetsHyperLinkPreset(),
        UniverSheetsNotePreset(),
        UniverSheetsTablePreset(),
        UniverSheetsDrawingPreset(),
      ],
    });
    api.current = univerAPI;
    const workbook = univerAPI.createWorkbook(structuredClone(data) as never);
    let timer: number | undefined;
    const save = () => {
      window.clearTimeout(timer);
      timer = undefined;
      try {
        latest.current(workbook.save() as unknown as WorkbookData);
      } catch {
        // The workbook is closing.
      }
    };
    // Every change to the data saves, a moment later.
    const listener = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (e) => {
      if (e.type !== CommandType.MUTATION) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 700);
    });
    onReady?.({
      selection: () => {
        const r = workbook.getActiveRange();
        if (!r) return null;
        const name = workbook.getActiveSheet().getSheetName();
        return `${/[^A-Za-z0-9_]/.test(name) ? `'${name}'` : name}!${r.getA1Notation()}`;
      },
      snapshot: () => workbook.save() as unknown as WorkbookData,
    });
    return () => {
      if (timer) save();
      listener.dispose();
      onReady?.(null);
      api.current = null;
      // Disposing during React's commit can warn; let it finish first.
      setTimeout(() => {
        univer.dispose();
        box.remove();
      });
    };
    // A new sheet remounts this component (keyed by id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.toggleDarkMode(dark);
  }, [dark]);

  return <div ref={host} className="sheet-host" />;
}
