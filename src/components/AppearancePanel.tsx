import { t } from "../i18n";
import {
  Check,
  FileText,
  Image,
  Moon,
  Palette,
  Sparkles,
  Sun,
  SunMoon,
  Type,
} from "lucide-react";
import { Section } from "./Section";
import { themes } from "../themes";
import {
  backgroundImage,
  backgrounds,
  defaultSceneAppearance,
  effectLabels,
  getBackground,
  isDraftArt,
  sceneFor,
  sceneTime,
  seasons,
} from "../backgrounds";
import type { Preferences } from "../types";
import { systemName } from "../platform";
export const readerFonts = [
  {
    id: "book",
    name: "Book serif",
    stack: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "palatino",
    name: "Palatino",
    stack:
      '"Palatino Linotype", "Book Antiqua", Palatino, "TeX Gyre Pagella", "URW Palladio L", Georgia, serif',
  },
  {
    id: "garamond",
    name: "Garamond",
    stack: 'Garamond, "EB Garamond", "Palatino Linotype", Georgia, serif',
  },
  {
    id: "sans",
    name: "Clean sans",
    stack:
      'system-ui, "Segoe UI", -apple-system, "Helvetica Neue", "Noto Sans", Cantarell, Ubuntu, Arial, sans-serif',
  },
  {
    id: "verdana",
    name: "Wide sans (Verdana)",
    stack: 'Verdana, "DejaVu Sans", "Segoe UI", sans-serif',
  },
  {
    id: "hyperlegible",
    name: "Atkinson Hyperlegible",
    stack:
      '"Atkinson Hyperlegible", "Atkinson Hyperlegible Next", Verdana, sans-serif',
  },
  {
    id: "dyslexic",
    name: "OpenDyslexic",
    stack: 'OpenDyslexic, "OpenDyslexic3", Verdana, sans-serif',
  },
] as const;
export function readerFontStack(id: string) {
  return (readerFonts.find((f) => f.id === id) || readerFonts[0]).stack;
}
function surfaceName(surface: string) {
  return surface === "dark"
    ? t("Night")
    : surface === "grid"
      ? t("Math grid")
      : surface === "blueprint"
        ? t("Blueprint")
    : surface === "light"
      ? t("White")
      : surface === "paper"
        ? t("Paper")
        : t("Sepia");
}
// Appearance controls in collapsible groups. The inspector opens the groups
// used most while reading; Settings opens every group.
export function AppearancePanel({
  prefs,
  onChange,
  scope = "inspector",
  autoScale = 100,
}: {
  prefs: Preferences;
  onChange: (p: Partial<Preferences>) => void;
  scope?: "inspector" | "settings";
  // The size chosen for this window when the size is automatic.
  autoScale?: number;
}) {
  const scale = prefs.uiScaleAuto ? autoScale : prefs.uiScale;
  const background = getBackground(prefs.scene);
  const season = background.season;
  const time = season ? sceneTime(prefs.scene) : "night";
  const full = scope === "settings";
  const theme = themes.find((th) => th.id === prefs.theme);
  const sceneName = season
    ? t(seasons.find((x) => x.id === season)!.name)
    : t(background.name);
  return (
    <div className="inspector-content appearance-panel">
      <Section
        id={scope + "-scene"}
        title={t("Scene")}
        icon={<Image size={15} />}
        meta={sceneName}
      >
        <div
          className="segmented day-night"
          role="group"
          aria-label={t("Day or night scene")}
        >
          {(["day", "night"] as const).map((when) => (
            <button
              key={when}
              className={season && time === when ? "active" : ""}
              aria-pressed={Boolean(season) && time === when}
              aria-label={when === "day" ? t("Day scene") : t("Night scene")}
              disabled={!season}
              title={
                season ? undefined : t("Choose a season to use day and night")
              }
              onClick={() =>
                season &&
                onChange({
                  scene: sceneFor(season, when, background.location),
                  timeMode: "manual",
                })
              }
            >
              {when === "day" ? <Sun size={14} /> : <Moon size={14} />}
              {when === "day" ? t("Day") : t("Night")}
            </button>
          ))}
        </div>
        <div className="scene-options">
          {[
            backgrounds[0],
            ...seasons.map((s) => getBackground(sceneFor(s.id, time))),
            ...seasons.map((s) =>
              getBackground(sceneFor(s.id, time, "garden")),
            ),
            getBackground("paper"),
          ].map((s) => {
            const art = backgroundImage(s);
            const chosen = s.season
              ? season === s.season && background.location === s.location
              : prefs.scene === s.id;
            return (
              <button
                key={s.id}
                onClick={() =>
                  onChange({ scene: s.id, backgroundMode: "manual" })
                }
                aria-pressed={chosen}
                aria-label={t(s.name)}
                title={t(s.name)}
                className={
                  "scene scene-" +
                  (s.season || s.id) +
                  (chosen ? " chosen" : "")
                }
              >
                <span
                  className={"scene-preview preview-" + s.id}
                  style={
                    art
                      ? {
                          backgroundImage: `url("${art.url}")`,
                          filter: art.filter,
                        }
                      : undefined
                  }
                  aria-hidden="true"
                />
                {isDraftArt(s) && (
                  <span className="draft-chip" aria-hidden="true">
                    {t("Draft art")}
                  </span>
                )}
                <span className="scene-label" aria-hidden="true">
                  {s.season
                    ? (s.location === "garden" ? t("Garden") + " · " : "") +
                      t(seasons.find((x) => x.id === s.season)!.name)
                    : t(s.name)}
                </span>
              </button>
            );
          })}
        </div>
        {isDraftArt(background) && (
          <p className="hint">
            {t("Temporary art. A painted version replaces it when added.")}
          </p>
        )}
        <label data-help={t("How strongly the scene shows behind the app.")}>
          {t("Background opacity")}{" "}
          <output>{Math.round(prefs.backgroundOpacity * 100)}%</output>
          <input
            aria-label={t("Background opacity")}
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
            <span>{t("Transparent")}</span>
            <span>{t("Opaque")}</span>
          </span>
        </label>
        <button
          className="text-button scene-reset"
          onClick={() => onChange(defaultSceneAppearance(prefs.scene))}
        >
          {t("Reset scene defaults")}
        </button>
      </Section>
      <Section
        id={scope + "-motion"}
        title={t("Motion")}
        icon={<Sparkles size={15} />}
        meta={prefs.motion && background.effects.length ? t("On") : t("Off")}
        defaultOpen={full}
      >
        <label
          className="check-label"
          data-help={t(
            "Drifting petals, mist, ripples and other small animations.",
          )}
        >
          <input
            type="checkbox"
            checked={prefs.motion}
            disabled={!background.effects.length}
            onChange={(e) => onChange({ motion: e.target.checked })}
          />
          {t("Subtle background motion")}
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
                {t(
                  key === "cabinLights" && background.location === "garden"
                    ? "Stone lantern"
                    : effectLabels[key],
                )}
              </label>
            ))}
          </div>
        )}
        <p className="hint">
          {background.effects.length > 0
            ? t(
                "Motion pauses when hidden and follows reduced-motion preferences.",
              )
            : t("Background motion is available with the landscape scenes.")}
        </p>
      </Section>
      <Section
        id={scope + "-text"}
        title={t("Text")}
        icon={<Type size={15} />}
        meta={prefs.fontSize + t("px")}
      >
        <label
          data-help={t("Size of the book text. Ctrl and + or - also work.")}
        >
          {t("Text size")}{" "}
          <output>
            {prefs.fontSize}
            {t("px")}
          </output>
          <input
            aria-label={t("Text size")}
            type="range"
            min="16"
            max="32"
            value={prefs.fontSize}
            onChange={(e) => onChange({ fontSize: +e.target.value })}
          />
        </label>
        <label
          data-help={t(
            "Typeface for book text, including dyslexia-friendly options.",
          )}
        >
          {t("Font")}
          <select
            aria-label={t("Reading font")}
            value={prefs.readerFont}
            onChange={(e) => onChange({ readerFont: e.target.value })}
          >
            {readerFonts.map((f) => (
              <option key={f.id} value={f.id}>
                {t(f.name)}
              </option>
            ))}
          </select>
        </label>
        {prefs.readerFont === "hyperlegible" && (
          <p className="hint">
            {t(
              "Uses the font when it is installed on this computer, otherwise a similar wide sans.",
            )}
          </p>
        )}
        <label data-help={t("Space between lines of book text.")}>
          {t("Line spacing")} <output>{prefs.lineHeight.toFixed(1)}</output>
          <input
            aria-label={t("Line spacing")}
            type="range"
            min="1.3"
            max="2.3"
            step=".1"
            value={prefs.lineHeight}
            onChange={(e) => onChange({ lineHeight: +e.target.value })}
          />
        </label>
        <label
          data-help={t(
            "Extra space between letters, which can help readability.",
          )}
        >
          {t("Letter spacing")}{" "}
          <output>
            {prefs.letterSpacing === 0
              ? t("Normal")
              : "+" + Math.round(prefs.letterSpacing * 100) + "%"}
          </output>
          <input
            aria-label={t("Letter spacing")}
            type="range"
            min="0"
            max="0.12"
            step="0.01"
            value={prefs.letterSpacing}
            onChange={(e) => onChange({ letterSpacing: +e.target.value })}
          />
        </label>
        <label data-help={t("Extra space between words.")}>
          {t("Word spacing")}{" "}
          <output>
            {prefs.wordSpacing === 0
              ? t("Normal")
              : "+" + Math.round(prefs.wordSpacing * 100) + "%"}
          </output>
          <input
            aria-label={t("Word spacing")}
            type="range"
            min="0"
            max="0.4"
            step="0.05"
            value={prefs.wordSpacing}
            onChange={(e) => onChange({ wordSpacing: +e.target.value })}
          />
        </label>
        <div className="check-row">
          <label
            className="check-label"
            data-help={t("Aligns book text to both margins.")}
          >
            <input
              type="checkbox"
              checked={prefs.justify}
              onChange={(e) => onChange({ justify: e.target.checked })}
            />
            {t("Justify text")}
          </label>
          <label
            className="check-label"
            data-help={t(
              "Splits long words at line ends, useful with justified text.",
            )}
          >
            <input
              type="checkbox"
              checked={prefs.hyphenate}
              onChange={(e) => onChange({ hyphenate: e.target.checked })}
            />
            {t("Hyphenate")}
          </label>
        </div>
        <label data-help={t("Marks the sentence or paragraph being read.")}>
          {t("Highlight while reading aloud")}
          <select
            aria-label={t("Highlight while reading aloud")}
            value={prefs.highlight}
            onChange={(e) =>
              onChange({
                highlight: e.target.value as Preferences["highlight"],
              })
            }
          >
            <option value="sentence">{t("Current sentence")}</option>
            <option value="paragraph">{t("Current paragraph")}</option>
            <option value="off">{t("No highlight")}</option>
          </select>
        </label>
        <label
          className="check-label"
          data-help={t("Marks each word as it is read, on its own or inside the highlighted sentence.")}
        >
          <input
            type="checkbox"
            checked={prefs.wordHighlight}
            onChange={(e) => onChange({ wordHighlight: e.target.checked })}
          />
          {t("Highlight each word")}
        </label>
        <label
          className="check-label"
          data-help={t("Scrolls the page to keep up with the voice.")}
        >
          <input
            type="checkbox"
            checked={prefs.follow}
            onChange={(e) => onChange({ follow: e.target.checked })}
          />
          {t("Follow narration")}
        </label>
      </Section>
      <Section
        id={scope + "-page"}
        title={t("Page")}
        icon={<FileText size={15} />}
        meta={surfaceName(prefs.surface)}
        defaultOpen={full}
      >
        <div
          className="segmented"
          role="group"
          aria-label={t("Reading surface")}
        >
          {["paper", "light", "dark", "parchment", "grid", "blueprint"].map((s) => (
            <button
              key={s}
              className={prefs.surface === s ? "active" : ""}
              aria-pressed={prefs.surface === s}
              onClick={() => onChange({ surface: s })}
            >
              {surfaceName(s)}
            </button>
          ))}
        </div>
        <label
          className="check-label"
          data-help={t("A subtle paper grain on the reading page.")}
        >
          <input
            type="checkbox"
            checked={prefs.texture}
            onChange={(e) => onChange({ texture: e.target.checked })}
          />
          {t("Paper texture")}
        </label>
        <label
          data-help={t(
            "Dims or brightens the page without changing text color.",
          )}
        >
          {t("Page brightness")} <output>{prefs.pageBrightness}%</output>
          <input
            aria-label={t("Page brightness")}
            type="range"
            min="50"
            max="150"
            step="5"
            value={prefs.pageBrightness}
            onChange={(e) => onChange({ pageBrightness: +e.target.value })}
          />
          <span className="range-endpoints" aria-hidden="true">
            <span>{t("Darker")}</span>
            <span>{t("Brighter")}</span>
          </span>
        </label>
        <label data-help={t("How wide the reading column is.")}>
          {t("Page width")}{" "}
          <output>
            {prefs.pageWidth === 0 ? t("Full width") : prefs.pageWidth + "px"}
          </output>
          <input
            aria-label={t("Page width")}
            type="range"
            min="600"
            max="2200"
            step="50"
            value={prefs.pageWidth || 2200}
            disabled={prefs.pageWidth === 0}
            onChange={(e) => onChange({ pageWidth: +e.target.value })}
          />
        </label>
        <label
          className="check-label"
          data-help={t("Lets the text fill the whole reading area.")}
        >
          <input
            type="checkbox"
            checked={prefs.pageWidth === 0}
            onChange={(e) =>
              onChange({ pageWidth: e.target.checked ? 0 : 850 })
            }
          />
          {t("Use full reading width")}
        </label>
        <label
          data-help={t(
            "Scroll continuously, page by page, or scroll with page snapping.",
          )}
        >
          {t("Reading mode")}
          <select
            aria-label={t("Reading mode")}
            value={prefs.readingMode}
            onChange={(e) =>
              onChange({
                readingMode: e.target.value as Preferences["readingMode"],
              })
            }
          >
            <option value="continuous">{t("Continuous scrolling")}</option>
            <option value="paged">{t("One page at a time")}</option>
            <option value="snap">{t("Scrolling with page snapping")}</option>
            <option value="book">{t("Book, two pages side by side")}</option>
          </select>
        </label>
        <label data-help={t("Gap between reading pages.")}>
          {t("Page spacing")}{" "}
          <output>
            {prefs.pageGap === 0 ? t("Continuous") : prefs.pageGap + "px"}
          </output>
          <input
            aria-label={t("Page spacing")}
            type="range"
            min="0"
            max="160"
            step="8"
            value={prefs.pageGap}
            onChange={(e) => onChange({ pageGap: +e.target.value })}
          />
          <span className="range-endpoints" aria-hidden="true">
            <span>{t("No gap")}</span>
            <span>{t("Large gap")}</span>
          </span>
        </label>
        <label
          data-help={t("Shows page numbers, paragraph ranges or a percentage.")}
        >
          {t("Reading progress")}
          <select
            aria-label={t("Reading progress")}
            value={prefs.readingProgress}
            onChange={(e) =>
              onChange({
                readingProgress: e.target
                  .value as Preferences["readingProgress"],
              })
            }
          >
            <option value="pages">{t("Page number")}</option>
            <option value="paragraphs">{t("Paragraph range")}</option>
            <option value="percentage">{t("Percentage")}</option>
          </select>
        </label>
      </Section>
      <Section
        id={scope + "-theme"}
        title={t("Colors and size")}
        icon={<Palette size={15} />}
        meta={theme ? t(theme.name) : undefined}
        defaultOpen={full}
      >
        <div
          className="theme-swatches"
          role="group"
          aria-label={t("Theme colors")}
        >
          {themes.map((th) => (
            <button
              key={th.id}
              title={t(th.name)}
              aria-label={t(th.name)}
              aria-pressed={prefs.theme === th.id}
              className={prefs.theme === th.id ? "chosen" : ""}
              onClick={() => onChange({ theme: th.id })}
              style={{
                background: th.bg,
                color: th.accent,
                borderColor: th.accent,
              }}
            >
              <span style={{ background: th.accent }} />
              {prefs.theme === th.id && <Check size={12} />}
            </button>
          ))}
        </div>
        <label data-help={t("Colors for menus, panels and buttons.")}>
          {t("App theme")}
          <select
            aria-label={t("App theme")}
            value={prefs.theme}
            onChange={(e) => onChange({ theme: e.target.value })}
          >
            {themes.map((th) => (
              <option key={th.id} value={th.id}>
                {t(th.name)}
              </option>
            ))}
          </select>
        </label>
        <label data-help={t("Makes menus and panels larger or smaller.")}>
          {t("Interface size")}{" "}
          <output>
            {scale}%{prefs.uiScaleAuto ? " · " + t("Automatic") : ""}
          </output>
          <input
            aria-label={t("Interface size")}
            type="range"
            min="90"
            max="130"
            step="5"
            value={scale}
            onChange={(e) =>
              onChange({ uiScale: +e.target.value, uiScaleAuto: false })
            }
          />
          <span className="range-endpoints" aria-hidden="true">
            <span>{t("Compact")}</span>
            <span>{t("Larger")}</span>
          </span>
        </label>
        <label
          className="check-label"
          data-help={t(
            "Picks a comfortable interface size for the window and screen, and adjusts when the window is resized.",
          )}
        >
          <input
            type="checkbox"
            checked={prefs.uiScaleAuto}
            onChange={(e) => onChange({ uiScaleAuto: e.target.checked })}
          />
          {t("Fit interface to screen size")}
        </label>
      </Section>
      <Section
        id={scope + "-automatic"}
        title={t("Automatic scene")}
        icon={<SunMoon size={15} />}
        meta={
          prefs.backgroundMode === "seasonal"
            ? t("Current season")
            : prefs.backgroundMode === "random"
              ? t("Random at startup")
              : prefs.timeMode !== "manual"
                ? t("Time of day")
                : t("Off")
        }
        defaultOpen={full}
      >
        <label
          data-help={t(
            "Pick the scene yourself, follow the season, or get a random one at startup.",
          )}
        >
          {t("Background selection")}
          <select
            aria-label={t("Background selection")}
            value={prefs.backgroundMode}
            onChange={(e) =>
              onChange({
                backgroundMode: e.target.value as Preferences["backgroundMode"],
              })
            }
          >
            <option value="manual">{t("Manual")}</option>
            <option value="seasonal">{t("Current season")}</option>
            <option value="random">{t("Random at startup")}</option>
          </select>
        </label>
        {prefs.backgroundMode === "seasonal" && (
          <label>
            {t("Seasons in")}
            <select
              aria-label={t("Seasons in")}
              value={prefs.seasonHemisphere}
              onChange={(e) =>
                onChange({
                  seasonHemisphere: e.target
                    .value as Preferences["seasonHemisphere"],
                })
              }
            >
              <option value="north">{t("Northern hemisphere")}</option>
              <option value="south">{t("Southern hemisphere")}</option>
            </select>
          </label>
        )}
        {prefs.backgroundMode !== "manual" && (
          <p className="hint">
            {prefs.backgroundMode === "seasonal"
              ? t(
                  "Uses your local date. Seasons change in March, June, September and December.",
                )
              : t(
                  "A different lake scene is chosen each time Origami opens, starting next launch.",
                )}{" "}
            {t("Choosing a scene switches back to Manual.")}
          </p>
        )}
        <label
          data-help={t(
            "Switch day and night yourself, follow the system, or follow the clock.",
          )}
        >
          {t("Time of day")}
          <select
            aria-label={t("Time of day")}
            value={prefs.timeMode}
            onChange={(e) =>
              onChange({ timeMode: e.target.value as Preferences["timeMode"] })
            }
          >
            <option value="manual">{t("Manual (Sun and Moon button)")}</option>
            <option value="system">
              {t("Follow {system} light or dark mode", { system: systemName })}
            </option>
            <option value="clock">{t("Follow local time")}</option>
          </select>
        </label>
        {prefs.timeMode === "clock" && (
          <div className="time-range">
            <label>
              {t("Day starts")}
              <input
                aria-label={t("Day starts")}
                type="time"
                value={prefs.dayStarts}
                onChange={(e) =>
                  e.target.value && onChange({ dayStarts: e.target.value })
                }
              />
            </label>
            <label>
              {t("Night starts")}
              <input
                aria-label={t("Night starts")}
                type="time"
                value={prefs.nightStarts}
                onChange={(e) =>
                  e.target.value && onChange({ nightStarts: e.target.value })
                }
              />
            </label>
          </div>
        )}
      </Section>
    </div>
  );
}
