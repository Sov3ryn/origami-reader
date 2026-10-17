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
// A manual job (Resume or Generate from the library) runs even when
// automatic covers are turned off.
type Job = { kind: "cover" | "portrait"; id: string; manual?: boolean };

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
  art: storage.ArtOptions = {},
) {
  const [installed, setInstalled] = useState(false);
  const [engine, setEngine] = useState({
    name: "Local image engine",
    attribution: "",
  });
  const [models, setModels] = useState<storage.ModelVersion[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [active, setActive] = useState("");
  const [portraitActive, setPortraitActive] = useState("");
  const [queue, setQueue] = useState<Job[]>([]);
  // Books whose cover the reader paused; automatic generation skips them.
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
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
    art,
  });
  latest.current = { auto, idle, allowMature, changed, report, portraits, art };
  async function refreshModels() {
    const s = await storage.coverEngineStatus();
    setInstalled(s.installed);
    setEngine({ name: s.name, attribution: s.attribution || "" });
    setModels(s.models || []);
    setDefaultModel(s.default || "");
  }
  useEffect(() => {
    void refreshModels().catch(() => {});
    return () => {
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
        latest.current.art,
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
      const data = await storage.generateVoicePortrait(
        id,
        description,
        seed,
        latest.current.art,
      );
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
      j.kind === "cover"
        ? (auto || j.manual) && !paused.has(j.id)
        : portraits.auto,
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
        ? generate(job.id, undefined, !job.manual)
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
    paused,
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
  // Pause stops this book's cover (cancelling it if it is being made) and
  // keeps it out of the automatic queue until resumed.
  async function pause(id: string) {
    setPaused((old) => new Set(old).add(id));
    setQueue((old) => old.filter((j) => !(j.kind === "cover" && j.id === id)));
    if (active === id) await cancel();
  }
  function resume(id: string) {
    setPaused((old) => {
      const next = new Set(old);
      next.delete(id);
      return next;
    });
    setQueue((old) => [
      { kind: "cover", id, manual: true },
      ...old.filter((j) => !(j.kind === "cover" && j.id === id)),
    ]);
  }
  // Where a book's cover stands, for the library indicator.
  function status(id: string): "generating" | "queued" | "paused" | "" {
    if (active === id) return "generating";
    if (paused.has(id)) return "paused";
    if (queue.some((j) => j.kind === "cover" && j.id === id)) return "queued";
    return "";
  }
  return {
    refreshModels,
    installed,
    engine,
    models,
    defaultModel,
    active,
    status,
    pause,
    resume,
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
      if (
        latest.current.auto &&
        !meta.coverImage &&
        meta.autoCover !== false &&
        // Vault books only get artwork when asked; a vault may lock mid-job.
        !meta.vault &&
        storage.desktop &&
        !pausedRef.current.has(meta.id)
      )
        setQueue((old) =>
          old.some((j) => j.kind === "cover" && j.id === meta.id)
            ? old
            : [...old, { kind: "cover", id: meta.id }],
        );
    },
  };
}
