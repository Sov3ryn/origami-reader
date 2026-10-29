import { describe, expect, it } from "vitest";
import { edgeFinishes } from "../src/binding";
import { emptyReadingStats, places, readingStats } from "../src/places";
import {
  freeBookmarks,
  freeFinishes,
  freeThemes,
  isOpen,
  placeOpen,
  placesOpen,
  requirementOf,
  rewardHint,
  rewardsOf,
  unlockedAll,
} from "../src/rewards";
import { achievements } from "../src/achievements";
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
    // The default bookmark moves and is open to everyone.
    expect(isOpen("bookmark", defaultPreferences.bookmarkDesign, fresh, false)).toBe(true);
    expect(freeBookmarks).toContain(defaultPreferences.bookmarkDesign);
    expect(requirementOf("bookmark", "plum-crane-ribbon")).toBeUndefined();
  });
  it("unlocks items as reading time, days and finished books add up", () => {
    const s = stats({ activeSeconds: hours(5), readingDays: 3 });
    const ids = unlockedAll(s, 3);
    expect(ids).toContain("theme:lake");
    expect(ids).toContain("theme:navy");
    expect(ids).toContain("theme:coral");
    expect(ids).toContain("theme:amber");
    expect(ids).toContain("bookmark:gilded-stag-leather");
    expect(ids).not.toContain("theme:forest");
    expect(ids).not.toContain("finish:gold");
    // The places those numbers earn come first, as before.
    expect(ids.slice(0, 2)).toEqual(["rainy-bookshop", "midnight-express"]);
  });
  it("unlocks items for parts of Origami tried once", () => {
    const fresh = unlockedAll(stats(), 0);
    expect(fresh).not.toContain("bookmark:woodland-owl");
    const ids = unlockedAll(stats({ feats: ["day-night", "binding", "restyle"] }), 0);
    expect(ids).toEqual(expect.arrayContaining(["bookmark:woodland-owl", "finish:silver", "theme:forest", "theme:sky"]));
    expect(ids).not.toContain("bookmark:sands-of-time");
  });
  it("gives every achievement a reward and every reward one achievement", () => {
    const seen = new Set<string>();
    for (const a of achievements) {
      const ids = rewardsOf(a);
      expect(ids.length, a.id).toBeGreaterThan(0);
      for (const id of ids) {
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
      expect(Boolean(a.feat) !== Boolean(a.metric), a.id).toBe(true);
    }
  });
  it("counts celebration places toward their goals", () => {
    const holiday = places.find((p) => p.category === "holiday")!;
    expect(unlockedAll(stats(), 0)).not.toContain("theme:petrol");
    expect(unlockedAll(stats({ unlocked: [holiday.id] }), 0)).toContain("theme:petrol");
  });
  it("never takes away what is chosen or already earned", () => {
    const prefs = { ...defaultPreferences, theme: "aurora", ribbonColor: "plum", binding: { edges: "gold" as const } };
    const ids = unlockedAll(stats(), 0, prefs, false);
    expect(ids).toEqual(expect.arrayContaining(["theme:aurora", "ribbon:plum", "finish:gold"]));
    const later = readingStats({ ...stats(), unlocked: ids });
    expect(isOpen("theme", "aurora", later, false)).toBe(true);
    expect(unlockedAll(later, 0)).toContain("theme:aurora");
    // A development build opens everything, so its choices are not kept.
    expect(unlockedAll(stats(), 0, prefs, true)).not.toContain("theme:aurora");
  });
  it("keeps every kind of earned id when progress is read back", () => {
    const ids = ["theme:lake", "finish:silver", "ribbon:amber", "bookmark:plum-crane-ribbon", "elsewhere:x"];
    expect(readingStats({ ...stats(), unlocked: ids }).unlocked).toEqual(ids.slice(0, 4));
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
    expect(hint.how).toBe("Read or listen for 100 h in all.");
    expect(hint.progress).toBe("So far: 3 h.");
    expect(rewardHint("theme", "plum", stats(), 0)).toBeNull();
    expect(rewardHint("ribbon", "orange", stats(), 0)!.how).toBe("Unlock 3 celebration places by reading during their months.");
    expect(rewardHint("bookmark", "woodland-owl", stats(), 0)).toEqual({ how: "Switch between day and night.", progress: "Achievement: Night owl" });
    expect(rewardHint("bookmark", "wandering-blue-box", stats(), 0)!.how).toBe("A secret achievement. Keep exploring Origami.");
  });
});
