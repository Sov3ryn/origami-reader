import { Check } from "lucide-react";
import { themes } from "../themes";
import {
  backgrounds,
  defaultSceneAppearance,
  effectLabels,
  getBackground,
} from "../backgrounds";
import type { Preferences } from "../types";
export function AppearancePanel({
  prefs,
  onChange,
}: {
  prefs: Preferences;
  onChange: (p: Partial<Preferences>) => void;
}) {
  const background = getBackground(prefs.scene);
  return (
    <div className="inspector-content">
      <h3>Appearance</h3>
      <label>
        App theme
        <select
          aria-label="App theme"
          value={prefs.theme}
          onChange={(e) => onChange({ theme: e.target.value })}
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="theme-swatches">
        {themes.map((t) => (
          <button
            key={t.id}
            title={t.name}
            aria-label={t.name}
            className={prefs.theme === t.id ? "chosen" : ""}
            onClick={() => onChange({ theme: t.id })}
            style={{
              background: t.bg,
              color: t.accent,
              borderColor: t.accent,
            }}
          >
            <span style={{ background: t.accent }} />
            {prefs.theme === t.id && <Check size={12} />}
          </button>
        ))}
      </div>
      <h4>Reading surface</h4>
      <div className="segmented">
        {["paper", "light", "dark", "parchment"].map((s) => (
          <button
            key={s}
            className={prefs.surface === s ? "active" : ""}
            onClick={() => onChange({ surface: s })}
          >
            {s === "dark"
              ? "Night"
              : s === "light"
                ? "White"
                : s === "paper"
                  ? "Paper"
                  : "Sepia"}
          </button>
        ))}
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={prefs.texture}
          onChange={(e) => onChange({ texture: e.target.checked })}
        />
        Paper texture
      </label>
      <label>
        Page brightness <output>{prefs.pageBrightness}%</output>
        <input
          aria-label="Page brightness"
          type="range"
          min="50"
          max="150"
          step="5"
          value={prefs.pageBrightness}
          onChange={(e) => onChange({ pageBrightness: +e.target.value })}
        />
        <span className="range-endpoints" aria-hidden="true">
          <span>Darker</span>
          <span>Brighter</span>
        </span>
      </label>
      <p className="hint">
        Adjusts the paper area. Text and app controls keep their colors.
      </p>
      <label>
        Text size <output>{prefs.fontSize}px</output>
        <input
          aria-label="Text size"
          type="range"
          min="16"
          max="32"
          value={prefs.fontSize}
          onChange={(e) => onChange({ fontSize: +e.target.value })}
        />
      </label>
      <label>
        Line spacing <output>{prefs.lineHeight.toFixed(1)}</output>
        <input
          aria-label="Line spacing"
          type="range"
          min="1.3"
          max="2.3"
          step=".1"
          value={prefs.lineHeight}
          onChange={(e) => onChange({ lineHeight: +e.target.value })}
        />
      </label>
      <label>
        Page width{" "}
        <output>
          {prefs.pageWidth === 0 ? "Full width" : prefs.pageWidth + "px"}
        </output>
        <input
          aria-label="Page width"
          type="range"
          min="600"
          max="2200"
          step="50"
          value={prefs.pageWidth || 2200}
          disabled={prefs.pageWidth === 0}
          onChange={(e) => onChange({ pageWidth: +e.target.value })}
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={prefs.pageWidth === 0}
          onChange={(e) => onChange({ pageWidth: e.target.checked ? 0 : 850 })}
        />
        Use full reading width
      </label>
      <h4>Background</h4>
      <p className="hint">
        Each scene remembers its palette, reading surface, opacity and motion.
      </p>
      <label>
        Background selection
        <select
          aria-label="Background selection"
          value={prefs.backgroundMode}
          onChange={(e) =>
            onChange({
              backgroundMode: e.target.value as Preferences["backgroundMode"],
            })
          }
        >
          <option value="manual">Manual</option>
          <option value="seasonal">Current season</option>
          <option value="random">Random at startup</option>
        </select>
      </label>
      {prefs.backgroundMode === "seasonal" && (
        <>
          <label>
            Seasons in
            <select
              aria-label="Seasons in"
              value={prefs.seasonHemisphere}
              onChange={(e) =>
                onChange({
                  seasonHemisphere: e.target
                    .value as Preferences["seasonHemisphere"],
                })
              }
            >
              <option value="north">Northern hemisphere</option>
              <option value="south">Southern hemisphere</option>
            </select>
          </label>
          <p className="hint">
            Uses your local date. Seasons change in March, June, September and
            December.
          </p>
        </>
      )}
      {prefs.backgroundMode === "random" && (
        <p className="hint">
          A different lake scene is chosen each time Origami opens, starting
          next launch.
        </p>
      )}
      {prefs.backgroundMode !== "manual" && (
        <p className="hint">Choosing a scene below switches back to Manual.</p>
      )}
      <div className="scene-options">
        {backgrounds.map((s) => (
          <button
            key={s.id}
            onClick={() => onChange({ scene: s.id, backgroundMode: "manual" })}
            aria-pressed={prefs.scene === s.id}
            className={
              "scene scene-" + s.id + (prefs.scene === s.id ? " chosen" : "")
            }
          >
            <span
              className={"scene-preview preview-" + s.id}
              style={
                s.image ? { backgroundImage: `url("${s.image}")` } : undefined
              }
              aria-hidden="true"
            />
            <span className="scene-label">{s.name}</span>
          </button>
        ))}
      </div>
      <button
        className="scene-reset"
        onClick={() => onChange(defaultSceneAppearance(prefs.scene))}
      >
        Reset scene defaults
      </button>
      <label>
        Background opacity{" "}
        <output>{Math.round(prefs.backgroundOpacity * 100)}%</output>
        <input
          aria-label="Background opacity"
          aria-valuetext={Math.round(prefs.backgroundOpacity * 100) + "%"}
          type="range"
          dir="ltr"
          min="0"
          max="100"
          step="1"
          value={Math.round(prefs.backgroundOpacity * 100)}
          disabled={prefs.scene === "none"}
          onChange={(e) =>
            onChange({ backgroundOpacity: +e.target.value / 100 })
          }
        />
        <span className="range-endpoints" aria-hidden="true">
          <span>Transparent</span>
          <span>Opaque</span>
        </span>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={prefs.motion}
          disabled={!background.effects.length}
          onChange={(e) => onChange({ motion: e.target.checked })}
        />
        Subtle background motion
      </label>
      {background.effects.length > 0 && prefs.motion && (
        <div className="ambient-options">
          {background.effects.map((key) => (
            <label className="check-label" key={key}>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => onChange({ [key]: e.target.checked })}
              />
              {effectLabels[key]}
            </label>
          ))}
        </div>
      )}
      <p className="hint">
        {background.effects.length > 0
          ? "Motion pauses when hidden and follows reduced-motion preferences."
          : "Background motion is available with the lake scenes."}
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={prefs.follow}
          onChange={(e) => onChange({ follow: e.target.checked })}
        />
        Follow narration
      </label>
    </div>
  );
}
