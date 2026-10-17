import { t } from "../i18n";
import type { WorkData, WorkItem } from "./types";

// Workspaces: separate sets of subjects, notes, cards, sheets, boards, plans
// and sticky notes (one for a course, one for a job...). Items carry the id of
// their workspace; items without one belong to the first workspace, "main".
// A workspace can live in a vault: its items are then sealed with that vault.
export type WorkspaceDoc = { id: string; kind: "workspace"; name: string; color: string; created: number; vault?: string };
export const MAIN = "main";

const KEY = "origami.workspace";
export function savedWorkspace() {
  try {
    return localStorage.getItem(KEY) || MAIN;
  } catch {
    return MAIN;
  }
}
export function rememberWorkspace(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private window */
  }
}

// Kinds that belong to a workspace. Study logs, hidden pairs, link batches
// and settings stay shared.
const SCOPED = new Set(["subject", "note", "card", "sheet", "chart", "board", "sticky", "plan", "picture"]);
export const workspaceOf = (item: { workspace?: string }) => item.workspace || MAIN;
type Scoped = { kind: string; workspace?: string; vault?: string };

// Only what belongs to `ws` (the rest of the data is left as is).
export function inWorkspace(data: WorkData, ws: string): WorkData {
  const out = { ...data } as Record<string, WorkItem[]>;
  for (const [key, list] of Object.entries(data) as [string, WorkItem[]][])
    out[key] = list.filter((i) => !SCOPED.has(i.kind) || workspaceOf(i as Scoped) === ws);
  return out as unknown as WorkData;
}

// New items join the open workspace, and its vault if it has one.
export function stamp<T extends { kind: string }>(items: T[], ws: WorkspaceDoc | undefined, id: string): T[] {
  return items.map((i) => {
    if (!SCOPED.has(i.kind)) return i;
    const s = i as unknown as Scoped;
    if (s.workspace || (id === MAIN && !ws?.vault)) return i;
    return { ...i, ...(id !== MAIN && !s.workspace ? { workspace: id } : {}), ...(ws?.vault && !s.vault ? { vault: ws.vault } : {}) };
  });
}

export const workspaceColors = ["#8f7bd8", "#4f8fd6", "#3fa784", "#d6a24f", "#d56f6f", "#c779b8", "#5b6b84"];
export const mainWorkspace = (name?: string): WorkspaceDoc => ({ id: MAIN, kind: "workspace", name: name || t("My workspace"), color: workspaceColors[0], created: 0 });

// --- Files ---------------------------------------------------------------------
// An .origami-workspace file: the workspace and its items as JSON. Vault
// fields are dropped (the file itself is not encrypted).
export function exportWorkspace(all: WorkData, ws: WorkspaceDoc) {
  const items: WorkItem[] = [];
  for (const list of Object.values(all) as WorkItem[][])
    for (const i of list) if (SCOPED.has(i.kind) && workspaceOf(i as Scoped) === ws.id) items.push(i);
  const clean = items.map((i) => {
    const { vault: _v, workspace: _w, ...rest } = i as WorkItem & Scoped;
    return rest;
  });
  return JSON.stringify({ type: "origami-workspace", format: 1, exported: new Date().toISOString(), workspace: { name: ws.name, color: ws.color }, items: clean });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[\w:.-]{6,120}$/;
// Reads a workspace file into a new workspace. Every id is replaced, so the
// copy never overwrites what is already here, and references between items
// (a card's note, a chart's sheet...) follow.
export function importWorkspace(text: string, names: string[]): { workspace: WorkspaceDoc; items: WorkItem[] } {
  let v: { type?: string; format?: number; workspace?: { name?: string; color?: string }; items?: unknown[] };
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error(t("This is not an Origami workspace file."));
  }
  if (v?.type !== "origami-workspace" || !Array.isArray(v.items)) throw new Error(t("This is not an Origami workspace file."));
  if ((v.format || 1) > 1) throw new Error(t("This workspace was saved by a newer Origami."));
  const items = v.items.filter((i): i is Scoped & { id: string } => {
    const x = i as { id?: unknown; kind?: unknown };
    return typeof x?.id === "string" && typeof x.kind === "string" && SCOPED.has(x.kind) && ID.test(x.id);
  });
  // Every item id that is a UUID gets a fresh one, replaced everywhere it
  // appears: in fields, inside note text (charts, links) and in ids built
  // from it (a note's cards are "<note id>:<hash>").
  const map = new Map<string, string>();
  for (const i of items) if (UUID.test(i.id)) map.set(i.id, crypto.randomUUID());
  let json = JSON.stringify(items);
  for (const [old, fresh] of map) json = json.split(old).join(fresh);
  const remapped = JSON.parse(json) as (WorkItem & Scoped)[];
  const before = new Set(items.map((i) => i.id));
  for (const i of remapped) if (before.has(i.id)) i.id = crypto.randomUUID();
  const id = crypto.randomUUID();
  let name = (v.workspace?.name || t("Imported workspace")).slice(0, 60);
  if (names.includes(name)) name = t("{name} (imported)", { name });
  const workspace: WorkspaceDoc = {
    id,
    kind: "workspace",
    name,
    color: workspaceColors.includes(v.workspace?.color || "") ? v.workspace!.color! : workspaceColors[1],
    created: Date.now(),
  };
  const fresh = remapped.map((i) => {
    const { vault: _v, ...rest } = i;
    return { ...rest, workspace: id } as WorkItem;
  });
  return { workspace, items: fresh };
}
