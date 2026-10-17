import { useState } from "react";
import { Check, Eraser, LoaderCircle, Pen, Trash2, Undo2 } from "lucide-react";
import { t } from "../../i18n";
import { InkPad } from "./InkPad";
import { loadPadSettings } from "./InkBlock";
import { answerMatch, emptyInk, linesText, recognize, savedReader, type InkData } from "./ink";

export type Written = { text: string; score: number };

// Answering a study card by writing: the handwriting is read, compared with
// the answer, and shown beside it. The reader still decides how well it went.
export function WriteAnswer({ expected, onChecked }: { expected: string; onChecked: (w: Written) => void }) {
  const [ink, setInk] = useState<InkData>(() => emptyInk(260));
  const [eraser, setEraser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const base = loadPadSettings();
  const settings = { ...base, tool: eraser ? ("eraser" as const) : base.tool === "highlighter" || base.tool === "eraser" ? ("pen" as const) : base.tool };
  const check = async () => {
    setBusy(true);
    setProblem("");
    try {
      const text = linesText(await recognize(ink, savedReader())).replace(/\n/g, " ").trim();
      onChecked({ text, score: answerMatch(text, expected) });
    } catch (e) {
      setProblem(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="write-answer">
      <div className="write-answer-bar">
        <span>{t("Write your answer")}</span>
        <span className="ink-spacer" />
        <button type="button" className={"ink-tool" + (!eraser ? " active" : "")} data-tip={t("Pen")} onClick={() => setEraser(false)}>
          <Pen size={15} />
        </button>
        <button type="button" className={"ink-tool" + (eraser ? " active" : "")} data-tip={t("Eraser (or the pen's eraser end)")} onClick={() => setEraser(true)}>
          <Eraser size={15} />
        </button>
        <button type="button" className="ink-tool" data-tip={t("Undo stroke")} disabled={!ink.strokes.length} onClick={() => setInk({ ...ink, strokes: ink.strokes.slice(0, -1) })}>
          <Undo2 size={15} />
        </button>
        <button type="button" className="ink-tool" data-tip={t("Clear")} disabled={!ink.strokes.length} onClick={() => setInk(emptyInk(ink.h))}>
          <Trash2 size={15} />
        </button>
        <button type="button" className="mini primary" disabled={!ink.strokes.length || busy} onClick={() => void check()}>
          {busy ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}
          {t("Check")}
        </button>
      </div>
      <InkPad ink={ink} onChange={setInk} editing settings={settings} label={t("Write your answer")} autoGrow={false} />
      {problem && (
        <p className="ink-result-error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

export function WrittenResult({ written }: { written: Written }) {
  const level = written.score >= 0.9 ? "match" : written.score >= 0.6 ? "close" : "off";
  return (
    <p className={"written-result " + level}>
      <span>{t("You wrote")}</span>
      <strong>{written.text || "…"}</strong>
      <em>{level === "match" ? t("Matches the answer") : level === "close" ? t("Close to the answer") : t("Different from the answer")}</em>
    </p>
  );
}
