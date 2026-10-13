import type { BookMeta } from "./types";
export function validateTrashDays(days: number | null): number | null {
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650))
    throw new Error(
      "Choose between 1 and 3,650 days, or keep Trash indefinitely.",
    );
  return days;
}
export function trashExpired(book: BookMeta, days: number | null, now: number) {
  validateTrashDays(days);
  return (
    book.deleted &&
    days !== null &&
    Number.isFinite(book.deletedAt) &&
    book.deletedAt! <= now - days * 86_400_000
  );
}
