import { it, expect } from "vitest";
import { dominantColor } from "../src/coverColor";
it("prefers the main colored area over dark and light borders", () => {
  const px: number[] = [];
  const add = (n: number, rgb: number[]) => {
    for (let i = 0; i < n; i++) px.push(...rgb, 255);
  };
  add(500, [5, 5, 8]); // black border
  add(200, [250, 250, 250]); // white title
  add(300, [30, 90, 160]); // blue art
  const c = dominantColor(new Uint8ClampedArray(px))!;
  expect(c).toBe("#1e5aa0");
  expect(dominantColor(new Uint8ClampedArray([]))).toBeNull();
});
