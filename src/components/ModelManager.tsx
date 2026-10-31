import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Check, Download, HardDrive, RefreshCw, Trash2, X } from "lucide-react";
import {
  modelCatalog,
  recommendations,
  type ModelEntry,
  type ModelInstallation,
} from "../modelCatalog";
import { hardwareSummary, type SystemProfile } from "../hardware";
import * as store from "../storage";
import { currentLanguage, formatNumber, t } from "../i18n";
import openRailLicense from "../../docs/licenses/DreamShaper-OpenRAIL-M.txt?raw";
import stabilityLicense from "../../docs/licenses/SD-Turbo-LICENSE.txt?raw";

type DownloadProgress = { model: string; percent: number; message: string; file?: string };

function gigabytes(bytes: number) {
  return bytes >= 1e9
    ? formatNumber(Math.round(bytes / 1e8) / 10) + " GB"
    : formatNumber(Math.max(1, Math.round(bytes / 1e6))) + " MB";
}

export function ModelManager({
  reader,
  image,
  onSelect,
  onChanged,
  beforeChange,
}: {
  reader: string;
  image: string;
  onSelect: (kind: "reader" | "image", id: string) => Promise<void>;
  onChanged: () => Promise<void>;
  beforeChange: () => Promise<unknown>;
}) {
  const [items, setItems] = useState<ModelInstallation[]>([]);
  const [hardware, setHardware] = useState<SystemProfile | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [remove, setRemove] = useState<ModelInstallation | null>(null);
  // A download in progress, and the image model whose license is open.
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [terms, setTerms] = useState("");
  const [agreed, setAgreed] = useState(false);
  // A warning from the download (starter voices missing) stays on screen.
  const warning = useRef("");
  useEffect(() => {
    // Also after leaving and coming back during a download: the panel picks
    // its progress up again and refreshes when it ends.
    const off = listen<DownloadProgress & { event: string }>("model-download", (e) => {
      if (e.payload.event === "progress") setProgress(e.payload);
      if (e.payload.event === "warning") {
        warning.current = t(
          "The reader is installed, but some starter voices could not be downloaded. Add voices in Voices, under More voices to download.",
        );
        setMessage(warning.current);
      }
      if (e.payload.event === "complete" || e.payload.event === "error") {
        setProgress(null);
        if (e.payload.event === "error") setMessage(String((e.payload as { message?: string }).message || ""));
        void refresh().catch(() => {});
        void onChanged().catch(() => {});
      }
    });
    return () => void off.then((stop) => stop());
  }, []);
  async function download(model: ModelEntry) {
    setBusy(model.id);
    setMessage("");
    setProgress({ model: model.id, percent: 0, message: "Preparing" });
    warning.current = "";
    try {
      await beforeChange();
      setItems(
        await store.downloadModel(model.id, !!model.terms && agreed, currentLanguage()),
      );
      await onChanged();
      setTerms("");
      setMessage(warning.current || t("{name} is ready.", { name: model.name }));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy("");
      setProgress(null);
    }
  }
  async function refresh() {
    setItems(await store.modelInventory());
    setHardware(await store.systemProfile());
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(String(e)));
  }, []);
  const recommended = recommendations(hardware, currentLanguage());
  async function select(kind: "reader" | "image", id: string) {
    setBusy(id);
    setMessage("");
    try {
      await onSelect(kind, id);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy("");
    }
  }
  async function change(item: ModelInstallation, install: boolean) {
    setBusy(item.id);
    setMessage("");
    try {
      await beforeChange();
      setItems(await store.changeModelInstallation(item.id, install));
      await onChanged();
      setRemove(null);
      setMessage(
        install
          ? t("Model connected.")
          : item.managed
            ? t("Model uninstalled.")
            : t("Model disconnected. Its external files were kept."),
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="inspector-content model-manager">
      <div className="model-hardware">
        <HardDrive size={21} />
        <div>
          <strong>{t("Models on this computer")}</strong>
          <p>
            {hardware
              ? hardwareSummary(hardware)
              : t("Hardware details unavailable")}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label={t("Refresh installed models")}
          onClick={() => void refresh().catch((e) => setMessage(String(e)))}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <p className="hint">
        {t(
          "Recommendations are starting points, not requirements. You can use any installed model or download another one here. Each file comes from the model's publisher and is checked before it is used.",
        )}
      </p>
      <p role="status">{message}</p>
      {(["reader", "image", "creator"] as const).map((kind) => (
        <section key={kind}>
          <h3>
            {kind === "reader"
              ? t("Reader models")
              : kind === "image"
                ? t("Image models")
                : t("Voice creation")}
          </h3>
          {kind === "reader" && (
            <p className="hint">
              {t(
                "Kitten and Kokoro use built-in voices. Choose Qwen to use Maeve and other custom voices.",
              )}
            </p>
          )}
          <div className="model-grid">
            {modelCatalog
              .filter((m) => m.kind === kind)
              .map((model) => {
                const item = items.find((i) => i.id === model.id) || {
                  id: model.id,
                  installed: false,
                  availableLocally: false,
                  managed: false,
                };
                const active =
                  (kind === "reader" ? reader : image) === model.id &&
                  item.installed;
                return (
                  <article
                    className={"model-card" + (active ? " selected" : "")}
                    key={model.id}
                  >
                    <div className="section-row">
                      <h4>{model.name}</h4>
                      {kind !== "creator" && recommended[kind] === model.id && (
                        <span className="model-badge">{t("Recommended")}</span>
                      )}
                    </div>
                    <p>{t(model.description)}</p>
                    <p className="hint">{t(model.hardware)}</p>
                    <div className="model-meta">
                      <span>
                        {item.installed ? t("Installed") : t("Not installed")}
                      </span>
                      {model.voices && (
                        <span>
                          {model.voices === "custom"
                            ? t("Custom voices")
                            : t("Built-in voices")}
                        </span>
                      )}
                    </div>
                    <details>
                      <summary>{t("License")}</summary>
                      <p className="hint">{model.license}</p>
                      {!model.download && (
                        <p className="hint">
                          {t(
                            "Full model terms and notices must be accepted when downloads become available.",
                          )}
                        </p>
                      )}
                    </details>
                    <div className="model-actions">
                      {item.installed ? (
                        <>
                          <button
                            className={active ? "" : "primary"}
                            disabled={!!busy || active || kind === "creator"}
                            onClick={() => {
                              if (kind !== "creator")
                                void select(kind, model.id);
                            }}
                          >
                            {active ? <Check size={15} /> : null}
                            {kind === "creator"
                              ? t("Ready in Voices")
                              : active
                                ? t("In use")
                                : t("Use model")}
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => setRemove(item)}
                          >
                            <Trash2 size={15} />
                            {item.managed ? t("Uninstall") : t("Disconnect")}
                          </button>
                        </>
                      ) : item.availableLocally ? (
                        <button
                          disabled={!!busy}
                          onClick={() => void change(item, true)}
                        >
                          {t("Reconnect local model")}
                        </button>
                      ) : model.download ? (
                        progress?.model === model.id ? (
                          <div className="model-progress" role="status">
                            <progress max={100} value={progress.percent} />
                            <small>
                              {t(progress.message)}
                              {progress.file ? " · " + progress.file : ""}
                            </small>
                            <button onClick={() => void store.cancelModelDownload()}>
                              <X size={15} />
                              {t("Cancel")}
                            </button>
                          </div>
                        ) : model.terms && terms === model.id ? null : (
                          <button
                            className="primary"
                            disabled={!!busy}
                            onClick={() => {
                              if (model.terms && terms !== model.id) {
                                setTerms(model.id);
                                setAgreed(false);
                              } else void download(model);
                            }}
                          >
                            <Download size={15} />
                            {t("Download ({size})", { size: gigabytes(model.download.bytes) })}
                          </button>
                        )
                      ) : (
                        <button
                          disabled
                          title={t("Download hosting is not configured yet.")}
                        >
                          <Download size={15} />
                          {t("Download coming soon")}
                        </button>
                      )}
                    </div>
                    {model.download?.together && !item.installed && (
                      <p className="hint">
                        {t("Kitten Mini, Kitten Micro and Kokoro download together.")}
                      </p>
                    )}
                    {model.terms && terms === model.id && !item.installed && progress?.model !== model.id && (
                      <div className="model-removal model-terms" role="group" aria-label={t("Image model license")}>
                        <p>
                          {model.terms === "stability"
                            ? t("SD-Turbo is provided under the Stability AI Community License. Powered by Stability AI.")
                            : t("DreamShaper is provided under CreativeML OpenRAIL-M. Its use restrictions apply to generated content and redistribution.")}
                        </p>
                        <details>
                          <summary>{t("Read the image model license")}</summary>
                          <pre className="license-text">
                            {model.terms === "stability" ? stabilityLicense : openRailLicense}
                          </pre>
                        </details>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                          />
                          {t("I agree to the image model license and its use restrictions.")}
                        </label>
                        <button
                          className="primary"
                          disabled={!agreed || !!busy}
                          onClick={() => void download(model)}
                        >
                          <Download size={15} />
                          {t("Download ({size})", { size: gigabytes(model.download!.bytes) })}
                        </button>
                        <button disabled={!!busy} onClick={() => setTerms("")}>
                          {t("Cancel")}
                        </button>
                      </div>
                    )}
                    {remove?.id === model.id && (
                      <div
                        className="model-removal"
                        role="group"
                        aria-label={t("Confirm model removal")}
                      >
                        <p>
                          {item.managed
                            ? t("Remove this model's managed files? Books, voices and saved artwork will be kept.")
                            : t("Disconnect this external model? Its files will remain on disk for other apps and testing.")}
                        </p>
                        <button
                          disabled={!!busy}
                          onClick={() => void change(item, false)}
                        >
                          {t("Confirm removal")}
                        </button>
                        <button
                          disabled={!!busy}
                          onClick={() => setRemove(null)}
                        >
                          {t("Cancel")}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
