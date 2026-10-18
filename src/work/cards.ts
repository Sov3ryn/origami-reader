import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import type { CardSource, CardType, Note, Schedule, StudyCard } from "./types";
import { noteCardLines } from "./text";

// FSRS scheduling (ts-fsrs, MIT). Fuzz spreads cards made together.
const scheduler = fsrs({ enable_fuzz: true });

const toSchedule = (c: Card): Schedule => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review?.getTime(),
});
const toCard = (s: Schedule): Card => ({
  ...s,
  due: new Date(s.due),
  state: s.state as State,
  last_review: s.last_review ? new Date(s.last_review) : undefined,
});

export function newSchedule(now = Date.now()): Schedule {
  return toSchedule(createEmptyCard(new Date(now)));
}

export type Answer = "again" | "hard" | "good" | "easy";
const grades: Record<Answer, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};
export function answer(card: StudyCard, a: Answer, now = Date.now()): StudyCard {
  const next = scheduler.next(toCard(card.schedule), new Date(now), grades[a]);
  // The first answer to a new card is when it joins the reviews.
  const introduced = card.introduced ?? (isNew(card) ? now : undefined);
  return { ...card, schedule: toSchedule(next.card), updated: now, ...(introduced ? { introduced } : {}) };
}
// When each answer would bring the card back, for the buttons' hints.
export function preview(card: StudyCard, now = Date.now()): Record<Answer, number> {
  const log = scheduler.repeat(toCard(card.schedule), new Date(now));
  return {
    again: log[Rating.Again].card.due.getTime(),
    hard: log[Rating.Hard].card.due.getTime(),
    good: log[Rating.Good].card.due.getTime(),
    easy: log[Rating.Easy].card.due.getTime(),
  };
}

export const isNew = (c: StudyCard) => c.schedule.state === State.New;
export function dueCards(cards: StudyCard[], now = Date.now()) {
  return cards
    .filter((c) => !c.suspended && c.schedule.due <= now)
    .sort((a, b) => {
      // Reviews first (they are the ones being forgotten), then new cards.
      const n = Number(isNew(a)) - Number(isNew(b));
      return n || a.schedule.due - b.schedule.due;
    });
}
// When a card was first studied. Cards answered before this was recorded
// count from their making, or from their only review.
function introducedAt(c: StudyCard) {
  if (c.introduced) return c.introduced;
  if (!c.schedule.reps) return 0;
  return c.schedule.reps === 1 ? Math.max(c.created, c.schedule.last_review || 0) : c.created;
}
// A gentle day: at most `newPerDay` new cards join the reviews.
export function todaysQueue(cards: StudyCard[], newPerDay = 20, now = Date.now()) {
  const due = dueCards(cards, now);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const introducedToday = cards.filter((c) => introducedAt(c) >= start.getTime()).length;
  let room = Math.max(0, newPerDay - introducedToday);
  return due.filter((c) => !isNew(c) || room-- > 0);
}
export function reviewedToday(cards: StudyCard[], now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return cards.filter((c) => (c.schedule.last_review || 0) >= start.getTime()).length;
}

export function makeCard(
  fields: {
    type: CardType;
    front: string;
    back: string;
    source?: CardSource;
    noteId?: string;
    subjectId?: string;
    vault?: string;
    origin?: StudyCard["origin"];
    id?: string;
  },
  now = Date.now(),
): StudyCard {
  return {
    id: fields.id || crypto.randomUUID(),
    kind: "card",
    type: fields.type,
    front: fields.front.trim(),
    back: fields.back.trim(),
    source: fields.source,
    noteId: fields.noteId,
    subjectId: fields.subjectId,
    vault: fields.vault || undefined,
    created: now,
    updated: now,
    schedule: newSchedule(now),
    origin: fields.origin || "manual",
  };
}

