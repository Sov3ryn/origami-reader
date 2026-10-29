import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { celebrationsOn, localDay, readingStats } from "./places";
import { unlockedAll } from "./rewards";
import { listenForFeats } from "./feats";
import type { Preferences } from "./types";

const TICK = 5_000;
const IDLE = 120_000;
const SAVE_EVERY = 60;

/*
 * Counts reading and listening time for places, themes, finishes and ribbons. A second counts while a book
 * is open in Read mode and either the voice is reading or the window is in
 * view with some input in the last two minutes, so idle time and reading with
 * narration at once are not counted twice. Time is added to the settings
 * once a minute and when the window is hidden.
 */
export function useReadingStats(
  ready: boolean,
  reading: boolean,
  listening: boolean,
  completedBooks: number,
  setPrefs: Dispatch<SetStateAction<Preferences>>,
) {
  const pending = useRef(0);
  const active = useRef(Date.now());
  const state = useRef({ reading, listening });
  state.current = { reading, listening };
  const books = useRef(completedBooks);
  books.current = completedBooks;
  useEffect(() => {
    if (!ready) return;
    const commit = () => {
      const seconds = pending.current;
      pending.current = 0;
      setPrefs((prefs) => {
        const stats = readingStats(prefs.readingStats);
        if (seconds > 0) {
          const now = new Date(), today = localDay(now);
          stats.activeSeconds += seconds;
          if (stats.lastReadingDay !== today) {
            stats.readingDays += 1;
            stats.lastReadingDay = today;
            stats.daySeconds = 0;
          }
          stats.daySeconds += seconds;
          // Secret achievements: the hour of reading, and a long day.
          const hour = now.getHours();
          const feats = new Set(stats.feats);
          if (hour < 4) feats.add("midnight");
          else if (hour < 7) feats.add("early");
          if (stats.daySeconds >= 2 * 3600) feats.add("marathon");
          stats.feats = [...feats];
          for (const id of celebrationsOn(now))
            stats.holidaySeconds[id] = (stats.holidaySeconds[id] || 0) + seconds;
        }
        const unlocked = unlockedAll(stats, books.current, prefs);
        if (!seconds && unlocked.length === stats.unlocked.length) return prefs;
        return { ...prefs, readingStats: { ...stats, unlocked } };
      });
    };
    const touched = () => {
      active.current = Date.now();
    };
    let last = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now(), elapsed = Math.min(now - last, TICK * 2) / 1000;
      last = now;
      const { reading, listening } = state.current;
      const present = !document.hidden && now - active.current < IDLE;
      if (reading && (listening || present)) pending.current += elapsed;
      if (pending.current >= SAVE_EVERY) commit();
    }, TICK);
    const hidden = () => {
      if (document.hidden && pending.current >= 1) commit();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
    for (const e of events) window.addEventListener(e, touched, { passive: true });
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", commit);
    return () => {
      clearInterval(timer);
      for (const e of events) window.removeEventListener(e, touched);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", commit);
      if (pending.current >= 1) commit();
    };
  }, [ready, setPrefs]);
  // A part of Origami tried for the first time. "mode-read", "mode-work" and
  // "mode-studio" count the modes used in a day, for the Wanderer.
  useEffect(() => {
    if (!ready) return;
    const tried = (id: string) => {
      setPrefs((prefs) => {
        const stats = readingStats(prefs.readingStats);
        const feats = new Set(stats.feats);
        if (id.startsWith("mode-")) {
          const today = localDay(new Date());
          const modes = new Set(stats.modesDay === today ? stats.dayModes : []);
          modes.add(id.slice(5));
          if (modes.size === stats.dayModes.length && stats.modesDay === today) return prefs;
          stats.dayModes = [...modes];
          stats.modesDay = today;
          if (["read", "work", "studio"].every((m) => modes.has(m))) feats.add("wanderer");
        } else {
          if (feats.has(id)) return prefs;
          feats.add(id);
        }
        stats.feats = [...feats];
        return { ...prefs, readingStats: { ...stats, unlocked: unlockedAll(stats, books.current, prefs) } };
      });
    };
    return listenForFeats(tried);
  }, [ready, setPrefs]);
  // Finishing a book can unlock a place or a theme straight away. On start,
  // the theme, finishes and ribbon already chosen are kept for good.
  useEffect(() => {
    if (!ready) return;
    setPrefs((prefs) => {
      const stats = readingStats(prefs.readingStats);
      const unlocked = unlockedAll(stats, completedBooks, prefs);
      return unlocked.length === stats.unlocked.length
        ? prefs
        : { ...prefs, readingStats: { ...stats, unlocked } };
    });
  }, [ready, completedBooks, setPrefs]);
}
