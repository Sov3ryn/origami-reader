import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../storage";
import { strengthOf, type Match } from "./text";

// The IBM Granite embedding models behind Related (src-tauri/src/embed.rs).
// "standard" is Granite 97M, "precise" Granite 311M; "words" uses no model.
export type ModelChoice = "standard" | "precise" | "words";
export type EmbeddingModel = {
  id: "standard" | "precise";
  name: string;
  installed: boolean;
  // Shipped with the app: always there, nothing to remove.
  bundled?: boolean;
  bytes: number;
  downloading: boolean;
};
export type EmbeddingStatus = { models: EmbeddingModel[]; fast: boolean; runtime: boolean };

export async function embeddingStatus(): Promise<EmbeddingStatus | null> {
  return desktop ? invoke("embedding_status") : null;
}
export async function downloadModel(id: string) {
  return invoke<void>("download_embedding_model", { id });
}
export async function cancelDownload() {
  return invoke<void>("cancel_embedding_download");
}
export async function removeModel(id: string) {
  return invoke<void>("remove_embedding_model", { id });
}
export async function embedTexts(id: string, texts: string[]): Promise<Float32Array[]> {
  const rows = await invoke<number[][]>("embed_texts", { id, texts });
  return rows.map((r) => Float32Array.from(r));
}
export type DownloadEvent = { id: string; received?: number; total?: number; done?: boolean; ok?: boolean };
export function onDownload(fn: (e: DownloadEvent) => void): () => void {
  if (!desktop) return () => {};
  let stop: (() => void) | undefined;
  let cancelled = false;
  void listen<DownloadEvent>("embedding-download", (e) => fn(e.payload)).then((un) => {
    if (cancelled) un();
    else stop = un;
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

// Stored vectors: base64 of 384 float32 numbers, with the text's hash so a
// changed note is indexed again.
export type VectorItem = {
  id: string;
  kind: "vector";
  doc: string;
  model: string;
  hash: string;
  v: string;
  vault?: string;
};
export const vectorId = (doc: string) => "vec:" + doc;
export function encodeVector(v: Float32Array) {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function decodeVector(s: string) {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
export function textHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ":" + s.length;
}

// Calibrated on English and French notes with single-passage vectors:
// same topic (also across languages) scores about 0.80 and up, close topics
// 0.74 to 0.80, unrelated passages below 0.70.
const levels: Record<string, { strong: number; likely: number; min: number }> = {
  standard: { strong: 0.8, likely: 0.74, min: 0.7 },
  precise: { strong: 0.8, likely: 0.74, min: 0.7 },
};
export function semanticRelated(
  vectors: Map<string, Float32Array>,
  model: string,
  id: string,
  { among, limit = 30 }: { among?: (id: string) => boolean; limit?: number } = {},
): Match[] {
  const a = vectors.get(id);
  const lv = levels[model];
  if (!a || !lv) return [];
  const out: Match[] = [];
  for (const [other, b] of vectors) {
    if (other === id || (among && !among(other))) continue;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    if (s < lv.min) continue;
    out.push({
      id: other,
      score: s,
      shared: [],
      strength: s >= lv.strong ? "strong" : s >= lv.likely ? "likely" : "weak",
      semantic: true,
    });
  }
  return out.sort((p, q) => q.score - p.score).slice(0, limit);
}

const rank = { weak: 0, likely: 1, strong: 2 } as const;
// Meaning from the model, words from the text: the stronger verdict wins, and
// shared words still explain the match when there are any.
export function mergeMatches(semantic: Match[], words: Match[]): Match[] {
  const byId = new Map<string, Match>();
  for (const m of words) byId.set(m.id, { ...m, strength: strengthOf(m.score) });
  for (const m of semantic) {
    const w = byId.get(m.id);
    if (!w) byId.set(m.id, m);
    else
      byId.set(m.id, {
        ...w,
        semantic: true,
        strength: rank[m.strength] > rank[w.strength] ? m.strength : w.strength,
        score: Math.max(m.score, w.score),
      });
  }
  return [...byId.values()].sort((a, b) => rank[b.strength] - rank[a.strength] || b.score - a.score);
}
