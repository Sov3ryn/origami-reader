import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  applyTimeOfDay,
  desiredTime,
  sceneFor,
  getBackground,
  sceneTime,
  seasonalScene,
  switchBackground,
} from "./backgrounds";
import type { Preferences } from "./types";

// Keeps the scene on the current season and/or time of day when those modes
// are enabled. Rechecks every minute, at focus, and when Windows switches
// between light and dark appearance.
export function useSeasonalBackground(
  ready: boolean,
  prefs: Pick<
    Preferences,
    | "backgroundMode"
    | "seasonHemisphere"
    | "timeMode"
    | "dayStarts"
    | "nightStarts"
  >,
  setPrefs: Dispatch<SetStateAction<Preferences>>,
) {
  const { backgroundMode, seasonHemisphere, timeMode, dayStarts, nightStarts } =
    prefs;
  useEffect(() => {
    if (!ready || (backgroundMode !== "seasonal" && timeMode === "manual"))
      return;
    const refresh = () => {
      if (document.hidden) return;
      const now = new Date();
      setPrefs((current) => {
        if (current.backgroundMode === "seasonal") {
          const time = desiredTime(current, now) || sceneTime(current.scene);
          return switchBackground(
            current,
            sceneFor(
              seasonalScene(now, current.seasonHemisphere),
              time,
              getBackground(current.scene).location,
            ),
          );
        }
        return applyTimeOfDay(current, now);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    const scheme =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-color-scheme: dark)")
        : null;
    scheme?.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      scheme?.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [
    ready,
    backgroundMode,
    seasonHemisphere,
    timeMode,
    dayStarts,
    nightStarts,
    setPrefs,
  ]);
}
