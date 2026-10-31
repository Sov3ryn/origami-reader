import { t } from "../i18n";
import { answerMatch } from "./ink/ink";
import { clozeParts, makeCard } from "./cards";
import { fitMask, MAX_MASKS, safeImage, type PictureSet } from "./pictures";
import type { StudyCard, Subject } from "./types";

const DAY = 86_400_000;
const dayStart = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const dateMs = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
};

// --- Exams ------------------------------------------------------------------------
// Days left until a subject's exam (0 on the day), or null without one or after it.
export function daysToExam(subject: Subject, now = Date.now()) {
  if (!subject.exam) return null;
  const days = Math.round((dateMs(subject.exam) - dayStart(now)) / DAY);
  return days >= 0 ? days : null;
}

// Before an exam (up to 30 days ahead), cards that would only come back after
// it are spread over the days left, weakest memories first, so every card is
// seen at least once before the exam. Returned cards join today's queue.
export function examCards(cards: StudyCard[], subjects: Subject[], now = Date.now()) {
  const extra: StudyCard[] = [];
  const today = dayStart(now);
  for (const s of subjects) {
    const left = daysToExam(s, now);
    if (left === null || left > 30) continue;
    const examEnd = dateMs(s.exam!) + DAY;
    const pool = cards
      .filter((c) => c.subjectId === s.id && !c.suspended && c.schedule.due > now && c.schedule.due >= examEnd && (c.schedule.last_review || 0) < today)
      .sort((a, b) => (a.schedule.stability || 0) - (b.schedule.stability || 0));
    extra.push(...pool.slice(0, Math.ceil(pool.length / Math.max(1, left))));
  }
  return extra;
}

// --- Practice tests -------------------------------------------------------------------
// A practice question never changes a card's schedule.
export type Question = { card: StudyCard; prompt: string; answer: string; choices?: string[] };
export type PracticeMode = "choice" | "typed" | "mixed";

export function questionFor(card: StudyCard) {
  if (card.type === "cloze") {
    const parts = clozeParts(card.front);
    return { prompt: parts.map((p) => (p.hidden ? "_____" : p.text)).join(""), answer: parts.filter((p) => p.hidden).map((p) => p.text).join(", ") };
  }
  return { prompt: card.front, answer: card.back };
}

function shuffle<T>(list: T[], random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Questions from cards; multiple choice uses other cards' answers as the
// wrong options (at least three different ones are needed). The wrong options
// come from `distractors`, the whole set by default, so a retest of a few
// missed cards still gets multiple choice.
export function buildTest(cards: StudyCard[], count: number, mode: PracticeMode, random = Math.random, distractors: StudyCard[] = cards): Question[] {
  const usable = cards.filter((c) => !c.suspended && questionFor(c).answer.trim());
  const picked = shuffle(usable, random).slice(0, count);
  const answers = [...new Set(distractors.filter((c) => !c.suspended && questionFor(c).answer.trim()).map((c) => questionFor(c).answer.trim()))];
  return picked.map((card, i) => {
    const q = { card, ...questionFor(card) };
    const others = shuffle(answers.filter((a) => a.toLowerCase() !== q.answer.trim().toLowerCase()), random).slice(0, 3);
    const choice = mode === "choice" || (mode === "mixed" && i % 2 === 0);
    return choice && others.length >= 3 ? { ...q, choices: shuffle([q.answer.trim(), ...others], random) } : q;
  });
}

// A typed answer: right, close (a slip), or wrong.
export function grade(typed: string, answer: string): "right" | "close" | "wrong" {
  const score = answerMatch(typed, answer);
  return score >= 0.92 ? "right" : score >= 0.7 ? "close" : "wrong";
}

// --- Card sets ------------------------------------------------------------------------
// An .origami-cards file: the cards' text only (no review history), to share.
// Picture cards bring their picture and boxes (format 2).
export function exportCardSet(title: string, cards: StudyCard[], pictures: PictureSet[] = []) {
  const used = new Set(cards.map((c) => c.picture?.set).filter(Boolean));
  const sets = pictures.filter((p) => used.has(p.id));
  return JSON.stringify(
    {
      type: "origami-cards",
      format: sets.length ? 2 : 1,
      title,
      cards: cards
        .filter((c) => c.type !== "picture" || sets.some((p) => p.id === c.picture?.set))
        .map((c) => ({ type: c.type, front: c.front, back: c.back, ...(c.source?.title ? { source: c.source.title } : {}), ...(c.picture ? { picture: c.picture } : {}) })),
      ...(sets.length ? { pictures: sets.map((p) => ({ id: p.id, title: p.title, image: p.image, width: p.width, height: p.height, hide: p.hide, masks: p.masks })) } : {}),
    },
    null,
    1,
  );
}
export function importCardSet(text: string, subjectId?: string) {
  let v: {
    type?: string;
    title?: string;
    cards?: { type?: string; front?: string; back?: string; picture?: { set?: unknown; mask?: unknown } }[];
    pictures?: { id?: unknown; title?: unknown; image?: unknown; width?: unknown; height?: unknown; hide?: unknown; masks?: unknown }[];
  };
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error(t("This is not an Origami card set."));
  }
  if (v?.type !== "origami-cards" || !Array.isArray(v.cards)) throw new Error(t("This is not an Origami card set."));
  const types = ["cloze", "qa", "term", "translate"] as const;
  const now = Date.now();
  // Pictures get new ids; only plain image data and numbers are kept.
  const pictures: PictureSet[] = [];
  const newId = new Map<string, string>();
  for (const p of Array.isArray(v.pictures) ? v.pictures.slice(0, 200) : []) {
    if (typeof p?.id !== "string" || !safeImage(p.image) || !Array.isArray(p.masks)) continue;
    const masks = p.masks
      .slice(0, MAX_MASKS)
      .filter((m): m is { id: string; x: number; y: number; w: number; h: number; label?: unknown } => typeof m?.id === "string" && /^[\w-]{1,40}$/.test(m.id) && [m.x, m.y, m.w, m.h].every((n) => Number.isFinite(n)))
      .map((m) => fitMask({ id: m.id, x: m.x, y: m.y, w: m.w, h: m.h, label: typeof m.label === "string" ? m.label : "" }));
    const id = crypto.randomUUID();
    newId.set(p.id, id);
    pictures.push({
      id,
      kind: "picture",
      title: typeof p.title === "string" ? p.title.slice(0, 140) : "",
      image: p.image,
      width: Math.max(1, Math.min(4000, Number(p.width) || 1)),
      height: Math.max(1, Math.min(4000, Number(p.height) || 1)),
      hide: p.hide === "one" ? "one" : "all",
      masks,
      subjectId,
      created: now,
      updated: now,
    });
  }
  const cards = v.cards
    .filter((c) => typeof c?.front === "string" && c.front.trim() && c.front.length < 4000 && (c.back ?? "").length < 8000)
    .slice(0, 5000)
    .flatMap((c, i) => {
      if (c.type === "picture") {
        const set = pictures.find((p) => p.id === newId.get(String(c.picture?.set)));
        if (!set || !set.masks.some((m) => m.id === c.picture?.mask)) return [];
        return [{ ...makeCard({ type: "picture", front: c.front!, back: c.back || "", subjectId, origin: "manual" }, now + i), picture: { set: set.id, mask: String(c.picture!.mask) } }];
      }
      return [makeCard({ type: types.includes(c.type as never) ? (c.type as (typeof types)[number]) : "qa", front: c.front!, back: c.back || "", subjectId, origin: "manual" }, now + i)];
    });
  return { title: (v.title || t("Shared cards")).slice(0, 60), cards, pictures };
}
