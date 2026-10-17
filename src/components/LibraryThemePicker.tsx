import { Check, LayoutGrid } from "lucide-react";
import { t } from "../i18n";
import { libraryThemes } from "../libraryThemes";

// Theme cards for the library: used in the library header and in Settings.
export function LibraryThemePicker({
  value,
  night,
  onChange,
  compact = false,
}: {
  value: string;
  night: boolean;
  onChange: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={"library-themes" + (compact ? " compact" : "")} role="radiogroup" aria-label={t("Library theme")}>
      {libraryThemes.map((theme) => {
        const ready = theme.status === "ready";
        const chosen = value === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            disabled={!ready}
            className={"library-theme-card" + (chosen ? " chosen" : "")}
            onClick={() => onChange(theme.id)}
          >
            <span className="library-theme-preview" aria-hidden="true">
              {theme.base ? (
                <img src={`${theme.base}preview_${night ? "night" : "day"}.webp`} alt="" />
              ) : theme.kind === "classic" ? (
                <span className="library-theme-classic">
                  <LayoutGrid size={compact ? 22 : 28} />
                </span>
              ) : (
                <span className="library-theme-soon">{t("Coming soon")}</span>
              )}
              {chosen && (
                <span className="library-theme-check">
                  <Check size={14} />
                </span>
              )}
            </span>
            <span className="library-theme-text">
              <strong>
                {t(theme.name)}
                {theme.kind === "room" && ready && <span className="library-theme-badge">3D</span>}
              </strong>
              {!compact && <small>{t(theme.description)}</small>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
