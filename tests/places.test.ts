import { describe, expect, it } from "vitest";
import {
  celebrationMonth,
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
  it("opens each celebration for its whole month", () => {
    expect(on(2026, 12, 2)).toEqual(expect.arrayContaining(["christmas", "winter-solstice", "hanukkah"]));
    expect(on(2027, 1, 20)).toContain("new-year");
    expect(on(2026, 12, 31)).not.toContain("new-year");
    // Easter 2026 is 5 April; Mardi Gras (17 February) is 47 days before.
    expect(on(2026, 4, 28)).toContain("easter");
    expect(on(2026, 2, 3)).toEqual(expect.arrayContaining(["carnival", "ramadan", "valentine", "lunar-new-year"]));
    // Ramadan 2026 runs from 18 February into March, so both months count.
    expect(on(2026, 3, 30)).toEqual(expect.arrayContaining(["ramadan", "eid", "nowruz"]));
    // Thanksgiving in Canada (October) and the United States (November).
    expect(on(2026, 10, 2)).toEqual(expect.arrayContaining(["harvest", "halloween"]));
    expect(on(2026, 11, 20)).toEqual(expect.arrayContaining(["harvest", "dia-de-muertos", "diwali"]));
    // Hanukkah 2027 starts on 24 December and ends in January 2028.
    expect(on(2028, 1, 15)).toContain("hanukkah");
    expect(on(2026, 8, 10)).toEqual([]);
    expect(celebrationMonth("ramadan", new Date(2026, 9, 26))).toEqual(new Date(2027, 1, 1));
    expect(celebrationMonth("halloween", new Date(2026, 9, 26))).toEqual(new Date(2026, 9, 1));
    expect(celebrationMonth("eid", new Date(2036, 0, 1))).toBeNull();
  });
  it("unlocks by reading time, days, books and celebration time, and never locks again", () => {
    const stats = readingStats({ ...emptyReadingStats, activeSeconds: 3600 });
    expect(unlockedPlaces(stats, 0)).toEqual(["rainy-bookshop"]);
    expect(unlockedPlaces(readingStats({ readingDays: 7 }), 0)).toContain("fox-retreat");
    expect(unlockedPlaces(readingStats({}), 1)).toContain("midnight-express");
    expect(unlockedPlaces(readingStats({ holidaySeconds: { halloween: 1200 } }), 0)).toEqual(["halloween"]);
    expect(unlockedPlaces(readingStats({ unlocked: ["glasshouse", "unknown"] }), 0)).toEqual(["glasshouse"]);
    // Celebrations have no other way in: reading time alone never opens them.
    expect(unlockedPlaces(readingStats({ activeSeconds: 400 * 3600 }), 0)).not.toContain("new-year");
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
    const halloween = places.find((p) => p.id === "halloween")!;
    expect(unlockHint(halloween, readingStats({ holidaySeconds: { halloween: 300 } }), 0, new Date(2026, 9, 26))).toEqual({
      how: "Read or listen for 20 minutes in the month of Halloween.",
      progress: "Open now, until the end of October 2026. So far: 5 min of 20 min.",
    });
    const christmas = places.find((p) => p.id === "christmas")!;
    expect(unlockHint(christmas, readingStats({}), 0, new Date(2026, 9, 26)).progress).toBe("Opens in December 2026.");
    expect(localDay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
