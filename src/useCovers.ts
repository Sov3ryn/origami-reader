import { useEffect, useRef, useState } from "react";
import * as storage from "./storage";
import { coverImage, coverPrompt } from "./covers";
import type { BookMeta } from "./types";

export function useCovers(
  auto: boolean,
  idle: boolean,
  changed: (meta: BookMeta) => void,
  report: (message: string) => void,
) {
  const [installed, setInstalled] = useState(false);
  const [active, setActive] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const running = useRef(false);
  const epoch = useRef(0);
  const latest = useRef({ auto, idle, changed, report });
  latest.current = { auto, idle, changed, report };
  useEffect(() => {
    let mounted = true;
    void storage
      .coverEngineStatus()
      .then((s) => {
        if (mounted) setInstalled(s.installed);
      })
      .catch(() => {});
    return () => {
      mounted = false;
      epoch.current++;
      void storage.cancelCover();
    };
  }, []);
  async function generate(id: string, prompt?: string, automatic = false) {
    if (running.current) throw new Error("A cover is already being generated.");
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
      );
      if (token !== epoch.current) return;
      if (!data.startsWith("data:image/png;base64,"))
        throw new Error("Invalid generated cover response.");
      const bytes = Uint8Array.from(atob(data.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      const image = await coverImage(new Blob([bytes], { type: "image/png" }));
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
  useEffect(() => {
    if (!auto && queue.length) setQueue([]);
    if (!auto || !idle || !installed || active || !queue.length) return;
    const id = queue[0];
    setQueue((old) => old.slice(1));
    void generate(id, undefined, true).catch((e) => {
      if (!String(e).includes("cancelled")) latest.current.report(String(e));
    });
  }, [auto, idle, installed, active, queue]);
  async function cancel() {
    epoch.current++;
    await storage.cancelCover();
  }
  return {
    installed,
    active,
    generate,
    cancel,
    enqueue: (meta: BookMeta) => {
      if (latest.current.auto && !meta.coverImage && storage.desktop)
        setQueue((old) => (old.includes(meta.id) ? old : [...old, meta.id]));
    },
  };
}
