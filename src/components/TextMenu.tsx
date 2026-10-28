import { t } from "../i18n";
import {
  ALargeSmall,
  BookOpen,
  Minus,
  Plus,
  Rows3,
  ScrollText,
  StickyNote,
} from "lucide-react";
import { Popover } from "./Popover";
import { Section } from "./Section";
import { readerFonts, readerFontStack } from "./AppearancePanel";
import { comfortPresets, matchingPreset } from "../comfort";
import type { BookMeta, Preferences } from "../types";

const surfaces = [
  { id: "paper", name: "Paper", swatch: "#f4efe3", ink: "#2b2721" },
  { id: "light", name: "White", swatch: "#ffffff", ink: "#171717" },
  { id: "parchment", name: "Sepia", swatch: "#ebdcbb", ink: "#3a3022" },
  { id: "dark", name: "Night", swatch: "#1b1c1f", ink: "#e3dfd7" },
  { id: "grid", name: "Math grid", swatch: "#fbfbf7", ink: "#1d2a44" },
  { id: "blueprint", name: "Blueprint", swatch: "#1f4e8c", ink: "#eef5ff" },
] as const;
const tones = [
  { id: "default", name: "Default" },
  { id: "soft", name: "Softer" },
  { id: "contrast", name: "High contrast" },
] as const;
const focusTools = [
  { id: "off", name: "Off" },
  { id: "line", name: "Line highlight" },
  { id: "strip", name: "Reading strip" },
  { id: "paragraph", name: "Paragraph focus" },
] as const;

