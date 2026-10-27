import type { VectorItem } from "./semantic";
import type { SheetDoc } from "./sheets/model";
import type { ChartSpec } from "./charts/spec";
import type { BoardDoc } from "./boards/model";
import type { StickyNote } from "./stickies/Stickies";
import type { WorkspaceDoc } from "./workspaces";
import type { PlanDoc } from "./plans/model";
import type { PictureSet } from "./pictures";

// Work Mode data. Everything is stored locally (see store.ts); items from a
// vault book carry `vault` and are sealed with that vault's key.

export type Subject = {
  id: string;
  kind: "subject";
  name: string;
  color: string;
  parent?: string;
  order: number;
  created: number;
  // Exam date (YYYY-MM-DD): reviews are spread so every card is seen before it.
  exam?: string;
  // Page width for its notes (papers.ts); none is standard.
  pageSize?: string;
};

// Notes are stored as HTML: the editor's own format, so nothing is lost and
// any browser can open them. The editor schema strips anything it does not
// know (scripts, styles, event handlers) before it is saved.
export type Note = {
  id: string;
  kind: "note";
  title: string;
  html: string;
  subjectId?: string;
  created: number;
  updated: number;
  pinned?: boolean;
  icon?: string;
  cover?: string;
  tags?: string[];
  // The paper this note is written on (papers.ts); none follows the theme.
  paper?: string;
  // Page width (papers.ts); none follows the subject.
  pageSize?: string;
  // Notes made from a highlight or card in a vault book are sealed too.
  vault?: string;
};

export type CardType = "cloze" | "qa" | "term" | "translate" | "picture";

// Where a card came from: the same anchor annotations use.
export type CardSource = {
  bookId: string;
  paragraphId: string;
  start: number;
  end: number;
  quote: string;
  title: string;
};

// ts-fsrs card state with dates stored as epoch milliseconds.
export type Schedule = {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
};

export type StudyCard = {
  id: string;
  kind: "card";
  type: CardType;
  // Fill in the blank: hidden words are wrapped in {{ }} in `front`.
  front: string;
  back: string;
  source?: CardSource;
  noteId?: string;
  subjectId?: string;
  vault?: string;
  created: number;
  updated: number;
  schedule: Schedule;
  // When the card was first answered (it left the new cards).
  introduced?: number;
  suspended?: boolean;
  // "note": made from a "question :: answer" line, kept in step with it.
  origin: "manual" | "note";
  // A picture card: the set holding the picture and the box this card hides.
  picture?: { set: string; mask: string };
};

// One "Link for me" run, kept so the whole batch can be undone.
export type LinkBatch = {
  id: string;
  kind: "batch";
  created: number;
  links: { noteId: string; targets: string[] }[];
  undone?: boolean;
};

// A pair the reader hid or unticked; never suggested again.
export type HiddenPair = { id: string; kind: "hidden"; a: string; b: string };

// Reviews per day, for the Schedule page's history.
export type StudyLog = { id: string; kind: "log"; date: string; reviews: number; remembered: number };
// Small facts about the workspace, such as whether the tutorial was added.
export type WorkMeta = { id: string; kind: "meta"; value: string };

// An earlier state of a note (history). Loaded on demand, never with the rest.
export type NoteVersion = { id: string; kind: "version"; note: string; title: string; html: string; saved: number; vault?: string };

export type WorkItem =
  | Subject
  | Note
  | StudyCard
  | LinkBatch
  | HiddenPair
  | VectorItem
  | StudyLog
  | WorkMeta
  | SheetDoc
  | ChartSpec
  | BoardDoc
  | StickyNote
  | WorkspaceDoc
  | PlanDoc
  | PictureSet;

export type WorkData = {
  subjects: Subject[];
  notes: Note[];
  cards: StudyCard[];
  batches: LinkBatch[];
  hidden: HiddenPair[];
  vectors: VectorItem[];
  logs: StudyLog[];
  meta: WorkMeta[];
  sheets: SheetDoc[];
  charts: ChartSpec[];
  boards: BoardDoc[];
  stickies: StickyNote[];
  workspaces: WorkspaceDoc[];
  plans: PlanDoc[];
  pictures: PictureSet[];
};

export const subjectColors = [
  "#8f7bd8",
  "#5aa6d6",
  "#4fb58a",
  "#d6a24f",
  "#d56f6f",
  "#c779b8",
  "#7f8a99",
];
