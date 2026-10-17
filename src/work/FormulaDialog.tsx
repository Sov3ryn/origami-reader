import { useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { t } from "../i18n";

// Writing a formula in LaTeX with a live preview. Opens from the slash menu,
// from typing $$x^2$$, or by clicking a formula in a note.
const examples = (): [string, string][] => [
  [t("Fraction"), "\\frac{a}{b}"],
  [t("Power"), "x^{2}"],
  [t("Root"), "\\sqrt{x}"],
  [t("Sum"), "\\sum_{i=1}^{n} i"],
  [t("Integral"), "\\int_{0}^{1} f(x)\\,dx"],
  [t("Matrix"), "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"],
  [t("Greek"), "\\alpha \\beta \\pi \\Delta"],
  [t("Chemistry"), "\\mathrm{H_2O \\rightarrow H^+ + OH^-}"],
];

export function renderFormula(latex: string, block: boolean) {
  try {
    return { html: katex.renderToString(latex || "\\;", { displayMode: block, throwOnError: true, strict: "ignore" }), error: "" };
  } catch (e) {
    return { html: "", error: e instanceof Error ? e.message.replace(/^KaTeX parse error: /, "") : String(e) };
  }
}

export function FormulaDialog({
  latex: initial,
  block: initialBlock,
  editing,
  onSave,
  onRemove,
  onClose,
}: {
  latex: string;
  block: boolean;
  editing: boolean;
  onSave: (latex: string, block: boolean) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [latex, setLatex] = useState(initial);
  const [block, setBlock] = useState(initialBlock);
  const preview = useMemo(() => renderFormula(latex, block), [latex, block]);
  const save = () => latex.trim() && !preview.error && onSave(latex.trim(), block);
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="quick-dialog formula-dialog" role="dialog" aria-modal="true" aria-labelledby="formula-title">
        <h2 id="formula-title">{editing ? t("Edit formula") : t("Insert formula")}</h2>
        <div className={"formula-preview" + (block ? " block" : "")} aria-live="polite">
          {preview.error ? (
            <span className="formula-error">{preview.error}</span>
          ) : latex.trim() ? (
            <span dangerouslySetInnerHTML={{ __html: preview.html }} />
          ) : (
            <span className="hint">{t("The formula appears here as you type.")}</span>
          )}
        </div>
        <label className="card-field">
          <span>{t("LaTeX")}</span>
          <textarea
            autoFocus
            rows={3}
            spellCheck={false}
            value={latex}
            placeholder="E = mc^2"
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") onClose();
            }}
          />
        </label>
        <div className="formula-examples" aria-label={t("Examples")}>
          {examples().map(([name, tex]) => (
            <button key={name} type="button" className="mini" data-tip={tex} onClick={() => setLatex((v) => (v ? v + " " : "") + tex)}>
              {name}
            </button>
          ))}
        </div>
        <label className="check-label">
          <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
          {t("On its own line, centred")}
        </label>
        <div className="dialog-actions">
          {onRemove && (
            <button className="danger-text" onClick={onRemove}>
              {t("Remove")}
            </button>
          )}
          <span className="spacer" />
          <button onClick={onClose}>{t("Cancel")}</button>
          <button className="primary" disabled={!latex.trim() || Boolean(preview.error)} onClick={save} data-tip={t("Save")} data-keys="Ctrl+Enter">
            {editing ? t("Save") : t("Insert")}
          </button>
        </div>
      </section>
    </div>
  );
}

// Text with $$formulas$$ in it (study cards), drawn with KaTeX.
export function MathText({ text }: { text: string }) {
  if (!text.includes("$$")) return <>{text}</>;
  const parts = text.split(/(\$\$[^$]+?\$\$)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^\$\$[^$]+\$\$$/.test(p)) return p;
        const r = renderFormula(p.slice(2, -2), false);
        return r.error ? p : <span key={i} className="card-math" dangerouslySetInnerHTML={{ __html: r.html }} />;
      })}
    </>
  );
}
