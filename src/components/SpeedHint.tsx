import { Gauge, X } from "lucide-react";
import { t } from "../i18n";

// A small card above the player when reading aloud keeps waiting for the voice
// between sentences: the reader is slower than real time on this computer, and
// a lighter one would keep up. It never interrupts the reading.
export function SpeedHint({
  current,
  lighter,
  sameVoices,
  installed,
  size,
  onSwitch,
  onModels,
  onLater,
  onNever,
}: {
  current: string;
  lighter: string;
  // Both are Qwen models, so the voices stay the same.
  sameVoices: boolean;
  installed: boolean;
  size: string;
  onSwitch: () => void;
  onModels: () => void;
  onLater: () => void;
  onNever: () => void;
}) {
  return (
    <aside className="update-toast speed-hint" role="status" aria-live="polite">
      <div className="update-toast-head">
        <Gauge size={16} />
        <strong>{t("Reading aloud is waiting between sentences")}</strong>
        <button className="icon-only plain" aria-label={t("Not now")} onClick={onLater}>
          <X size={15} />
        </button>
      </div>
      <p>
        {t("{model} is slower than real time on this computer.", { model: current })}{" "}
        {installed
          ? sameVoices
            ? t("{model} reads faster with the same voices.", { model: lighter })
            : t("{model} reads faster, with its own English voices.", { model: lighter })
          : t("{model} reads faster. It can be downloaded in Settings, Models ({size}).", { model: lighter, size })}
      </p>
      <div className="update-toast-actions">
        <button onClick={onNever}>{t("Don't suggest again")}</button>
        {installed ? (
          <button className="primary" onClick={onSwitch}>
            {t("Switch and continue")}
          </button>
        ) : (
          <button className="primary" onClick={onModels}>
            {t("Open Models")}
          </button>
        )}
      </div>
    </aside>
  );
}
