import { t } from "../i18n";
import { useSyncExternalStore } from "react";

const fmt = (s: number) =>
  Math.floor(s / 60) +
  ":" +
  Math.floor(s % 60)
    .toString()
    .padStart(2, "0");

type Clock = {
  getTime: () => number;
  subscribeTime: (listener: () => void) => () => void;
  duration: number;
  seek: (n: number) => void;
};

// Subscribes to playback time on its own, so time updates repaint only these
// small controls instead of the library or the book pages.
export function PlaybackTimeLabel({ clock }: { clock: Clock }) {
  const time = useSyncExternalStore(clock.subscribeTime, clock.getTime);
  return (
    <span className="playback-time">
      {fmt(time)} / {fmt(clock.duration)}
    </span>
  );
}
export function PlaybackSeek({ clock }: { clock: Clock }) {
  const time = useSyncExternalStore(clock.subscribeTime, clock.getTime);
  return (
    <input
      type="range"
      aria-label={t("Seek in current passage")}
      min="0"
      max={clock.duration || 1}
      step=".1"
      disabled={!clock.duration}
      value={Math.min(time, clock.duration || 1)}
      onChange={(e) => clock.seek(+e.target.value)}
    />
  );
}
