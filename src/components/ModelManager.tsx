import { useEffect, useState } from "react";
import { Check, Download, HardDrive, RefreshCw, Trash2 } from "lucide-react";
import {
  modelCatalog,
  recommendations,
  type ModelInstallation,
} from "../modelCatalog";
import { hardwareSummary, type SystemProfile } from "../hardware";
import * as store from "../storage";
import { t } from "../i18n";

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
  async function refresh() {
    setItems(await store.modelInventory());
    setHardware(await store.systemProfile());
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(String(e)));
  }, []);
  const recommended = recommendations(hardware);
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
          "Recommendations are starting points, not requirements. You can choose any installed model. Download links will be added later.",
        )}
      </p>
      <p role="status">{message}</p>
      {(["reader", "image", "creator"] as const).map((kind) => (
        <section key={kind}>
          <h3>
            {t(
              kind === "reader"
                ? "Reader models"
                : kind === "image"
                  ? "Image models"
                  : "Voice creation",
            )}
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
                        {t(item.installed ? "Installed" : "Not installed")}
                      </span>
                      {model.voices && (
                        <span>
                          {t(
                            model.voices === "custom"
                              ? "Custom voices"
                              : "Built-in voices",
                          )}
                        </span>
                      )}
                    </div>
                    <details>
                      <summary>{t("License")}</summary>
                      <p className="hint">{model.license}</p>
                      <p className="hint">
                        {t(
                          "Full model terms and notices must be accepted when downloads become available.",
                        )}
                      </p>
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
                            {t(
                              kind === "creator"
                                ? "Ready in Voices"
                                : active
                                  ? "In use"
                                  : "Use model",
                            )}
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => setRemove(item)}
                          >
                            <Trash2 size={15} />
                            {t(item.managed ? "Uninstall" : "Disconnect")}
                          </button>
                        </>
                      ) : item.availableLocally ? (
                        <button
                          disabled={!!busy}
                          onClick={() => void change(item, true)}
                        >
                          {t("Reconnect local model")}
                        </button>
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
                    {remove?.id === model.id && (
                      <div
                        className="model-removal"
                        role="group"
                        aria-label={t("Confirm model removal")}
                      >
                        <p>
                          {t(
                            item.managed
                              ? "Remove this model's managed files? Books, voices and saved artwork will be kept."
                              : "Disconnect this external model? Its files will remain on disk for other apps and testing.",
                          )}
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
