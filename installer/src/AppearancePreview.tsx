import { t } from "../../src/i18n";
import type { CSSProperties } from "react";
import {
  BookOpen,
  Bookmark,
  Play,
  Search,
  Settings2,
  Volume2,
} from "lucide-react";
import { defaultPreferences } from "../../src/types";
import { BackgroundScene } from "./appearance/BackgroundScene";
import { getPreset, presetTheme, surfaceNames } from "./presets";
import type { SetupOptions } from "./model";
import "./appearance/reader-appearance.css";
import "./appearance-preview.css";

export function AppearancePreview({ options }: { options: SetupOptions }) {
  const preset = getPreset(options.background);
  const theme = presetTheme(options.background);
  const prefs = {
    ...defaultPreferences,
    ...options.appearance,
    scene: preset.id,
    motion: options.motion !== "reduced" && options.appearance.motion,
  };
  const variables = {
    "--bg": theme.bg,
    "--panel": theme.panel,
    "--ink": theme.ink,
    "--accent": theme.accent,
    "--accent-ink": theme.contrast,
    "--muted": theme.muted,
    "--line": theme.line,
    "--page-brightness": prefs.pageBrightness / 100,
  } as CSSProperties;
  return (
    <div
      className="appearance-example"
      style={variables}
      aria-label={t("{name} preview with {surface}", {
        name: t(preset.name),
        surface: t(surfaceNames[prefs.surface]),
      })}
    >
      <BackgroundScene key={`${preset.id}-${prefs.motion}`} prefs={prefs} />
      <div className="example-sidebar" aria-hidden="true">
        <img src="./crane.png" alt="" />
        <strong>{t("Origami")}</strong>
        <span className="example-nav-active">
          <BookOpen size={15} /> {t("Library")}
        </span>
        <span>
          <Bookmark size={15} /> {t("Bookmarks")}
        </span>
        <span>
          <Settings2 size={15} /> {t("Settings")}
        </span>
      </div>
      <div className="example-workspace">
        <div className="example-topbar">
          <span>{t("The northern road")}</span>
          <Search size={15} />
        </div>
        <div className="example-reading-area">
          <article
            className={`example-paper surface-${prefs.surface} ${prefs.texture ? "" : "texture-off"}`}
          >
            <span className="example-chapter">{t("CHAPTER ONE")}</span>
            <h2>{t("Beside the fire")}</h2>
            <p>
              {t(
                "The rain had stopped, but everything was still shining. Wet stone, silver branches, a thin ribbon of sunlight across the water.",
              )}
            </p>
            <p>
              {t(
                "“Come closer to the fire,” she said. “There’s room beside me.”",
              )}
            </p>
          </article>
        </div>
        <div className="example-player" aria-hidden="true">
          <span className="example-play">
            <Play size={15} fill="currentColor" />
          </span>
          <span>{t("Read aloud")}</span>
          <span className="example-track">
            <i />
          </span>
          <Volume2 size={16} />
          <span>1×</span>
        </div>
      </div>
    </div>
  );
}
