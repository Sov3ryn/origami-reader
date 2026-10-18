import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AudioLines, Check, Download, ShieldCheck, Users, X } from "lucide-react";
import { t } from "../i18n";
import { desktop } from "../storage";

// Studio's models, set up from inside Studio: only people who use Studio
// download them. Each part is optional; what a missing part enables is said.
type Part = { id: "watermark" | "analysis" | "transcription"; bytes: number; installed: boolean };
type Status = { parts: Part[]; runtime: boolean; download?: { running: boolean; progress: { part: string; received: number; total: number } | null } };

const ABOUT: Record<Part["id"], { name: string; does: string; icon: typeof ShieldCheck }> = {
  watermark: { name: "Watermark", does: "Needed to export audio: the inaudible mark that says the voices are AI-generated, and Verify a file.", icon: ShieldCheck },
  analysis: { name: "Characters and speakers", does: "Finds the characters and who says each line, so each can have a voice (Ministral 3 and llama.cpp).", icon: Users },
  transcription: { name: "Recordings to text", does: "Makes a book from an audiobook or any narrated recording (NVIDIA Parakeet).", icon: AudioLines },
};
const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

// `only` shows just the parts a place needs (the watermark in the export dialog, say).
export function StudioSetup({ onChange, only }: { onChange?: () => void; only?: Part["id"][] }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ part: string; received: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);

  async function refresh() {
    if (!desktop) return;
    const s = await invoke<Status>("studio_setup_status");
    const parts = only ? s.parts.filter((p) => only.includes(p.id)) : s.parts;
    setStatus({ ...s, parts });
    setChosen((c) => (c.length ? c : parts.filter((p) => !p.installed).map((p) => p.id)));
    // A download keeps running while Studio is closed: show it again when it reopens.
    if (s.download) {
      setRunning(s.download.running);
      if (s.download.running && s.download.progress) setProgress(s.download.progress);
    }
  }
  useEffect(() => {
    void refresh().catch(() => undefined);
    const off = [
      listen<{ part: string; received: number; total: number }>("studio-setup-progress", (e) => setProgress(e.payload)),
      listen<{ ok: boolean; cancelled?: boolean; message?: string }>("studio-setup-done", (e) => {
        setRunning(false);
        setProgress(null);
        if (!e.payload.ok && !e.payload.cancelled) setError(e.payload.message || t("The download failed."));
        void refresh().then(() => onChange?.());
      }),
    ];
    return () => off.forEach((p) => void p.then((f) => f()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!status || hidden) return null;
  const missing = status.parts.filter((p) => !p.installed);
  if (!missing.length && !running) return null;
  const total = status.parts.filter((p) => chosen.includes(p.id) && !p.installed).reduce((a, p) => a + p.bytes, 0);
  return (
    <section className="studio-setup" aria-labelledby="studio-setup-title">
      <header>
        <h2 id="studio-setup-title">{t("Set up Studio")}</h2>
        <button className="icon-only plain" onClick={() => setHidden(true)} aria-label={t("Hide")} disabled={running}>
          <X size={15} />
        </button>
      </header>
      <p className="studio-hint">{t("Studio works on this computer. These parts are downloaded once and checked before use. Choose the ones you need.")}</p>
      <ul>
        {status.parts.map((p) => {
          const a = ABOUT[p.id];
          const Icon = a.icon;
          return (
            <li key={p.id}>
              <label className="studio-check">
                <input
                  type="checkbox"
                  checked={p.installed || chosen.includes(p.id)}
                  disabled={p.installed || running}
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))}
                />
                <span>
                  <strong>
                    <Icon size={14} /> {t(a.name)}
                  </strong>
                  <small>{t(a.does)}</small>
                </span>
              </label>
              <span className="muted small">{p.installed ? <><Check size={13} /> {t("Ready")}</> : gb(p.bytes)}</span>
            </li>
          );
        })}
      </ul>
      {!status.runtime && <p className="studio-warn">{t("The ONNX Runtime is missing from this installation; run setup again to add it.")}</p>}
      {running && progress && (
        <div className="studio-export-running">
          <p>
            {t(ABOUT[progress.part as Part["id"]]?.name || progress.part)} · {gb(progress.received)} / {gb(progress.total)}
          </p>
          <span className="studio-progress" aria-hidden="true">
            <i style={{ width: `${Math.round((progress.received / Math.max(1, progress.total)) * 100)}%` }} />
          </span>
        </div>
      )}
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      <div className="studio-row end">
        {running ? (
          <button onClick={() => void invoke("studio_setup_cancel")}>{t("Cancel")}</button>
        ) : (
          <button
            className="primary"
            disabled={!total}
            onClick={async () => {
              setError("");
              setRunning(true);
              try {
                await invoke("studio_setup_download", { parts: chosen });
              } catch (e) {
                setRunning(false);
                setError(String(e));
              }
            }}
          >
            <Download size={15} /> {t("Download {size}", { size: gb(total) })}
          </button>
        )}
      </div>
    </section>
  );
}
