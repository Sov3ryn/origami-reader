import * as THREE from "three";
import type { BookMeta } from "./types";

// Geometry exported by tools/library-scene/build_room.py, in Blender axes
// (metres, Z up, the camera looking along +Y).
export type RoomShelf = {
  bay: number;
  row: number;
  x0: number;
  x1: number;
  z: number;
  height: number;
  spineY: number;
  depth: number;
};
export type RoomScene = {
  version: number;
  image: { width: number; height: number };
  camera: { matrixWorld: number[][]; fovV: number };
  lightScale: number;
  // Exposure (stops) of the room renders; light passes are stored without it.
  exposure?: { day: number; night: number };
  shelves: RoomShelf[];
  // Bookcase parts as [x0, x1, y0, y1, z0, z1] boxes, drawn depth-only.
  occluders?: number[][];
};
// Positions are in three.js axes: x, y up, z toward the camera.
export type ShelfBook = {
  meta: BookMeta;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  lean: number;
  colour: string;
};
export type Filler = Omit<ShelfBook, "meta">;

// Blender (x, y, z) to three.js (x, z, -y).
const BLENDER_TO_THREE = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

export function roomCamera(scene: RoomScene) {
  const { matrixWorld: m, fovV } = scene.camera;
  const blender = new THREE.Matrix4().set(...(m.flat() as Parameters<THREE.Matrix4["set"]>));
  const world = BLENDER_TO_THREE.clone().multiply(blender);
  const camera = new THREE.PerspectiveCamera(fovV, scene.image.width / scene.image.height, 0.05, 60);
  world.decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrixWorld();
  return camera;
}

// The bookcase's dividers, stiles and boards as three.js boxes.
export function occluderBoxes(scene: RoomScene) {
  return (scene.occluders || []).map(([x0, x1, y0, y1, z0, z1]) => ({
    centre: new THREE.Vector3((x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2),
    size: new THREE.Vector3(x1 - x0, z1 - z0, y1 - y0),
  }));
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function random(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const CLOTH = ["#27406b", "#6b2430", "#2f5a43", "#a07a2c", "#255c63", "#4f2d55", "#8a3f22", "#3b3f6e"];
const LEATHER = ["#4a1c18", "#23382b", "#1f2840", "#6e4526", "#1c1917", "#3d2618", "#4b1d2a", "#2f2a22", "#5a3a1c"];
// Eye level first, then outwards; the centre bay first, then left and right.
const ROW_ORDER = [3, 2, 4, 1, 5, 0, 6];
const BAY_ORDER = [1, 0, 2];

export function bookSize(meta: BookMeta) {
  const r = random(hash(meta.id));
  const words = meta.wordCount || meta.paragraphCount * 60 || 40000;
  return {
    w: Math.min(0.075, Math.max(0.016, 0.016 + words * 1.05e-7)),
    h: 0.21 + r() * 0.09,
    d: 0.15 + r() * 0.07,
    colour: CLOTH[Math.floor(r() * CLOTH.length)],
  };
}

// Places the reader's books on the shelves (eye level first) and fills the
// rest with antique volumes so the room reads as a lived-in library.
export function layoutShelves(scene: RoomScene, books: BookMeta[]) {
  const shelves = [...scene.shelves].sort(
    (a, b) =>
      BAY_ORDER.indexOf(a.bay) - BAY_ORDER.indexOf(b.bay) ||
      ROW_ORDER.indexOf(a.row) - ROW_ORDER.indexOf(b.row),
  );
  const cursor = new Map(shelves.map((s) => [s, s.x0]));
  const placed: ShelfBook[] = [];
  let s = 0;
  const gap = 0.002;
  const put = (shelf: RoomShelf, w: number, h: number, d: number) => {
    const x = cursor.get(shelf)!;
    cursor.set(shelf, x + w + gap);
    h = Math.min(h, shelf.height - 0.025);
    d = Math.min(d, shelf.depth);
    return { x: x + w / 2, y: shelf.z + h / 2, z: -(shelf.spineY + d / 2), w, h, d };
  };
  for (const meta of books) {
    const size = bookSize(meta);
    while (s < shelves.length && cursor.get(shelves[s])! + size.w > shelves[s].x1) s++;
    if (s >= shelves.length) break;
    placed.push({ meta, ...put(shelves[s], size.w, size.h, size.d), lean: 0, colour: size.colour });
  }
  const fillers: Filler[] = [];
  for (const shelf of shelves) {
    const r = random(hash(`${shelf.bay}-${shelf.row}`));
    for (;;) {
      const left = shelf.x1 - cursor.get(shelf)!;
      if (left < 0.012) break;
      let w = 0.018 + r() * 0.037;
      if (left - w < 0.018) w = left - gap;
      const tall = r() < 0.15 ? 0.06 : 0;
      fillers.push({
        ...put(shelf, w, 0.19 + r() * 0.1 + tall, 0.16 + r() * 0.08),
        lean: 0,
        colour: LEATHER[Math.floor(r() * LEATHER.length)],
      });
    }
  }
  return { books: placed, fillers, overflow: books.length - placed.length };
}
