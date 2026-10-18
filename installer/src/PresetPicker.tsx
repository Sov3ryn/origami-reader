import { t } from "../../src/i18n";
import { Check, Moon, Sun } from "lucide-react";
import { AppearancePreview } from "./AppearancePreview";
import { places, sceneFor, timeOf } from "./presets";
import type { SetupOptions } from "./model";

// Scenes still on temporary art show the filtered day painting, as Origami does.
function thumbnail(scene: { image?: string; draft?: { from: string; filter: string } }) {
  const url = scene.draft?.from || scene.image;
  return url ? { backgroundImage: `url(".${url}")`, filter: scene.draft?.filter } : undefined;
}

// One card per place, and a day or night switch; places with only one time
// keep it. The preview shows the chosen style beside the cards.
export function PresetPicker({ options, onSelect }: { options: SetupOptions; onSelect: (id: string) => void }) {
  const time = timeOf(options.background);
  return (
    <div className="appearance-layout">
      <AppearancePreview options={options} />
      <div className="appearance-choices">
        <div className="day-night" role="radiogroup" aria-label={t("Time of day")}>
          {(["day", "night"] as const).map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={time === value}
              onClick={() => {
                const place = places.find((p) => p.scenes.some((s) => s.id === options.background));
                if (place) onSelect(sceneFor(place, value).id);
              }}
            >
              {value === "day" ? <Sun size={15} /> : <Moon size={15} />}
              {value === "day" ? t("Day") : t("Night")}
            </button>
          ))}
        </div>
        <div className="background-preset-grid">
          {places.map((place) => {
            const scene = sceneFor(place, time);
            const selected = place.scenes.some((s) => s.id === options.background);
            return (
              <button
                className={`background-preset ${selected ? "selected" : ""}`}
                key={place.id}
                aria-pressed={selected}
                onClick={() => onSelect(scene.id)}
              >
                <span className="preset-thumbnail" style={thumbnail(scene)} />
                <span className="preset-card-copy">
                  <strong>
                    {t(place.location)} · {t(place.season)}
                  </strong>
                  {place.id === "lake" && <em>{t("Recommended")}</em>}
                </span>
                {selected && <Check className="preset-check" size={16} />}
              </button>
            );
          })}
        </div>
        <p className="preset-default-note">{t("You can change the style, texture and animations later in Origami.")}</p>
      </div>
    </div>
  );
}
