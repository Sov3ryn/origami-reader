import { t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, RefreshCw, X } from "lucide-react";
import { coverImage } from "../covers";
import { VOICE_PORTRAIT_SIZE, voicePortraitPrompt } from "../voicePortraits";
import { useCoverTilt } from "../useCoverTilt";
import type { Voice } from "../types";

// Thrown messages are catalog keys; t() keeps any other text as it is.
const errorText = (e: unknown) => t(e instanceof Error ? e.message : String(e));
// Cancelling a generation is the reader's own choice, not an error.
const cancelled = (e: unknown) => String(e).includes("cancelled");

export function VoicePortrait({
  voice,
  large = false,
  tilt = false,
}: {
  voice: Voice;
  large?: boolean;
  // Tilts toward the pointer like the Library covers.
  tilt?: boolean;
}) {
  const tiltRoot = useRef<HTMLSpanElement>(null);
  useCoverTilt(tiltRoot, tilt, ".voice-portrait", undefined, large ? 40 : 24);
  const portrait = (
    <span className={"voice-portrait " + (large ? "large" : "")}>
      {voice.portrait ? (
        <img
          src={voice.portrait}
          alt={t("Illustrated portrait for {name}", { name: voice.name })}
          width={256}
          height={256}
        />
      ) : (
        <span aria-hidden="true">{voice.name[0]}</span>
      )}
    </span>
  );
  return tilt ? (
    <span ref={tiltRoot} className="voice-portrait-tilt">
      {portrait}
    </span>
  ) : (
    portrait
  );
}

export function VoicePortraitDialog({
  voice,
  installed,
  active,
  busy,
  idle,
  onClose,
  onImage,
  onGenerate,
  onCancel,
}: {
  voice: Voice;
  installed: boolean;
  active: boolean;
  busy: boolean;
  idle: boolean;
  onClose: () => void;
  onImage: (image: string) => Promise<void>;
  onGenerate: (prompt: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(() => voicePortraitPrompt(voice));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = useRef<HTMLButtonElement>(null);
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
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !active && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="portrait-dialog-title"
        className="cover-dialog portrait-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            if (!active && !saving) onClose();
          }
          if (e.key !== "Tab") return;
          const fields = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),textarea:not(:disabled)",
            ),
          );
          const first = fields[0],
            last = fields[fields.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="section-row">
          <h2 id="portrait-dialog-title">{t("Voice portrait")}</h2>
          <button
            ref={close}
            className="icon-button"
            aria-label={t("Close portrait editor")}
            disabled={active || saving}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="cover-dialog-body">
          <VoicePortrait voice={voice} large />
          <div>
            <h3>{voice.name}</h3>
            <p className="hint">
              {t(
                "Fictional character artwork based on the voice profile. You can choose a different appearance.",
              )}
            </p>
            <input
              ref={input}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              aria-label={t("Voice portrait image file")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setSaving(true);
                setError("");
                void coverImage(file, VOICE_PORTRAIT_SIZE)
                  .then(onImage)
                  .catch((e) => setError(errorText(e)))
                  .finally(() => {
                    setSaving(false);
                    if (input.current) input.current.value = "";
                  });
              }}
            />
            <button
              disabled={busy || saving}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={17} />
              {t("Choose image")}
            </button>
            <label>
              {t("Portrait description")}
              <textarea
                aria-label={t("Portrait description")}
                maxLength={1400}
                value={prompt}
                disabled={active || saving}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <p className="hint">
              {t(
                "Describe ethnicity, age, hair, clothing and expression here. For example: adult Black woman, short curly hair, green wool jacket. Portraits are saved at 256 × 256. Cover content settings do not apply.",
              )}
            </p>
            <div className="dialog-actions">
              <button
                className="primary"
                disabled={
                  !installed || !idle || busy || saving || !prompt.trim()
                }
                onClick={() => {
                  setError("");
                  void onGenerate(prompt).catch((e) => {
                    if (!cancelled(e)) setError(errorText(e));
                  });
                }}
              >
                {active ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <RefreshCw size={17} />
                )}
                {voice.portrait
                  ? t("Regenerate portrait")
                  : t("Generate portrait")}
              </button>
              {active && (
                <button
                  onClick={() => {
                    void onCancel().catch((e) => setError(errorText(e)));
                  }}
                >
                  {t("Cancel generation")}
                </button>
              )}
            </div>
            <p className="hint">
              {!installed
                ? t(
                    "Set up the local cover engine to generate portraits, or choose an image.",
                  )
                : !idle
                  ? t("Stop playback before generating artwork.")
                  : busy && !active
                    ? t("Another image is being generated.")
                    : t(
                        "Each generation uses a new seed and unloads the image model afterward.",
                      )}
            </p>
            {error && <p role="alert">{error}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
