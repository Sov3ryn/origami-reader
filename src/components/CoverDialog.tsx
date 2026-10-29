import { t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, X, LoaderCircle } from "lucide-react";
import type { BookMeta } from "../types";
import { Cover } from "./Primitives";
import { coverImage } from "../covers";
import { autoTitleStyle, titleInks, titleStyles } from "../coverTitles";

export function CoverDialog({
  book,
  prompt: initialPrompt,
  installed,
  active,
  busy,
  onText,
  onLettering,
  idle,
  allowMature,
  starter,
  onMature,
  onClose,
  onImage,
  onGenerate,
  onCancel,
}: {
  book: BookMeta;
  prompt: string;
  installed: boolean;
  active: boolean;
  busy: boolean;
  onText: (mode: BookMeta["coverText"]) => void;
  onLettering: (lettering: Pick<BookMeta, "titleStyle" | "titleInk">) => void;
  idle: boolean;
  allowMature: boolean;
  starter: boolean;
  onMature: (value: boolean) => void;
  onClose: () => void;
  onImage: (image: string) => Promise<void>;
  onGenerate: (prompt: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
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
        if (e.target === e.currentTarget && !active) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-dialog-title"
        className="cover-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            if (!active) onClose();
          }
          if (e.key !== "Tab") return;
          const fields = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),textarea:not(:disabled),select:not(:disabled),input:not([type=file]):not(:disabled)",
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
          <h2 id="cover-dialog-title">{t("Change cover")}</h2>
          <button
            ref={close}
            className="icon-button"
            aria-label={t("Close cover editor")}
            disabled={active}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="cover-dialog-body">
          <Cover book={book} />
          <div>
            <h3>{book.title}</h3>
            <label>
              {t("Cover text")}
              <select
                aria-label={t("Cover text overlay")}
                value={book.coverText || "auto"}
                onChange={(e) =>
                  onText(e.target.value as BookMeta["coverText"])
                }
              >
                <option value="auto">{t("Automatic")}</option>
                <option value="show">{t("Show title and author")}</option>
                <option value="hide">{t("Hide title and author")}</option>
              </select>
            </label>
            <label>
              {t("Title style")}
              <select
                value={book.titleStyle || "auto"}
                onChange={(e) =>
                  onLettering({
                    titleStyle: e.target.value === "auto" ? undefined : e.target.value,
                  })
                }
              >
                <option value="auto">
                  {t("Automatic ({style})", { style: t(titleStyles.find(([id]) => id === autoTitleStyle(book))![1]) })}
                </option>
                {titleStyles.map(([id, name]) => (
                  <option key={id} value={id}>
                    {t(name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Lettering colour")}
              <select
                value={book.titleInk || "auto"}
                onChange={(e) =>
                  onLettering({
                    titleInk: e.target.value === "auto" ? undefined : e.target.value,
                  })
                }
              >
                <option value="auto">{t("Automatic")}</option>
                {titleInks.map(([id, name]) => (
                  <option key={id} value={id}>
                    {t(name)}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              {t("Automatic picks the lettering from the book's genres.")}
            </p>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={t("Cover image file")}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setSaving(true);
                setError("");
                void coverImage(file)
                  .then(onImage)
                  .catch((e) => setError(String(e)))
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
            <p className="hint">
              {t("PNG, JPEG or WebP. The image is copied into your library.")}
            </p>
            <label>
              {t("Cover description")}
              <textarea
                aria-label={t("Cover description")}
                value={prompt}
                maxLength={1400}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <p className="hint">
              {t(
                "Saves 320 × 448 book-cover artwork. The prompt requests no text. Origami adds the title and author.",
              )}
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={allowMature && !starter}
                disabled={starter || active}
                onChange={(e) => onMature(e.target.checked)}
              />
              {t("Allow mature cover artwork (NSFW)")}
            </label>
            <p className="hint">
              {starter
                ? t("Starter-library covers always use standard mode.")
                : t(
                    "Standard mode requests clothed, non-explicit artwork. This is prompt guidance, not an image-content filter.",
                  )}
            </p>
            <div className="dialog-actions">
              <button
                className="primary"
                disabled={!installed || !idle || busy || !prompt.trim()}
                onClick={() => {
                  setError("");
                  void onGenerate(prompt).catch((e) => setError(String(e)));
                }}
              >
                {active ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <RefreshCw size={17} />
                )}
                {book.coverOrigin === "generated"
                  ? t("Regenerate cover")
                  : t("Generate cover")}
              </button>
              {active && (
                <button
                  onClick={() => {
                    void onCancel();
                  }}
                >
                  {t("Cancel generation")}
                </button>
              )}
            </div>
            <p className="hint">
              {!installed
                ? t(
                    "Local cover generation requires the cover engine setup. You can choose an image now.",
                  )
                : !idle
                  ? t("Stop playback to generate a cover.")
                  : busy && !active
                    ? t("Another image is being generated.")
                    : t(
                        "Each generation uses a new random seed. The image model unloads when it finishes.",
                      )}
            </p>
            {error && <p role="alert">{error}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
