import { t } from "../i18n";
import { dayKey } from "./schedule";

// Ready-made notes for common kinds of work. Plain note HTML, so everything in
// them (callouts, checklists, dates, card lines) works as usual.
export type Template = { id: string; label: string; description: string; title: string; html: string };

const callout = (kind: string, body: string) => `<div data-callout="${kind}"><p>${body}</p></div>`;
const h = (level: number, text: string) => `<h${level}>${text}</h${level}>`;
const p = (text = "") => `<p>${text}</p>`;
const tasks = (items: string[]) =>
  `<ul data-type="taskList">${items.map((i) => `<li data-type="taskItem" data-checked="false"><p>${i}</p></li>`).join("")}</ul>`;
const list = (items: string[]) => `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join("")}</ul>`;
// An empty card line: it becomes a study card once both sides are written.
const cardLine = () => "<p> :: </p>";
const table = (head: string[], rows: number) =>
  `<table><tbody><tr>${head.map((c) => `<th><p>${c}</p></th>`).join("")}</tr>${Array.from({ length: rows }, () => `<tr>${head.map(() => "<td><p></p></td>").join("")}</tr>`).join("")}</tbody></table>`;

export function templates(): Template[] {
  const today = dayKey(new Date());
  const inWeek = dayKey(new Date(Date.now() + 7 * 86_400_000));
  return [
    {
      id: "cornell",
      label: t("Cornell notes"),
      description: t("Cues and questions beside your notes, then a summary. Good for lectures and reading."),
      title: t("Cornell notes"),
      html:
        callout("note", t("Topic, date and source.")) +
        table([t("Cues and questions"), t("Notes")], 4) +
        h(2, t("Summary")) +
        p(t("In three or four sentences, what did this cover?")) +
        h(2, t("Study cards")) +
        cardLine(),
    },
    {
      id: "lecture",
      label: t("Lecture notes"),
      description: t("Key points, definitions, questions to ask and what to review."),
      title: t("Lecture: "),
      html:
        callout("summary", t("Course, lecturer and date.")) +
        h(2, t("Key points")) +
        list(["", ""]) +
        h(2, t("Definitions")) +
        cardLine() +
        h(2, t("Questions to ask")) +
        list([""]) +
        h(2, t("To review")) +
        tasks([`${t("Reread my notes")} @${inWeek}`]),
    },
    {
      id: "book",
      label: t("Book summary"),
      description: t("The big idea, chapter by chapter notes, quotes and what you will do with it."),
      title: t("Summary: "),
      html:
        callout("tip", t("The book in one sentence.")) +
        h(2, t("Big ideas")) +
        list(["", "", ""]) +
        h(2, t("Chapter notes")) +
        h(3, t("Chapter 1")) +
        p() +
        h(2, t("Quotes")) +
        `<blockquote><p>${t("Drag a passage here from a book opened beside the note.")}</p></blockquote>` +
        h(2, t("What I will do with it")) +
        tasks([""]),
    },
    {
      id: "vocabulary",
      label: t("Vocabulary list"),
      description: t("Words and meanings that become study cards as you type them."),
      title: t("Vocabulary"),
      html:
        callout("tip", t("Write a word, then two colons, then its meaning: each line becomes a study card.")) +
        cardLine() +
        cardLine() +
        cardLine(),
    },
    {
      id: "meeting",
      label: t("Meeting notes"),
      description: t("Attendees, agenda, decisions and actions with dates."),
      title: t("Meeting: "),
      html:
        table([t("Date"), t("Attendees")], 1).replace("<td><p></p></td>", `<td><p>@${today}</p></td>`) +
        h(2, t("Agenda")) +
        list(["", ""]) +
        h(2, t("Notes")) +
        p() +
        callout("important", t("Decisions")) +
        h(2, t("Actions")) +
        tasks([`${t("Who does what")} @${inWeek}`]),
    },
    {
      id: "project",
      label: t("Project brief"),
      description: t("Goal, scope, milestones with dates, risks and open questions."),
      title: t("Project: "),
      html:
        callout("summary", t("The goal in one sentence, and how you will know it is done.")) +
        h(2, t("Scope")) +
        table([t("In scope"), t("Out of scope")], 2) +
        h(2, t("Milestones")) +
        tasks([`${t("First milestone")} @${inWeek}`, t("Second milestone")]) +
        h(2, t("Risks")) +
        callout("warning", t("What could go wrong, and what you will do about it.")) +
        h(2, t("Open questions")) +
        list([""]),
    },
    {
      id: "research",
      label: t("Research paper"),
      description: t("Question, method, findings, limits and how it connects to your other notes."),
      title: t("Paper: "),
      html:
        table([t("Authors"), t("Year"), t("Where published")], 1) +
        h(2, t("Question")) +
        p() +
        h(2, t("Method")) +
        p() +
        h(2, t("Findings")) +
        list([""]) +
        h(2, t("Limits")) +
        callout("question", t("What would make you doubt this?")) +
        h(2, t("Connections")) +
        p(t("Type [[ to link the notes this relates to.")),
    },
    {
      id: "weekly",
      label: t("Weekly review"),
      description: t("What went well, what did not, and the plan for next week."),
      title: t("Week of {date}", { date: today }),
      html:
        h(2, t("Done this week")) +
        list([""]) +
        h(2, t("What went well")) +
        p() +
        h(2, t("What to change")) +
        p() +
        h(2, t("Next week")) +
        tasks([`@${inWeek}`]),
    },
    {
      id: "exam",
      label: t("Exam revision"),
      description: t("Topics to cover with dates, weak spots and practice questions as cards."),
      title: t("Revision: "),
      html:
        callout("important", t("Exam date and what it covers.")) +
        h(2, t("Topics")) +
        tasks([`${t("Topic 1")} @${today}`, `${t("Topic 2")} @${inWeek}`]) +
        h(2, t("Weak spots")) +
        list([""]) +
        h(2, t("Practice questions")) +
        cardLine(),
    },
  ];
}
