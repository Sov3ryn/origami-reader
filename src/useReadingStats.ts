import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { celebrationsOn, localDay, readingStats, unlockedPlaces } from "./places";
import type { Preferences } from "./types";

const TICK = 5_000;
const IDLE = 120_000;
const SAVE_EVERY = 60;

/*
 * Counts reading and listening time for places. A second counts while a book
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
          }
          for (const id of celebrationsOn(now))
            stats.holidaySeconds[id] = (stats.holidaySeconds[id] || 0) + seconds;
        }
        const unlocked = unlockedPlaces(stats, books.current);
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
  // Finishing a book can unlock a place straight away.
  useEffect(() => {
    if (!ready) return;
    setPrefs((prefs) => {
      const stats = readingStats(prefs.readingStats);
      const unlocked = unlockedPlaces(stats, completedBooks);
      return unlocked.length === stats.unlocked.length
        ? prefs
        : { ...prefs, readingStats: { ...stats, unlocked } };
    });
  }, [ready, completedBooks, setPrefs]);
}
