import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, RotateCcw, Sparkles, X } from "lucide-react";
import { t } from "../i18n";
import { MathText } from "./FormulaDialog";
import { PictureFace } from "./PictureCards";
import { buildTest, grade, type PracticeMode, type Question } from "./practice";
import type { StudyCard } from "./types";

type Answer = { q: Question; given: string; result: "right" | "close" | "wrong" };

// A practice test from a set of cards: multiple choice, typed answers or
// both. Nothing here changes when cards come back; it is only practice.
export function PracticeTest({
  cards,
  title,
  onStudy,
  onClose,
}: {
  cards: StudyCard[];
  title: string;
  onStudy: (cards: StudyCard[], title: string) => void;
  onClose: () => void;
}) {
  const [setup, setSetup] = useState<{ count: number; mode: PracticeMode } | null>(null);
  const [round, setRound] = useState(0);
  const [pool, setPool] = useState(cards);
  const questions = useMemo(() => (setup ? buildTest(pool, setup.count, setup.mode) : []), [setup, pool, round]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState<Answer | null>(null);
  const q = questions[answers.length];
  const done = setup && answers.length >= questions.length;
  // 1 to 4 pick a choice; Enter goes on.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (shown && e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (!shown && q?.choices && /^[1-4]$/.test(e.key)) answer(q.choices[+e.key - 1]);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const answer = (given: string) => {
    if (!q) return;
    const result = q.choices ? (given === q.answer.trim() ? "right" : "wrong") : grade(given, q.answer);
    const a = { q, given, result } as Answer;
    setShown(a);
  };
  const next = () => {
    if (!shown) return;
    setAnswers([...answers, shown]);
    setShown(null);
    setTyped("");
  };
  const restart = (cardsAgain: StudyCard[]) => {
    setPool(cardsAgain);
    setAnswers([]);
    setShown(null);
    setTyped("");
    setRound((r) => r + 1);
    if (setup) setSetup({ ...setup, count: Math.min(setup.count, cardsAgain.length) });
  };

  if (!setup)
    return (
      <section className="work-page practice">
        <header className="work-page-head">
          <div>
            <span className="eyebrow">{title}</span>
            <h1>{t("Practice test")}</h1>
          </div>
          <button className="icon-only" aria-label={t("Close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <p className="hint">{t("A quick test on {count} cards. It does not change when cards come back, so practise as often as you like.", { count: cards.length })}</p>
        <PracticeSetup max={cards.length} onStart={setSetup} />
      </section>
    );

  if (done) {
    const right = answers.filter((a) => a.result !== "wrong").length;
    const missed = answers.filter((a) => a.result === "wrong").map((a) => a.q.card);
    return (
      <section className="work-page practice">
        <header className="work-page-head">
          <div>
            <span className="eyebrow">{title}</span>
            <h1>{t("{right} of {total} right", { right, total: answers.length })}</h1>
          </div>
          <button className="icon-only" aria-label={t("Close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="practice-score" style={{ ["--score" as string]: `${Math.round((right / Math.max(1, answers.length)) * 100)}%` }}>
          <span>{Math.round((right / Math.max(1, answers.length)) * 100)}%</span>
        </div>
        {missed.length > 0 && (
          <>
            <h2 className="work-subhead">{t("To look at again")}</h2>
            <ul className="practice-missed">
              {answers
                .filter((a) => a.result === "wrong")
                .map((a) => (
                  <li key={a.q.card.id}>
                    <strong>
                      <MathText text={a.q.prompt} />
                    </strong>
                    <span>
                      {t("Answer")}: <MathText text={a.q.answer} />
                    </span>
                    {a.given && (
                      <small>
                        {t("You answered")}: {a.given}
                      </small>
                    )}
                  </li>
                ))}
            </ul>
          </>
        )}
        <div className="practice-actions">
          {missed.length > 0 && (
            <>
              <button className="primary" onClick={() => restart(missed)}>
                <RotateCcw size={15} />
                {t("Practise the missed ones")}
              </button>
              <button onClick={() => onStudy(missed, t("Missed in practice"))}>
                <Sparkles size={15} />
                {t("Study them now")}
              </button>
            </>
          )}
          <button onClick={() => restart(cards)}>{t("New test")}</button>
          <button onClick={onClose}>{t("Done")}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="work-page practice">
      <header className="study-head">
        <div>
          <span className="eyebrow">{title}</span>
          <div className="study-progress" aria-label={t("Progress")}>
            <span style={{ width: `${(answers.length / Math.max(1, questions.length)) * 100}%` }} />
          </div>
        </div>
        <span className="study-count">{t("{count} left", { count: questions.length - answers.length })}</span>
        <button className="icon-only" aria-label={t("End practice")} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {q && (
        <div className="practice-card">
          <p className="study-front">
            <MathText text={q.prompt} />
          </p>
          {q.card.type === "picture" && <PictureFace card={q.card} revealed={Boolean(shown)} />}
          {q.choices ? (
            <div className="practice-choices">
              {q.choices.map((c, i) => (
                <button
                  key={c}
                  disabled={Boolean(shown)}
                  className={shown ? (c === q.answer.trim() ? "right" : c === shown.given ? "wrong" : "") : ""}
                  onClick={() => answer(c)}
                >
                  <kbd>{i + 1}</kbd>
                  <MathText text={c} />
                </button>
              ))}
            </div>
          ) : (
            <form
              className="practice-typed"
              onSubmit={(e) => {
                e.preventDefault();
                if (shown) next();
                else answer(typed);
              }}
            >
              <input autoFocus value={typed} disabled={Boolean(shown)} placeholder={t("Type the answer")} onChange={(e) => setTyped(e.target.value)} />
              {!shown && (
                <button className="primary" type="submit">
                  {t("Check")}
                </button>
              )}
            </form>
          )}
          {shown && (
            <div className={"practice-feedback " + shown.result}>
              {shown.result === "right" ? <Check size={16} /> : shown.result === "close" ? <Check size={16} /> : <X size={16} />}
              <span>
                {shown.result === "right" ? t("Right") : shown.result === "close" ? t("Nearly: check the spelling") : t("Not quite")}
                {shown.result !== "right" && (
                  <>
                    {" · "}
                    {t("Answer")}: <MathText text={q.answer} />
                  </>
                )}
              </span>
              <button className="primary" autoFocus onClick={next}>
                {answers.length + 1 >= questions.length ? t("See results") : t("Next")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PracticeSetup({ max, onStart }: { max: number; onStart: (s: { count: number; mode: PracticeMode }) => void }) {
  const [count, setCount] = useState(Math.min(10, max));
  const [mode, setMode] = useState<PracticeMode>("mixed");
  const sizes = [...new Set([5, 10, 20, max].filter((n) => n <= max && n > 0))];
  return (
    <div className="practice-setup">
      <div className="segmented" role="group" aria-label={t("Questions")}>
        {sizes.map((n) => (
          <button key={n} className={count === n ? "active" : ""} aria-pressed={count === n} onClick={() => setCount(n)}>
            {n === max && n > 20 ? t("All {count}", { count: n }) : n}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label={t("Kind of questions")}>
        {(
          [
            ["mixed", t("Mixed")],
            ["choice", t("Multiple choice")],
            ["typed", t("Type the answer")],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={mode === id ? "active" : ""} aria-pressed={mode === id} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      {mode !== "typed" && max < 4 && (
        <p className="hint">{t("Multiple choice needs at least four cards with different answers; these questions will ask you to type the answer.")}</p>
      )}
      <button className="primary big" disabled={!max} onClick={() => onStart({ count, mode })}>
        <ClipboardCheck size={16} />
        {t("Start the test")}
      </button>
    </div>
  );
}
