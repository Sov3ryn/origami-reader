import { Check } from "lucide-react";
import { themes } from "../themes";
import type { Preferences } from "../types";
export function AppearancePanel({
  prefs,
  onChange,
}: {
  prefs: Preferences;
  onChange: (p: Partial<Preferences>) => void;
}) {
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
      <div className="scene-options">
        {[
          { id: "none", name: "None" },
          { id: "lake", name: "Moonlit lake" },
          { id: "paper", name: "Paper hills" },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => onChange({ scene: s.id })}
            aria-pressed={prefs.scene === s.id}
            className={
              "scene scene-" + s.id + (prefs.scene === s.id ? " chosen" : "")
            }
          >
            <span
              className={"scene-preview preview-" + s.id}
              aria-hidden="true"
            />
            <span className="scene-label">{s.name}</span>
          </button>
        ))}
      </div>
      <label>
        Background opacity{" "}
        <output>{Math.round(prefs.backgroundOpacity * 100)}%</output>
        <input
          aria-label="Background opacity"
          aria-valuetext={Math.round(prefs.backgroundOpacity * 100) + "%"}
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(prefs.backgroundOpacity * 100)}
          disabled={prefs.scene === "none"}
          onChange={(e) =>
            onChange({ backgroundOpacity: +e.target.value / 100 })
          }
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={prefs.motion}
          disabled={prefs.scene !== "lake"}
          onChange={(e) => onChange({ motion: e.target.checked })}
        />
        Subtle background motion
      </label>
      {prefs.scene === "lake" && prefs.motion && (
        <div className="ambient-options">
          {(
            [
              ["mist", "Drifting mist"],
              ["petals", "Windblown petals"],
              ["mountainFog", "Mountain fog"],
              ["ripples", "Lake ripples"],
              ["cabinLights", "Cabin lights"],
              ["moonCloud", "Cloud across the moon"],
            ] as const
          ).map(([key, name]) => (
            <label className="check-label" key={key}>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => onChange({ [key]: e.target.checked })}
              />
              {name}
            </label>
          ))}
        </div>
      )}
      <p className="hint">
        {prefs.scene === "lake"
          ? "Motion pauses when hidden and follows reduced-motion preferences."
          : "Background motion is available with Moonlit lake."}
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
