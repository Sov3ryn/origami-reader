// Themes, binding finishes, ribbon colours and bookmarks earned by using
// Origami. A few of each are open from the start (including both high
// contrast themes); the rest come with achievements (achievements.ts): reading
// time, days, finished books and celebrations, or trying parts of the app.
// Supporting Origami unlocks everything at once, places included, and
// achievements keep counting. Earned items never lock again, and whatever is
// already chosen stays available.
import { achieved, achievements, type Achievement } from "./achievements";
import { t } from "./i18n";
import {
  places,
  requirementHint,
  unlockedPlaces,
} from "./places";
import type { Preferences, ReadingStats } from "./types";

export type RewardKind = "theme" | "finish" | "ribbon" | "bookmark";

// Donations are not linked to the app yet, so supporter unlocks can only be
// previewed in development builds. There, setting localStorage
// "origami.devLocks" to "1" shows the locks as a new reader sees them.
export const isSupporter = () => import.meta.env.DEV && !devLocks();
function devLocks() {
  try {
    return localStorage.getItem("origami.devLocks") === "1";
  } catch {
    return false;
  }
}

export const freeThemes = ["plum", "graphite", "white", "parchment", "contrast-dark", "contrast-light"];
export const freeFinishes = ["plain"];
// The default bookmark, so every reader starts with one that moves.
export const freeBookmarks = ["plum-crane-ribbon"];

export const rewardId = (kind: RewardKind, id: string) => kind + ":" + id;
// The reward ids of an achievement.
export function rewardsOf(a: Achievement): string[] {
  return [
    ...(a.themes || []).map((id) => rewardId("theme", id)),
    ...(a.finishes || []).map((id) => rewardId("finish", id)),
    ...(a.ribbons || []).map((id) => rewardId("ribbon", id)),
    ...(a.bookmarks || []).map((id) => rewardId("bookmark", id)),
  ];
}
const goals = new Map<string, Achievement>();
for (const a of achievements) for (const id of rewardsOf(a)) goals.set(id, a);

/** The achievement that unlocks an item, or undefined when it is open to everyone. */
export function requirementOf(kind: RewardKind, id: string): Achievement | undefined {
  return goals.get(rewardId(kind, id));
}

/** Whether an item can be chosen: free, earned, or unlocked by supporting. */
export function isOpen(kind: RewardKind, id: string, stats: ReadingStats, supporter = isSupporter()) {
  return supporter || !goals.has(rewardId(kind, id)) || stats.unlocked.includes(rewardId(kind, id));
}

/** Whether a place can be chosen. */
export function placeOpen(id: string, stats: ReadingStats, supporter = isSupporter()) {
  return supporter || stats.unlocked.includes(id);
}

/** How to unlock an item and how far along the reader is. */
export function rewardHint(kind: RewardKind, id: string, stats: ReadingStats, completedBooks: number) {
  const a = requirementOf(kind, id);
  if (!a) return null;
  if (a.metric) return requirementHint(a.metric, a.value!, stats, completedBooks);
  return a.secret
    ? { how: t("A secret achievement. Keep exploring Origami."), progress: "" }
    : { how: t(a.goal), progress: t("Achievement: {name}", { name: t(a.name) }) };
}

// The ids of the items chosen now, so updating Origami never takes away a
// theme, finish or ribbon someone already uses.
function chosen(prefs: Preferences): string[] {
  const ids = [rewardId("theme", prefs.theme)];
  for (const part of ["edges", "spine", "cover"] as const) {
    const finish = prefs.binding?.[part];
    if (finish) ids.push(rewardId("finish", finish));
  }
  if (prefs.ribbonColor) ids.push(rewardId("ribbon", prefs.ribbonColor));
  if (prefs.bookmarkDesign) ids.push(rewardId("bookmark", prefs.bookmarkDesign));
  return ids.filter((id) => goals.has(id));
}

/** Places, then earned and kept items: what stats.unlocked should hold. */
export function unlockedAll(stats: ReadingStats, completedBooks: number, prefs?: Preferences, supporter = isSupporter()): string[] {
  const withPlaces = { ...stats, unlocked: unlockedPlaces(stats, completedBooks) };
  const ids = new Set(withPlaces.unlocked);
  for (const a of achievements)
    if (achieved(a, withPlaces, completedBooks)) for (const id of rewardsOf(a)) ids.add(id);
  // Development builds open everything, so a choice made there is not one
  // the reader earned; keeping it would unlock it in the installed app too,
  // which shares the same data folder.
  if (prefs && !supporter) for (const id of chosen(prefs)) ids.add(id);
  return [...ids];
}

/** How many places are open, for the gallery's count. */
export function placesOpen(stats: ReadingStats, supporter = isSupporter()) {
  return supporter ? places.length : places.filter((p) => stats.unlocked.includes(p.id)).length;
}
