import { useEffect, useState } from "react";
import { Download, RotateCw, Sparkles, X } from "lucide-react";
import { t } from "../i18n";
import { formatSize, installUpdate, onUpdateProgress, restartApp, type UpdateFound } from "../updates";

// A small card in the corner when the daily check finds an update: what it is,
// "Download now" and "Later". It never blocks the page and goes away on its own
// terms; installing shows its progress, then offers to restart.
export function UpdateToast({
  found,
  managed,
  onLater,
  onSettings,
}: {
  found: UpdateFound;
  // Installed with the installer, so it can update itself.
  managed: boolean;
  onLater: () => void;
  onSettings: () => void;
}) {
  const [state, setState] = useState<"offer" | "installing" | "restart">("offer");
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (state !== "installing") return;
    const off = onUpdateProgress((p) => setProgress(p.total ? p.received / p.total : 0));
    return () => void off.then((stop) => stop());
  }, [state]);
  const size = found.components.reduce((n, c) => n + (c.size || 0), 0);
  const notes = (found.notes || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
  async function install() {
    setProblem("");
    setProgress(0);
    setState("installing");
    try {
      const restart = await installUpdate();
      if (restart) setState("restart");
      else onLater();
    } catch (e) {
      setProblem(String(e));
      setState("offer");
    }
  }
  return (
    <aside className="update-toast" role="status" aria-live="polite">
      <div className="update-toast-head">
        <Sparkles size={16} />
        <strong>
          {state === "restart"
            ? t("The update is installed.")
            : t("Origami {version} is available", { version: found.version || "" })}
        </strong>
        {state !== "installing" && (
          <button className="icon-only plain" aria-label={t("Later")} onClick={onLater}>
            <X size={15} />
          </button>
        )}
      </div>
      {state === "restart" ? (
        <p>{t("Restart Origami to finish. Your reading place and notes are saved.")}</p>
      ) : notes ? (
        <p>{notes.length > 160 ? notes.slice(0, 157) + "..." : notes}</p>
      ) : null}
      {state === "installing" && (
        <span className="update-toast-bar" aria-hidden="true">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
      {problem && <p className="update-toast-problem">{problem}</p>}
      <div className="update-toast-actions">
        {state === "restart" ? (
          <>
            <button onClick={onLater}>{t("Later")}</button>
            <button className="primary" onClick={() => void restartApp()}>
              <RotateCw size={15} />
              {t("Restart now")}
            </button>
          </>
        ) : managed ? (
          <>
            <button className="text-button" onClick={onSettings} disabled={state === "installing"}>
              {t("Details")}
            </button>
            <button onClick={onLater} disabled={state === "installing"}>
              {t("Later")}
            </button>
            <button className="primary" onClick={() => void install()} disabled={state === "installing"}>
              <Download size={15} />
              {state === "installing"
                ? t("Installing… {percent}%", { percent: Math.round(progress * 100) })
                : size
                  ? t("Download now ({size})", { size: formatSize(size) })
                  : t("Download now")}
            </button>
          </>
        ) : (
          <>
            <button onClick={onLater}>{t("Later")}</button>
            <button className="primary" onClick={onSettings}>
              {t("Details")}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
