// Synced by scripts/sync-appearance.mjs from the reader's visual components.
import { useEffect, useState } from "react";

type FeedingSpot = { id: number; left: number; top: number; width: number };

// These coordinates stay inside open water in the shared lake artwork.
function feedingSpot(id: number, previous?: FeedingSpot): FeedingSpot {
  let left = 39 + Math.random() * 48;
  let top = 56 + Math.random() * 21;
  if (
    previous &&
    Math.abs(left - previous.left) < 12 &&
    Math.abs(top - previous.top) < 7
  ) {
    left = left < 63 ? left + 20 : left - 20;
    top = top < 66 ? top + 8 : top - 8;
  }
  return { id, left, top, width: 8 + (top - 56) * 0.22 };
}

export function FishRipples() {
  const [spot, setSpot] = useState<FeedingSpot | null>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    let previous: FeedingSpot | undefined;
    let sequence = 0;
    const allowed = () => !document.hidden && !reduced.matches;
    const appear = () => {
      if (!allowed()) return;
      previous = feedingSpot(++sequence, previous);
      setSpot(previous);
      // One short disturbance, then still water until the next feeding event.
      timer = setTimeout(appear, 28000 + Math.random() * 27000);
    };
    const activity = () => {
      clearTimeout(timer);
      setSpot(null);
      if (allowed()) timer = setTimeout(appear, 10000 + Math.random() * 12000);
    };
    activity();
    document.addEventListener("visibilitychange", activity);
    reduced.addEventListener("change", activity);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", activity);
      reduced.removeEventListener("change", activity);
    };
  }, []);
  return (
    spot && (
      <div
        key={spot.id}
        className="fish-feeding"
        style={{
          left: spot.left + "%",
          top: spot.top + "%",
          width: spot.width + "%",
        }}
      >
        {[0, 1, 2].map((ring) => (
          <span
            key={ring}
            className="ambient-layer fish-ring"
            style={{ animationDelay: ring * 1.2 + "s" }}
          />
        ))}
      </div>
    )
  );
}
