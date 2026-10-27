import { useEffect, useRef, useState } from "react";
import { chosenTake, gapAfter, takeAudio, takeMime, type Production, type ProductionUnit, type Take } from "./production";

// Plays a chapter line after line from the chosen takes, with the same pauses
// the master uses, and keeps the next take loaded so lines follow without a gap.
const cache = new Map<string, string>();
const order: string[] = [];

export async function takeUrl(production: string, take: Take) {
  const key = `${production}/${take.file}`;
  const found = cache.get(key);
  if (found) return found;
  const data = await takeAudio(production, take.file);
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: takeMime(take.file) }));
  cache.set(key, url);
  order.push(key);
  // Keep the last 60 takes (about 10 minutes of audio) in memory.
  while (order.length > 60) {
    const old = order.shift()!;
    URL.revokeObjectURL(cache.get(old)!);
    cache.delete(old);
  }
  return url;
}

export function forgetTake(production: string, file: string) {
  const key = `${production}/${file}`;
  const url = cache.get(key);
  if (url) URL.revokeObjectURL(url);
  cache.delete(key);
}

export type Playback = {
  playing: boolean;
  current: string;
  // Seconds into the current line, for the timeline.
  position: number;
  rate: number;
  setRate: (r: number) => void;
  play: (from: string, only?: Take) => void;
  stop: () => void;
  toggle: (from: string) => void;
};

export function usePlayback(production: Production, units: ProductionUnit[], onLine?: (id: string) => void): Playback {
  const audio = useRef<HTMLAudioElement | null>(null);
  const run = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState("");
  const [position, setPosition] = useState(0);
  const [rate, setRateState] = useState(1);
  const latest = useRef({ production, units, rate, onLine });
  latest.current = { production, units, rate, onLine };

  function stop() {
    run.current++;
    window.clearTimeout(timer.current);
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
  }

  async function playFrom(index: number, token: number, single?: Take) {
    const { production: p, units: list } = latest.current;
    let i = index;
    // Skip lines without audio.
    while (i < list.length && !single && !chosenTake(p, list[i])) i++;
    const unit = list[i];
    const take = single || (unit && chosenTake(p, unit));
    if (!unit || !take || token !== run.current) {
      if (token === run.current) setPlaying(false);
      return;
    }
    setCurrent(unit.id);
    latest.current.onLine?.(unit.id);
    let url: string;
    try {
      url = await takeUrl(p.info.id, take);
    } catch {
      if (token === run.current) setPlaying(false);
      return;
    }
    if (token !== run.current) return;
    const a = new Audio(url);
    a.playbackRate = latest.current.rate;
    audio.current = a;
    a.ontimeupdate = () => setPosition(a.currentTime);
    a.onended = () => {
      if (token !== run.current) return;
      if (single) return setPlaying(false);
      const next = list[i + 1];
      const gap = gapAfter(unit, next) / latest.current.rate;
      timer.current = window.setTimeout(() => void playFrom(i + 1, token), gap * 1000);
    };
    // Load the next line while this one plays.
    const next = list.slice(i + 1).find((u) => chosenTake(p, u));
    const nextTake = next && chosenTake(p, next);
    if (nextTake && !single) void takeUrl(p.info.id, nextTake).catch(() => undefined);
    await a.play().catch(() => setPlaying(false));
  }

  function play(from: string, only?: Take) {
    stop();
    const token = ++run.current;
    const index = Math.max(0, latest.current.units.findIndex((u) => u.id === from));
    setPlaying(true);
    setPosition(0);
    void playFrom(index, token, only);
  }

  useEffect(() => stop, []);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  return {
    playing,
    current,
    position,
    rate,
    setRate: setRateState,
    play,
    stop,
    toggle: (from) => (playing ? stop() : play(current && latest.current.units.some((u) => u.id === current) ? current : from)),
  };
}
