import { describe, expect, it } from "vitest";
import { edgeFinishes } from "../src/binding";
import { emptyReadingStats, places, readingStats } from "../src/places";
import {
  freeFinishes,
  freeThemes,
  isOpen,
  placeOpen,
  placesOpen,
  requirementOf,
  rewardHint,
  unlockedAll,
} from "../src/rewards";
import { annotationColors, themes } from "../src/themes";
import { defaultPreferences, type ReadingStats } from "../src/types";

const stats = (patch: Partial<ReadingStats> = {}): ReadingStats => ({ ...emptyReadingStats, ...patch });
const hours = (n: number) => n * 3600;

describe("earned themes, finishes and ribbons", () => {
  it("gives every locked item exactly one goal, and keeps a free set", () => {
    for (const th of themes)
      expect(freeThemes.includes(th.id) !== Boolean(requirementOf("theme", th.id)), th.id).toBe(true);
    for (const f of edgeFinishes)
      expect(freeFinishes.includes(f.id) !== Boolean(requirementOf("finish", f.id)), f.id).toBe(true);
    for (const c of annotationColors) expect(requirementOf("ribbon", c.id), c.id).toBeTruthy();
    expect(freeThemes).toContain("contrast-dark");
    expect(freeThemes).toContain("contrast-light");
    expect(freeThemes).toContain(defaultPreferences.theme);
  });
  it("keeps everything locked except the free set for a new reader", () => {
    const fresh = stats();
    expect(isOpen("theme", "plum", fresh, false)).toBe(true);
    expect(isOpen("theme", "lake", fresh, false)).toBe(false);
    expect(isOpen("finish", "plain", fresh, false)).toBe(true);
    expect(isOpen("finish", "gold", fresh, false)).toBe(false);
    expect(isOpen("ribbon", "amber", fresh, false)).toBe(false);
  });
  it("unlocks items as reading time, days and finished books add up", () => {
    const s = stats({ activeSeconds: hours(5), readingDays: 3 });
    const ids = unlockedAll(s, 2);
    expect(ids).toContain("theme:lake");
    expect(ids).toContain("theme:forest");
    expect(ids).toContain("finish:silver");
    expect(ids).toContain("ribbon:amber");
    expect(ids).toContain("theme:copper");
    expect(ids).not.toContain("theme:indigo");
    expect(ids).not.toContain("finish:gold");
    // The places those numbers earn come first, as before.
    expect(ids.slice(0, 2)).toEqual(["rainy-bookshop", "midnight-express"]);
  });
  it("counts celebration places toward their goals", () => {
    const holiday = places.find((p) => p.category === "holiday")!;
    expect(unlockedAll(stats(), 0)).not.toContain("theme:coral");
    expect(unlockedAll(stats({ unlocked: [holiday.id] }), 0)).toContain("theme:coral");
  });
  it("never takes away what is chosen or already earned", () => {
    const prefs = { ...defaultPreferences, theme: "aurora", ribbonColor: "plum", binding: { edges: "gold" as const } };
    const ids = unlockedAll(stats(), 0, prefs);
    expect(ids).toEqual(expect.arrayContaining(["theme:aurora", "ribbon:plum", "finish:gold"]));
    const later = readingStats({ ...stats(), unlocked: ids });
    expect(isOpen("theme", "aurora", later, false)).toBe(true);
    expect(unlockedAll(later, 0)).toContain("theme:aurora");
  });
  it("opens everything for supporters, places included", () => {
    const fresh = stats();
    expect(isOpen("finish", "gold", fresh, true)).toBe(true);
    expect(isOpen("theme", "aurora", fresh, true)).toBe(true);
    expect(placeOpen(places[0].id, fresh, true)).toBe(true);
    expect(placesOpen(fresh, true)).toBe(places.length);
    expect(placesOpen(fresh, false)).toBe(0);
  });
  it("says how to earn an item and how far along the reader is", () => {
    const hint = rewardHint("finish", "gold", stats({ activeSeconds: hours(3) }), 0)!;
    expect(hint.how).toBe("Read or listen for 150 h in all.");
    expect(hint.progress).toBe("So far: 3 h.");
    expect(rewardHint("theme", "plum", stats(), 0)).toBeNull();
    expect(rewardHint("theme", "petrol", stats(), 0)!.how).toBe("Unlock 3 celebration places by reading during their months.");
  });
});
