import { t } from "../i18n";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

type Match = {
  title: string;
  path: string[];
  description: string;
  element: HTMLElement;
  rank: number;
};

const clean = (s: string | null | undefined) =>
  (s || "").replace(/\s+/g, " ").trim();

// The short explanation shown under a setting, when it has one.
function describe(element: HTMLElement) {
  // Settings without a visible hint carry a short search-only description.
  if (element.dataset.help) return element.dataset.help;
  const own =
    element.closest(".setting-check")?.querySelector<HTMLElement>(".hint") ||
    (element.nextElementSibling?.classList.contains("hint")
      ? (element.nextElementSibling as HTMLElement)
      : null);
  const section = element.classList.contains("panel-section-title")
    ? element
        .closest("[data-section]")
        ?.querySelector<HTMLElement>(".panel-section-body .hint")
    : null;
  const text = clean((own || section)?.textContent);
  return text.length > 110 ? text.slice(0, 107).trimEnd() + "..." : text;
}

// Where a setting lives: its category, then its group.
function location(element: HTMLElement) {
  const category = element.closest<HTMLElement>("[data-category]");
  const path = [
    clean(category?.querySelector(".settings-category-header h2")?.textContent),
  ];
  if (!element.classList.contains("panel-section-title")) {
    const section = element
      .closest("[data-section]")
      ?.querySelector(".panel-section-title");
    const name = clean(section?.textContent);
    if (name && name !== path[0]) path.push(name);
  }
  return path.filter(Boolean);
}

// Finds settings by name or description in every category, including
// collapsed groups. Each result shows where it lives and what it does;
// choosing one opens its category and group and scrolls to it.
export function SettingsMatches({
  query,
  onPick,
}: {
  query: string;
  onPick: (element: HTMLElement) => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    const q = query.trim().toLowerCase();
    const found: Match[] = [];
    const seen = new Set<string>();
    document
      .querySelectorAll<HTMLElement>(
        ".settings-grid label, .settings-grid .panel-section-title, .settings-grid h4:not(.panel-section-heading), .settings-grid h3:not(.panel-section-heading), .settings-grid summary, .settings-grid dd",
      )
      .forEach((element) => {
        const first = clean(element.firstChild?.textContent);
        const full = clean(element.textContent);
        const title = first.length > 2 ? first : full;
        if (!title) return;
        const description = describe(element);
        const name = full.toLowerCase();
        const rank = title.toLowerCase().startsWith(q)
          ? 0
          : name.includes(q)
            ? 1
            : description.toLowerCase().includes(q)
              ? 2
              : -1;
        if (rank < 0) return;
        const path = location(element);
        const key = title + "|" + path.join("|");
        if (seen.has(key)) return;
        seen.add(key);
        found.push({ title, path, description, element, rank });
      });
    setMatches(found.sort((a, b) => a.rank - b.rank).slice(0, 8));
  }, [query]);
  return (
    <div
      className="settings-matches"
      role="listbox"
      aria-label={t("Matching settings")}
    >
      {matches.length ? (
        matches.map((m, i) => (
          <button
            key={i}
            role="option"
            aria-selected="false"
            onClick={() => onPick(m.element)}
          >
            <strong>{m.title}</strong>
            {m.path.length > 0 && (
              <span className="match-path">
                {m.path.map((part, j) => (
                  <span key={j}>
                    {j > 0 && <ChevronRight size={12} aria-hidden="true" />}
                    {part}
                  </span>
                ))}
              </span>
            )}
            {m.description && (
              <span className="match-description">{m.description}</span>
            )}
          </button>
        ))
      ) : (
        <span className="hint">{t("No matching settings")}</span>
      )}
    </div>
  );
}
