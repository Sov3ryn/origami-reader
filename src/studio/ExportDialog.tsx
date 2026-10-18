import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { BookOpen, CheckCircle2, FileAudio, FolderOpen, Headphones, X, XCircle } from "lucide-react";
import { t } from "../i18n";
import type { Book } from "../types";
import {
  aiLine,
  cancelExport,
  chooseFolder,
  creditLine,
  creditTitle,
  exportProduction,
  manuscript,
  revealFile,
  watermarkReady,
  type ExportDone,
  type ExportProgress,
  type Production,
} from "./production";

// Export: an audiobook (M4B with chapters, or MP3 per chapter), an EPUB and a
// print PDF. Every file carries the "Made with Origami Studio" credit; audio
// also gets the spoken credit, AI labels and the inaudible watermark.
const TRIMS: [string, [number, number]][] = [
  ["5 x 8 in", [5, 8]],
  ["5.5 x 8.5 in", [5.5, 8.5]],
  ["6 x 9 in", [6, 9]],
];

export function ExportDialog({
  production,
  book,
  titles,
  onClose,
}: {
  production: Production;
  book: Book | null;
  titles: Map<number, string>;
  onClose: () => void;
}) {
  const { info, units } = production;
  const [m4b, setM4b] = useState(true);
  const [mp3, setMp3] = useState(false);
  const [epub, setEpub] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [trim, setTrim] = useState(1);
  const [font, setFont] = useState("EB Garamond");
  const [large, setLarge] = useState(false);
  const [narrator, setNarrator] = useState(t("Digital voices"));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [rights, setRights] = useState("");
  const [folder, setFolder] = useState("");
  const [wmReady, setWmReady] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("");
  const [value, setValue] = useState(0);
  const [done, setDone] = useState<ExportDone | null>(null);

  const missing = units.filter((u) => !u.take).length;
  const unapproved = units.filter((u) => u.take && u.status !== "approved").length;
  const audio = m4b || mp3;
  useEffect(() => {
    void watermarkReady().then(setWmReady);
    const off = [
      listen<ExportProgress>("studio-export-progress", (e) => {
        if (e.payload.id !== info.id) return;
        setStep(e.payload.step);
        setValue(e.payload.value);
      }),
      listen<ExportDone>("studio-export-done", (e) => {
        if (e.payload.id !== info.id) return;
        setRunning(false);
        setDone(e.payload);
      }),
    ];
    return () => off.forEach((p) => void p.then((f) => f()));
  }, [info.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !running && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [running, onClose]);
  const cover = useMemo(() => {
    const c = book?.meta.coverImage || "";
    const m = c.match(/^data:image\/[a-z+]+;base64,(.+)$/);
    return m ? m[1] : null;
  }, [book]);

  async function start() {
    setDone(null);
    setStep(t("Starting"));
    setValue(0);
    const chapterTitles: Record<string, string> = {};
    for (const u of units) if (!(u.chapter in chapterTitles)) chapterTitles[u.chapter] = titles.get(u.chapter) || t("Chapter {n}", { n: String(u.chapter + 1) });
    const rightsLines = rights.split("\n").map((l) => l.trim()).filter(Boolean);
    try {
      setRunning(true);
      await exportProduction(info.id, {
        folder,
        m4b,
        mp3,
        epub,
        pdf,
        credit: audio ? creditLine(info) : "",
        creditTitle: creditTitle(info.language),
        titles: chapterTitles,
        meta: { title: info.title, author: info.author, narrator, year },
        cover,
        manuscript: epub || pdf ? manuscript(production, book, { rights: rightsLines, ai: production.takes.length ? aiLine(info.language) : "" }) : null,
        print: { trim: TRIMS[trim][1], font, bleed: false, large },
      });
    } catch (e) {
      setRunning(false);
      setDone({ id: info.id, ok: false, message: String(e) });
    }
  }

  const nothing = !m4b && !mp3 && !epub && !pdf;
  return (
    <div className="studio-dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <section className="studio-dialog" role="dialog" aria-modal="true" aria-labelledby="studio-export-title">
        <header>
          <h2 id="studio-export-title">{t("Export")}</h2>
          <button className="icon-only" onClick={onClose} disabled={running} aria-label={t("Close")}>
            <X size={17} />
          </button>
        </header>

        {done?.ok && done.result ? (
          <div className="studio-export-done">
            <p className="studio-success">
              <CheckCircle2 size={18} /> {t("Export finished.")}
            </p>
            <ul className="studio-files">
              {done.result.files.map((f) => (
                <li key={f}>
                  <span title={f}>{f.split(/[\\/]/).pop()}</span>
                  <button onClick={() => void revealFile(f)}>
                    <FolderOpen size={14} /> {t("Show in folder")}
                  </button>
                </li>
              ))}
            </ul>
            {done.result.report.length > 0 && (
              <>
                <h3>{t("Levels")}</h3>
                <p className="studio-hint">{t("Audiobook stores ask for an RMS of -23 to -18 dB, peaks under -3 dB and a noise floor under -60 dB.")}</p>
                <table className="studio-levels">
                  <thead>
                    <tr>
                      <th>{t("Chapter")}</th>
                      <th>RMS</th>
                      <th>{t("Peak")}</th>
                      <th>{t("Floor")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {done.result.report.map((r, i) => (
                      <tr key={i}>
                        <td>{r.title}</td>
                        <td>{r.rms}</td>
                        <td>{r.peak}</td>
                        <td>{r.floor}</td>
                        <td>{r.pass ? <CheckCircle2 size={15} className="ok" aria-label={t("Passes")} /> : <XCircle size={15} className="bad" aria-label={t("Check")} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="studio-hint">
              {t("Export id {id}. Exported files are yours: deleting the production never removes them.", { id: done.result.exportId })}
            </p>
            <div className="studio-row end">
              <button className="primary" onClick={onClose}>
                {t("Done")}
              </button>
            </div>
          </div>
        ) : running ? (
          <div className="studio-export-running">
            <p>{step}</p>
            <span className="studio-progress" aria-hidden="true">
              <i style={{ width: `${Math.round(value * 100)}%` }} />
            </span>
            <div className="studio-row end">
              <button onClick={() => void cancelExport()}>{t("Cancel")}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="studio-export-grid">
              <fieldset>
                <legend>
                  <Headphones size={15} /> {t("Audiobook")}
                </legend>
                <label className="studio-check">
                  <input type="checkbox" checked={m4b} onChange={(e) => setM4b(e.target.checked)} disabled={wmReady === false} />
                  <span>
                    {t("M4B with chapters")}
                    <small>{t("One file, for audiobook apps and most stores.")}</small>
                  </span>
                </label>
                <label className="studio-check">
                  <input type="checkbox" checked={mp3} onChange={(e) => setMp3(e.target.checked)} disabled={wmReady === false} />
                  <span>
                    {t("MP3, one file per chapter")}
                    <small>{t("128 kbps with Windows' own encoder.")}</small>
                  </span>
                </label>
                {wmReady === false && <p className="studio-warn">{t("The watermark model is not installed, so audio cannot be exported yet.")}</p>}
                {audio && (
                  <p className="studio-hint">
                    <FileAudio size={13} /> {t("Opens with: “{credit}”", { credit: creditLine(info) })}
                  </p>
                )}
                {audio && (missing > 0 || unapproved > 0) && (
                  <p className="studio-warn">
                    {missing > 0 && t("{n} lines have no audio and will be left out.", { n: String(missing) }) + " "}
                    {unapproved > 0 && t("{n} lines are not approved yet; their current take is used.", { n: String(unapproved) })}
                  </p>
                )}
              </fieldset>
              <fieldset>
                <legend>
                  <BookOpen size={15} /> {t("Book")}
                </legend>
                <label className="studio-check">
                  <input type="checkbox" checked={epub} onChange={(e) => setEpub(e.target.checked)} />
                  <span>
                    {t("EPUB ebook")}
                    <small>{t("The book's text, with its cover and contents.")}</small>
                  </span>
                </label>
                <label className="studio-check">
                  <input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} />
                  <span>
                    {t("Print PDF")}
                    <small>{t("Typeset for print, with margins that follow KDP's rules.")}</small>
                  </span>
                </label>
                {pdf && (
                  <div className="studio-inline">
                    <select value={trim} onChange={(e) => setTrim(Number(e.target.value))} aria-label={t("Trim size")}>
                      {TRIMS.map(([label], i) => (
                        <option key={label} value={i}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select value={font} onChange={(e) => setFont(e.target.value)} aria-label={t("Typeface")}>
                      <option>EB Garamond</option>
                      <option>Literata</option>
                    </select>
                    <label className="studio-check small">
                      <input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} />
                      <span>{t("Large print")}</span>
                    </label>
                  </div>
                )}
              </fieldset>
            </div>
            <details className="studio-details">
              <summary>{t("Credits and rights")}</summary>
              <label className="studio-field">
                <span>{t("Narrator credit")}</span>
                <input value={narrator} onChange={(e) => setNarrator(e.target.value)} />
              </label>
              <label className="studio-field">
                <span>{t("Year")}</span>
                <input value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} inputMode="numeric" />
              </label>
              <label className="studio-field">
                <span>{t("Copyright page lines (optional)")}</span>
                <textarea rows={3} value={rights} onChange={(e) => setRights(e.target.value)} placeholder={t("For example: Text in the public domain. Cover by the author.")} />
              </label>
            </details>
            <p className="studio-hint">{t("Every export carries “Made with Origami Studio” and the crane on its copyright page; audiobooks say it in their opening credits and carry AI labels and an inaudible watermark.")}</p>
            {done && !done.ok && <p className="studio-error" role="alert">{done.cancelled ? t("Export cancelled.") : done.message}</p>}
            <div className="studio-row folder">
              <button onClick={() => void chooseFolder().then((f) => f && setFolder(f))}>
                <FolderOpen size={15} /> {folder ? t("Change folder") : t("Choose a folder")}
              </button>
              <span className="studio-path" title={folder}>
                {folder || t("No folder chosen")}
              </span>
              <button className="primary" disabled={!folder || nothing || (audio && wmReady === false)} onClick={() => void start()}>
                {t("Export")}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
