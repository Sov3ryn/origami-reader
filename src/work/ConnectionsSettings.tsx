import { useEffect, useState } from "react";
import { Check, Download, LoaderCircle, Trash2, X } from "lucide-react";
import { displayLocale, t } from "../i18n";
import {
  cancelDownload,
  downloadModel,
  embeddingStatus,
  onDownload,
  removeModel,
  type EmbeddingStatus,
} from "./semantic";

const mb = (bytes: number) => Math.round(bytes / 1_000_000).toLocaleString(displayLocale());

// Settings, Work mode: choose and install the model behind Related.
export function ConnectionsSettings({
  value,
  onChange,
  notify,
}: {
  value: string;
  onChange: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [progress, setProgress] = useState<{ id: string; received: number; total: number } | null>(null);
  const refresh = () => void embeddingStatus().then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    refresh();
    return onDownload((e) => {
      if (e.done) {
        setProgress(null);
        refresh();
      } else if (e.total) setProgress({ id: e.id, received: e.received || 0, total: e.total });
    });
  }, []);
  if (!status) return <p className="hint">{t("Connections models are available in the desktop app.")}</p>;
  const busy = status.models.some((m) => m.downloading) || Boolean(progress);

  async function get(id: string) {
    setProgress({ id, received: 0, total: status!.models.find((m) => m.id === id)!.bytes });
    try {
      await downloadModel(id);
      onChange(id);
      notify(t("Connections model ready. Related notes now follow meaning, in any language."));
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      refresh();
    }
  }
  return (
    <div className="connections-models" role="radiogroup" aria-label={t("Connections model")}>
      {status.models.map((m) => {
        const mine = progress?.id === m.id;
        return (
          <div key={m.id} className={"model-choice" + (value === m.id ? " chosen" : "")}>
            <label className="check-label">
              <input
                type="radio"
                name="connections-model"
                checked={value === m.id}
                disabled={!m.installed}
                onChange={() => onChange(m.id)}
              />
              <span>
                <strong>{m.id === "standard" ? t("Standard") : t("Precise")}</strong> · {m.name}
                <small className="hint">
                  {m.id === "standard"
                    ? t("Fast on any computer, no graphics card needed.")
                    : t("Finds subtler links; best on strong computers.")}{" "}
                  {t("{size} MB download.", { size: mb(m.bytes) })}
                </small>
              </span>
            </label>
            <div className="model-actions">
              {m.installed ? (
                <>
                  <span className="model-ready">
                    <Check size={14} />
                    {m.bundled ? t("Included with Origami") : t("Installed")}
                  </span>
                  {!m.bundled && <button
                    className="icon-only"
                    aria-label={t("Remove {name}", { name: m.name })}
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm(t("Remove this model? Related falls back to shared words until a model is installed.")))
                        return;
                      await removeModel(m.id).catch((e) => notify(String(e)));
                      if (value === m.id) onChange("words");
                      refresh();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>}
                </>
              ) : mine ? (
                <>
                  <progress value={progress!.received} max={progress!.total} />
                  <small>{Math.round((progress!.received / Math.max(1, progress!.total)) * 100)}%</small>
                  <button className="icon-only" aria-label={t("Cancel download")} onClick={() => void cancelDownload()}>
                    <X size={15} />
                  </button>
                </>
              ) : (
                <button disabled={busy || !status.runtime} onClick={() => void get(m.id)}>
                  {busy ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}
                  {t("Download")}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <label className="check-label model-choice words">
        <input type="radio" name="connections-model" checked={value === "words"} onChange={() => onChange("words")} />
        <span>
          <strong>{t("No model")}</strong>
          <small className="hint">{t("Related matches shared words only. Nothing to download.")}</small>
        </span>
      </label>
      {!status.runtime && (
        <p className="hint">{t("This installation is missing the ONNX Runtime the models need. Reinstalling Origami adds it.")}</p>
      )}
      {!status.fast && (
        <p className="hint">{t("This processor gets the full-precision files, which are larger but run the same way.")}</p>
      )}
    </div>
  );
}
