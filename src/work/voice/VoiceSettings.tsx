import { useEffect, useState } from "react";
import { Check, Download, LoaderCircle, Trash2, X } from "lucide-react";
import { displayLocale, t } from "../../i18n";
import {
  autoTranscribe,
  cancelVoiceDownload,
  downloadVoiceModel,
  onVoiceDownload,
  removeVoiceModel,
  saveAutoTranscribe,
  savedVoiceLanguage,
  savedVoiceModel,
  saveVoiceLanguage,
  saveVoiceModel,
  voiceLanguages,
  voiceStatus,
  type VoiceStatus,
} from "./voice";

const mb = (bytes: number) => Math.round(bytes / 1_000_000).toLocaleString(displayLocale());
const describe = (id: string) =>
  id === "small"
    ? t("Most accurate, including French and accents. About a third of real time on a recent processor.")
    : id === "base"
      ? t("Faster and smaller, for older computers. Less accurate with accents and quiet speech.")
      : "";

// Settings, Work mode, Voice notes: Whisper models (OpenAI, MIT), downloaded
// only on request, the spoken language and automatic transcription.
export function VoiceSettings({ notify }: { notify: (message: string) => void }) {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [chosen, setChosen] = useState(savedVoiceModel);
  const [language, setLanguage] = useState(savedVoiceLanguage);
  const [auto, setAuto] = useState(autoTranscribe);
  const [progress, setProgress] = useState<{ id: string; received: number; total: number } | null>(null);
  const refresh = () => void voiceStatus().then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    refresh();
    const off = onVoiceDownload((e) => {
      if (e.done) setProgress(null);
      else if (e.total) setProgress({ id: e.id, received: e.received || 0, total: e.total });
    });
    return () => void off.then((stop) => stop());
  }, []);
  if (!status) return <p className="hint">{t("Voice notes are available in the desktop app.")}</p>;
  const installed = status.models.filter((m) => m.installed);
  const active = installed.find((m) => m.id === chosen)?.id || installed.find((m) => m.id === "small")?.id || installed[0]?.id || "";
  async function get(id: string, bytes: number) {
    setProgress({ id, received: 0, total: bytes });
    try {
      await downloadVoiceModel(id);
      saveVoiceModel(id);
      setChosen(id);
      notify(t("Voice note model ready."));
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      refresh();
    }
  }
  return (
    <div className="handwriting-settings">
      <p className="hint">{t("Record a voice note in any note with / then Voice note. Origami can write down what you said, on this computer.")}</p>
      {status.models.map((m) => (
        <div className="model-choice" key={m.id}>
          <span>
            <strong>{m.name}</strong>
            <small className="hint">
              {describe(m.id)} {t("{size} MB download.", { size: mb(m.bytes) })}
            </small>
          </span>
          <div className="model-actions">
            {m.installed ? (
              <>
                <span className="model-ready">
                  <Check size={14} />
                  {m.bundled ? t("Included with Origami") : t("Installed")}
                </span>
                {!m.bundled && (
                  <button
                    className="icon-only"
                    aria-label={t("Remove {name}", { name: m.name })}
                    onClick={async () => {
                      if (!window.confirm(t("Remove this model? Recordings and their text are kept."))) return;
                      await removeVoiceModel(m.id).catch((e) => notify(String(e)));
                      refresh();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </>
            ) : progress?.id === m.id ? (
              <>
                <progress value={progress.received} max={progress.total} />
                <small>{Math.round((progress.received / Math.max(1, progress.total)) * 100)}%</small>
                <button className="icon-only" aria-label={t("Cancel download")} onClick={() => void cancelVoiceDownload()}>
                  <X size={15} />
                </button>
              </>
            ) : (
              <button disabled={!status.runtime || m.downloading || Boolean(progress)} onClick={() => void get(m.id, m.bytes)}>
                {m.downloading ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}
                {t("Download")}
              </button>
            )}
          </div>
        </div>
      ))}
      {installed.length > 1 && (
        <label className="handwriting-reader">
          {t("Transcribe with")}
          <select
            value={active}
            onChange={(e) => {
              saveVoiceModel(e.target.value);
              setChosen(e.target.value);
            }}
          >
            {installed.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="handwriting-reader">
        {t("Spoken language")}
        <select
          value={language}
          onChange={(e) => {
            saveVoiceLanguage(e.target.value);
            setLanguage(e.target.value);
          }}
        >
          {voiceLanguages.map(([code, name]) => (
            <option key={code} value={code}>
              {t(name)}
            </option>
          ))}
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            saveAutoTranscribe(e.target.checked);
            setAuto(e.target.checked);
          }}
        />
        {t("Transcribe each voice note when the recording stops")}
      </label>
      <p className="hint">{t("Recordings and their text never leave this computer. Models are downloaded from Hugging Face and checked before use.")}</p>
    </div>
  );
}
