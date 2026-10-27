import { useCallback, useRef, useState } from "react";
import { meterAudio } from "./audioMeter";
import { invoke } from "@tauri-apps/api/core";
import type { Production } from "./studio/production";
import { studioUnits } from "./studioNarration";
import * as storage from "./storage";
import {
  isShortSpeech,
  speechWeight,
  spellBareNumber,
  speechUnits,
  textLanguage,
} from "./documents";
import { spokenText } from "./spokenText";
import { bookVoice } from "./voiceCatalog";
import type { Book, Preferences, TextSelection, SpeechResult } from "./types";
// first/last are sentence indexes in the spoken text of `paragraph`.
export type Unit = {
  text: string;
  paragraph: number;
  first: number;
  last: number;
  heading?: boolean;
  // Studio narration: where the line sits in the paragraph, its voice and its take.
  range?: { start: number; end: number };
  voice?: string;
  take?: { production: string; file: string; duration: number };
};
type Status = "idle" | "generating" | "playing" | "paused";
const rulesKey = (prefs: Preferences, bookId: string) =>
  JSON.stringify([
    bookId,
    prefs.romanNumeralHeadings,
    prefs.skipSpeechMarkup !== false,
    prefs.skipCitations !== false,
    prefs.skipAuthorYear === true,
    prefs.pronunciations || [],
  ]);
