import { describe, expect, it } from "vitest";
import {
  BOOK_MIN_HEIGHT,
  BOOK_MIN_WIDTH,
  bookFits,
  bookPageHeight,
} from "../src/bookLayout";

describe("book page size", () => {
  it("fits at the minimum size without a bookmark", () => {
    expect(bookFits(BOOK_MIN_WIDTH, BOOK_MIN_HEIGHT)).toBe(true);
    expect(bookPageHeight(BOOK_MIN_WIDTH, BOOK_MIN_HEIGHT)).toBeGreaterThanOrEqual(360);
  });

  it("does not fit below the minimum width or height", () => {
    expect(bookFits(BOOK_MIN_WIDTH - 1, 1000)).toBe(false);
    expect(bookFits(1600, BOOK_MIN_HEIGHT - 1)).toBe(false);
  });

  it("leaves room for a wide bookmark beside the book", () => {
    // Copper ginkgo leaf: about 0.539 wide for its height.
    expect(bookPageHeight(900, 1000, 0.539)).toBeLessThan(360);
    expect(bookFits(900, 1000, 0.539)).toBe(false);
    expect(bookFits(970, 1000, 0.539)).toBe(true);
  });

  it("caps the page height", () => {
    expect(bookPageHeight(5000, 5000)).toBe(1150);
  });
});
