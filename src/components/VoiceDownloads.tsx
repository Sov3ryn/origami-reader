import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { t } from "../i18n";
import { languageName } from "../bookLanguage";
import type { Voice } from "../types";

// Languages the local speech model reads, each a downloadable voice pack.
// Voice names in the app's voice list use the English language name.
export const voicePacks = [
  { code: "en", name: "English" },
  { code: "ko", name: "Korean" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
];
export type SeenVoice = { name: string; languages: string[] };

// Where people will get more voices, download packs again, or bring back
// voices they removed. Packs are not hosted yet, so nothing downloads.
export function VoiceDownloads({
  voices,
  seen,
  interfaceLanguage,
  onClose,
}: {
  voices: Voice[];
  seen: Record<string, SeenVoice>;
  interfaceLanguage: string;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => {
    close.current?.focus();
    const modal = close.current?.closest(".modal-scrim");
    const siblings = Array.from(modal?.parentElement?.children || []).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== modal,
    );
    const previous = siblings.map((el) => el.inert);
    siblings.forEach((el) => {
      el.inert = true;
    });
    return () =>
      siblings.forEach((el, i) => {
        el.inert = previous[i];
      });
  }, []);
  const installed = new Set(voices.map((v) => v.id));
  const removed = Object.entries(seen)
    .filter(([id]) => !installed.has(id))
    .map(([id, v]) => ({ id, ...v }));
  const toggle = (key: string) =>
    setChosen((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-downloads-title"
        className="cover-dialog voice-downloads"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="section-row">
          <h2 id="voice-downloads-title">{t("Download voices")}</h2>
          <button
            ref={close}
            className="icon-button"
            aria-label={t("Close voice downloads")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="setting-note">
          {t(
            "Voice packs are not available for download yet. They will appear here in a later update, so you can add languages or bring back voices you removed.",
          )}
        </p>
        <h3>{t("Voice packs")}</h3>
        <ul className="voice-pack-list">
          {voicePacks.map((pack) => {
            const count = voices.filter((v) =>
              v.languages.includes(pack.name),
            ).length;
            return (
              <li key={pack.code}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={chosen.has(pack.code)}
                    onChange={() => toggle(pack.code)}
                  />
                  <span>
                    <strong>
                      {t("{language} voices", {
                        language: languageName(pack.code, interfaceLanguage),
                      })}
                    </strong>
                    <span className="hint">
                      {count
                        ? t("{count} installed", { count })
                        : t("Not installed")}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {removed.length > 0 && (
          <>
            <h3>{t("Removed voices")}</h3>
            <ul className="voice-pack-list">
              {removed.map((v) => (
                <li key={v.id}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={chosen.has("voice:" + v.id)}
                      onChange={() => toggle("voice:" + v.id)}
                    />
                    <span>
                      <strong>{v.name}</strong>
                      <span className="hint">{v.languages.join(", ")}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="dialog-actions">
          <button className="primary" disabled title={t("Not available yet")}>
            <Download size={16} />
            {t("Download selected")}
          </button>
          <button onClick={onClose}>{t("Close")}</button>
        </div>
      </section>
    </div>
  );
}
