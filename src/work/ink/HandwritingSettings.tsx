import { useEffect, useState } from "react";
import { Check, Download, LoaderCircle, Trash2, X } from "lucide-react";
import { displayLocale, t } from "../../i18n";
import {
  cancelHandwritingDownload,
  downloadHandwritingModel,
  handwritingModelStatus,
  onHandwritingDownload,
  OWN_READER,
  READER_KEY,
  recognizers,
  removeHandwritingModel,
  savedReader,
  type HandwritingModelStatus,
} from "./ink";

const mb = (bytes: number) => Math.round(bytes / 1_000_000).toLocaleString(displayLocale());

// Settings, Work mode, Handwriting: which reader turns ink into text, and
// Origami's own model (Microsoft TrOCR, MIT), downloaded only on request.
export function HandwritingSettings({ notify }: { notify: (message: string) => void }) {
  const [status, setStatus] = useState<HandwritingModelStatus | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [reader, setReader] = useState(savedReader);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const refresh = () => {
    void handwritingModelStatus().then(setStatus).catch(() => setStatus(null));
    void recognizers().then(setNames);
  };
  useEffect(() => {
    refresh();
    const off = onHandwritingDownload((e) => {
      if (e.done) setProgress(null);
      else if (e.total) setProgress({ received: e.received || 0, total: e.total });
    });
    return () => void off.then((stop) => stop());
  }, []);
  if (!status) return <p className="hint">{t("Handwriting reading is available in the desktop app.")}</p>;
  const system = names.filter((n) => n !== OWN_READER);
  const choose = (value: string) => {
    setReader(value);
    try {
      localStorage.setItem(READER_KEY, value);
    } catch {
      /* private window */
    }
  };
  async function get() {
    setProgress({ received: 0, total: status!.bytes });
    try {
      await downloadHandwritingModel();
      // Downloading it means wanting it: it becomes the reader (Windows stays
      // a choice below, for other languages).
      choose(OWN_READER);
      notify(t("Handwriting model ready."));
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      refresh();
    }
  }
  return (
    <div className="handwriting-settings">
      <p className="hint">
        {system.length
          ? t("Windows can read handwriting in these languages: {list}. More can be added in Windows Settings, Time and language, Language.", {
              list: system.map((n) => n.replace(/^Microsoft /, "").replace(/ Handwriting Recognizer$/, "")).join(", "),
            })
          : t("This computer has no system handwriting reader. Download Origami's model below to read handwriting.")}
      </p>
      <div className="model-choice">
        <span>
          <strong>{t("Origami handwriting model")}</strong> · TrOCR base handwritten (Microsoft, MIT)
          <small className="hint">
            {t("Reads English handwriting on any computer, offline. Best with one line of writing at a time, as written in a note.")}{" "}
            {t("{size} MB download.", { size: mb(status.bytes) })}
          </small>
        </span>
        <div className="model-actions">
          {status.installed ? (
            <>
              <span className="model-ready">
                <Check size={14} />
                {status.bundled ? t("Included with Origami") : t("Installed")}
              </span>
              {!status.bundled && <button
                className="icon-only"
                aria-label={t("Remove the handwriting model")}
                onClick={async () => {
                  if (!window.confirm(t("Remove the handwriting model? Drawings and text already read are kept."))) return;
                  await removeHandwritingModel().catch((e) => notify(String(e)));
                  if (reader === OWN_READER) choose("");
                  refresh();
                }}
              >
                <Trash2 size={15} />
              </button>}
            </>
          ) : progress ? (
            <>
              <progress value={progress.received} max={progress.total} />
              <small>{Math.round((progress.received / Math.max(1, progress.total)) * 100)}%</small>
              <button className="icon-only" aria-label={t("Cancel download")} onClick={() => void cancelHandwritingDownload()}>
                <X size={15} />
              </button>
            </>
          ) : (
            <button disabled={!status.runtime || status.downloading} onClick={() => void get()}>
              {status.downloading ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}
              {t("Download")}
            </button>
          )}
        </div>
      </div>
      {(system.length > 0 || status.installed) && (
        <label className="handwriting-reader">
          {t("Read handwriting with")}
          <select value={reader} onChange={(e) => choose(e.target.value)}>
            <option value="">{system.length ? t("Windows, in the system language") : t("Origami handwriting model")}</option>
            {system.map((n) => (
              <option key={n} value={n}>
                {t("Windows")}: {n.replace(/^Microsoft /, "").replace(/ Handwriting Recognizer$/, "")}
              </option>
            ))}
            {status.installed && system.length > 0 && <option value={OWN_READER}>{t("Origami handwriting model (English)")}</option>}
          </select>
        </label>
      )}
      <p className="hint">{t("Handwriting never leaves this computer. The model is downloaded from Hugging Face and checked before use.")}</p>
    </div>
  );
}
