import { invoke } from "@tauri-apps/api/core";
import { openDB } from "idb";
import { desktop } from "../storage";
import type { NoteVersion, WorkData, WorkItem } from "./types";

// The browser build keeps Work Mode in its own small database.
const db = () =>
  openDB("origami-work-v1", 1, {
    upgrade(d) {
      d.createObjectStore("work", { keyPath: "id" });
    },
  });

export async function loadWork(): Promise<WorkData> {
  const items: WorkItem[] = desktop
    ? await invoke("list_work", { kind: null })
    : await (await db()).getAll("work");
  const data: WorkData = {
    subjects: [],
    notes: [],
    cards: [],
    batches: [],
    hidden: [],
    vectors: [],
    logs: [],
    meta: [],
    sheets: [],
    charts: [],
    boards: [],
    stickies: [],
    workspaces: [],
    plans: [],
    pictures: [],
  };
  for (const item of items) {
    if (item.kind === "subject") data.subjects.push(item);
    else if (item.kind === "note") data.notes.push(item);
    else if (item.kind === "card") data.cards.push(item);
    else if (item.kind === "batch") data.batches.push(item);
    else if (item.kind === "hidden") data.hidden.push(item);
    else if (item.kind === "vector") data.vectors.push(item);
    else if (item.kind === "log") data.logs.push(item);
    else if (item.kind === "meta") data.meta.push(item);
    else if (item.kind === "sheet") data.sheets.push(item);
    else if (item.kind === "chart") data.charts.push(item);
    else if (item.kind === "board") data.boards.push(item);
    else if (item.kind === "sticky") data.stickies.push(item);
    else if (item.kind === "workspace") data.workspaces.push(item);
    else if (item.kind === "plan") data.plans.push(item);
    else if (item.kind === "picture") data.pictures.push(item);
  }
  data.subjects.sort((a, b) => a.order - b.order);
  return data;
}

export async function saveWork(items: (WorkItem | NoteVersion)[]) {
  if (!items.length) return;
  if (desktop) return invoke<void>("save_work", { items });
  const t = (await db()).transaction("work", "readwrite");
  for (const item of items) await t.store.put(item);
  await t.done;
}

// The desktop store refuses a note over 4 MB (store.rs). Work mode checks
// first, so it can say so once instead of failing on every save.
const NOTE_LIMIT = 4 * 1024 * 1024;
export function tooLarge(item: WorkItem) {
  if (!desktop || item.kind !== "note") return false;
  const text = JSON.stringify(item);
  return text.length * 3 > NOTE_LIMIT && new TextEncoder().encode(text).length > NOTE_LIMIT;
}

// Note history: the newest first, at most `keep` kept per note.
export const VERSIONS_KEPT = 50;
export async function noteVersions(note: string): Promise<NoteVersion[]> {
  if (desktop) return invoke("note_versions", { note });
  const all = (await (await db()).getAll("work")) as (WorkItem | NoteVersion)[];
  return all.filter((v): v is NoteVersion => v.kind === "version" && v.note === note).sort((a, b) => b.saved - a.saved);
}
export async function pruneVersions(note: string, keep = VERSIONS_KEPT) {
  if (desktop) return invoke<number>("prune_note_versions", { note, keep });
  const old = (await noteVersions(note)).slice(keep).map((v) => v.id);
  await deleteWork(old);
  return old.length;
}

export async function deleteWork(ids: string[]) {
  if (!ids.length) return;
  if (desktop) return invoke<void>("delete_work", { ids });
  const t = (await db()).transaction("work", "readwrite");
  for (const id of ids) await t.store.delete(id);
  await t.done;
}

// Books moving into or out of a vault take their cards along. Notes that
// quote those books move in too, so their text is sealed with the book.
export async function followBooks(bookIds: Set<string>, vault: string) {
  const data = await loadWork();
  const quotes = (html: string) =>
    [...html.matchAll(/\bdata-book="([^"]*)"/g)].some((m) => bookIds.has(m[1]));
  const changed: WorkItem[] = [
    ...data.cards
      .filter((c) => c.source && bookIds.has(c.source.bookId) && (c.vault || "") !== vault)
      .map((c) => ({ ...c, vault: vault || undefined })),
    ...(vault
      ? data.notes.filter((n) => n.vault !== vault && quotes(n.html)).map((n) => ({ ...n, vault }))
      : []),
  ];
  await saveWork(changed);
}

// A folder of files picked by the reader (desktop), or one combined file.
// Binary files are passed as "base64:" followed by their contents.
export async function exportFolder(
  name: string,
  files: [string, string][],
): Promise<boolean> {
  if (desktop) return invoke("export_folder", { name, files });
  for (const [path, text] of files) {
    const u = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = path.split("/").pop() || "note.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  return true;
}

export function bytesToBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Opens a web address in the reader's browser.
export async function openUrl(url: string) {
  if (desktop) return invoke<void>("open_url", { url });
  window.open(url, "_blank", "noopener");
}
