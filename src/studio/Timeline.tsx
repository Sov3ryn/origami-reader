import { useMemo, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { t } from "../i18n";
import { IconButton } from "../components/Primitives";
import { chosenTake, clock, gapAfter, type Production, type ProductionUnit } from "./production";
import type { CastMember } from "./cast";
import type { Playback } from "./usePlayback";

export type TimelineView = "tracks" | "strip";

const readView = (): TimelineView => {
  try {
    return localStorage.getItem("origami.studioTimeline") === "strip" ? "strip" : "tracks";
  } catch {
    return "tracks";
  }
};
const readZoom = () => {
  try {
    const z = Number(localStorage.getItem("origami.studioTimelineZoom"));
    return z >= 1 && z <= 8 ? z : 1;
  } catch {
    return 1;
  }
};
const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the choice lasts for this session.
  }
};

// Where each line of the chapter falls in time: its chosen take's length, or
// an estimate from its text while it has none, with the pauses the master uses.
export function chapterLayout(production: Production, units: ProductionUnit[]) {
  let at = 0;
  const lines = units.map((u, i) => {
    const take = chosenTake(production, u);
    const length = take ? take.duration : Math.max(0.8, u.text.length / 15);
    const line = { unit: u, start: at, length, heard: Boolean(take) };
    at += length + gapAfter(u, units[i + 1]);
    return line;
  });
  return { lines, total: Math.max(1, at) };
}

// Ruler steps that give about ten marks across the visible width.
const STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];

