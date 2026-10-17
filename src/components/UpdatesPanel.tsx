import { useEffect, useState } from "react";
import { Download, RefreshCw, RotateCw } from "lucide-react";
import { t } from "../i18n";
import {
  checkUpdates,
  componentName,
  formatSize,
  installUpdate,
  markChecked,
  onUpdateProgress,
  restartApp,
  updateStatus,
  type UpdateFound,
  type UpdateStatus,
} from "../updates";

// Settings, About: the installed version, checking for updates and whether
// to check automatically. Updates replace only the parts that changed.
export function UpdatesPanel({
  version,
  auto,
  onAuto,
}: {
  version: string;
  auto: boolean;
  onAuto: (on: boolean) => void;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [found, setFound] = useState<UpdateFound | null>(null);
  const [state, setState] = useState<"idle" | "checking" | "installing" | "restart" | "current">("idle");
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    void updateStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    if (state !== "installing") return;
    const off = onUpdateProgress((p) => setProgress(p.total ? p.received / p.total : 0));
    return () => void off.then((stop) => stop());
  }, [state]);

  const check = async () => {
    setProblem("");
    setState("checking");
    try {
      const result = await checkUpdates();
      markChecked();
      setFound(result.components.length ? result : null);
      setState(result.components.length ? "idle" : "current");
    } catch (e) {
      setProblem(String(e));
      setState("idle");
    }
  };
  const install = async () => {
    setProblem("");
    setProgress(0);
    setState("installing");
    try {
      const restart = await installUpdate();
      setFound(null);
      setState(restart ? "restart" : "current");
      setStatus(await updateStatus());
    } catch (e) {
      setProblem(String(e));
      setState("idle");
    }
  };

  const configured = Boolean(status?.configured);
  const size = found?.components.reduce((n, c) => n + (c.size || 0), 0) || 0;
  return (
    <div className="updates-panel">
      <p className="hint">{t("Installed version: {version}", { version })}</p>
      {!configured && (
        <p className="hint">
          {t("Updates will arrive here once Origami has a download server. Until then, new versions come as a full kit, and installing one keeps your library, notes and settings.")}
        </p>
      )}
      {configured && status && !status.managed && (
        <p className="hint">{t("This copy was not installed with the installer, so it cannot update itself.")}</p>
      )}
      <div className="updates-actions">
        <button className="secondary" disabled={!configured || state === "checking" || state === "installing"} onClick={() => void check()}>
          <RefreshCw size={15} className={state === "checking" ? "spin" : ""} />
          {state === "checking" ? t("Checking…") : t("Check for updates")}
        </button>
        {state === "current" && <span className="hint" role="status">{t("Origami is up to date.")}</span>}
      </div>
      {found && (
        <div className="update-found" role="status">
          <strong>{t("Version {version} is available", { version: found.version || "" })}</strong>
          {found.notes && <p>{found.notes}</p>}
          <ul>
            {found.components.map((c) => (
              <li key={c.id}>
                {componentName(c.id)} · {c.version} · {formatSize(c.size)}
              </li>
            ))}
          </ul>
          <button className="primary" disabled={state === "installing" || !status?.managed} onClick={() => void install()}>
            <Download size={15} />
            {state === "installing"
              ? t("Installing… {percent}%", { percent: Math.round(progress * 100) })
              : t("Download and install ({size})", { size: formatSize(size) })}
          </button>
        </div>
      )}
      {state === "restart" && (
        <div className="update-found" role="status">
          <strong>{t("The update is installed.")}</strong>
          <p>{t("Restart Origami to finish. Your reading place and notes are saved.")}</p>
          <button className="primary" onClick={() => void restartApp()}>
            <RotateCw size={15} />
            {t("Restart now")}
          </button>
        </div>
      )}
      {problem && <p className="hint" role="alert">{problem}</p>}
      <label className="check-label">
        <input type="checkbox" checked={auto} disabled={!configured} onChange={(e) => onAuto(e.target.checked)} />
        {t("Check for updates automatically (once a day)")}
      </label>
      <p className="hint">
        {t("Checking only downloads a small signed list of versions. Nothing is installed without you, and updates signed by anyone else are refused.")}
      </p>
    </div>
  );
}