export function bookUnits(
  book: Book,
  position: number,
  prefs: Preferences,
): Unit[] {
  const units = book.paragraphs.slice(position).flatMap((p, i) =>
    speechUnits(
      spokenText(p, prefs, undefined, book.meta.id),
      400,
      prefs.skipSpeechMarkup !== false,
    ).map((unit) => ({
      ...unit,
      paragraph: position + i,
      heading: p.kind === "heading",
    })),
  );
  // A bare chapter number or single word is joined to what follows so the
  // speech model always receives a complete phrase. Numbers are spelled in
  // the book's own language.
  const language = textLanguage(
    book.paragraphs
      .slice(position, position + 40)
      .map((p) => p.text)
      .join(" ")
      .slice(0, 4000),
  );
  const merged: Unit[] = [];
  for (let i = 0; i < units.length; i++) {
    const unit = {
      ...units[i],
      text: spellBareNumber(units[i].text, language),
    };
    const next = units[i + 1];
    if (
      isShortSpeech(unit.text) &&
      next &&
      speechWeight(unit.text) + speechWeight(next.text) < 400
    ) {
      const joiner = /[.!?:;,…]["”’)]*$/.test(unit.text) ? " " : ". ";
      units[i + 1] = { ...unit, text: unit.text + joiner + next.text };
      continue;
    }
    merged.push(unit);
  }
  return merged;
}
export function unitPause(
  prefs: Pick<Preferences, "sentencePause" | "paragraphPause" | "headingPause">,
  unit: Unit,
  next: Unit | undefined,
  speed: number,
) {
  if (!next) return 0;
  const ms =
    next.paragraph === unit.paragraph
      ? prefs.sentencePause
      : unit.heading
        ? prefs.headingPause
        : prefs.paragraphPause;
  return Math.max(0, ms || 0) / Math.max(0.5, speed);
}
export function usePlayer(
  report: (s: string) => void,
  onVoiceUsed: (voice: string) => void,
  // Reading aloud keeps waiting for the voice between sentences (once per reading).
  onSlow?: (model: string) => void,
) {
  const [status, setStatusState] = useState<Status>("idle");
  const statusRef = useRef<Status>("idle");
  const setStatus = (next: Status) => {
    statusRef.current = next;
    setStatusState(next);
  };
  const [current, setCurrent] = useState(-1);
  const [currentUnit, setCurrentUnit] = useState<Unit | null>(null);
  const [currentText, setCurrentText] = useState("");
  // Playback time changes several times a second. It lives outside React
  // state so only the seek bar re-renders, not the whole workspace.
  const timeStore = useRef({ value: 0, listeners: new Set<() => void>() });
  const setTime = (value: number) => {
    timeStore.current.value = value;
    for (const listener of timeStore.current.listeners) listener();
  };
  const getTime = useCallback(() => timeStore.current.value, []);
  const subscribeTime = useCallback((listener: () => void) => {
    timeStore.current.listeners.add(listener);
    return () => {
      timeStore.current.listeners.delete(listener);
    };
  }, []);
  const [duration, setDuration] = useState(0);
  const [unvoiced, setUnvoiced] = useState<{
    bookId: string;
    paragraphs: number[];
  }>({ bookId: "", paragraphs: [] });
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const finish = useRef<(() => void) | null>(null);
  const urls = useRef(new Set<string>());
  const activePrefs = useRef<Preferences | null>(null);
  const pending = useRef(0);
  const paused = useRef(false);
  const resumed = useRef<(() => void)[]>([]);
  const fadeRun = useRef(0);
  const fadeScale = useRef(1);
  const cache = useRef(new Map<string, SpeechResult>());
  // The Studio production read aloud for a book, loaded fresh at each start.
  const narration = useRef<{ bookId: string; load: () => Promise<Production> } | null>(null);
  const session = useRef<{
    book: Book;
    units: Unit[];
    index: number;
    rules: string;
    onPosition: (n: number) => void;
  } | null>(null);
  function wake() {
    for (const resolve of resumed.current.splice(0)) resolve();
  }
  async function stop(unload = false) {
    const token = ++generation.current;
    fadeRun.current++;
    fadeScale.current = 1;
    paused.current = false;
    wake();
    audio.current?.pause();
    audio.current = null;
    finish.current?.();
    finish.current = null;
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current.clear();
    setStatus("idle");
    setTime(0);
    setDuration(0);
    if (unload) {
      cache.current.clear();
      await storage.cancelSpeech().catch(() => {});
    } else if (pending.current > 0)
      await storage.interruptSpeech().catch(() => {});
    return token;
  }
  function setPlayback(speed: number, volume: number) {
    if (audio.current) {
      audio.current.playbackRate = speed;
      audio.current.volume = volume * fadeScale.current;
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
    selection?: string | TextSelection,
    resumeCurrent = false,
    offset = 0,
  ) {
    const previous = session.current;
    const token = await stop();
    if (generation.current !== token) return;
    if (!storage.desktop) {
      report(
        "Voice generation is available in the desktop app. The browser preview supports reading and annotations.",
      );
      return;
    }
    activePrefs.current = prefs;
    const cast =
      selection === undefined && narration.current && narration.current.bookId === book.meta.id
        ? await narration.current.load().catch(() => {
            report("The Studio cast could not be loaded. Reading with the book's voice.");
            return null;
          })
        : null;
    if (generation.current !== token) return;
    const rules = rulesKey(prefs, book.meta.id) + (cast ? "|" + cast.info.id : "");
    const resumable =
      resumeCurrent &&
      previous?.book.meta.id === book.meta.id &&
      previous.book.paragraphs === book.paragraphs &&
      previous.rules === rules;
    const units: Unit[] = resumable
      ? previous!.units.slice(
          Math.max(
            0,
            Math.min(previous!.units.length - 1, previous!.index + offset),
          ),
        )
      : selection !== undefined
        ? speechUnits(
            typeof selection === "string"
              ? selection
              : spokenText(
                  book.paragraphs[position],
                  prefs,
                  selection,
                  book.meta.id,
                ),
            400,
            prefs.skipSpeechMarkup !== false,
          ).map((unit) => ({
            ...unit,
            // Selection units do not map to whole-paragraph sentences.
            first: -1,
            last: -1,
            paragraph: position,
          }))
        : cast
          ? studioUnits(book, cast, position)
          : bookUnits(book, position, prefs);
    session.current = { book, units, index: 0, rules, onPosition };
    const voice = bookVoice(book.meta, prefs);
    const get = async (unit: Unit) => {
      // A Studio take plays as it was made.
      if (unit.take) {
        try {
          const audio = await invoke<string>("studio_take_audio", { id: unit.take.production, file: unit.take.file });
          return {
            result: { audio, rate: 0, duration: unit.take.duration, mime: unit.take.file.endsWith(".flac") ? "audio/flac" : "audio/wav" } as SpeechResult,
            error: null,
          };
        } catch (error) {
          return { result: null, error };
        }
      }
      const lineVoice = unit.voice || voice;
      const key = JSON.stringify([
        book.meta.id,
        lineVoice,
        unit.text,
        prefs.voiceTemperature,
        prefs.speechModel,
      ]);
      const cached = cache.current.get(key);
      if (cached) {
        cache.current.delete(key);
        cache.current.set(key, cached);
        return { result: cached, error: null };
      }
      pending.current++;
      try {
        const result = await storage.synthesize(
          unit.text,
          lineVoice,
          prefs.voiceTemperature,
          prefs.speechModel,
        );
        if (
          generation.current === token &&
          !result.unvoiced &&
          result.audio.length < 16 * 1024 * 1024
        ) {
          cache.current.set(key, result);
          let size = Array.from(cache.current.values()).reduce(
            (sum, v) => sum + v.audio.length * 2,
            0,
          );
          while (size > 32 * 1024 * 1024 || cache.current.size > 64) {
            const oldest = cache.current.keys().next().value!;
            size -= cache.current.get(oldest)!.audio.length * 2;
            cache.current.delete(oldest);
          }
        }
        return {
          result,
          error: null,
        };
      } catch (error) {
        return { result: null, error };
      } finally {
        pending.current--;
      }
    };
    const whilePaused = async () => {
      while (paused.current && generation.current === token)
        await new Promise<void>((resolve) => resumed.current.push(resolve));
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        if (ms <= 0) return resolve();
        const timer = setTimeout(resolve, ms);
        finish.current = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    try {
      if (!units.length) {
        report("No spoken text in this selection.");
        return;
      }
      setStatus("generating");
      // The voice keeps working ahead of the reader: up to AHEAD units are
      // generated, one at a time and in order, while the current one plays,
      // so a long sentence after a short one is ready when its turn comes.
      const AHEAD = 3;
      const pending: ReturnType<typeof get>[] = [];
      let chain: Promise<unknown> = Promise.resolve();
      const ensure = (upTo: number) => {
        for (let k = pending.length; k <= Math.min(upTo, units.length - 1); k++) {
          const request = chain.then(() =>
            generation.current === token
              ? get(units[k])
              : { result: null, error: null },
          );
          pending[k] = request;
          chain = request.then(
            () => undefined,
            () => undefined,
          );
        }
      };
      ensure(AHEAD);
      // Waits for the voice between sentences, after the first (which also
      // loads the model): three of 1.5 s or more within ten sentences means
      // this model cannot keep up on this computer.
      const stalls: number[] = [];
      let slowSaid = false;
      // One sentence the voice fails on is marked and skipped like an
      // unvoiced passage; three in a row stop the reading with the error.
      let failures = 0;
      for (let i = 0; i < units.length; i++) {
        ensure(i + AHEAD);
        const waitStart = performance.now();
        const response = await pending[i];
        if (i > 0 && !units[i].take && performance.now() - waitStart > 1500) {
          stalls.push(i);
          while (stalls.length && stalls[0] < i - 9) stalls.shift();
          if (stalls.length >= 3 && !slowSaid) {
            slowSaid = true;
            onSlow?.(prefs.speechModel);
          }
        }
        if (generation.current !== token) return;
        if (!response.result) {
          // The first sentence failing usually means the voice or model is missing.
          if (i === 0 || ++failures >= 3 || units[i].take) throw response.error;
          const paragraph = units[i].paragraph;
          setUnvoiced((old) => ({
            bookId: book.meta.id,
            paragraphs:
              old.bookId === book.meta.id
                ? [...new Set([...old.paragraphs, paragraph])]
                : [paragraph],
          }));
          report("A passage could not be voiced and was skipped. It is marked in the margin.");
          continue;
        }
        failures = 0;
        const result = response.result;
        if (i === 0) onVoiceUsed(voice);
        session.current!.index = i;
        setCurrent(units[i].paragraph);
        setCurrentUnit(units[i]);
        setCurrentText(units[i].text);
        onPosition(units[i].paragraph);
        if (result.unvoiced) {
          // The worker could not voice this passage reliably. Keep reading and
          // leave a visible marker so the reader can retry it.
          const paragraph = units[i].paragraph;
          setUnvoiced((old) => ({
            bookId: book.meta.id,
            paragraphs:
              old.bookId === book.meta.id
                ? [...new Set([...old.paragraphs, paragraph])]
                : [paragraph],
          }));
          report(
            "A passage could not be voiced and was skipped. It is marked in the margin.",
          );
          continue;
        }
        await whilePaused();
        if (generation.current !== token) return;
        const bytes = Uint8Array.from(atob(result.audio), (c) =>
          c.charCodeAt(0),
        );
        const url = URL.createObjectURL(
          new Blob([bytes], { type: result.mime || "audio/wav" }),
        );
        urls.current.add(url);
        const player = new Audio(url);
        meterAudio(player);
        audio.current = player;
        player.volume = activePrefs.current!.volume * fadeScale.current;
        player.playbackRate = activePrefs.current!.speed;
        player.preservesPitch = true;
        setTime(0);
        setDuration(result.duration);
        player.ontimeupdate = () => setTime(player.currentTime);
        await new Promise<void>((resolve, reject) => {
          finish.current = resolve;
          player.onended = () => resolve();
          player.onerror = () => reject(new Error("Audio playback failed."));
          player
            .play()
            .then(() => {
              if (generation.current === token && !paused.current)
                setStatus("playing");
            })
            .catch(reject);
        });
        URL.revokeObjectURL(url);
        urls.current.delete(url);
        if (generation.current !== token) return;
        await wait(
          unitPause(
            activePrefs.current!,
            units[i],
            units[i + 1],
            activePrefs.current!.speed,
          ),
        );
        if (generation.current !== token) return;
        if (!paused.current) setStatus("generating");
      }
      setStatus("idle");
      setCurrentUnit(null);
      audio.current = null;
      finish.current = null;
    } catch (e) {
      if (generation.current === token) {
        setStatus("idle");
        setCurrentUnit(null);
        report(e instanceof Error ? e.message : String(e));
      }
    }
  }
  function toggle() {
    if (statusRef.current === "idle") return;
    if (paused.current) {
      paused.current = false;
      const a = audio.current;
      if (
        a &&
        a.paused &&
        !a.ended &&
        a.currentTime < (a.duration || Infinity)
      ) {
        void a
          .play()
          .then(() => setStatus("playing"))
          .catch((e) => report(String(e)));
      } else setStatus("generating");
      // With nothing to resume (paused while the next sentence was still being
      // made), the loop sets "playing" itself once that sentence starts.
      wake();
    } else {
      paused.current = true;
      audio.current?.pause();
      setStatus("paused");
    }
  }
  // Moves by speech units (usually sentences) within the current session.
  async function skip(delta: number) {
    const s = session.current;
    if (!s || statusRef.current === "idle" || !activePrefs.current)
      return false;
    const target = s.index + delta;
    if (target < 0 || target >= s.units.length) return false;
    await start(
      s.book,
      s.units[target].paragraph,
      activePrefs.current,
      s.onPosition,
      undefined,
      true,
      delta,
    );
    return true;
  }
  // Lowers the volume gradually, then stops. Used by the sleep timer.
  async function fadeStop(ms = 8000) {
    const run = ++fadeRun.current;
    const steps = 20;
    for (let step = 1; step <= steps; step++) {
      await new Promise((resolve) => setTimeout(resolve, ms / steps));
      if (fadeRun.current !== run) return;
      fadeScale.current = 1 - step / steps;
      if (audio.current && activePrefs.current)
        audio.current.volume = activePrefs.current.volume * fadeScale.current;
    }
    await stop();
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
  function clearUnvoiced(paragraph?: number) {
    setUnvoiced((old) => ({
      ...old,
      paragraphs:
        paragraph === undefined
          ? []
          : old.paragraphs.filter((p) => p !== paragraph),
    }));
  }
  return {
    // Sets (or clears) the Studio production that reads a book aloud.
    setNarration: (bookId: string | null, load?: () => Promise<Production>) => {
      narration.current = bookId && load ? { bookId, load } : null;
    },
    status,
    current,
    currentUnit,
    currentText,
    getTime,
    subscribeTime,
    duration,
    unvoiced,
    start,
    stop,
    toggle,
    skip,
    fadeStop,
    clearUnvoiced,
    seek,
    setPlayback,
    // The loaded model serves every voice, so a new voice only stops playback.
    changeVoice: () => stop(),
    // A different model version releases the current one.
    unload: () => stop(true),
    forgetBooks: (ids: Set<string>) => {
      for (const key of cache.current.keys()) {
        if (ids.has(JSON.parse(key)[0])) cache.current.delete(key);
      }
    },
  };
}
