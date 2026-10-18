import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../storage";
import { bookUnits } from "../usePlayer";
import type { Book, Preferences } from "../types";

// A Studio production: a snapshot of one book's manuscript cut into render
// units (one to three sentences), each with its takes. Stored by the desktop
// app in its own folder (src-tauri/src/studio.rs).

export type ProductionInfo = {
  id: string;
  title: string;
  author: string;
  bookId: string;
  language: string;
  // The narrator's voice for every unit in a single-narrator production.
  voice: string;
  created: number;
  updated: number;
  sourceHash: string;
  // Filled in by the list: how many units exist and how many have audio.
  units?: number;
  rendered?: number;
};

export type UnitStatus = "pending" | "rendered" | "approved" | "failed";
export type ProductionUnit = {
  id: string;
  chapter: number;
  // Paragraph index in the snapshot, and its stable id in the book.
  paragraph: number;
  paragraphId: string;
  heading: boolean;
  // What is spoken, after pronunciations and skip rules.
  text: string;
  status: UnitStatus;
  take?: string;
};

export type Take = {
  id: string;
  unit: string;
  file: string;
  duration: number;
  seed: number;
  model: string;
  voice: string;
  text: string;
  created: number;
};

export type Production = { info: ProductionInfo; units: ProductionUnit[]; takes: Take[] };

const TITLE_END = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|Mme|Mlle|Mgr|M|Messrs|Capt|Col|Gen|Rev|Prof)\.$/;

/** Render units for a whole book, in reading order, with ids that stay stable. */
export function productionUnits(book: Book, prefs: Preferences): ProductionUnit[] {
  const counts = new Map<number, number>();
  // The sentence splitter breaks after titles ("Mr." | "Bennet, said..."); a
  // unit must never end on one, or the narrator pauses in mid-sentence.
  const raw = bookUnits(book, 0, prefs);
  const joined: typeof raw = [];
  for (const u of raw) {
    const last = joined.at(-1);
    if (last && last.paragraph === u.paragraph && TITLE_END.test(last.text)) last.text += " " + u.text;
    else joined.push({ ...u });
  }
  return joined.map((u) => {
    const p = book.paragraphs[u.paragraph];
    const n = counts.get(u.paragraph) ?? 0;
    counts.set(u.paragraph, n + 1);
    return {
      id: `p${u.paragraph}-u${n}`,
      chapter: p?.chapter ?? 0,
      paragraph: u.paragraph,
      paragraphId: p?.id ?? "",
      heading: Boolean(u.heading),
      text: u.text,
      status: "pending",
    };
  });
}

/** Chapter titles from the first heading in each chapter, or a number. */
export function chapterTitles(book: Book) {
  const titles = new Map<number, string>();
  for (const p of book.paragraphs) {
    if (!titles.has(p.chapter) && p.kind === "heading") titles.set(p.chapter, p.text.trim().slice(0, 80));
  }
  return titles;
}

export function newProductionId(now = Date.now()) {
  return `prod-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newProduction(book: Book, prefs: Preferences, voice: string, now = Date.now()): Production {
  const info: ProductionInfo = {
    id: newProductionId(now),
    title: book.meta.title,
    author: book.meta.author,
    bookId: book.meta.id,
    language: book.meta.language || "",
    voice,
    created: now,
    updated: now,
    sourceHash: book.meta.sourceHash,
  };
  return { info, units: productionUnits(book, prefs), takes: [] };
}

/** Share of units with audio, from 0 to 1. */
export function progress(p: Pick<ProductionInfo, "units" | "rendered">) {
  return p.units ? Math.min(1, (p.rendered || 0) / p.units) : 0;
}

// --- Desktop storage ---------------------------------------------------------------------
export const listProductions = (): Promise<ProductionInfo[]> => (desktop ? invoke("list_productions") : Promise.resolve([]));
export const createProduction = (p: Production) => invoke<ProductionInfo>("create_production", { info: p.info, units: p.units });
export const readProduction = (id: string) => invoke<Production>("read_production", { id });
export const saveProductionInfo = (info: ProductionInfo) => invoke<void>("save_production_info", { info });
export const saveProductionUnits = (id: string, units: ProductionUnit[]) => invoke<void>("save_production_units", { id, units });
export const deleteProduction = (id: string) => invoke<void>("delete_production", { id });

// --- Rendering ---------------------------------------------------------------------------
export const startRender = (id: string, chapter?: number) => invoke<void>("studio_render", { id, chapter: chapter ?? null });
export const cancelRender = () => invoke<void>("studio_cancel_render");
export const renderRunning = (): Promise<boolean> => (desktop ? invoke("studio_render_running") : Promise.resolve(false));
export const takeAudio = (id: string, file: string) => invoke<string>("studio_take_audio", { id, file });
export type RenderProgress = { id: string; done: number; total: number };
export type RenderDone = { id: string; ok: boolean; cancelled?: boolean; message?: string };
