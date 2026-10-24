// Places to read: 31 painted scenes with their own animations (19 celebrations,
// 12 reading milestones). The art and its catalog come from tools/places;
// src/places/origami-backgrounds.js draws them as <origami-background>.
import catalog from "./places/places.json";
import { t, formatNumber } from "./i18n";
import { emptyReadingStats, type ReadingStats } from "./types";
export { emptyReadingStats, type ReadingStats };

export type PlaceUnlock =
  | {
      metric: "holidaySeconds";
      value: number;
      holidayId: string;
      fallbackSeconds: number;
      label: string;
    }
  | {
      metric: "activeSeconds" | "completedBooks" | "distinctReadingDays";
      value: number;
      label: string;
    };
export type Place = {
  id: string;
  event: string;
  title: string;
  category: "holiday" | "achievement";
  image: string;
  effects: { type: string; [key: string]: unknown }[];
  unlock: PlaceUnlock;
};
export const places = catalog as unknown as Place[];
export const placeSceneId = (id: string) => "place-" + id;
export function placeFor(sceneId: string): Place | undefined {
  return sceneId.startsWith("place-")
    ? places.find((p) => placeSceneId(p.id) === sceneId)
    : undefined;
}

const count = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
export function readingStats(value: unknown): ReadingStats {
  const v = (value && typeof value === "object" ? value : {}) as Partial<ReadingStats>;
  const holidays: Record<string, number> = {};
  for (const [id, s] of Object.entries(v.holidaySeconds || {}))
    if (count(s)) holidays[id] = count(s);
  return {
    activeSeconds: count(v.activeSeconds),
    readingDays: count(v.readingDays),
    lastReadingDay: typeof v.lastReadingDay === "string" ? v.lastReadingDay : "",
    holidaySeconds: holidays,
    unlocked: Array.isArray(v.unlocked)
      ? v.unlocked.filter((id) => places.some((p) => p.id === id))
      : [],
  };
}

/*
 * Celebration windows in local dates. Fixed dates and those computed from
 * Easter are exact; lunar and lunisolar dates are listed to 2035 and may be a
 * day off locally. Everyone gets every window: nothing is inferred about
 * country or faith. After 2035, or for a missed celebration, each place also
 * unlocks after its lifetime-hours fallback.
 */
type Window = [start: Date, days: number];
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const shift = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
function easter(year: number) {
  // Anonymous Gregorian algorithm.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return day(year, month, ((h + l - 7 * m + 114) % 31) + 1);
}
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = day(year, month, 1);
  return day(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
}
const table = (dates: string[], before: number, length: number) => (year: number) =>
  dates
    .filter((d) => +d.slice(0, 4) === year || +d.slice(0, 4) === year - 1)
    .map((d): Window => [shift(day(+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10)), -before), length]);
