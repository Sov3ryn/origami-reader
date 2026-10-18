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
  // The characters and their voices, after an analysis (phase 2).
  cast?: import("./cast").CastMember[];
  analysis?: { model: string; date: number; speech: number; uncertain: number };
  // How names and rare words are said in this production (phase 2).
  pronunciations?: import("./pronounce").Pronunciation[];
  // Filled in by the list: how many units exist and how many have audio.
  units?: number;
  rendered?: number;
};

export type UnitStatus = "pending" | "rendered" | "approved" | "failed";
// "pending" with a take means the spoken text changed since that take.
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
  // The text as cut from the book, kept when the spoken text is edited.
  original?: string;
  // Speech (phase 2): who says it, the piece of speech it belongs to, how sure
  // the analysis was (0 to 1), and the voice that reads it (else the narrator's).
  speaker?: string;
  speech?: string;
  confidence?: number;
  voice?: string;
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
  rate?: number;
  // Measured by the speech worker (dBFS and seconds); older takes have none.
  checks?: { peak: number; rms: number; lead: number; trail: number };
  ended?: boolean;
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
export const replaceProductionUnits = (id: string, units: ProductionUnit[]) => invoke<void>("studio_replace_units", { id, units });
export const deleteProduction = (id: string) => invoke<void>("delete_production", { id });

// --- Rendering ---------------------------------------------------------------------------
export const startRender = (id: string, chapter?: number, units?: string[]) =>
  invoke<void>("studio_render", { id, chapter: chapter ?? null, units: units ?? null });
export const cancelRender = () => invoke<void>("studio_cancel_render");
export const renderRunning = (): Promise<boolean> => (desktop ? invoke("studio_render_running") : Promise.resolve(false));
export const takeAudio = (id: string, file: string) => invoke<string>("studio_take_audio", { id, file });
export type RenderProgress = { id: string; done: number; total: number };
export type RenderDone = { id: string; ok: boolean; cancelled?: boolean; message?: string };

// --- Review ------------------------------------------------------------------------------
export type Issue = "cut" | "fast" | "slow" | "clipping" | "quiet" | "pause" | "changed";

/** Speaking pace of a take in characters per second. */
export const pace = (take: Pick<Take, "text" | "duration">) => take.text.replace(/\s+/g, " ").trim().length / Math.max(0.2, take.duration);

/** The production's typical pace: the median over takes of lines long enough to judge. */
export function typicalPace(takes: Take[]) {
  const paces = takes.filter((t) => t.text.length >= 40 && t.duration > 0).map(pace).sort((a, b) => a - b);
  return paces.length >= 5 ? paces[Math.floor(paces.length / 2)] : 15;
}

/** What may be wrong with a take, from its measurements. Empty when it sounds fine on paper. */
export function takeIssues(take: Take | undefined, unit: ProductionUnit, typical: number): Issue[] {
  if (!take) return [];
  const out: Issue[] = [];
  if (unit.status === "pending") out.push("changed");
  if (take.ended === false || unit.status === "failed") out.push("cut");
  // Short lines vary a lot, so pace is only judged on longer ones.
  if (take.text.length >= 25) {
    const p = pace(take);
    if (p > typical * 1.45) out.push("fast");
    if (p < typical * 0.6) out.push("slow");
  }
  const c = take.checks;
  if (c) {
    if (c.peak > -0.3) out.push("clipping");
    if (c.rms < -36) out.push("quiet");
    if (c.lead > 1.2 || c.trail > 1.6) out.push("pause");
  }
  return out;
}

export const issueText: Record<Issue, string> = {
  cut: "Cut off or unfinished",
  fast: "Faster than the rest of the book",
  slow: "Slower than the rest of the book",
  clipping: "Too loud: the peaks clip",
  quiet: "Much quieter than usual",
  pause: "Long silence before or after the speech",
  changed: "The text changed since this take",
};

/** The take a unit plays: its chosen take. */
export function chosenTake(p: Production, unit: ProductionUnit) {
  return unit.take ? p.takes.find((t) => t.id === unit.take) : undefined;
}

/** Every take of a unit, newest first. */
export function takesOf(p: Production, unitId: string) {
  return p.takes.filter((t) => t.unit === unitId).sort((a, b) => b.created - a.created);
}

/** Pauses between lines when playing or mastering: longer between paragraphs and around headings. */
export function gapAfter(unit: ProductionUnit, next: ProductionUnit | undefined) {
  if (!next) return 0;
  if (unit.heading || next.heading) return 1.2;
  return unit.paragraph === next.paragraph ? 0.25 : 0.65;
}

/** Estimated length in seconds of a list of units with their chosen takes, gaps included. */
export function spokenLength(p: Production, units: ProductionUnit[]) {
  let total = 0;
  units.forEach((u, i) => {
    const take = chosenTake(p, u);
    if (take) total += take.duration + gapAfter(u, units[i + 1]);
  });
  return total;
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** A unit with new spoken text: it needs a new take, and the book text is kept. */
export function editUnit(unit: ProductionUnit, text: string): ProductionUnit {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean === unit.text) return unit;
  const original = unit.original ?? unit.text;
  return { ...unit, text: clean, original: clean === original ? undefined : original, status: "pending" };
}