// The chapter along the bottom of the editor, as tracks (a lane for the
// narrator, one per character who speaks in it, and the background sound) or
// as a strip (one compact row of lines, C's view). The transport is the same.
export function Timeline({
  production,
  units,
  cast,
  issues,
  selected,
  playback,
  chapterName,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onSelect,
}: {
  production: Production;
  units: ProductionUnit[];
  cast: CastMember[];
  issues: Map<string, unknown>;
  selected: string;
  playback: Playback;
  chapterName: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
}) {
  const [view, setView] = useState<TimelineView>(readView);
  const [zoom, setZoom] = useState(readZoom);
  const { lines, total } = useMemo(() => chapterLayout(production, units), [production, units]);
  const heard = lines.filter((l) => l.heard).length;
  const now = lines.find((l) => l.unit.id === playback.current);
  const elapsed = now ? now.start + Math.min(playback.position, now.length) : 0;
  const tracks = useMemo(() => {
    const byWho = new Map<string, typeof lines>();
    for (const l of lines) {
      const who = l.unit.speaker || "";
      if (!byWho.has(who)) byWho.set(who, []);
      byWho.get(who)!.push(l);
    }
    const rows = [{ id: "", name: t("Narrator"), color: "var(--muted)", lines: byWho.get("") || [] }];
    for (const [id, list] of byWho) {
      if (!id) continue;
      const c = cast.find((x) => x.id === id);
      rows.push({ id, name: c?.name || id, color: c?.color || "var(--accent)", lines: list });
    }
    return rows;
  }, [lines, cast]);
  const step = STEPS.find((s) => total / s <= 10 * zoom) || STEPS[STEPS.length - 1];
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const pct = (s: number) => `${(s / total) * 100}%`;
  const lineClass = (l: (typeof lines)[number]) =>
    [
      "clip",
      l.unit.status,
      l.heard ? "" : "empty",
      issues.has(l.unit.id) ? "flagged" : "",
      l.unit.id === selected ? "sel" : "",
      l.unit.id === playback.current ? "now" : "",
    ].join(" ");
  const pick = (id: string) => onSelect(id);
  return (
    <section className={"studio-timeline-panel " + view} aria-label={t("Timeline")}>
      <div className="tl-bar">
        <div className="transport">
          <IconButton label={t("Previous chapter")} disabled={!canPrev} onClick={onPrev}>
            <SkipBack size={18} />
          </IconButton>
          <button
            className="play-button"
            onClick={() => playback.toggle(selected || units[0]?.id || "")}
            aria-label={playback.playing ? t("Pause") : t("Play")}
            data-tip={t("Play or pause (Space)")}
            disabled={!heard}
          >
            {playback.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <IconButton label={t("Next chapter")} disabled={!canNext} onClick={onNext}>
            <SkipForward size={18} />
          </IconButton>
        </div>
        <span className="tl-time">
          {clock(elapsed)} <span>/ {clock(total)}</span>
        </span>
        <span className="tl-where">
          {chapterName} · {t("{done}/{total} lines", { done: String(heard), total: String(lines.length) })}
        </span>
        <span className="tl-spacer" />
        {view === "tracks" && (
          <label className="tl-zoom">
            <span>{t("Zoom")}</span>
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={zoom}
              aria-label={t("Timeline zoom")}
              onChange={(e) => {
                setZoom(Number(e.target.value));
                keep("origami.studioTimelineZoom", e.target.value);
              }}
            />
          </label>
        )}
        <div className="segmented tl-views" role="radiogroup" aria-label={t("Timeline")}>
          {(
            [
              ["tracks", t("Tracks")],
              ["strip", t("Strip")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={view === id}
              className={view === id ? "active" : ""}
              onClick={() => {
                setView(id);
                keep("origami.studioTimeline", id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="studio-speed">
          <span className="sr-only">{t("Playback speed")}</span>
          <select value={playback.rate} onChange={(e) => playback.setRate(Number(e.target.value))}>
            {[0.8, 1, 1.15, 1.3, 1.5].map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>
      </div>
      {view === "strip" ? (
        <div className="tl-strip" aria-hidden="true">
          {lines.map((l) => (
            <i key={l.unit.id} className={lineClass(l)} style={{ flexGrow: l.length, ["--who" as string]: tracks.find((r) => r.id === (l.unit.speaker || ""))?.color }} onClick={() => pick(l.unit.id)} onDoubleClick={() => playback.play(l.unit.id)} />
          ))}
        </div>
      ) : (
        <div className="tl-scroll">
          <div className="tl-inner" style={{ width: `calc(var(--tl-label) + (100% - var(--tl-label)) * ${zoom})` }}>
            <div className="tl-row tl-ruler" aria-hidden="true">
              <span className="tl-label" />
              <span className="tl-lane">
                {ticks.map((s) => (
                  <span key={s} className="tl-tick" style={{ left: pct(s) }}>
                    {clock(s)}
                  </span>
                ))}
              </span>
            </div>
            {tracks.map((row) => (
              <div key={row.id || "narrator"} className="tl-row" style={{ ["--who" as string]: row.color }}>
                <span className="tl-label">
                  <i aria-hidden="true" />
                  {row.name}
                </span>
                <span className="tl-lane">
                  {row.lines.map((l) => (
                    <button
                      key={l.unit.id}
                      className={lineClass(l)}
                      style={{ left: pct(l.start), width: `max(2px, ${pct(l.length)})` }}
                      aria-label={l.unit.text.slice(0, 80)}
                      tabIndex={-1}
                      onClick={() => pick(l.unit.id)}
                      onDoubleClick={() => playback.play(l.unit.id)}
                    />
                  ))}
                </span>
              </div>
            ))}
            {production.info.bed && (
              <div className="tl-row" style={{ ["--who" as string]: "var(--muted)" }}>
                <span className="tl-label">
                  <i aria-hidden="true" />
                  {t("Background sound")}
                </span>
                <span className="tl-lane">
                  <span className="clip bed" style={{ left: 0, width: "100%" }} title={production.info.bed.name} />
                </span>
              </div>
            )}
            <span className="tl-head" aria-hidden="true" style={{ left: `calc(var(--tl-label) + (100% - var(--tl-label)) * ${elapsed / total})` }} />
          </div>
        </div>
      )}
    </section>
  );
}
