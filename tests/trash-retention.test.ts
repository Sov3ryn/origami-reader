import { it, expect } from "vitest";
import { trashExpired, validateTrashDays } from "../src/trashRetention";
import type { BookMeta } from "../src/types";
it("keeps indefinite and active books, and expires only dated Trash items at the exact boundary", () => {
  const day = 86_400_000,
    now = 100 * day;
  const book = { deleted: true, deletedAt: now - 7 * day } as BookMeta;
  expect(trashExpired(book, 7, now)).toBe(true);
  expect(trashExpired(book, 7, now - 1)).toBe(false);
  expect(trashExpired(book, null, now)).toBe(false);
  expect(trashExpired({ ...book, deleted: false }, 7, now)).toBe(false);
  expect(trashExpired({ ...book, deletedAt: undefined }, 7, now)).toBe(false);
  expect(trashExpired({ ...book, deletedAt: now + day }, 1, now)).toBe(false);
  for (const invalid of [0, -1, 1.5, 3651, NaN])
    expect(() => validateTrashDays(invalid)).toThrow();
});
