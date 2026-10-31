import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Heart, LockKeyhole, Palette, X } from "lucide-react";
import { t } from "../i18n";
import { themes } from "../themes";
import {
  backgroundImage,
  backgrounds,
  getBackground,
  seasons,
  type BackgroundDefinition,
} from "../backgrounds";
import { places, placeSceneId, readingStats, unlockHint, type Place } from "../places";
import { bookFinished } from "../libraryFilters";
import { isOpen, placeOpen, placesOpen, rewardHint } from "../rewards";
import type { BookMeta, Preferences } from "../types";
import { recordFeat } from "../feats";

// Colour themes grouped by how bright their background is.
const brightness = (hex: string) => {
  const full = hex.length === 4 ? hex.replace(/[0-9a-f]/gi, (c) => c + c) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const colorGroups: [string, typeof themes][] = [
  ["Dark", themes.filter((th) => !th.id.startsWith("contrast") && brightness(th.bg) < 128)],
  ["Light", themes.filter((th) => !th.id.startsWith("contrast") && brightness(th.bg) >= 128)],
  ["High contrast", themes.filter((th) => th.id.startsWith("contrast"))],
];

export type GalleryTab = "scenes" | "colors";

// Shown wherever themes and other looks are chosen: everything can be earned,
// and supporting only makes it immediate.
export function UnlockNote() {
  return (
    <p className="unlock-note">
      <Heart size={14} aria-hidden="true" />
      <span>
        {t(
          "Every theme, place, binding, ribbon colour and bookmark can be unlocked for free through achievements. Supporting development unlocks them all immediately. Nothing is for supporters only, and your achievements still progress as usual.",
        )}
      </span>
    </p>
  );
}

// Landscapes in season order, day before night, then the plain choices.
const landscapes: BackgroundDefinition[] = [
  getBackground("none"),
  ...seasons.flatMap((season) =>
    (["day", "night"] as const).map(
      (time) =>
        backgrounds.find(
          (b) => b.season === season.id && b.time === time && !b.location,
        )!,
    ),
  ),
  getBackground("paper"),
];

// One window for every scene and colour theme. Places not yet earned stay
// dark, and hovering or focusing one says how to unlock it.
export function ThemeGallery({
  prefs,
  books,
  tab: initialTab = "scenes",
  onChange,
  onClose,
}: {
  prefs: Preferences;
  books: BookMeta[];
  tab?: GalleryTab;
  onChange: (p: Partial<Preferences>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<GalleryTab>(initialTab);
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();
  const stats = readingStats(prefs.readingStats);
  const finished = books.filter(bookFinished).length;
  // Where focus was before the gallery opened, to return to on close.
  const opener = useRef(document.activeElement);
  useEffect(() => {
    const scrim = dialog.current?.parentElement;
    dialog.current?.querySelector<HTMLElement>("[aria-pressed='true'], button")?.focus();
    const siblings = Array.from(scrim?.parentElement?.children || []).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== scrim && !el.classList.contains("toast-region"),
    );
    const previous = siblings.map((el) => el.inert);
    siblings.forEach((el) => {
      el.inert = true;
    });
    return () => {
      siblings.forEach((el, i) => {
        el.inert = previous[i];
      });
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected)
        requestAnimationFrame(() => back.focus());
    };
  }, []);
  const tile = (
    key: string,
    label: string,
    caption: string | undefined,
    art: { url: string; filter?: string } | undefined,
    chosen: boolean,
    choose: () => void,
    extra?: { locked?: Place; className?: string },
  ) => {
    const locked = extra?.locked;
    const hint = locked && unlockHint(locked, stats, finished);
    const hintId = key + "-hint";
    return (
      <button
        key={key}
        className={
          "gallery-tile" +
          (chosen ? " chosen" : "") +
          (locked ? " locked" : "") +
          (extra?.className ? " " + extra.className : "")
        }
        aria-pressed={locked ? undefined : chosen}
        aria-disabled={locked ? true : undefined}
        aria-label={locked ? t("Locked place") : label}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => !locked && choose()}
      >
        <span
          className="gallery-art"
          style={art ? { backgroundImage: `url("${art.url}")`, filter: art.filter } : undefined}
          aria-hidden="true"
        />
        {locked ? (
          <span className="gallery-lock" aria-hidden="true">
            <LockKeyhole size={18} />
          </span>
        ) : (
          <span className="gallery-label" aria-hidden="true">
            <strong>{label}</strong>
            {caption && <small>{caption}</small>}
          </span>
        )}
        {chosen && !locked && (
          <span className="gallery-check" aria-hidden="true">
            <Check size={13} />
          </span>
        )}
        {hint && (
          <span className="gallery-hint" id={hintId} role="tooltip">
            <strong>{hint.how}</strong>
            <span>{hint.progress}</span>
          </span>
        )}
      </button>
    );
  };
  const placeTile = (place: Place) =>
    tile(
      place.id,
      t(place.title),
      t(place.event),
      { url: place.image },
      prefs.scene === placeSceneId(place.id),
      () => {
        recordFeat("restyle");
        onChange({ scene: placeSceneId(place.id), backgroundMode: "manual" });
      },
      { locked: placeOpen(place.id, stats) ? undefined : place },
    );
  const group = (category: Place["category"]) => places.filter((p) => p.category === category);
  const open = placesOpen(stats);
  const content = (
    <div
      className="modal-scrim gallery-scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={dialog}
        className="quick-dialog theme-gallery"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="gallery-heading">
          <Palette size={18} aria-hidden="true" />
          <h2 id={titleId}>{t("Scene and colors")}</h2>
          <div className="segmented gallery-tabs" role="tablist" aria-label={t("Scene and colors")}>
            {(["scenes", "colors"] as const).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {id === "scenes" ? t("Scenes") : t("Color themes")}
              </button>
            ))}
          </div>
          <button className="icon-button" aria-label={t("Close")} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {tab === "scenes" ? (
          <div className="gallery-body" role="tabpanel">
            <UnlockNote />
            <h3>{t("Landscapes")}</h3>
            <div className="gallery-grid">
              {landscapes.map((s) =>
                tile(
                  s.id,
                  t(s.name),
                  undefined,
                  backgroundImage(s),
                  prefs.scene === s.id,
                  () => { recordFeat("restyle"); onChange({ scene: s.id, backgroundMode: "manual" }); },
                  { className: "preview-" + s.id },
                ),
              )}
            </div>
            <h3>
              {t("Places to read")}{" "}
              <small>
                {t("{count} of {total} unlocked", { count: open, total: places.length })}
              </small>
            </h3>
            <p className="hint">
              {t("Reading, listening and finishing books unlock new places. Each celebration unlocks only when you read during its month.")}
            </p>
            <h4>{t("Celebrations")}</h4>
            <div className="gallery-grid">{group("holiday").map(placeTile)}</div>
            <h4>{t("Reading milestones")}</h4>
            <div className="gallery-grid">{group("achievement").map(placeTile)}</div>
          </div>
        ) : (
          <div className="gallery-body" role="tabpanel">
            <UnlockNote />
            <p className="hint">{t("Colors for menus, panels and buttons.")}</p>
            {colorGroups.map(([title, list]) => (
              <div key={title}>
                <h4>{title === "Dark" ? t("Dark") : title === "Light" ? t("Light") : t("High contrast")}</h4>
                <div className="gallery-grid color-grid">
                  {list.map((th) => {
                    const chosen = prefs.theme === th.id;
                    const locked = !chosen && !isOpen("theme", th.id, stats);
                    const hint = locked ? rewardHint("theme", th.id, stats, finished) : null;
                    return (
                      <button
                        key={th.id}
                        className={"color-tile" + (chosen ? " chosen" : "") + (locked ? " locked" : "")}
                        aria-pressed={locked ? undefined : chosen}
                        aria-disabled={locked ? true : undefined}
                        aria-describedby={hint ? "theme-hint-" + th.id : undefined}
                        onClick={() => { if (locked) return; recordFeat("restyle"); onChange({ theme: th.id }); }}
                        style={{ background: th.bg, color: th.ink, borderColor: th.line }}
                      >
                        <span className="color-panel" style={{ background: th.panel, borderColor: th.line }} aria-hidden="true">
                          <span style={{ background: th.accent }} />
                          <span style={{ background: th.muted }} />
                        </span>
                        <strong>{t(th.name)}</strong>
                        {chosen && <Check size={14} style={{ color: th.accent }} aria-hidden="true" />}
                        {locked && <LockKeyhole size={14} aria-hidden="true" />}
                        {hint && (
                          <span className="gallery-hint" id={"theme-hint-" + th.id} role="tooltip">
                            <strong>{hint.how}</strong>
                            <span>{hint.progress}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
  return createPortal(content, document.querySelector(".app") || document.body);
}
