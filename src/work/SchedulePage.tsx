import { useMemo } from "react";
import { CalendarDays, Check, FileText, Sparkles } from "lucide-react";
import { t } from "../i18n";
import { agenda, dayKey, rhythm, type DatedTask } from "./schedule";
import type { Note, StudyCard, StudyLog } from "./types";

// Upcoming days (cards due and dated checklist items) and the study rhythm.
export function SchedulePage({
  notes,
  cards,
  logs,
  onStudy,
  onOpen,
  onToggle,
}: {
  notes: Note[];
  cards: StudyCard[];
  logs: StudyLog[];
  onStudy: () => void;
  onOpen: (noteId: string) => void;
  onToggle: (task: DatedTask) => void;
}) {
  const days = useMemo(() => agenda(notes, cards, 14), [notes, cards]);
  const grid = useMemo(() => rhythm(logs, 12), [logs]);
  const today = dayKey(Date.now());
  const most = Math.max(1, ...days.map((d) => d.cards));
  const busiest = Math.max(1, ...grid.cells.map((c) => c.reviews));
  const weekTasks = days.slice(0, 7).reduce((n, d) => n + d.tasks.filter((x) => !x.done).length, 0);
  const label = (key: string, i: number) =>
    i === 0
      ? t("Today")
      : i === 1
        ? t("Tomorrow")
        : new Date(key + "T12:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });

  return (
    <section className="work-page schedule-page">
      <header className="work-page-head">
        <div>
          <span className="eyebrow">{t("Schedule")}</span>
          <h1>{t("The next two weeks")}</h1>
          <p className="work-page-sub">
            {t("{cards} cards due today · {tasks} tasks this week", { cards: days[0].cards, tasks: weekTasks })}
          </p>
        </div>
        <div className="work-page-actions">
          <button className="primary" disabled={!days[0].cards} onClick={onStudy}>
            <Sparkles size={15} />
            {t("Study today's cards")}
          </button>
        </div>
      </header>

      <div className="forecast" role="img" aria-label={t("Cards due each day")}>
        {days.map((d, i) => (
          <div key={d.key} className={"forecast-day" + (i === 0 ? " today" : "")} title={`${label(d.key, i)}: ${d.cards}`}>
            <span className="forecast-bar" style={{ height: `${Math.max(4, (d.cards / most) * 100)}%` }}>
              {d.cards > 0 && <em>{d.cards}</em>}
            </span>
            <small>{new Date(d.key + "T12:00").toLocaleDateString([], { weekday: "narrow" })}</small>
          </div>
        ))}
      </div>

      <div className="agenda">
        {days
          .filter((d, i) => i < 2 || d.cards > 0 || d.tasks.length > 0)
          .map((d) => {
            const i = days.indexOf(d);
            return (
              <article key={d.key} className={"agenda-day" + (i === 0 ? " today" : "")}>
                <header>
                  <CalendarDays size={15} />
                  <strong>{label(d.key, i)}</strong>
                  {d.cards > 0 && (
                    <span className="agenda-cards">{d.cards === 1 ? t("1 card") : t("{count} cards", { count: d.cards })}</span>
                  )}
                </header>
                {d.tasks.length === 0 && d.cards === 0 && <p className="agenda-empty">{t("Nothing planned.")}</p>}
                {d.tasks.map((task) => (
                  <div key={task.noteId + task.index} className={"agenda-task" + (task.done ? " done" : "") + (task.date < today ? " late" : "")}>
                    <button
                      className="task-check"
                      role="checkbox"
                      aria-checked={task.done}
                      aria-label={task.text}
                      onClick={() => onToggle(task)}
                    >
                      {task.done && <Check size={12} />}
                    </button>
                    <span>{task.text}</span>
                    {task.date < today && !task.done && <em className="agenda-late">{t("Late")}</em>}
                    <button className="agenda-note" onClick={() => onOpen(task.noteId)} title={t("Open note")}>
                      <FileText size={12} />
                      {task.noteTitle || t("Untitled")}
                    </button>
                  </div>
                ))}
              </article>
            );
          })}
        <p className="hint agenda-hint">{t("Add a date to any checklist item, like @{date}, and it appears here.", { date: days[3].key })}</p>
      </div>

      <h2 className="work-subhead">{t("Your study rhythm")}</h2>
      <div className="rhythm" role="img" aria-label={t("Days studied in the last twelve weeks")}>
        {grid.cells.map((c) => (
          <span
            key={c.key}
            className={"rhythm-cell" + (c.future ? " future" : "") + (c.key === today ? " today" : "")}
            style={{ ["--level" as string]: c.reviews ? 0.25 + 0.75 * (c.reviews / busiest) : 0 }}
            title={`${c.key}: ${c.reviews}`}
          />
        ))}
      </div>
      <p className="hint">
        {grid.studied === 0
          ? t("Your study days will appear here. No streaks, no pressure.")
          : t("{count} days of study in the last twelve weeks.", { count: grid.studied })}
      </p>
    </section>
  );
}