// --- Fill in the blank ---------------------------------------------------------
export type ClozePart = { text: string; hidden: boolean };
export function clozeParts(front: string): ClozePart[] {
  const parts: ClozePart[] = [];
  let last = 0;
  for (const m of front.matchAll(/\{\{([\s\S]+?)\}\}/g)) {
    if (m.index! > last) parts.push({ text: front.slice(last, m.index), hidden: false });
    parts.push({ text: m[1], hidden: true });
    last = m.index! + m[0].length;
  }
  if (last < front.length) parts.push({ text: front.slice(last), hidden: false });
  return parts;
}
export function hasBlank(front: string) {
  return clozeParts(front).some((p) => p.hidden);
}
// Toggles one word (by its character range in the plain sentence) in or out
// of the hidden words.
export type Word = { text: string; start: number; end: number; word: boolean };
export function words(sentence: string): Word[] {
  const out: Word[] = [];
  for (const m of sentence.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*|[^\p{L}\p{N}]+/gu))
    out.push({
      text: m[0],
      start: m.index!,
      end: m.index! + m[0].length,
      word: /[\p{L}\p{N}]/u.test(m[0][0]),
    });
  return out;
}
export function clozeFront(sentence: string, hidden: Set<number>) {
  // Neighbouring hidden words, with only spaces between them, become one blank.
  const list = words(sentence);
  let out = "";
  let open = false;
  list.forEach((w, i) => {
    if (w.word) {
      if (hidden.has(i) && !open) {
        out += "{{";
        open = true;
      } else if (!hidden.has(i) && open) {
        out += "}}";
        open = false;
      }
    } else if (open && !(/^\s+$/.test(w.text) && hidden.has(i + 1))) {
      out += "}}";
      open = false;
    }
    out += w.text;
  });
  if (open) out += "}}";
  return out;
}
// A first guess at the key term: the longest uncommon word, preferring
// capitalised words and numbers that are not at the start of the sentence.
export function suggestBlank(sentence: string): number[] {
  const list = words(sentence);
  let best = -1;
  let bestScore = 0;
  list.forEach((w, i) => {
    if (!w.word || w.text.length < 4) return;
    let score = w.text.length;
    if (/^\p{Lu}/u.test(w.text) && i > 0) score += 6;
    if (/\d/.test(w.text)) score += 5;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best >= 0 ? [best] : [];
}
// "Term is meaning", "Term: meaning", "Term - meaning", "Terme est ..."
export function splitTerm(text: string): { term: string; meaning: string } | null {
  const m =
    /^\s*([^:\n]{1,60}?)\s*[:–-]\s+([\s\S]+)$/.exec(text) ||
    /^\s*([^,.\n]{1,60}?)\s+(?:is|are|means|est|sont|signifie)\s+([\s\S]+)$/i.exec(text);
  return m ? { term: m[1].trim(), meaning: m[2].trim() } : null;
}

// --- Cards written in notes -------------------------------------------------------
// "question :: answer" lines keep their own cards. A card's id comes from its
// note and question, so editing the answer keeps the schedule.
function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
export function syncNoteCards(note: Note, cards: StudyCard[], now = Date.now()) {
  const lines = noteCardLines(note.html);
  const mine = cards.filter((c) => c.noteId === note.id && c.origin === "note");
  const save: StudyCard[] = [];
  const keep = new Set<string>();
  for (const { front, back } of lines) {
    const id = `${note.id}:${hash(front.toLowerCase())}`;
    if (keep.has(id)) continue;
    keep.add(id);
    const old = mine.find((c) => c.id === id);
    if (!old)
      save.push(
        makeCard(
          { id, type: "qa", front, back, noteId: note.id, subjectId: note.subjectId, vault: note.vault, origin: "note" },
          now,
        ),
      );
    else if (old.back !== back || old.front !== front || old.subjectId !== note.subjectId)
      save.push({ ...old, front, back, subjectId: note.subjectId, updated: now });
  }
  const remove = mine.filter((c) => !keep.has(c.id)).map((c) => c.id);
  return { save, remove };
}

export function formatWait(ms: number) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo} mo` : `${(d / 365).toFixed(1)} y`;
}
