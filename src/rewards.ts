// Themes, binding finishes and bookmark ribbons earned by using Origami. A
// few of each are open from the start (including both high contrast themes);
// the rest unlock with reading time, reading days, finished books or
// celebration places, a little harder than the places. Supporting Origami
// unlocks everything at once, places included, and achievements keep
// counting. Earned items never lock again, and whatever is already chosen
// stays available.
import {
  goalProgress,
  places,
  requirementHint,
  unlockedPlaces,
  type GoalMetric,
} from "./places";
import type { Preferences, ReadingStats } from "./types";

export type RewardKind = "theme" | "finish" | "ribbon";
export type Requirement = { metric: GoalMetric; value: number };

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

const h = (n: number): Requirement => ({ metric: "activeSeconds", value: n * 3600 });
const days = (n: number): Requirement => ({ metric: "distinctReadingDays", value: n });
const books = (n: number): Requirement => ({ metric: "completedBooks", value: n });
const parties = (n: number): Requirement => ({ metric: "celebrations", value: n });

// Each step: the goal, then the themes, finishes and ribbons it unlocks. Dark
// and light themes come in pairs.
export const ladder: [Requirement, string[], string[], string[]][] = [
  [h(2), ["lake", "sage"], [], []],
  [days(3), ["forest", "sky"], [], ["amber", "blue", "rose"]],
  [h(5), ["navy", "lavender"], ["silver"], []],
  [books(2), ["copper", "rose"], [], []],
  [days(10), ["nordic", "nordic-snow"], [], ["mint", "cyan", "slate"]],
  [h(12), ["indigo", "seafoam"], [], []],
  [parties(1), ["coral", "apricot"], [], []],
  [books(4), [], ["copper"], ["orange", "red", "pink"]],
  [h(20), ["olive", "olive-paper"], [], []],
  [days(20), ["burgundy", "berry"], ["gunmetal"], []],
  [books(6), ["amber", "honey"], [], []],
  [h(35), ["teahouse", "stone"], [], ["plum", "olive", "lavender"]],
  [parties(3), ["petrol", "newsprint"], ["rose-gold"], []],
  [days(45), ["ember", "peach"], [], []],
  [h(60), ["orchid", "crimson"], [], []],
  [books(12), ["aurora", "mossrose"], [], []],
  [h(150), [], ["gold"], []],
];

export const rewardId = (kind: RewardKind, id: string) => kind + ":" + id;
const goals = new Map<string, Requirement>();
for (const [goal, themes, finishes, ribbons] of ladder) {
  for (const id of themes) goals.set(rewardId("theme", id), goal);
  for (const id of finishes) goals.set(rewardId("finish", id), goal);
  for (const id of ribbons) goals.set(rewardId("ribbon", id), goal);
}

/** The goal that unlocks an item, or undefined when it is open to everyone. */
export function requirementOf(kind: RewardKind, id: string): Requirement | undefined {
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
  const goal = requirementOf(kind, id);
  return goal ? requirementHint(goal.metric, goal.value, stats, completedBooks) : null;
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
  return ids.filter((id) => goals.has(id));
}

/** Places, then earned and kept items: what stats.unlocked should hold. */
export function unlockedAll(stats: ReadingStats, completedBooks: number, prefs?: Preferences): string[] {
  const withPlaces = { ...stats, unlocked: unlockedPlaces(stats, completedBooks) };
  const ids = new Set(withPlaces.unlocked);
  for (const [id, goal] of goals)
    if (goalProgress(goal.metric, withPlaces, completedBooks) >= goal.value) ids.add(id);
  if (prefs) for (const id of chosen(prefs)) ids.add(id);
  return [...ids];
}

/** How many places are open, for the gallery's count. */
export function placesOpen(stats: ReadingStats, supporter = isSupporter()) {
  return supporter ? places.length : places.filter((p) => stats.unlocked.includes(p.id)).length;
}
