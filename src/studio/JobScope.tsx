import { useEffect, useState } from "react";
import { Square } from "lucide-react";
import { t } from "../i18n";
import type { ProductionUnit } from "./production";

// How much of the book a long job covers: a page to hear a result in a minute
// on a slow computer, a chapter, a run of chapters, or the whole book.
export type ScopeKind = "page" | "chapter" | "range" | "all";
export type Scope = { kind: ScopeKind; from: number; to: number };
// A page: about as many words as a printed page.
const PAGE_WORDS = 300;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** The lines a job covers. A page starts at the selected line when it is in the
 * shown chapter (otherwise the chapter's first) and runs for about 300 words. */
export function scopeUnits(units: ProductionUnit[], scope: Scope, at: { chapter: number; selected?: string }): ProductionUnit[] {
  if (scope.kind === "all") return units;
  if (scope.kind === "chapter") return units.filter((u) => u.chapter === at.chapter);
  if (scope.kind === "range") {
    const [a, b] = scope.from <= scope.to ? [scope.from, scope.to] : [scope.to, scope.from];
    return units.filter((u) => u.chapter >= a && u.chapter <= b);
  }
  let start = units.findIndex((u) => u.id === at.selected && u.chapter === at.chapter);
  if (start < 0) start = units.findIndex((u) => u.chapter === at.chapter);
  if (start < 0) return [];
  const page: ProductionUnit[] = [];
  let count = 0;
  for (let i = start; i < units.length && count < PAGE_WORDS; i++) {
    page.push(units[i]);
    count += words(units[i].text);
  }
  return page;
}

/** The scope in words, for the progress bar ("Chapters 2 to 5"). */
export function scopeLabel(scope: Scope, chapterName: (c: number) => string, chapter: number) {
  if (scope.kind === "all") return t("Whole book");
  if (scope.kind === "chapter") return chapterName(chapter);
  if (scope.kind === "page") return t("One page");
  const [a, b] = scope.from <= scope.to ? [scope.from, scope.to] : [scope.to, scope.from];
  return a === b ? chapterName(a) : t("Chapters {from} to {to}", { from: String(a + 1), to: String(b + 1) });
}

export function ScopePicker({
  scope,
  chapters,
  chapterName,
  onChange,
  label,
}: {
  scope: Scope;
  chapters: number[];
  chapterName: (c: number) => string;
  onChange: (scope: Scope) => void;
  label: string;
}) {
  const chapterSelect = (value: number, set: (n: number) => void, name: string) => (
    <select value={value} aria-label={name} onChange={(e) => set(+e.target.value)}>
      {chapters.map((c) => (
        <option key={c} value={c}>
          {chapterName(c)}
        </option>
      ))}
    </select>
  );
  return (
    <span className="studio-scope">
      <select value={scope.kind} aria-label={label} data-tip={label} onChange={(e) => onChange({ ...scope, kind: e.target.value as ScopeKind })}>
        <option value="page">{t("One page")}</option>
        <option value="chapter">{t("This chapter")}</option>
        <option value="range">{t("Chapters from…")}</option>
        <option value="all">{t("Whole book")}</option>
      </select>
      {scope.kind === "range" && (
        <>
          {chapterSelect(scope.from, (from) => onChange({ ...scope, from }), t("First chapter"))}
          <span className="muted">{t("to")}</span>
          {chapterSelect(scope.to, (to) => onChange({ ...scope, to }), t("Last chapter"))}
        </>
      )}
    </span>
  );
}

export const clockTime = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** A running job: what it does, how far it is, time spent and left, and Stop.
 * The bar moves even between results, so a slow computer still shows work. */
export function JobBar({
  title,
  value,
  detail,
  now,
  started,
  onStop,
}: {
  title: string;
  // 0 to 1, or null while the first result is awaited.
  value: number | null;
  detail?: string;
  // The text being worked on right now.
  now?: string;
  started: number;
  onStop: () => void;
}) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = (tick - started) / 1000;
  const left = value && value > 0.02 && value < 1 ? (elapsed / value) * (1 - value) : null;
  return (
    <section className="studio-job" role="status" aria-live="polite">
      <span className="studio-spinner" aria-hidden="true" />
      <div className="studio-job-body">
        <div className="studio-job-line">
          <strong>{title}</strong>
          <span className="muted">
            {[
              value === null ? t("Starting") : `${Math.floor(value * 100)}%`,
              detail,
              t("{time} elapsed", { time: clockTime(elapsed) }),
              left !== null && t("about {time} left", { time: clockTime(left) }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <span className={"studio-job-track" + (value === null ? " waiting" : "")} aria-hidden="true">
          <i style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
        </span>
        {now && <span className="studio-job-now muted">{now}</span>}
      </div>
      <button onClick={onStop}>
        <Square size={14} /> {t("Stop")}
      </button>
    </section>
  );
}
