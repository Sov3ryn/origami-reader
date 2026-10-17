import { invoke, isTauri } from "@tauri-apps/api/core";
import { openDB } from "idb";
import {
  isLegacyDemo,
  prepareStarterBooks,
  starterMigration,
} from "./starterLibrary";
import { validateSpokenEdits } from "./spokenText";
import { trashExpired, validateTrashDays } from "./trashRetention";
import type { SystemProfile } from "./hardware";
import type {
  Annotation,
  Book,
  BookMeta,
  Preferences,
  SpeechResult,
  Voice,
  SpokenEdit,
} from "./types";
export const desktop = isTauri();
let initialization: Promise<void> | undefined;
export async function initializeLibrary() {
  initialization ??= (async () => {
    const done = desktop
      ? await invoke<boolean>("starter_library_installed")
      : await (await db()).get("settings", starterMigration);
    if (done) return;
    const books = await prepareStarterBooks(await listBooks(), readBook);
    if (desktop) {
      await invoke("install_starter_library", { books });
      return;
    }
    const d = await db();
    const t = d.transaction(
      ["metadata", "bodies", "settings", "annotations"],
      "readwrite",
    );
    if (await t.objectStore("settings").get(starterMigration)) {
      await t.done;
      return;
    }
    const metadata = t.objectStore("metadata");
    const bodies = t.objectStore("bodies");
    const annotations = t.objectStore("annotations");
    for (const book of books) {
      const current = await metadata.getAll();
      const found = current.find(
        (b) => b.id === book.meta.id || b.sourceHash === book.meta.sourceHash,
      );
      if (found) {
        if (!found.coverImage && !found.deleted)
          await metadata.put({
            ...found,
            coverImage: book.meta.coverImage,
            coverOrigin: book.meta.coverOrigin,
            coverText: book.meta.coverText,
          });
        continue;
      }
      await metadata.put(book.meta);
      await bodies.put(book.paragraphs, book.meta.id);
    }
    const backup = [];
    for (const meta of (await metadata.getAll()).filter(isLegacyDemo)) {
      const notes = await annotations.index("bookId").getAll(meta.id);
      backup.push({
        meta,
        paragraphs: await bodies.get(meta.id),
        annotations: notes,
      });
      for (const note of notes) await annotations.delete(note.id);
      await bodies.delete(meta.id);
      await metadata.delete(meta.id);
    }
    await t.objectStore("settings").put(backup, "starter-demo-backup-v3");
    await t.objectStore("settings").put(true, starterMigration);
    await t.done;
  })();
  try {
    await initialization;
  } catch (error) {
    initialization = undefined;
    throw error;
  }
  return listBooks();
}
const db = () =>
  openDB("origami-reader-v1", 1, {
    upgrade(db) {
      db.createObjectStore("metadata", { keyPath: "id" });
      db.createObjectStore("bodies");
      db.createObjectStore("settings");
      const a = db.createObjectStore("annotations", { keyPath: "id" });
      a.createIndex("bookId", "bookId");
    },
  });
