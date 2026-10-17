import { describe, expect, it } from "vitest";
import { autoUiScale } from "../src/screenFit";

// Window sizes in CSS pixels, after the system's display scaling.
describe("automatic interface size", () => {
  it("is compact on small laptops and split windows", () => {
    expect(autoUiScale(1366, 728)).toBe(95); // 1366 x 768 laptop
    expect(autoUiScale(1280, 680)).toBe(95);
    expect(autoUiScale(960, 1040)).toBe(90); // half of a 1080p screen
    expect(autoUiScale(1536, 650)).toBe(90); // 1080p laptop at 125%, short
  });

  it("stays at 100% on common desktop screens", () => {
    expect(autoUiScale(1920, 1010)).toBe(100); // 1080p at 100%
    expect(autoUiScale(1536, 824)).toBe(100); // 1080p at 125%
  });

  it("grows on large and high-resolution screens", () => {
    expect(autoUiScale(1920, 1130)).toBe(110); // 1920 x 1200
    expect(autoUiScale(2560, 1370)).toBe(120); // 1440p, or 4K at 150%
    expect(autoUiScale(3840, 2090)).toBe(130); // 4K at 100%
  });
});
