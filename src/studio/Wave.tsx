import { useEffect, useState } from "react";
import type { Take } from "./production";
import { takeUrl } from "./usePlayback";

// A take's waveform as a row of bars, read from its audio once and kept for
// the session. Until it is read (or when it cannot be, outside the desktop
// app) the bars are flat.
const peaksCache = new Map<string, number[]>();

async function peaksOf(production: string, take: Take, bars: number) {
  const key = `${production}/${take.file}/${bars}`;
  const known = peaksCache.get(key);
  if (known) return known;
  const url = await takeUrl(production, take);
  const data = await (await fetch(url)).arrayBuffer();
  const context = new OfflineAudioContext(1, 1, 44100);
  const audio = await context.decodeAudioData(data);
  const samples = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    for (let i = b * step; i < Math.min(samples.length, (b + 1) * step); i += 16) peak = Math.max(peak, Math.abs(samples[i]));
    peaks.push(peak);
  }
  const top = Math.max(0.05, ...peaks);
  const scaled = peaks.map((p) => p / top);
  peaksCache.set(key, scaled);
  return scaled;
}

export function Wave({ production, take, bars = 40 }: { production: string; take: Take; bars?: number }) {
  const [peaks, setPeaks] = useState<number[] | null>(() => peaksCache.get(`${production}/${take.file}/${bars}`) || null);
  useEffect(() => {
    let live = true;
    void peaksOf(production, take, bars)
      .then((p) => live && setPeaks(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [production, take, bars]);
  return (
    <span className="studio-wave" aria-hidden="true">
      {(peaks || Array.from({ length: bars }, () => 0.12)).map((p, i) => (
        <i key={i} style={{ height: `${Math.max(8, Math.round(p * 100))}%` }} />
      ))}
    </span>
  );
}
