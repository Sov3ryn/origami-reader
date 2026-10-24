import { describe, expect, it } from "vitest";
import {
  celebrationsOn,
  localDay,
  places,
  readingStats,
  unlockHint,
  unlockedPlaces,
} from "../src/places";
import { getBackground } from "../src/backgrounds";
import { emptyReadingStats } from "../src/types";

const on = (y: number, m: number, d: number) => celebrationsOn(new Date(y, m - 1, d, 12));

describe("places to read", () => {
  it("lists 19 celebrations and 12 reading milestones as scenes", () => {
    expect(places.filter((p) => p.category === "holiday")).toHaveLength(19);
    expect(places.filter((p) => p.category === "achievement")).toHaveLength(12);
    const scene = getBackground("place-christmas");
    expect(scene.place?.title).toBe("The Christmas Eve Library");
    expect(scene.image).toBe("/places/christmas.webp");
  });
  it("opens celebrations on their local dates", () => {
    expect(on(2026, 12, 24)).toContain("christmas");
    expect(on(2027, 1, 1)).toContain("new-year");
    expect(on(2026, 12, 31)).toContain("new-year");
    // Easter 2026 is 5 April; Mardi Gras is 47 days before.
    expect(on(2026, 4, 5)).toContain("easter");
    expect(on(2026, 2, 17)).toContain("carnival");
    // Thanksgiving: 12 October 2026 in Canada, 26 November in the United States.
    expect(on(2026, 10, 12)).toContain("harvest");
    expect(on(2026, 11, 26)).toContain("harvest");
    // A window that crosses the new year (Hanukkah from 24 December 2027).
    expect(on(2028, 1, 1)).toContain("hanukkah");
    expect(on(2026, 3, 1)).toContain("ramadan");
    expect(on(2026, 8, 10)).toEqual([]);
  });
  it("unlocks by reading time, days, books and celebration time, and never locks again", () => {
    const stats = readingStats({ ...emptyReadingStats, activeSeconds: 3600 });
    expect(unlockedPlaces(stats, 0)).toEqual(["rainy-bookshop"]);
    expect(unlockedPlaces(readingStats({ readingDays: 7 }), 0)).toContain("fox-retreat");
    expect(unlockedPlaces(readingStats({}), 1)).toContain("midnight-express");
    expect(unlockedPlaces(readingStats({ holidaySeconds: { halloween: 1200 } }), 0)).toEqual(["halloween"]);
    expect(unlockedPlaces(readingStats({ unlocked: ["glasshouse", "unknown"] }), 0)).toEqual(["glasshouse"]);
    // The lifetime fallback opens a missed celebration.
    const fallback = places.find((p) => p.id === "new-year")!.unlock;
    expect(fallback.metric).toBe("holidaySeconds");
    if (fallback.metric === "holidaySeconds")
      expect(unlockedPlaces(readingStats({ activeSeconds: fallback.fallbackSeconds }), 0)).toContain("new-year");
  });
  it("ignores damaged statistics", () => {
    expect(readingStats({ activeSeconds: -5, readingDays: "x", holidaySeconds: { a: NaN }, unlocked: "no" })).toEqual(emptyReadingStats);
    expect(readingStats(null)).toEqual(emptyReadingStats);
  });
  it("explains how to unlock a place", () => {
    const bookshop = places.find((p) => p.id === "rainy-bookshop")!;
    expect(unlockHint(bookshop, readingStats({ activeSeconds: 600 }), 0)).toEqual({
      how: "Read or listen for 1 h in all.",
      progress: "So far: 10 min.",
    });
    const train = places.find((p) => p.id === "midnight-express")!;
    expect(unlockHint(train, readingStats({}), 0).how).toBe("Finish your first book.");
    expect(localDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