// Reading comfort (Aa) in the top bar: reading mode, presets, font, size,
// spacing, text color and focus tools, with a live sample. Paper and scene
// live in the Appearance tab. While a book is open the
// settings can apply to all books or to that book only.
export function TextMenu({
  prefs,
  onChange,
  onMore,
  book,
  onBookComfort,
  bookFits = true,
}: {
  prefs: Preferences;
  onChange: (p: Partial<Preferences>) => void;
  onMore: () => void;
  book?: BookMeta;
  onBookComfort?: (on: boolean) => void;
  // Whether the reading area is wide enough for two book pages.
  bookFits?: boolean;
}) {
  const layouts = [
    { id: "continuous", name: t("Scroll"), icon: <ScrollText size={16} /> },
    { id: "snap", name: t("Snap"), icon: <Rows3 size={16} /> },
    { id: "paged", name: t("Pages"), icon: <StickyNote size={16} /> },
    { id: "book", name: t("Book"), icon: <BookOpen size={16} /> },
  ] as const;
  const layout = prefs.readingMode;
  const surface = surfaces.find((s) => s.id === prefs.surface) || surfaces[0];
  const preset = matchingPreset(prefs);
  return (
    <Popover
      label={t("Reading comfort")}
      icon={<ALargeSmall size={19} />}
      panelClassName="text-menu"
    >
      <div
        className="text-menu-sample"
        style={{
          background: surface.swatch,
          color:
            prefs.textTone === "contrast"
              ? surface.id === "dark"
                ? "#fff"
                : "#000"
              : prefs.textTone === "soft"
                ? `color-mix(in srgb, ${surface.ink} 78%, transparent)`
                : surface.ink,
          fontFamily: readerFontStack(prefs.readerFont),
          fontSize: Math.min(prefs.fontSize, 24),
          lineHeight: prefs.lineHeight,
          letterSpacing: prefs.letterSpacing + "em",
          wordSpacing: prefs.wordSpacing + "em",
          filter: `brightness(${prefs.pageBrightness / 100})`,
        }}
        aria-hidden="true"
      >
        {t("The lake was still, and the paper crane drifted toward the shore.")}
      </div>
      <div
        className="reading-layouts"
        role="group"
        aria-label={t("Page layout")}
      >
        {layouts.map((l) => (
          <button
            key={l.id}
            aria-pressed={layout === l.id}
            className={layout === l.id ? "active" : ""}
            title={l.id === "snap" ? t("Scrolling with page snapping") : undefined}
            onClick={() => onChange({ readingMode: l.id })}
          >
            {l.icon}
            <span>{l.name}</span>
          </button>
        ))}
      </div>
      {layout === "book" && (
        <div className="book-options">
          {!bookFits && (
            <p className="hint">
              {t(
                "Book mode shows two pages side by side. Make the window wider or taller, or close a side panel, to see it; until then the text scrolls as usual.",
              )}
            </p>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={prefs.bookOpening}
              onChange={(e) => onChange({ bookOpening: e.target.checked })}
            />
            {t("Open new books from the cover")}
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={prefs.bookTypeset}
              onChange={(e) => onChange({ bookTypeset: e.target.checked })}
            />
            {t("Printed-book typography")}
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={prefs.bookSound}
              onChange={(e) => onChange({ bookSound: e.target.checked })}
            />
            {t("Page turn sound")}
          </label>
        </div>
      )}
      {book && onBookComfort && (
        <div className="comfort-scope" role="group" aria-label={t("Apply to")}>
          <button
            aria-pressed={!book.comfort}
            className={!book.comfort ? "active" : ""}
            onClick={() => book.comfort && onBookComfort(false)}
          >
            {t("All books")}
          </button>
          <button
            aria-pressed={Boolean(book.comfort)}
            className={book.comfort ? "active" : ""}
            onClick={() => !book.comfort && onBookComfort(true)}
          >
            {t("This book only")}
          </button>
        </div>
      )}
      <div className="comfort-presets" role="group" aria-label={t("Presets")}>
        {comfortPresets.map((p) => (
          <button
            key={p.id}
            aria-pressed={preset?.id === p.id}
            className={preset?.id === p.id ? "active" : ""}
            title={t(p.description)}
            onClick={() => onChange(p.values)}
          >
            <strong>{t(p.name)}</strong>
            <span>{t(p.description)}</span>
          </button>
        ))}
      </div>
      <p className="hint comfort-note">
        {t(
          "These settings can make text easier and more comfortable to read. Different readers prefer different combinations.",
        )}
      </p>
      <Section id="comfort-text" title={t("Font and spacing")}>
        <label>
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
        <div
          className="text-menu-size"
          role="group"
          aria-label={t("Text size")}
        >
          <span>{t("Text size")}</span>
          <button
            className="icon-button"
            aria-label={t("Smaller text")}
            disabled={prefs.fontSize <= 16}
            onClick={() =>
              onChange({ fontSize: Math.max(16, prefs.fontSize - 1) })
            }
          >
            <Minus size={15} />
          </button>
          <output>
            {prefs.fontSize}
            {t("px")}
          </output>
          <button
            className="icon-button"
            aria-label={t("Larger text")}
            disabled={prefs.fontSize >= 32}
            onClick={() =>
              onChange({ fontSize: Math.min(32, prefs.fontSize + 1) })
            }
          >
            <Plus size={15} />
          </button>
        </div>
        <label>
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
        <label>
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
        <label>
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
          <label className="check-label">
            <input
              type="checkbox"
              checked={prefs.justify}
              onChange={(e) => onChange({ justify: e.target.checked })}
            />
            {t("Justify text")}
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={prefs.hyphenate}
              onChange={(e) => onChange({ hyphenate: e.target.checked })}
            />
            {t("Hyphenate")}
          </label>
        </div>
      </Section>
      <Section id="comfort-focus" title={t("Focus and color")}>
        <div className="text-menu-row">
          <span>{t("Focus tools")}</span>
          <div
            className="focus-tools"
            role="group"
            aria-label={t("Focus tools")}
          >
            {focusTools.map((tool) => (
              <button
                key={tool.id}
                aria-pressed={(prefs.focusTool || "off") === tool.id}
                className={
                  (prefs.focusTool || "off") === tool.id ? "active" : ""
                }
                onClick={() => onChange({ focusTool: tool.id })}
              >
                {t(tool.name)}
              </button>
            ))}
          </div>
          <p className="hint">
            {prefs.focusTool === "line"
              ? t("Highlights the line under the pointer.")
              : prefs.focusTool === "strip"
                ? t(
                    "A reading strip follows the pointer and dims the text around it.",
                  )
                : prefs.focusTool === "paragraph"
                  ? t(
                      "Dims every paragraph except the one you point at or hear.",
                    )
                  : t("Helps keep your place while reading.")}
          </p>
        </div>
        <div className="text-menu-row">
          <span>{t("Text color")}</span>
          <div className="segmented" role="group" aria-label={t("Text color")}>
            {tones.map((tone) => (
              <button
                key={tone.id}
                aria-pressed={(prefs.textTone || "default") === tone.id}
                className={
                  (prefs.textTone || "default") === tone.id ? "active" : ""
                }
                onClick={() => onChange({ textTone: tone.id })}
              >
                {t(tone.name)}
              </button>
            ))}
          </div>
        </div>
      </Section>
      <button className="text-button text-menu-more" onClick={onMore}>
        {t("More appearance settings")}
      </button>
    </Popover>
  );
}
