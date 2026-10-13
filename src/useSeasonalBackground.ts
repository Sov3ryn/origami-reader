import { useEffect, type Dispatch, type SetStateAction } from "react";
import { seasonalScene, switchBackground } from "./backgrounds";
import type { Preferences } from "./types";

export function useSeasonalBackground(
  ready: boolean,
  mode: Preferences["backgroundMode"],
  hemisphere: Preferences["seasonHemisphere"],
  setPrefs: Dispatch<SetStateAction<Preferences>>,
) {
  useEffect(() => {
    if (!ready || mode !== "seasonal") return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const now = new Date();
      setPrefs((prefs) =>
        switchBackground(prefs, seasonalScene(now, hemisphere)),
      );
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = setTimeout(refresh, tomorrow.getTime() - now.getTime() + 100);
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [ready, mode, hemisphere, setPrefs]);
}
