import { useCallback, useEffect, useRef, useState } from "react";

// Reads a note aloud with the reader's Origami voice, paragraph by paragraph.
// The next paragraph is prepared while the current one plays, so there are
// no gaps; stopping cancels everything still waiting.
export function useNoteReader(speak?: (text: string) => Promise<string>) {
  const [state, setState] = useState<{ index: number; total: number } | null>(null);
  const run = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => {
    run.current++;
    audio.current?.pause();
    audio.current = null;
    setState(null);
  }, []);
  useEffect(() => stop, [stop]);
  const start = useCallback(
    async (paragraphs: string[]) => {
      if (!speak) return;
      stop();
      const my = ++run.current;
      const parts = paragraphs.map((p) => p.trim()).filter(Boolean);
      if (!parts.length) return;
      let next: Promise<string> | null = speak(parts[0]);
      for (let i = 0; i < parts.length; i++) {
        if (my !== run.current) return;
        setState({ index: i, total: parts.length });
        let url: string;
        try {
          url = await next!;
        } catch {
          break;
        }
        next = i + 1 < parts.length ? speak(parts[i + 1]) : null;
        if (my !== run.current) return;
        await new Promise<void>((done) => {
          const a = new Audio(url);
          audio.current = a;
          a.onended = () => done();
          a.onerror = () => done();
          void a.play().catch(() => done());
        });
      }
      if (my === run.current) setState(null);
    },
    [speak, stop],
  );
  return { reading: state, start, stop };
}
