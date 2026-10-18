// The Schedule page: dated checklist items from notes, the cards coming due,
// and a calm record of the days you studied.
import { decode, noteText } from "./text";
import type { Note, StudyCard, StudyLog } from "./types";

export type DatedTask = {
  noteId: string;
  noteTitle: string;
  index: number; // the nth checklist item in the note
  text: string;
  date: string; // YYYY-MM-DD
  done: boolean;
};

export const dayKey = (t: number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
};

// Checklist items in document order, nested ones included. Both reading and
// ticking walk the same list, so the nth item is always the same one. The
// parsed document is inert: no script runs and nothing is fetched.
function taskItems(html: string) {
  if (!/data-type="taskItem"/.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { doc, items: [...doc.body.querySelectorAll('li[data-type="taskItem"]')] };
}
export function noteTasks(note: Note): DatedTask[] {
  const out: DatedTask[] = [];
  const found = taskItems(note.html);
  if (!found) return out;
  found.items.forEach((li, index) => {
    // The item's own text, without the items nested under it.
    const own = li.cloneNode(true) as Element;
    own.querySelectorAll("ul, ol").forEach((l) => l.remove());
    const text = noteText(own.innerHTML).replace(/\s+/g, " ").trim();
    const date = /@(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];
    if (date)
      out.push({
        noteId: note.id,
        noteTitle: note.title,
        index,
        text: text.replace(/\s*@\d{4}-\d{2}-\d{2}\b\s*/, " ").trim(),
        date,
        done: li.getAttribute("data-checked") === "true",
      });
  });
  return out;
}
// Ticks or unticks the nth checklist item of a note.
export function setTaskDone(html: string, index: number, done: boolean) {
  const found = taskItems(html);
  const li = found?.items[index];
  if (!found || !li) return html;
  li.setAttribute("data-checked", String(done));
  return found.doc.body.innerHTML;
}

export type Day = { key: string; cards: number; tasks: DatedTask[] };
// The next `days` days. Today also holds everything overdue.
export function agenda(notes: Note[], cards: StudyCard[], days = 14, now = Date.now()): Day[] {
  const today = dayKey(now);
  const list: Day[] = Array.from({ length: days }, (_, i) => ({ key: addDays(today, i), cards: 0, tasks: [] }));
  const at = new Map(list.map((d) => [d.key, d]));
  for (const c of cards) {
    if (c.suspended) continue;
    const key = c.schedule.due <= now ? today : dayKey(c.schedule.due);
    const day = at.get(key);
    if (day) day.cards++;
  }
  for (const n of notes)
    for (const task of noteTasks(n)) {
      const day = at.get(task.date < today && !task.done ? today : task.date);
      if (day) day.tasks.push(task);
    }
  return list;
}

// Weeks of study, Monday first, for the rhythm grid.
export function rhythm(logs: StudyLog[], weeks = 12, now = Date.now()) {
  const counts = new Map(logs.map((l) => [l.date, l.reviews]));
  const today = new Date(now);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const start = dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (weeks - 1) * 7));
  const cells: { key: string; reviews: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const key = addDays(start, i);
    cells.push({ key, reviews: counts.get(key) || 0, future: key > dayKey(now) });
  }
  const studied = cells.filter((c) => c.reviews > 0).length;
  return { cells, studied };
}

export function logAnswer(logs: StudyLog[], remembered: boolean, now = Date.now()): StudyLog {
  const date = dayKey(now);
  const old = logs.find((l) => l.date === date);
  return {
    id: "log:" + date,
    kind: "log",
    date,
    reviews: (old?.reviews || 0) + 1,
    remembered: (old?.remembered || 0) + (remembered ? 1 : 0),
  };
}

export const plainTitle = (s: string) => decode(s);
