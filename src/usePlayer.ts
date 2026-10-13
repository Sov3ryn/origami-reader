import { useRef, useState } from "react";
import * as storage from "./storage";
import { splitSpeech } from "./documents";
import type { Book, Preferences } from "./types";
type Unit = { text: string; paragraph: number };
export function usePlayer(
  report: (s: string) => void,
  onVoiceUsed: (voice: string) => void,
) {
  const [status, setStatus] = useState<
    "idle" | "generating" | "playing" | "paused"
  >("idle");
  const [current, setCurrent] = useState(-1);
  const [currentText, setCurrentText] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const finish = useRef<(() => void) | null>(null);
  const urls = useRef(new Set<string>());
  const activePrefs = useRef<Preferences | null>(null);
  const pending = useRef(0);
  const session = useRef<{
    bookId: string;
    units: Unit[];
    index: number;
  } | null>(null);
  async function stop(unload = false) {
    const token = ++generation.current;
    audio.current?.pause();
    audio.current = null;
    finish.current?.();
    finish.current = null;
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current.clear();
    setStatus("idle");
    setTime(0);
    setDuration(0);
    if (pending.current > 0 || unload)
      await storage.cancelSpeech().catch(() => {});
    return token;
  }
  function setPlayback(speed: number, volume: number) {
    if (audio.current) {
      audio.current.playbackRate = speed;
      audio.current.volume = volume;
    }
    if (activePrefs.current) {
      activePrefs.current = { ...activePrefs.current, speed, volume };
    }
  }
  async function start(
    book: Book,
    position: number,
    prefs: Preferences,
    onPosition: (n: number) => void,
    selection?: string,
    resumeCurrent = false,
  ) {
    const token = await stop();
    if (generation.current !== token) return;
    if (!storage.desktop) {
      report(
        "Voice generation is available in the desktop app. The browser preview supports reading and annotations.",
      );
      return;
    }
    activePrefs.current = prefs;
    const units: Unit[] =
      resumeCurrent && session.current?.bookId === book.meta.id
        ? session.current.units.slice(session.current.index)
        : selection
          ? splitSpeech(selection).map((text) => ({
              text,
              paragraph: position,
            }))
          : book.paragraphs.slice(position).flatMap((p, i) =>
              splitSpeech(p.text).map((text) => ({
                text,
                paragraph: position + i,
              })),
            );
    session.current = { bookId: book.meta.id, units, index: 0 };
    const voice = book.meta.voice || prefs.voice;
    const get = async (unit: Unit) => {
      pending.current++;
      try {
        return {
          result: await storage.synthesize(unit.text, voice),
          error: null,
        };
      } catch (error) {
        return { result: null, error };
      } finally {
        pending.current--;
      }
    };
    try {
      if (!units.length) {
        report("No spoken text in this selection.");
        return;
      }
      setStatus("generating");
      let next = get(units[0]);
      for (let i = 0; i < units.length; i++) {
        const response = await next;
        if (generation.current !== token) return;
        if (!response.result) throw response.error;
        const result = response.result;
        if (i === 0) onVoiceUsed(voice);
        const bytes = Uint8Array.from(atob(result.audio), (c) =>
          c.charCodeAt(0),
        );
        const url = URL.createObjectURL(
          new Blob([bytes], { type: "audio/wav" }),
        );
        urls.current.add(url);
        const player = new Audio(url);
        audio.current = player;
        session.current!.index = i;
        player.volume = activePrefs.current!.volume;
        player.playbackRate = activePrefs.current!.speed;
        setCurrent(units[i].paragraph);
        setCurrentText(units[i].text);
        onPosition(units[i].paragraph);
        setTime(0);
        setDuration(result.duration);
        player.ontimeupdate = () => setTime(player.currentTime);
        if (i + 1 < units.length) next = get(units[i + 1]);
        await new Promise<void>((resolve, reject) => {
          finish.current = resolve;
          player.onended = () => resolve();
          player.onerror = () => reject(new Error("Audio playback failed."));
          player
            .play()
            .then(() => {
              if (generation.current === token) setStatus("playing");
            })
            .catch(reject);
        });
        URL.revokeObjectURL(url);
        urls.current.delete(url);
        if (generation.current !== token) return;
        setStatus("generating");
      }
      setStatus("idle");
      audio.current = null;
      finish.current = null;
    } catch (e) {
      if (generation.current === token) {
        setStatus("idle");
        report(String(e));
      }
    }
  }
  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      void a
        .play()
        .then(() => setStatus("playing"))
        .catch((e) => report(String(e)));
    } else {
      a.pause();
      setStatus("paused");
    }
  }
  function seek(n: number) {
    if (audio.current) {
      audio.current.currentTime = Math.max(
        0,
        Math.min(n, audio.current.duration || duration),
      );
      setTime(audio.current.currentTime);
    }
  }
  return {
    status,
    current,
    currentText,
    time,
    duration,
    start,
    stop,
    toggle,
    seek,
    setPlayback,
    changeVoice: () => stop(true),
  };
}