export async function listBooks(): Promise<BookMeta[]> {
  return desktop ? invoke("list_books") : (await db()).getAll("metadata");
}
export async function readBook(id: string): Promise<Book> {
  if (desktop) return invoke("read_book", { id });
  const d = await db();
  return {
    meta: await d.get("metadata", id),
    paragraphs: await d.get("bodies", id),
  };
}
export async function saveBook(book: Book) {
  if (desktop) return invoke("save_book", { book });
  const d = await db();
  const t = d.transaction(["metadata", "bodies"], "readwrite");
  await t.objectStore("metadata").put(book.meta);
  await t.objectStore("bodies").put(book.paragraphs, book.meta.id);
  await t.done;
}
export async function saveMeta(meta: BookMeta) {
  if (desktop) return invoke("save_meta", { meta });
  return (await db()).put("metadata", meta);
}
export async function deleteTrashedBooks(ids: string[]) {
  if (!ids.length) throw new Error("Select books in Trash first.");
  if (desktop) return invoke<void>("delete_trashed_books", { ids });
  const d = await db();
  const t = d.transaction(["metadata", "bodies", "annotations"], "readwrite");
  void t.done.catch(() => {});
  try {
    for (const id of new Set(ids)) {
      const meta = await t.objectStore("metadata").get(id);
      if (!meta?.deleted)
        throw new Error("Only books in Trash can be permanently deleted.");
    }
    for (const id of new Set(ids)) {
      for (const note of await t
        .objectStore("annotations")
        .index("bookId")
        .getAll(id))
        await t.objectStore("annotations").delete(note.id);
      await t.objectStore("bodies").delete(id);
      await t.objectStore("metadata").delete(id);
    }
    await t.done;
  } catch (error) {
    try {
      t.abort();
    } catch {}
    await t.done.catch(() => {});
    throw error;
  }
}
export async function purgeTrash(days: number | null): Promise<string[]> {
  validateTrashDays(days);
  if (desktop) return invoke("purge_trash", { days });
  const now = Date.now();
  const d = await db();
  const t = d.transaction(["metadata", "bodies", "annotations"], "readwrite");
  const removed: string[] = [];
  for (const meta of await t.objectStore("metadata").getAll()) {
    if (!meta.deleted) continue;
    // Older entries get a full retention period rather than an unknown age.
    if (!Number.isFinite(meta.deletedAt)) {
      await t.objectStore("metadata").put({ ...meta, deletedAt: now });
      continue;
    }
    if (!trashExpired(meta, days, now)) continue;
    for (const note of await t
      .objectStore("annotations")
      .index("bookId")
      .getAll(meta.id))
      await t.objectStore("annotations").delete(note.id);
    await t.objectStore("bodies").delete(meta.id);
    await t.objectStore("metadata").delete(meta.id);
    removed.push(meta.id);
  }
  await t.done;
  return removed;
}
export async function saveSpokenEdits(
  bookId: string,
  paragraphId: string,
  edits: SpokenEdit[],
) {
  if (desktop)
    return invoke<void>("save_spoken_edits", { bookId, paragraphId, edits });
  const d = await db();
  const t = d.transaction("bodies", "readwrite");
  const paragraphs = (await t.store.get(bookId)) as
    Book["paragraphs"] | undefined;
  const paragraph = paragraphs?.find((p) => p.id === paragraphId);
  if (!paragraph) throw new Error("Passage not found.");
  validateSpokenEdits(paragraph.text, edits);
  if (edits.length) paragraph.spokenEdits = edits;
  else delete paragraph.spokenEdits;
  await t.store.put(paragraphs, bookId);
  await t.done;
}
export async function readSettings(): Promise<Partial<Preferences>> {
  return desktop
    ? invoke("read_settings")
    : (await db()).get("settings", "preferences").then((v) => v || {});
}
export async function saveSettings(settings: Preferences) {
  if (desktop) return invoke("save_settings", { settings });
  return (await db()).put("settings", settings, "preferences");
}
export async function listAnnotations(bookId?: string): Promise<Annotation[]> {
  if (desktop) return invoke("list_annotations", { bookId: bookId || null });
  const d = await db();
  return bookId
    ? d.getAllFromIndex("annotations", "bookId", bookId)
    : d.getAll("annotations");
}
export async function saveAnnotation(annotation: Annotation) {
  if (desktop) return invoke("save_annotation", { annotation });
  return (await db()).put("annotations", annotation);
}
export async function deleteAnnotation(id: string) {
  if (desktop) return invoke("delete_annotation", { id });
  return (await db()).delete("annotations", id);
}
export async function getVoices(model?: string): Promise<Voice[]> {
  return desktop ? invoke("list_voices", { model: model || null }) : [];
}
export async function synthesize(
  text: string,
  voice: string,
  temperature?: number,
  model?: string,
): Promise<SpeechResult> {
  if (!desktop)
    throw new Error("Local voice generation is available in the desktop app.");
  return invoke("synthesize", {
    text,
    voice,
    temperature,
    model: model || null,
  });
}
export async function cancelSpeech() {
  if (desktop) await invoke("cancel_speech");
}
export async function interruptSpeech() {
  if (desktop) await invoke("interrupt_speech");
}
export async function prepareVoice(voice: string, model?: string) {
  if (desktop) await invoke("prepare_voice", { voice, model: model || null });
}
export type ModelVersion = {
  id: string;
  name: string;
  description: string;
  tier: string;
  sizeGb?: number | null;
  // Speech engine family; voices are made for one engine.
  engine?: string;
};
export async function speechModels(): Promise<{
  models: ModelVersion[];
  default: string;
}> {
  return desktop ? invoke("speech_models") : { models: [], default: "" };
}
// Graphics and memory, read locally to choose performance defaults.
export async function systemProfile(): Promise<SystemProfile | null> {
  return desktop ? invoke("system_profile") : null;
}
export async function coverEngineStatus(): Promise<{
  installed: boolean;
  name: string;
  attribution?: string;
  models?: ModelVersion[];
  default?: string;
}> {
  return desktop
    ? invoke("cover_engine_status")
    : { installed: false, name: "SD-Turbo · local" };
}
// The image model version and whether speech may stay loaded during a job.
export type ArtOptions = { model?: string; keepSpeech?: boolean };
export async function generateCover(
  prompt: string,
  seed: number,
  allowMature = false,
  bookId?: string,
  options: ArtOptions = {},
): Promise<string> {
  if (!desktop)
    throw new Error("Cover generation is available in the desktop app.");
  return invoke("generate_cover", {
    prompt,
    seed,
    allowMature,
    bookId,
    model: options.model || null,
    keepSpeech: Boolean(options.keepSpeech),
  });
}
export async function cancelCover() {
  if (desktop) await invoke("cancel_cover");
}
export async function generateVoicePortrait(
  voice: string,
  prompt: string,
  seed: number,
  options: ArtOptions = {},
): Promise<string> {
  if (!desktop)
    throw new Error("Portrait generation is available in the desktop app.");
  return invoke("generate_voice_portrait", {
    voice,
    prompt,
    seed,
    model: options.model || null,
    keepSpeech: Boolean(options.keepSpeech),
  });
}
export async function saveVoicePortrait(
  voice: string,
  portrait: string,
  prompt: string,
  origin: "generated" | "custom",
) {
  if (!desktop)
    throw new Error("Voice portraits are available in the desktop app.");
  return invoke<void>("save_voice_portrait", {
    voice,
    portrait,
    prompt,
    origin,
  });
}
export async function deleteVoicePortrait(voice: string) {
  if (desktop) await invoke("delete_voice_portrait", { voice });
}
// Copies of covers and portraits as files in the app's Artwork folder.
export async function saveArtworkCopies(
  items: { folder: "covers" | "portraits"; name: string; data: string }[],
): Promise<string> {
  if (!desktop)
    throw new Error("Artwork files are available in the desktop app.");
  return invoke("save_artwork_copies", { items });
}
export async function openArtworkFolder() {
  if (desktop) await invoke("open_artwork_folder");
}
export async function exportText(name: string, text: string) {
  if (desktop) return invoke("export_text", { name, text });
  const u = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

// Donation and source-code pages, configured in the desktop build only.
export async function externalLinks(): Promise<{
  support: string;
  source: string;
}> {
  if (!desktop) return { support: "", source: "" };
  return invoke("external_links");
}
export async function openExternalLink(kind: "support" | "source") {
  if (desktop) await invoke("open_external_link", { kind });
}

export async function modelInventory(): Promise<
  import("./modelCatalog").ModelInstallation[]
> {
  return desktop ? invoke("model_inventory") : [];
}
export async function changeModelInstallation(
  id: string,
  install: boolean,
): Promise<import("./modelCatalog").ModelInstallation[]> {
  if (!desktop)
    throw new Error("Model management is available in the desktop app.");
  return invoke("change_model_installation", { id, install });
}

// Vaults: encrypted shelves unlocked with a 4 to 8 digit PIN. Desktop only;
// the keys live in the app process and every vault locks when it closes.
export type Vault = { id: string; name: string; unlocked: boolean; books: number };
export const vaultsAvailable = desktop;
export async function listVaults(): Promise<Vault[]> {
  return desktop ? invoke("list_vaults") : [];
}
export async function createVault(name: string, pin: string): Promise<Vault> {
  return invoke("create_vault", { name, pin });
}
export async function unlockVault(id: string, pin: string) {
  return invoke<void>("unlock_vault", { id, pin });
}
export async function lockVault(id?: string) {
  if (desktop) await invoke<void>("lock_vault", { id: id ?? null });
}
export async function renameVault(id: string, name: string) {
  return invoke<void>("rename_vault", { id, name });
}
export async function changeVaultPin(id: string, current: string, pin: string) {
  return invoke<void>("change_vault_pin", { id, current, pin });
}
export async function deleteVault(id: string, pin: string): Promise<string[]> {
  return invoke("delete_vault", { id, pin });
}
export async function parentalPinSet(): Promise<boolean> {
  return desktop ? invoke("parental_pin_status") : false;
}
export async function checkParentalPin(pin: string) {
  return invoke<void>("check_parental_pin", { pin });
}
export async function setParentalPin(current: string, pin: string | null) {
  return invoke<void>("set_parental_pin", { current, pin });
}

// Deletes voices for good; returns the ids that were removed.
export async function deleteVoices(ids: string[]): Promise<string[]> {
  return invoke("delete_voices", { ids });
}
