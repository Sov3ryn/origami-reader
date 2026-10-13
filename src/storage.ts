import { invoke, isTauri } from "@tauri-apps/api/core";
import { openDB } from "idb";
import { sampleBooks } from "./seeds";
import { validateSpokenEdits } from "./spokenText";
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
    if (!(await listBooks()).length) {
      for (const item of sampleBooks()) await saveBook(item);
    }
  })();
  await initialization;
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
export async function getVoices(): Promise<Voice[]> {
  return desktop ? invoke("list_voices") : [];
}
export async function synthesize(
  text: string,
  voice: string,
): Promise<SpeechResult> {
  if (!desktop)
    throw new Error("Local voice generation is available in the desktop app.");
  return invoke("synthesize", { text, voice });
}
export async function cancelSpeech() {
  if (desktop) await invoke("cancel_speech");
}
export async function prepareVoice(voice: string) {
  if (desktop) await invoke("prepare_voice", { voice });
}
export async function coverEngineStatus(): Promise<{
  installed: boolean;
  name: string;
}> {
  return desktop
    ? invoke("cover_engine_status")
    : { installed: false, name: "SD-Turbo · local" };
}
export async function generateCover(
  prompt: string,
  seed: number,
  allowMature = false,
  bookId?: string,
): Promise<string> {
  if (!desktop)
    throw new Error("Cover generation is available in the desktop app.");
  return invoke("generate_cover", { prompt, seed, allowMature, bookId });
}
export async function cancelCover() {
  if (desktop) await invoke("cancel_cover");
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
