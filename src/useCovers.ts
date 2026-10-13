import { useEffect, useRef, useState } from "react";
import * as storage from "./storage";
import {
  coverImage,
  coverPrompt,
  starterCover,
  GENERATED_COVER_SIZE,
} from "./covers";
import type { BookMeta, Voice } from "./types";
import { VOICE_PORTRAIT_SIZE, voicePortraitPrompt } from "./voicePortraits";
type Job = { kind: "cover" | "portrait"; id: string };

export function useCovers(
  auto: boolean,
  idle: boolean,
  allowMature: boolean,
  changed: (meta: BookMeta) => void,
  report: (message: string) => void,
  portraits: {
    auto: boolean;
    voices: Voice[];
    changed: (voice: Voice) => void;
  },
) {
  const [installed, setInstalled] = useState(false);
  const [engine, setEngine] = useState({
    name: "Local image engine",
    attribution: "",
  });
  const [active, setActive] = useState("");
  const [portraitActive, setPortraitActive] = useState("");
  const [queue, setQueue] = useState<Job[]>([]);
  const attempted = useRef(new Set<string>());
  const [retry, setRetry] = useState(0);
  const running = useRef(false);
  const epoch = useRef(0);
  const latest = useRef({
    auto,
    idle,
    allowMature,
    changed,
    report,
    portraits,
  });
  latest.current = { auto, idle, allowMature, changed, report, portraits };
  useEffect(() => {
    let mounted = true;
    void storage
      .coverEngineStatus()
      .then((s) => {
        if (mounted) {
          setInstalled(s.installed);
          setEngine({ name: s.name, attribution: s.attribution || "" });
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
      epoch.current++;
      void storage.cancelCover();
    };
  }, []);
  async function generate(id: string, prompt?: string, automatic = false) {
    if (running.current)
      throw new Error("An image is already being generated.");
    if (!latest.current.idle)
      throw new Error("Stop playback before generating a cover.");
    running.current = true;
    const token = ++epoch.current;
    setActive(id);
    try {
      const book = await storage.readBook(id);
      if (token !== epoch.current || !latest.current.idle) return;
      if (
        automatic &&
        (book.meta.coverImage || book.meta.deleted || !latest.current.auto)
      )
        return;
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
      const data = await storage.generateCover(
        prompt || coverPrompt(book),
        seed,
        latest.current.allowMature && !starterCover(book.meta),
        id,
      );
      if (token !== epoch.current) return;
      if (!data.startsWith("data:image/png;base64,"))
        throw new Error("Invalid generated cover response.");
      const bytes = Uint8Array.from(atob(data.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      const image = await coverImage(
        new Blob([bytes], { type: "image/png" }),
        GENERATED_COVER_SIZE,
      );
      if (token !== epoch.current) return;
      const current = (await storage.readBook(id)).meta;
      if (current.deleted || (automatic && current.coverImage)) return;
      const meta = {
        ...current,
        coverImage: image,
        coverOrigin: "generated" as const,
      };
      await storage.saveMeta(meta);
      latest.current.changed(meta);
    } finally {
      running.current = false;
      setActive("");
    }
  }
  async function generatePortrait(
    id: string,
    prompt?: string,
    automatic = false,
  ) {
    if (running.current)
      throw new Error("An image is already being generated.");
    if (!latest.current.idle)
      throw new Error("Stop playback before generating a portrait.");
    const voice = latest.current.portraits.voices.find((v) => v.id === id);
    if (!voice) throw new Error("Voice is not installed.");
    if (automatic && (!latest.current.portraits.auto || voice.portrait)) return;
    running.current = true;
    const token = ++epoch.current;
    setPortraitActive(id);
    try {
      const description = prompt || voicePortraitPrompt(voice);
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
      const data = await storage.generateVoicePortrait(id, description, seed);
      if (token !== epoch.current) return;
      if (!data.startsWith("data:image/png;base64,"))
        throw new Error("Invalid generated portrait response.");
      const bytes = Uint8Array.from(atob(data.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      const portrait = await coverImage(
        new Blob([bytes], { type: "image/png" }),
        VOICE_PORTRAIT_SIZE,
      );
      if (token !== epoch.current) return;
      const current = latest.current.portraits.voices.find((v) => v.id === id);
      if (!current || (automatic && current.portrait)) return;
      await storage.saveVoicePortrait(id, portrait, description, "generated");
      latest.current.portraits.changed({
        ...current,
        portrait,
        portraitPrompt: description,
        portraitOrigin: "generated",
      });
    } finally {
      running.current = false;
      setPortraitActive("");
    }
  }
  useEffect(() => {
    if (!portraits.auto || !installed) return;
    const missing = portraits.voices.filter(
      (v) => v.available && !v.portrait && !attempted.current.has(v.id),
    );
    if (missing.length)
      setQueue((old) => {
        const queued = new Set(
          old.filter((j) => j.kind === "portrait").map((j) => j.id),
        );
        return [
          ...old,
          ...missing
            .filter((v) => !queued.has(v.id))
            .map((v) => ({ kind: "portrait" as const, id: v.id })),
        ];
      });
  }, [portraits.auto, portraits.voices, installed, retry]);
  useEffect(() => {
    const enabled = queue.filter((j) =>
      j.kind === "cover" ? auto : portraits.auto,
    );
    if (enabled.length !== queue.length) {
      setQueue(enabled);
      return;
    }
    if (
      !idle ||
      !installed ||
      active ||
      portraitActive ||
      running.current ||
      !queue.length ||
      document.hidden
    )
      return;
    const job = queue[0];
    setQueue((old) => old.slice(1));
    if (job.kind === "portrait") attempted.current.add(job.id);
    const task =
      job.kind === "cover"
        ? generate(job.id, undefined, true)
        : generatePortrait(job.id, undefined, true);
    void task.catch((e) => {
      if (!String(e).includes("cancelled")) latest.current.report(String(e));
    });
  }, [
    auto,
    idle,
    installed,
    engine,
    active,
    portraitActive,
    portraits.auto,
    queue,
    retry,
  ]);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) setRetry((old) => old + 1);
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, []);
  async function cancel() {
    epoch.current++;
    await storage.cancelCover();
  }
  return {
    installed,
    engine,
    active,
    portraitActive,
    busy: Boolean(active || portraitActive),
    generate,
    generatePortrait,
    retryPortraits: () => {
      attempted.current.clear();
      setRetry((old) => old + 1);
    },
    cancel,
    enqueue: (meta: BookMeta) => {
      if (latest.current.auto && !meta.coverImage && storage.desktop)
        setQueue((old) =>
          old.some((j) => j.kind === "cover" && j.id === meta.id)
            ? old
            : [...old, { kind: "cover", id: meta.id }],
        );
    },
  };
}
