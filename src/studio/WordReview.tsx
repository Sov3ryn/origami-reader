import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Volume2 } from "lucide-react";
import { t } from "../i18n";
import { doubtful, recordingClip, type HeardFile } from "./recording";

// Words the transcription was unsure of, one at a time: hear the moment in the
// recording, keep the word or correct it. Clicking any word of the context plays
// the recording from there.
export function WordReview({ files, heard, onChange, onDone }: { files: string[]; heard: HeardFile[]; onChange: (next: HeardFile[]) => void; onDone: () => void }) {
  // The list is fixed when the review starts, so corrected words keep their place.
  const queue = useMemo(() => doubtful(heard), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [at, setAt] = useState(0);
  const [draft, setDraft] = useState(queue[0]?.word || "");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const item = queue[at];
  const words = item ? heard[item.file].words : [];
  const context = item ? words.slice(Math.max(0, item.index - 8), item.index + 9).map((w, i) => ({ w, i: Math.max(0, item.index - 8) + i })) : [];

  async function play(file: number, index: number) {
    const w = heard[file].words[index];
    if (!w) return;
    setError("");
    try {
      audio.current?.pause();
      const b64 = await recordingClip(files[file], Math.max(0, w[1] - 1.2), w[2] + 0.9);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      const el = new Audio(url);
      audio.current = el;
      el.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      setPlaying(true);
      await el.play();
    } catch (e) {
      setPlaying(false);
      setError(String(e));
    }
  }
  useEffect(() => {
    if (!item) return;
    setDraft(item.word);
    void play(item.file, item.index);
    input.current?.focus();
    input.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  useEffect(() => () => audio.current?.pause(), []);

  // Saves the word as written (an empty word removes it) and marks it checked.
  function keep(step: number) {
    if (item) {
      const next = heard.map((f, fi) =>
        fi !== item.file ? f : { ...f, words: f.words.map((w, wi) => (wi === item.index ? ([draft.trim(), w[1], w[2], 1] as typeof w) : w)) },
      );
      onChange(next);
    }
    const target = at + step;
    if (target >= queue.length) return onDone();
    setAt(Math.max(0, target));
  }

  if (!item) {
    return (
      <div className="studio-word-review">
        <p className="studio-hint">{t("No word needs checking.")}</p>
        <div className="studio-row end">
          <button className="primary" onClick={onDone}>
            {t("Done")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="studio-word-review" onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}>
      <p className="muted small">
        {t("Word {n} of {total}", { n: String(at + 1), total: String(queue.length) })} · {t("{n}% sure", { n: String(Math.round(item.conf * 100)) })}
      </p>
      <p className="studio-word-context">
        {context.map(({ w, i }) => (
          <button key={i} className={i === item.index ? "current" : ""} onClick={() => void play(item.file, i)} title={t("Hear it")}>
            {i === item.index ? draft || "∅" : w[0]}
          </button>
        ))}
      </p>
      <div className="studio-row">
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") keep(1);
          }}
          aria-label={t("The word as it should be written")}
        />
        <button className="icon-only" onClick={() => void play(item.file, item.index)} aria-label={t("Hear it again")} data-tip={t("Hear it again")}>
          <Volume2 size={15} className={playing ? "studio-pulse" : ""} />
        </button>
      </div>
      <p className="studio-hint">{t("Correct the word if needed, or clear it to remove it. Enter keeps it and goes to the next one.")}</p>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      <div className="studio-row end">
        <button onClick={() => setAt(Math.max(0, at - 1))} disabled={at === 0}>
          <ArrowLeft size={14} /> {t("Previous")}
        </button>
        <button onClick={onDone}>{t("Stop checking")}</button>
        <button className="primary" onClick={() => keep(1)}>
          {at + 1 < queue.length ? (
            <>
              <Check size={14} /> {t("Keep and next")} <ArrowRight size={14} />
            </>
          ) : (
            <>
              <Check size={14} /> {t("Keep and finish")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
