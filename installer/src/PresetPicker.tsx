import { t } from "../../src/i18n";
import { Check } from "lucide-react";
import { AppearancePreview } from "./AppearancePreview";
import { presets, surfaceNames } from "./presets";
import type { SetupOptions } from "./model";

export function PresetPicker({
  options,
  onSelect,
}: {
  options: SetupOptions;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <AppearancePreview options={options} />
      <div className="background-preset-grid">
        {presets.map((item) => (
          <button
            className={`background-preset ${item.id === options.background ? "selected" : ""}`}
            key={item.id}
            aria-pressed={item.id === options.background}
            onClick={() => onSelect(item.id)}
          >
            <span
              className={`preset-thumbnail preset-thumbnail-${item.id}`}
              style={
                item.image
                  ? { backgroundImage: `url("${item.image}")` }
                  : undefined
              }
            />
            <span className="preset-card-copy">
              <strong>{t(item.name)}</strong>
              <small>{t(surfaceNames[item.appearance.surface])}</small>
              {item.id === "lake" && <em>{t("Recommended")}</em>}
            </span>
            {item.id === options.background && (
              <Check className="preset-check" size={17} />
            )}
          </button>
        ))}
      </div>
      <p className="preset-default-note">
        {t(
          "Each style includes its background, paper texture, transparency and animations. You can fine-tune these in Origami.",
        )}
      </p>
    </>
  );
}
