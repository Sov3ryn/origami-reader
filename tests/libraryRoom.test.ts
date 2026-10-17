import { it, expect } from "vitest";
import { layoutShelves, bookSize, type RoomScene } from "../src/libraryRoom";
import type { BookMeta } from "../src/types";

const shelf = (bay: number, row: number) => ({ bay, row, x0: bay * 2, x1: bay * 2 + 1.7, z: row * 0.44, height: 0.4, spineY: 1.63, depth: 0.33 });
const scene: RoomScene = {
  version: 1,
  image: { width: 3840, height: 2160 },
  camera: { matrixWorld: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], fovV: 35 },
  lightScale: 4,
  shelves: [0, 1, 2].flatMap((bay) => [0, 1, 2, 3, 4, 5, 6].map((row) => shelf(bay, row))),
};
const book = (id: string, wordCount: number) => ({ id, title: id, author: "A", wordCount, paragraphCount: 100 }) as BookMeta;

it("puts books at eye level first, never overlapping, and fills the rest", () => {
  const books = Array.from({ length: 60 }, (_, i) => book("b" + i, 60000 + i * 5000));
  const { books: placed, fillers, overflow } = layoutShelves(scene, books);
  expect(overflow).toBe(0);
  expect(placed[0].y).toBeCloseTo(3 * 0.44 + placed[0].h / 2);
  const all = [...placed, ...fillers].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const s of scene.shelves) {
    const row = all.filter((b) => Math.abs(b.y - b.h / 2 - s.z) < 1e-6 && b.x > s.x0 && b.x < s.x1).sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) expect(row[i].x - row[i].w / 2).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w / 2 - 1e-9);
    expect(row.at(-1)!.x + row.at(-1)!.w / 2).toBeLessThanOrEqual(s.x1 + 1e-9);
    for (const b of row) expect(b.h).toBeLessThanOrEqual(s.height);
  }
  expect(bookSize(book("long", 460000)).w).toBeGreaterThan(bookSize(book("short", 30000)).w);
});