const windows: Record<string, (year: number) => Window[]> = {
  "new-year": (y) => [[day(y - 1, 12, 31), 3]],
  "lunar-new-year": table(
    ["2026-02-17", "2027-02-06", "2028-01-26", "2029-02-13", "2030-02-03", "2031-01-23", "2032-02-11", "2033-01-31", "2034-02-19", "2035-02-08"],
    1, 5,
  ),
  valentine: (y) => [[day(y, 2, 13), 3]],
  carnival: (y) => [[shift(easter(y), -51), 5]],
  nowruz: (y) => [[day(y, 3, 19), 5]],
  easter: (y) => [[shift(easter(y), -2), 4]],
  "earth-day": (y) => [[day(y, 4, 21), 3]],
  ramadan: table(
    ["2026-02-18", "2027-02-08", "2028-01-28", "2029-01-16", "2030-01-05", "2030-12-26", "2031-12-15", "2032-12-04", "2033-11-23", "2034-11-12", "2035-11-01"],
    0, 30,
  ),
  eid: table(
    ["2026-03-20", "2027-03-10", "2028-02-27", "2029-02-15", "2030-02-05", "2031-01-25", "2032-01-14", "2033-01-02", "2033-12-23", "2034-12-12", "2035-12-01"],
    1, 4,
  ),
  midsummer: (y) => [[day(y, 6, 19), 7]],
  "saint-jean": (y) => [[day(y, 6, 23), 3]],
  "national-day": (y) => [[day(y, 6, 30), 3]],
  // Thanksgiving in Canada (second Monday of October) and the United States
  // (fourth Thursday of November).
  harvest: (y) => [
    [shift(nthWeekday(y, 10, 1, 2), -2), 3],
    [nthWeekday(y, 11, 4, 4), 4],
  ],
  halloween: (y) => [[day(y, 10, 30), 2]],
  "dia-de-muertos": (y) => [[day(y, 10, 31), 3]],
  diwali: table(
    ["2026-11-08", "2027-10-29", "2028-10-17", "2029-11-05", "2030-10-26", "2031-11-14", "2032-11-02", "2033-10-22", "2034-11-10", "2035-10-30"],
    2, 5,
  ),
  hanukkah: table(
    ["2026-12-04", "2027-12-24", "2028-12-12", "2029-12-01", "2030-12-20", "2031-12-09", "2032-11-27", "2033-12-16", "2034-12-06", "2035-12-25"],
    0, 9,
  ),
  christmas: (y) => [[day(y, 12, 23), 4]],
  "winter-solstice": (y) => [[day(y, 12, 20), 4]],
};
// Celebrations whose window includes this local date.
export function celebrationsOn(date: Date): string[] {
  const today = day(date.getFullYear(), date.getMonth() + 1, date.getDate()).getTime();
  return Object.entries(windows)
    .filter(([, of]) =>
      [date.getFullYear(), date.getFullYear() + 1].some((y) =>
        of(y).some(([start, days]) => today >= start.getTime() && today < shift(start, days).getTime()),
      ),
    )
    .map(([id]) => id);
}
export const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function earned(place: Place, stats: ReadingStats, completedBooks: number) {
  const u = place.unlock;
  if (u.metric === "holidaySeconds")
    return (stats.holidaySeconds[u.holidayId] || 0) >= u.value || stats.activeSeconds >= u.fallbackSeconds;
  const have = u.metric === "activeSeconds" ? stats.activeSeconds : u.metric === "completedBooks" ? completedBooks : stats.readingDays;
  return have >= u.value;
}
// Earned places never lock again, even if a finished book is deleted.
export function unlockedPlaces(stats: ReadingStats, completedBooks: number): string[] {
  const ids = new Set(stats.unlocked);
  for (const p of places) if (earned(p, stats, completedBooks)) ids.add(p.id);
  return places.filter((p) => ids.has(p.id)).map((p) => p.id);
}

const hours = (seconds: number) => {
  const h = seconds / 3600;
  return h < 1 ? t("{minutes} min", { minutes: Math.floor(seconds / 60) }) : t("{hours} h", { hours: formatNumber(Math.floor(h * 10) / 10) });
};
// How to unlock a place, and how far along the reader is.
export function unlockHint(place: Place, stats: ReadingStats, completedBooks: number): { how: string; progress: string } {
  const u = place.unlock;
  if (u.metric === "holidaySeconds")
    return {
      how: t("Read or listen for 20 minutes during {event}.", { event: t(place.event) }),
      progress: t("Or reach {total} of reading in all. So far: {done}.", {
        total: hours(u.fallbackSeconds),
        done: hours(stats.activeSeconds),
      }),
    };
  if (u.metric === "activeSeconds")
    return {
      how: t("Read or listen for {total} in all.", { total: hours(u.value) }),
      progress: t("So far: {done}.", { done: hours(stats.activeSeconds) }),
    };
  if (u.metric === "completedBooks")
    return {
      how: u.value === 1 ? t("Finish your first book.") : t("Finish {count} books.", { count: u.value }),
      progress: t("Finished so far: {count}.", { count: completedBooks }),
    };
  return {
    how: t("Read on {count} different days.", { count: u.value }),
    progress: t("Days so far: {count}.", { count: stats.readingDays }),
  };
}
