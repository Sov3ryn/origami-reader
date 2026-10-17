import { t } from "../i18n";
import { makeCard } from "./cards";
import type { StudyCard } from "./types";

// Picture cards (image occlusion): boxes drawn over parts of a picture. Each
// box becomes one card that hides it; the answer is the box's label. The
// picture is kept once, in its set, and the cards point to it.
export type Mask = { id: string; x: number; y: number; w: number; h: number; label: string };
export type PictureSet = {
  id: string;
  kind: "picture";
  title: string;
  // A JPEG or PNG data URL, at most MAX_SIDE pixels on its longest side.
  image: string;
  width: number;
  height: number;
  // Positions and sizes are fractions of the picture (0 to 1).
  masks: Mask[];
  // "one": only the asked box is hidden. "all": every box is hidden and the
  // asked one is marked.
  hide: "one" | "all";
  subjectId?: string;
  workspace?: string;
  vault?: string;
  created: number;
  updated: number;
};

export const MAX_SIDE = 1600;
export const MAX_MASKS = 120;

export function newPictureSet(subjectId?: string, now = Date.now()): PictureSet {
  return { id: crypto.randomUUID(), kind: "picture", title: "", image: "", width: 0, height: 0, masks: [], hide: "all", subjectId, created: now, updated: now };
}

export const pictureTitle = (set: PictureSet) => set.title.trim() || t("Untitled picture");

// Boxes in reading order (top to bottom, then left to right), for numbering.
export function maskOrder(masks: Mask[]) {
  return [...masks].sort((a, b) => (Math.abs(a.y - b.y) < 0.02 ? a.x - b.x : a.y - b.y));
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
// Keeps a box inside the picture and at least a little visible.
export function fitMask(m: Mask): Mask {
  const w = clamp(m.w, 0.01);
  const h = clamp(m.h, 0.01);
  return { ...m, w, h, x: clamp(m.x, 0, 1 - w), y: clamp(m.y, 0, 1 - h), label: m.label.slice(0, 200) };
}

// A box from two corners, in any order.
export function maskFrom(a: { x: number; y: number }, b: { x: number; y: number }, id = crypto.randomUUID().slice(0, 8)): Mask {
  return fitMask({ id, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), label: "" });
}

// Keeps the set's cards in step with its boxes: a card per box, the title
// as the question and the label as the answer. Review history is kept.
export function syncPictureCards(set: PictureSet, cards: StudyCard[], now = Date.now()) {
  const mine = cards.filter((c) => c.picture?.set === set.id);
  const byMask = new Map(mine.map((c) => [c.picture!.mask, c]));
  const save: StudyCard[] = [];
  const keep = new Set<string>();
  const front = pictureTitle(set);
  if (set.image)
    for (const m of set.masks) {
      const old = byMask.get(m.id);
      const back = m.label.trim();
      if (!old) {
        save.push({ ...makeCard({ type: "picture", front, back, subjectId: set.subjectId, vault: set.vault, origin: "manual" }, now), picture: { set: set.id, mask: m.id } });
        continue;
      }
      keep.add(old.id);
      if (old.front !== front || old.back !== back || old.subjectId !== set.subjectId || old.vault !== set.vault)
        save.push({ ...old, front, back, subjectId: set.subjectId, vault: set.vault, updated: now });
    }
  const remove = mine.filter((c) => !keep.has(c.id) && !save.some((s) => s.id === c.id)).map((c) => c.id);
  return { save, remove };
}

// Reads an image file into a data URL no larger than MAX_SIDE. Photos become
// JPEG; images with transparency stay PNG (on white they would lose labels).
export async function loadPicture(file: Blob): Promise<{ image: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error(t("Choose a picture file (PNG, JPEG, WebP or BMP)."));
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(t("This picture could not be opened."));
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  g.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let transparent = false;
  if (file.type === "image/png" || file.type === "image/webp") {
    const px = g.getImageData(0, 0, width, height).data;
    for (let i = 3; i < px.length; i += 4 * 7)
      if (px[i] < 250) {
        transparent = true;
        break;
      }
  }
  if (transparent) return { image: canvas.toDataURL("image/png"), width, height };
  const flat = document.createElement("canvas");
  flat.width = width;
  flat.height = height;
  const f = flat.getContext("2d")!;
  f.fillStyle = "#fff";
  f.fillRect(0, 0, width, height);
  f.drawImage(canvas, 0, 0);
  return { image: flat.toDataURL("image/jpeg", 0.88), width, height };
}

// Only images made by loadPicture (or the same kinds) are accepted from files.
export const safeImage = (s: unknown): s is string => typeof s === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 12_000_000;
