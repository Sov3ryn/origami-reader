import { useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Play, Square } from "lucide-react";
import { t } from "../i18n";
import * as store from "../storage";
import type { Production } from "./production";
import { occurrences, sampleAround, suggestWords, type Pronunciation } from "./pronounce";

// Words: names and other proper nouns of the book, how often they come, and how
// to say them. A pronunciation changes the spoken text of every line with the
// word (the book text stays); generated lines then need a new take.
export function WordsPanel({
  production,
  onApply,
  onJump,
}: {
  production: Production;
  onApply: (p: Pronunciation) => void;
  onJump: (unitId: string) => void;
}) {
  const { info, units } = production;
  const done = info.pronunciations || [];
  const words = useMemo(() => suggestWords(units, info.cast || [], done.map((d) => d.word)), [units, info.cast, done]);
  const [open, setOpen] = useState("");
  const [draft, setDraft] = useState("");
  const [at, setAt] = useState(0);
  const [hearing, setHearing] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const list = open ? occurrences(units, open) : [];

  async function hear(word: string, sayAs: string) {
    audio.current?.pause();
    if (hearing) return setHearing(false);
    const where = occurrences(units, word)[0];
    setHearing(true);
    try {
      const result = await store.synthesize(sampleAround(where?.original ?? where?.text ?? word, word, sayAs || word), info.voice);
      const a = new Audio("data:audio/wav;base64," + result.audio);
      audio.current = a;
      a.onended = () => setHearing(false);
      await a.play();
    } catch {
      setHearing(false);
    }
  }
  const row = (word: string, count: number, sayAs?: string) => (
    <li key={word} className={"studio-word" + (open === word ? " open" : "")}>
      <button
        className="studio-word-main"
        onClick={() => {
          setOpen(open === word ? "" : word);
          setDraft(sayAs || word);
          setAt(0);
        }}
        aria-expanded={open === word}
      >
        <strong>{word}</strong>
        {sayAs && <span className="studio-say">{sayAs}</span>}
        <span className="muted small">{count}</span>
      </button>
      {open === word && (
        <div className="studio-word-more">
          <label className="studio-field">
            <span>{t("Say it as")}</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("For example: Nether-field")} />
          </label>
          <div className="studio-row">
            <button onClick={() => void hear(word, draft)}>
              {hearing ? <Square size={13} /> : <Play size={13} />} {t("Hear it")}
            </button>
            <button className="primary" disabled={!draft.trim() || draft.trim() === (sayAs || word)} onClick={() => onApply({ word, sayAs: draft.trim() })}>
              <Check size={13} /> {t("Use everywhere")}
            </button>
          </div>
          {list.length > 0 && (
            <div className="studio-occurrences">
              <span className="muted small">{t("{n} of {total}", { n: String(at + 1), total: String(list.length) })}</span>
              <button className="icon-only" disabled={at <= 0} onClick={() => (setAt(at - 1), onJump(list[at - 1].id))} aria-label={t("Previous")}>
                <ChevronLeft size={14} />
              </button>
              <button className="icon-only" disabled={at >= list.length - 1} onClick={() => (setAt(at + 1), onJump(list[at + 1].id))} aria-label={t("Next")}>
                <ChevronRight size={14} />
              </button>
              <button onClick={() => onJump(list[at].id)}>{t("Show")}</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
  return (
    <div className="studio-words">
      <p className="studio-hint">{t("Names and rare words of this book. Choose how each is said; the book's text is not changed.")}</p>
      {done.length > 0 && (
        <>
          <div className="studio-panel-head">
            <span>{t("Chosen")}</span>
          </div>
          <ul className="studio-word-list">{done.map((d) => row(d.word, occurrences(units, d.word).length, d.sayAs))}</ul>
        </>
      )}
      <div className="studio-panel-head">
        <span>{t("To check")}</span>
        <span className="muted">{words.length}</span>
      </div>
      <ul className="studio-word-list">{words.map((w) => row(w.word, w.count))}</ul>
      {!words.length && <p className="muted small">{t("No names left to check.")}</p>}
    </div>
  );
}