export const takeMime = (file: string) => (file.endsWith(".flac") ? "audio/flac" : "audio/wav");

// --- Export ------------------------------------------------------------------------------
export type ExportOptions = {
  folder: string;
  m4b: boolean;
  mp3: boolean;
  epub: boolean;
  pdf: boolean;
  credit: string;
  creditTitle: string;
  titles: Record<string, string>;
  meta: { title: string; author: string; narrator: string; year: string };
  cover: string | null;
  manuscript: Manuscript | null;
  print: { trim: [number, number]; font: string; bleed: boolean; large: boolean };
};
export type Manuscript = {
  title: string;
  author: string;
  lang: string;
  rights: string[];
  ai: string;
  first_published: string;
  chapters: { title: string | null; blocks: { text: string; quote?: boolean; center?: boolean }[] }[];
};
export type ExportProgress = { id: string; step: string; value: number };
export type LevelReport = { title: string; rms: number; peak: number; floor: number; seconds: number; pass: boolean };
export type ExportDone = {
  id: string;
  ok: boolean;
  cancelled?: boolean;
  message?: string;
  result?: { files: string[]; report: LevelReport[]; exportId: string };
};
export const exportProduction = (id: string, options: ExportOptions) => invoke<void>("studio_export", { id, options });
export const cancelExport = () => invoke<void>("studio_cancel_export");
export const chooseFolder = () => invoke<string | null>("studio_choose_folder");
export const revealFile = (path: string) => invoke<void>("studio_reveal", { path });
export const watermarkReady = (): Promise<boolean> => (desktop ? invoke("studio_watermark_ready") : Promise.resolve(false));

const CREDITS: Record<string, (title: string, author: string) => string> = {
  en: (t, a) => `${t}, by ${a}. Narrated by digital voices. Made with Origami Studio.`,
  fr: (t, a) => `${t}, de ${a}. Lu par des voix numériques. Réalisé avec Origami Studio.`,
  de: (t, a) => `${t}, von ${a}. Gelesen von digitalen Stimmen. Erstellt mit Origami Studio.`,
  es: (t, a) => `${t}, de ${a}. Narrado por voces digitales. Hecho con Origami Studio.`,
  it: (t, a) => `${t}, di ${a}. Letto da voci digitali. Realizzato con Origami Studio.`,
  pt: (t, a) => `${t}, de ${a}. Narrado por vozes digitais. Feito com Origami Studio.`,
};
const CREDIT_TITLES: Record<string, string> = {
  en: "Opening credits",
  fr: "Générique",
  de: "Vorspann",
  es: "Créditos iniciales",
  it: "Titoli di testa",
  pt: "Créditos iniciais",
};
const AI_LINES: Record<string, string> = {
  en: "The audiobook edition is narrated by AI-generated digital voices.",
  fr: "L'édition audio est lue par des voix numériques générées par IA.",
};
const lang2 = (language: string) => (language || "en").slice(0, 2).toLowerCase();

/** The spoken opening credit, in the book's language (English when there is no wording for it). */
export function creditLine(info: Pick<ProductionInfo, "title" | "author" | "language">) {
  const make = CREDITS[lang2(info.language)] || CREDITS.en;
  return make(info.title, info.author || "an unknown author");
}
export const creditTitle = (language: string) => CREDIT_TITLES[lang2(language)] || CREDIT_TITLES.en;
export const aiLine = (language: string) => AI_LINES[lang2(language)] || AI_LINES.en;

/** The manuscript for the ebook and print exports: the book's own text by chapter
 * (never the edited spoken text), with the first heading of each chapter as its title. */
export function manuscript(p: Production, book: Book | null, extra: { rights: string[]; ai: string }): Manuscript {
  const chapters: Manuscript["chapters"] = [];
  if (book) {
    let current = -1;
    for (const para of book.paragraphs) {
      if (para.chapter !== current) {
        current = para.chapter;
        chapters.push({ title: null, blocks: [] });
      }
      const c = chapters[chapters.length - 1];
      const text = para.text.trim();
      if (!text) continue;
      if (para.kind === "heading" && !c.title && !c.blocks.length) c.title = text;
      else if (para.kind === "heading") c.blocks.push({ text, center: true });
      else c.blocks.push({ text, quote: Boolean(para.quote), center: para.align === "center" });
    }
  } else {
    // Without the library book, rebuild paragraphs from the production's units.
    let chapter = -1;
    let paragraph = -1;
    for (const u of p.units) {
      if (u.chapter !== chapter) {
        chapter = u.chapter;
        paragraph = -1;
        chapters.push({ title: null, blocks: [] });
      }
      const c = chapters[chapters.length - 1];
      const text = u.original ?? u.text;
      if (u.heading && !c.title && !c.blocks.length) c.title = text;
      else if (u.paragraph === paragraph && c.blocks.length) c.blocks[c.blocks.length - 1].text += " " + text;
      else c.blocks.push({ text, center: u.heading });
      paragraph = u.paragraph;
    }
  }
  return {
    title: p.info.title,
    author: p.info.author,
    lang: p.info.language || "en",
    rights: extra.rights,
    ai: extra.ai,
    first_published: "",
    chapters: chapters.filter((c) => c.blocks.length || c.title),
  };
}
