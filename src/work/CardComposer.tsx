import { useMemo, useState } from "react";
import { BookOpen, Check, GalleryVerticalEnd, Languages, MessageCircleQuestion, Rows3 } from "lucide-react";
import { t } from "../i18n";
import { clozeFront, clozeParts, splitTerm, suggestBlank, words } from "./cards";
import type { CardSource, CardType, Subject } from "./types";

export type CardDraft = {
  type: CardType;
  front: string;
  back: string;
  subjectId?: string;
};

// Turns a selected passage into a study card. Used while reading, beside a
// source in Work Mode and from a note.
export function CardComposer({
  text,
  source,
  subjects,
  subjectId,
  compact = false,
  onSave,
  onCancel,
}: {
  text: string;
  source?: CardSource;
  subjects: Subject[];
  subjectId?: string;
  compact?: boolean;
  onSave: (draft: CardDraft) => void | Promise<void>;
  onCancel: () => void;
}) {
  const sentence = text.replace(/\s+/g, " ").trim();
  const term = useMemo(() => splitTerm(sentence), [sentence]);
  const [type, setType] = useState<CardType>(term ? "term" : "cloze");
  const list = useMemo(() => words(sentence), [sentence]);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set(suggestBlank(sentence)));
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(sentence);
  const [termText, setTermText] = useState(term?.term || "");
  const [meaning, setMeaning] = useState(term?.meaning || sentence);
  const [translation, setTranslation] = useState("");
  const [subject, setSubject] = useState(subjectId || "");
  const [saving, setSaving] = useState(false);

  const draft: CardDraft | null = (() => {
    const s = subject || undefined;
    if (type === "cloze") {
      const front = clozeFront(sentence, hidden);
      return clozeParts(front).some((p) => p.hidden) ? { type, front, back: "", subjectId: s } : null;
    }
    if (type === "qa")
      return question.trim() && answer.trim() ? { type, front: question, back: answer, subjectId: s } : null;
    if (type === "term")
      return termText.trim() && meaning.trim() ? { type, front: termText, back: meaning, subjectId: s } : null;
    return translation.trim() ? { type, front: sentence, back: translation, subjectId: s } : null;
  })();

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  const types: [CardType, string, React.ReactNode][] = [
    ["cloze", t("Fill in the blank"), <Rows3 size={14} />],
    ["qa", t("Question"), <MessageCircleQuestion size={14} />],
    ["term", t("Term"), <BookOpen size={14} />],
    ["translate", t("Translate"), <Languages size={14} />],
  ];

  return (
    <div
      className={"card-composer" + (compact ? " compact" : "")}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
      }}
    >
      <div className="card-composer-head">
        <GalleryVerticalEnd size={16} />
        <strong>{t("New study card")}</strong>
        {source && <small title={source.title}>{source.title}</small>}
      </div>
      <div className="card-types" role="tablist" aria-label={t("Card type")}>
        {types.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={type === id} className={type === id ? "active" : ""} onClick={() => setType(id)}>
            {icon}
            {label}
          </button>
        ))}
      </div>
      {type === "cloze" && (
        <>
          <p className="card-hint">{t("Click the words to hide. You will try to remember them.")}</p>
          <p className="cloze-picker">
            {list.map((w, i) =>
              w.word ? (
                <button
                  key={i}
                  type="button"
                  aria-pressed={hidden.has(i)}
                  className={hidden.has(i) ? "hidden-word" : ""}
                  onClick={() =>
                    setHidden((old) => {
                      const next = new Set(old);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                >
                  {w.text}
                </button>
              ) : (
                <span key={i}>{w.text}</span>
              ),
            )}
          </p>
        </>
      )}
      {type === "qa" && (
        <>
          <label className="card-field">
            <span>{t("Question")}</span>
            <input autoFocus value={question} placeholder={t("What is…?")} onChange={(e) => setQuestion(e.target.value)} />
          </label>
          <label className="card-field">
            <span>{t("Answer")}</span>
            <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </label>
        </>
      )}
      {type === "term" && (
        <>
          <label className="card-field">
            <span>{t("Term")}</span>
            <input autoFocus value={termText} onChange={(e) => setTermText(e.target.value)} />
          </label>
          <label className="card-field">
            <span>{t("Meaning")}</span>
            <textarea rows={3} value={meaning} onChange={(e) => setMeaning(e.target.value)} />
          </label>
        </>
      )}
      {type === "translate" && (
        <>
          <blockquote className="card-quote">{sentence}</blockquote>
          <label className="card-field">
            <span>{t("In your language")}</span>
            <textarea autoFocus rows={3} value={translation} onChange={(e) => setTranslation(e.target.value)} />
          </label>
        </>
      )}
      <div className="card-composer-foot">
        {subjects.length > 0 && (
          <select aria-label={t("Subject")} value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">{t("No subject")}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <button type="button" onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button type="button" className="primary" disabled={!draft || saving} onClick={() => void save()}>
          <Check size={15} />
          {t("Save card")}
        </button>
      </div>
    </div>
  );
}
