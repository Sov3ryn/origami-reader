import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { BookOpen, CheckCircle2, FileAudio, FolderOpen, Headphones, X, XCircle } from "lucide-react";
import { t } from "../i18n";
import type { Book } from "../types";
import { StudioSetup } from "./StudioSetup";
import { useModal } from "../components/useModal";
import {
  aiLine,
  cancelExport,
  chooseFolder,
  creditLine,
  creditTitle,
  exportProduction,
  manuscript,
  previewPrint,
  revealFile,
  shownText,
  watermarkReady,
  refusingStores,
  storeProfiles,
  type ExportDone,
  type ExportProgress,
  type Production,
} from "./production";
import { recordFeat } from "../feats";

// Export: an audiobook (M4B with chapters, or MP3 per chapter), an EPUB and a
// print PDF. Every file carries the "Made with Origami Reader" credit; audio
// also gets the spoken credit, AI labels and the inaudible watermark.
const TRIMS: [string, [number, number]][] = [
  ["5 x 8 in", [5, 8]],
  ["5.5 x 8.5 in", [5.5, 8.5]],
  ["6 x 9 in", [6, 9]],
];

// Export steps the back end sends as untranslated keys. Never called: it lists
// the literals so scripts/extract-strings.mjs finds them.
export const EXPORT_STEPS = () => [
  t("Recording the opening credits"),
  t("Preparing the background sound"),
  t("Writing the stems of {title}"),
  t("Mastering {title}"),
  t("Finishing the audiobook"),
  t("Writing the read-along ebook"),
  t("Writing the ebook"),
  t("Typesetting the print book"),
  t("Writing the Word manuscript"),
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
  // Audio needs at least one line with a take (the export uses any take, approved or not).
  const heard = units.some((u) => u.take);
  const [m4b, setM4b] = useState(heard);
  const [mp3, setMp3] = useState(false);
  const [epub, setEpub] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [docx, setDocx] = useState(false);
  const [readalong, setReadalong] = useState(false);
  const [stems, setStems] = useState(false);
  const [sample, setSample] = useState(false);
  const [trim, setTrim] = useState(1);
  const [font, setFont] = useState("EB Garamond");
  const [large, setLarge] = useState(false);
  const [theme, setTheme] = useState("classic");
  const [narrator, setNarrator] = useState(t("Digital voices"));
  const [store, setStore] = useState("personal");
  const profile = storeProfiles.find((s) => s.id === store) || storeProfiles[0];
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [rights, setRights] = useState("");
  const [bleed, setBleed] = useState(false);
  const [matter, setMatter] = useState({ dedication: "", epigraph: "", epigraph_by: "", acknowledgements: "", about: "", also_by: "" });
  const [preview, setPreview] = useState<{ pages: number; images: string[]; first: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [folder, setFolder] = useState("");
  const [wmReady, setWmReady] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("");
  const [value, setValue] = useState(0);
  const [done, setDone] = useState<ExportDone | null>(null);
  const [error, setError] = useState("");
  const scrim = useRef<HTMLDivElement>(null);
  useModal(scrim);
  // Counts preview requests, so a typesetting that ends after the options changed is dropped.
  const previewRun = useRef(0);

  const missing = units.filter((u) => !u.take).length;
  const unapproved = units.filter((u) => u.take && u.status !== "approved").length;
  const audio = m4b || mp3 || readalong || stems || sample;
  useEffect(() => {
    void watermarkReady().then(setWmReady);
    const off = [
      listen<ExportProgress>("studio-export-progress", (e) => {
        if (e.payload.id !== info.id) return;
        setStep(e.payload.key ? t(e.payload.key, { title: e.payload.title ?? "" }) : e.payload.step);
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
  // A preview typeset with other options no longer shows what will be exported.
  useEffect(() => {
    previewRun.current++;
    setPreview(null);
    setPreviewing(false);
  }, [trim, font, large, bleed, theme, pdf, matter, rights]);
  const cover = useMemo(() => {
    const c = book?.meta.coverImage || "";
    const m = c.match(/^data:image\/[a-z+]+;base64,(.+)$/);
    return m ? m[1] : null;
  }, [book]);

  // The manuscript with its front and back matter, for exports and the preview.
  function bookData() {
    const rightsLines = rights.split("\n").map((l) => l.trim()).filter(Boolean);
    const m = manuscript(production, book, { rights: rightsLines, ai: production.takes.length ? aiLine(info.language) : "" });
    return { ...m, ...matter, theme, also_by: matter.also_by.split("\n").map((l) => l.trim()).filter(Boolean) };
  }
  async function showPages(first: number) {
    const run = ++previewRun.current;
    setPreviewing(true);
    setError("");
    try {
      // Book spreads: the first page alone on the right, then even pages on the left.
      const r = await previewPrint(bookData(), { trim: TRIMS[trim][1], font, bleed, large }, first, first === 0 ? 1 : 2);
      if (run === previewRun.current) setPreview({ ...r, first });
    } catch (e) {
      if (run === previewRun.current) setError(String(e));
    } finally {
      if (run === previewRun.current) setPreviewing(false);
    }
  }
  async function start() {
    recordFeat("studio-export");
    setDone(null);
    setStep(t("Starting"));
    setValue(0);
    const chapterTitles: Record<string, string> = {};
    for (const u of units) if (!(u.chapter in chapterTitles)) chapterTitles[u.chapter] = titles.get(u.chapter) || t("Chapter {n}", { n: String(u.chapter + 1) });
    try {
      setRunning(true);
      await exportProduction(info.id, {
        folder,
        m4b,
        mp3,
        epub,
        pdf,
        docx,
        readalong,
        stems,
        sample,
        speakers: { "": t("Narrator"), ...Object.fromEntries((info.cast || []).map((c) => [c.id, c.name])) },
        aiLine: aiLine(info.language),
        shown: readalong ? shownText(production, book) : {},
        credit: audio ? creditLine(info) : "",
        creditTitle: creditTitle(info.language),
        titles: chapterTitles,
        meta: { title: info.title, author: info.author, narrator, year },
        cover,
        manuscript: epub || pdf || readalong || docx ? bookData() : null,
        print: { trim: TRIMS[trim][1], font, bleed, large },
      });
    } catch (e) {
      setRunning(false);
      setDone({ id: info.id, ok: false, message: String(e) });
    }
  }

  const nothing = !m4b && !mp3 && !epub && !pdf && !docx && !readalong && !stems && !sample;
  return (
    <div ref={scrim} className="studio-dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
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
            {done.result.sampleMissing && <p className="studio-warn">{t("No chapter has a minute of lines yet, so no retail sample was made.")}</p>}
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
              <button className="primary" autoFocus onClick={onClose}>
                {t("Done")}
              </button>
            </div>
          </div>
        ) : running ? (
          <div className="studio-export-running">
            <p role="status">{step}</p>
            <span className="studio-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={t("Export")}>
              <i style={{ width: `${Math.round(value * 100)}%` }} />
            </span>
            <div className="studio-row end">
              <button autoFocus onClick={() => void cancelExport()}>
                {t("Cancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="studio-field">
              <span>{t("Where will it go?")}</span>
              <select
                data-autofocus
                value={store}
                onChange={(e) => {
                  const next = storeProfiles.find((s) => s.id === e.target.value) || storeProfiles[0];
                  setStore(next.id);
                  setNarrator(t(next.narrator));
                  setM4b(heard && next.m4b);
                  setMp3(heard && next.mp3);
                }}
              >
                {storeProfiles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.name)}
                  </option>
                ))}
              </select>
            </label>
            <p className="studio-hint">
              {t(profile.note)} {t("Check the store's current rules before publishing.")} {t(refusingStores)}
            </p>
            <div className="studio-export-grid">
              <fieldset>
                <legend>
                  <Headphones size={15} /> {t("Audiobook")}
                </legend>
                <label className="studio-check">
                  <input type="checkbox" checked={m4b} onChange={(e) => setM4b(e.target.checked)} disabled={wmReady === false || !heard} />
                  <span>
                    {t("M4B with chapters")}
                    <small>{t("One file, for audiobook apps and most stores.")}</small>
                  </span>
                </label>
                <label className="studio-check">
                  <input type="checkbox" checked={mp3} onChange={(e) => setMp3(e.target.checked)} disabled={wmReady === false || !heard} />
                  <span>
                    {t("MP3, one file per chapter")}
                    <small>{t("128 kbps with Windows' own encoder.")}</small>
                  </span>
                </label>
                <label className="studio-check">
                  <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} disabled={wmReady === false || !heard} />
                  <span>
                    {t("Retail sample")}
                    <small>{t("Up to five minutes from the start of the story, without the credits, for a store page.")}</small>
                  </span>
                </label>
                <label className="studio-check">
                  <input type="checkbox" checked={stems} onChange={(e) => setStems(e.target.checked)} disabled={wmReady === false || !heard} />
                  <span>
                    {t("Stems, one WAV per speaker")}
                    <small>{t("For a sound editor: every chapter as one track per speaker, lined up, unlimited 32-bit WAV.")}</small>
                  </span>
                </label>
                {!heard && <p className="studio-hint">{t("No line has audio yet, so only the book can be exported.")}</p>}
                {heard && wmReady === false && (
                  <>
                    <p className="studio-warn">{t("The watermark model is not installed, so audio cannot be exported yet.")}</p>
                    <StudioSetup only={["watermark"]} onChange={() => void watermarkReady().then(setWmReady)} />
                  </>
                )}
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
                  <input type="checkbox" checked={readalong} onChange={(e) => setReadalong(e.target.checked)} disabled={wmReady === false || !heard} />
                  <span>
                    {t("Read-along EPUB")}
                    <small>{t("The ebook with the narration: each line lights up as it is read, in readers that support it.")}</small>
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
                    <label className="studio-check small">
                      <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
                      <span>{t("Bleed")}</span>
                    </label>
                    <button onClick={() => void showPages(0)} disabled={previewing}>
                      {previewing ? t("Typesetting") : t("Preview pages")}
                    </button>
                  </div>
                )}
                <label className="studio-check">
                  <input type="checkbox" checked={docx} onChange={(e) => setDocx(e.target.checked)} />
                  <span>
                    {t("Word manuscript")}
                    <small>{t("The usual submission layout for editors and agents: double spaced, Times New Roman, a page per chapter.")}</small>
                  </span>
                </label>
                {(epub || pdf || readalong) && (
                  <label className="studio-field">
                    <span>{t("Design")}</span>
                    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                      <option value="classic">{t("Classic: centred small capitals and drop caps")}</option>
                      <option value="modern">{t("Modern: flush left, large chapter numbers")}</option>
                      <option value="elegant">{t("Elegant: italic titles and ornaments")}</option>
                    </select>
                  </label>
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
                <span>{t("Dedication")}</span>
                <input value={matter.dedication} onChange={(e) => setMatter({ ...matter, dedication: e.target.value })} />
              </label>
              <div className="studio-inline grow">
                <label className="studio-field">
                  <span>{t("Epigraph")}</span>
                  <input value={matter.epigraph} onChange={(e) => setMatter({ ...matter, epigraph: e.target.value })} />
                </label>
                <label className="studio-field">
                  <span>{t("Quoted from")}</span>
                  <input value={matter.epigraph_by} onChange={(e) => setMatter({ ...matter, epigraph_by: e.target.value })} />
                </label>
              </div>
              <label className="studio-field">
                <span>{t("Acknowledgements")}</span>
                <textarea rows={2} value={matter.acknowledgements} onChange={(e) => setMatter({ ...matter, acknowledgements: e.target.value })} />
              </label>
              <label className="studio-field">
                <span>{t("About the author")}</span>
                <textarea rows={2} value={matter.about} onChange={(e) => setMatter({ ...matter, about: e.target.value })} />
              </label>
              <label className="studio-field">
                <span>{t("Also by the author (one title per line)")}</span>
                <textarea rows={2} value={matter.also_by} onChange={(e) => setMatter({ ...matter, also_by: e.target.value })} />
              </label>
              <label className="studio-field">
                <span>{t("Copyright page lines (optional)")}</span>
                <textarea rows={3} value={rights} onChange={(e) => setRights(e.target.value)} placeholder={t("For example: Text in the public domain. Cover by the author.")} />
              </label>
            </details>
            <p className="studio-hint">{t("Every export carries “Made with Origami Reader” and the crane on its copyright page; audiobooks say it in their opening credits and carry AI labels and an inaudible watermark.")}</p>
            {preview && (
              <div className="studio-preview">
                <div className="studio-spread">
                  {preview.first === 0 && <span className="studio-page-blank" aria-hidden="true" />}
                  {preview.images.map((img, i) => (
                    <img key={preview.first + i} src={"data:image/png;base64," + img} alt={t("Page {n}", { n: String(preview.first + i + 1) })} />
                  ))}
                </div>
                <div className="studio-row">
                  <button onClick={() => void showPages(preview.first <= 1 ? 0 : preview.first - 2)} disabled={previewing || preview.first === 0}>
                    {t("Previous pages")}
                  </button>
                  <span className="muted small">
                    {preview.first === 0
                      ? t("Page {n} of {total}", { n: "1", total: String(preview.pages) })
                      : t("Pages {a} and {b} of {n}", { a: String(preview.first + 1), b: String(Math.min(preview.pages, preview.first + 2)), n: String(preview.pages) })}
                  </span>
                  <button onClick={() => void showPages(preview.first === 0 ? 1 : preview.first + 2)} disabled={previewing || preview.first + (preview.first === 0 ? 1 : 2) >= preview.pages}>
                    {t("Next pages")}
                  </button>
                  <button className="icon-only" onClick={() => setPreview(null)} aria-label={t("Close the preview")}>
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="studio-error" role="alert">
                {error}
              </p>
            )}
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
