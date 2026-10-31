import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Headphones, LoaderCircle, PenLine, RotateCcw, Sparkles, X } from "lucide-react";
import { t } from "../i18n";
import { MathText } from "./FormulaDialog";
import { PictureFace } from "./PictureCards";
import { handwritingAvailable } from "./ink/ink";
import { WriteAnswer, WrittenResult, type Written } from "./ink/WriteAnswer";
import { answer, clozeParts, formatWait, preview, type Answer } from "./cards";
import type { StudyCard } from "./types";

// One study session: the card, then the answer, then how well it was
// remembered. Listen mode reads both sides aloud with the reader's voice.
export function StudySession({
  cards,
  title,
  fourButtons,
  speak,
  onSave,
  onShowInBook,
  onClose,
}: {
  cards: StudyCard[];
  title: string;
  fourButtons: boolean;
  speak?: (text: string) => Promise<string>;
  onSave: (card: StudyCard, grade: Answer) => Promise<void>;
  onShowInBook: (card: StudyCard) => void;
  onClose: () => void;
}) {
  const [queue, setQueue] = useState(() => cards.map((c) => c.id));
  const [byId, setById] = useState(() => new Map(cards.map((c) => [c.id, c])));
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Answer[]>([]);
  const [listen, setListen] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // Answering by writing (pen or mouse), remembered between sessions.
  const [writeMode, setWriteMode] = useState(() => {
    try {
      return handwritingAvailable() && localStorage.getItem("origami.studyWrite") === "1";
    } catch {
      return false;
    }
  });
  const [written, setWritten] = useState<Written | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem("origami.studyWrite", writeMode ? "1" : "0");
    } catch {
      /* private window */
    }
  }, [writeMode]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const turn = useRef(0);
  const card = queue.length ? byId.get(queue[0]) : undefined;
  const hints = useMemo(() => (card ? preview(card) : null), [card]);

  const stopAudio = useCallback(() => {
    turn.current++;
    audio.current?.pause();
    audio.current = null;
    setSpeaking(false);
  }, []);
  useEffect(() => stopAudio, [stopAudio]);

  const play = useCallback(
    async (text: string, my: number) => {
      if (!speak || !text.trim()) return;
      setSpeaking(true);
      try {
        const url = await speak(text);
        if (my !== turn.current) return;
        const a = new Audio(url);
        audio.current = a;
        await new Promise<void>((done) => {
          a.onended = () => done();
          a.onerror = () => done();
          void a.play().catch(() => done());
        });
      } finally {
        if (my === turn.current) setSpeaking(false);
      }
    },
    [speak],
  );

  const front = card ? spokenFront(card) : "";
  const back = card ? spokenBack(card) : "";
  const reveal = useCallback(() => setRevealed(true), []);

  // Listen mode: question, a pause to think, then the answer.
  useEffect(() => {
    if (!listen || !card) return;
    const my = ++turn.current;
    void (async () => {
      if (!revealed) {
        await play(front, my);
        if (my !== turn.current) return;
        await wait(4000);
        if (my === turn.current) setRevealed(true);
      } else {
        await play(back, my);
        if (my !== turn.current || !handsFree) return;
        await wait(2500);
        // Hands-free goes on without grading; the card stays due.
        if (my === turn.current) next(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen, card?.id, revealed]);

  function next(grade: Answer | null) {
    if (!card) return;
    stopAudio();
    if (grade) {
      const updated = answer(card, grade);
      void onSave(updated, grade);
      setResults((r) => [...r, grade]);
      setById((m) => new Map(m).set(updated.id, updated));
      // Forgotten cards come back later in this session.
      const again = updated.schedule.due - Date.now() < 20 * 60_000;
      setQueue((q) => (again ? [...q.slice(1), q[0]] : q.slice(1)));
    } else setQueue((q) => [...q.slice(1), q[0]]);
    setRevealed(false);
    setWritten(null);
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) return;
      // A focused button or link handles its own Space/Enter (so "Forgot" grades as Forgot).
      if ((e.key === " " || e.key === "Enter") && (e.target as HTMLElement).closest("button,a,summary,[role=button]")) return;
      if (e.key === "Escape") return onClose();
      if (!card) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        return reveal();
      }
      if (!revealed) return;
      const map: Record<string, Answer> = fourButtons
        ? { "1": "again", "2": "hard", "3": "good", "4": "easy" }
        : { "1": "again", "2": "good", " ": "good", Enter: "good" };
      if (map[e.key]) {
        e.preventDefault();
        next(map[e.key]);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const total = cards.length;
  const remembered = results.filter((r) => r !== "again").length;

  if (!card)
    return (
      <div className="study-session done">
        <div className="study-finish">
          <Sparkles size={30} />
          <h2>{results.length ? t("Session complete") : t("Nothing to study right now")}</h2>
          {results.length > 0 && (
            <p>
              {t("{count} answers, {percent}% remembered.", {
                count: results.length,
                percent: Math.round((remembered / results.length) * 100),
              })}
            </p>
          )}
          <p className="hint">{t("Cards come back right before you would forget them.")}</p>
          <button className="primary" onClick={onClose}>
            <Check size={16} />
            {t("Done")}
          </button>
        </div>
      </div>
    );

  const parts = card.type === "cloze" ? clozeParts(card.front) : [];
  const buttons: [Answer, string][] = fourButtons
    ? [
        ["again", t("Forgot")],
        ["hard", t("Hard")],
        ["good", t("Good")],
        ["easy", t("Easy")],
      ]
    : [
        ["again", t("Forgot")],
        ["good", t("Got it")],
      ];

  return (
    <div className="study-session">
      <header className="study-head">
        <div>
          <span className="eyebrow">{title}</span>
          <div className="study-progress" aria-label={t("Progress")}>
            <span style={{ width: `${Math.min(100, (results.length / Math.max(1, total)) * 100)}%` }} />
          </div>
        </div>
        <span className="study-count">{t("{count} left", { count: queue.length })}</span>
        {speak && (
          <button
            className={"chip-toggle" + (listen ? " on" : "")}
            aria-pressed={listen}
            onClick={() => {
              stopAudio();
              setListen(!listen);
            }}
          >
            {speaking ? <LoaderCircle size={14} className="spin" /> : <Headphones size={14} />}
            {t("Listen")}
          </button>
        )}
        {handwritingAvailable() && (
          <button className={"chip-toggle" + (writeMode ? " on" : "")} aria-pressed={writeMode} onClick={() => setWriteMode(!writeMode)} data-tip={t("Answer by writing with a pen or the mouse")}>
            <PenLine size={14} />
            {t("Write")}
          </button>
        )}
        {listen && (
          <label className="check-label small">
            <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} />
            {t("Hands-free")}
          </label>
        )}
        <button className="icon-only" aria-label={t("End session")} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className={"study-card" + (revealed ? " revealed" : "")} key={card.id + String(revealed)}>
        <div className="study-face">
          {card.type === "cloze" ? (
            <p className="study-cloze">
              {parts.map((p, i) =>
                p.hidden ? (
                  <mark key={i} className={revealed ? "shown" : ""}>
                    {revealed ? p.text : " ".repeat(Math.max(6, p.text.length))}
                  </mark>
                ) : (
                  <span key={i}>
                    <MathText text={p.text} />
                  </span>
                ),
              )}
            </p>
          ) : card.type === "picture" ? (
            <>
              <p className="study-front picture-question">{card.front}</p>
              <PictureFace card={card} revealed={revealed} />
            </>
          ) : (
            <p className={"study-front" + (card.type === "translate" ? " quote" : "")}>
              <MathText text={card.front} />
            </p>
          )}
          {revealed && card.type !== "cloze" && card.type !== "picture" && <p className="study-back">
              <MathText text={card.back} />
            </p>}
        </div>
        {writeMode && !revealed && spokenAnswer(card).trim() && (
          <WriteAnswer
            key={card.id}
            expected={spokenAnswer(card)}
            onChecked={(w) => {
              setWritten(w);
              reveal();
            }}
          />
        )}
        {revealed && written && <WrittenResult written={written} />}
        {revealed && card.source && (
          <div className="study-source">
            <span>{card.source.title}</span>
            <button className="text-button" onClick={() => onShowInBook(card)}>
              <BookOpen size={14} />
              {t("Show in book")}
            </button>
          </div>
        )}
      </div>
      <footer className="study-actions">
        {!revealed ? (
          <button className="primary big" onClick={reveal}>
            {t("Show answer")}
            <kbd>{t("Space")}</kbd>
          </button>
        ) : (
          buttons.map(([a, label], i) => (
            <button key={a} className={"grade grade-" + a} onClick={() => next(a)}>
              {a === "again" && <RotateCcw size={15} />}
              <span>{label}</span>
              {hints && <small>{formatWait(hints[a] - Date.now())}</small>}
              <kbd>{i + 1}</kbd>
            </button>
          ))
        )}
      </footer>
    </div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function spokenFront(card: StudyCard) {
  if (card.type !== "cloze") return card.front;
  return clozeParts(card.front)
    .map((p) => (p.hidden ? " … " : p.text))
    .join("");
}
// What a written answer is compared with: the hidden words, or the back.
function spokenAnswer(card: StudyCard) {
  if (card.type === "cloze")
    return clozeParts(card.front)
      .filter((p) => p.hidden)
      .map((p) => p.text)
      .join(" ");
  return card.back.replace(/\$\$[^$]*\$\$/g, " ");
}
function spokenBack(card: StudyCard) {
  if (card.type === "cloze")
    return clozeParts(card.front)
      .map((p) => p.text)
      .join("");
  return card.back;
}
