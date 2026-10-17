import { describe, expect, it } from "vitest";
import { addDays, agenda, dayKey, logAnswer, noteTasks, rhythm, setTaskDone } from "../src/work/schedule";
import { decodeVector, encodeVector, mergeMatches, semanticRelated, textHash } from "../src/work/semantic";
import { htmlToMarkdown, cleanHtml } from "../src/work/transfer";
import { buildTutorial } from "../src/work/tutorial";
import { makeCard } from "../src/work/cards";
import { noteLinks, passageLinks, unlinkedMentions } from "../src/work/text";
import type { Note } from "../src/work/types";
import type { Book, BookMeta } from "../src/types";

const note = (html: string, id = "n1"): Note => ({ id, kind: "note", title: "Plan", html, created: 1, updated: 1 });
const task = (text: string, done = false) => `<li data-type="taskItem" data-checked="${done}"><p>${text}</p></li>`;

describe("schedule", () => {
  it("reads dated checklist items and ticks them in the note", () => {
    const n = note(`<ul data-type="taskList">${task("No date")}${task("Read chapter 2 @2026-10-20")}${task("Done one @2026-10-18", true)}</ul>`);
    const tasks = noteTasks(n);
    expect(tasks.map((x) => [x.text, x.date, x.done, x.index])).toEqual([
      ["Read chapter 2", "2026-10-20", false, 1],
      ["Done one", "2026-10-18", true, 2],
    ]);
    const ticked = setTaskDone(n.html, 1, true);
    expect(noteTasks({ ...n, html: ticked })[0].done).toBe(true);
    expect(noteTasks({ ...n, html: ticked })[1].done).toBe(true);
  });
  it("puts due cards and tasks on their days, overdue on today", () => {
    const now = new Date(2026, 9, 17, 9).getTime();
    const today = dayKey(now);
    const due = makeCard({ type: "qa", front: "a", back: "b" }, now - 86_400_000);
    const later = { ...makeCard({ type: "qa", front: "c", back: "d" }, now), schedule: { ...due.schedule, due: now + 2 * 86_400_000 } };
    const n = note(`<ul data-type="taskList">${task(`Late @${addDays(today, -2)}`)}${task(`Soon @${addDays(today, 3)}`)}</ul>`);
    const days = agenda([n], [due, later], 7, now);
    expect(days[0].cards).toBe(1);
    expect(days[0].tasks.map((t) => t.text)).toEqual(["Late"]);
    expect(days[2].cards).toBe(1);
    expect(days[3].tasks.map((t) => t.text)).toEqual(["Soon"]);
  });
  it("logs answers per day and lays out twelve weeks", () => {
    const now = new Date(2026, 9, 17, 9).getTime();
    const one = logAnswer([], true, now);
    const two = logAnswer([one], false, now);
    expect([two.reviews, two.remembered, two.id]).toEqual([2, 1, "log:2026-10-17"]);
    const r = rhythm([two], 12, now);
    expect(r.cells).toHaveLength(84);
    expect(r.studied).toBe(1);
    expect(r.cells.find((c) => c.key === "2026-10-17")?.reviews).toBe(2);
  });
});

describe("related by meaning", () => {
  it("stores vectors compactly and finds the closest by cosine", () => {
    const v = (...xs: number[]) => {
      const a = Float32Array.from(xs);
      const n = Math.hypot(...xs);
      return a.map((x) => x / n);
    };
    const round = decodeVector(encodeVector(v(1, 2, 3)));
    expect(Array.from(round).map((x) => x.toFixed(4))).toEqual(Array.from(v(1, 2, 3)).map((x) => x.toFixed(4)));
    const vectors = new Map([
      ["n:a", v(1, 0, 0)],
      ["n:b", v(0.95, 0.31, 0)],
      ["n:c", v(0.7, 0.7, 0.14)],
      ["n:d", v(0, 1, 0)],
    ]);
    const found = semanticRelated(vectors, "standard", "n:a");
    expect(found.map((m) => [m.id, m.strength])).toEqual([
      ["n:b", "strong"],
      ["n:c", "weak"],
    ]);
    const merged = mergeMatches(found, [{ id: "n:c", score: 0.3, shared: ["osmosis"], strength: "strong" }]);
    expect(merged.find((m) => m.id === "n:c")).toMatchObject({ strength: "strong", semantic: true, shared: ["osmosis"] });
    expect(textHash("abc")).not.toBe(textHash("abd"));
  });
});

describe("callouts", () => {
  it("keep their kind in HTML and become GitHub-style callouts in Markdown", () => {
    const html = cleanHtml('<div data-callout="warning"><p>Mind the <strong>gap</strong></p></div><div data-callout="evil"><p>x</p></div>');
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain('data-callout="note"');
    expect(htmlToMarkdown(html)).toContain("> [!WARNING]\n> Mind the **gap**");
  });
});

describe("colour marks", () => {
  it("keep named colours and styles, and drop unknown ones", () => {
    const html = cleanHtml(
      '<p><mark data-color="green">green</mark> <u data-color="red" data-style="wavy">wavy</u> <mark data-color="#ff0000" style="background:red">raw</mark> <u data-style="zigzag">odd</u></p>',
    );
    expect(html).toContain('<mark data-color="green">green</mark>');
    expect(html).toContain('<u data-color="red" data-style="wavy">wavy</u>');
    expect(html).toContain("<mark>raw</mark>");
    expect(html).toContain("<u>odd</u>");
    expect(html).not.toMatch(/\sstyle=/);
    expect(htmlToMarkdown(html)).toContain("==green==");
  });
});

describe("tutorial", () => {
  it("builds a tutorial workspace with linked chapters, documents and cards", async () => {
    const books = [
      { id: "pp", title: "Pride and Prejudice" },
      { id: "dr", title: "Dracula" },
    ] as BookMeta[];
    const text: Record<string, string> = {
      pp: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known.",
      dr: "Count Dracula had directed me to go to the Golden Krone Hotel, which I found old-fashioned.",
    };
    const read = async (id: string) => ({ meta: books.find((b) => b.id === id)!, paragraphs: [{ id: id + "-p", text: text[id], kind: "paragraph", chapter: 0 }] }) as Book;
    for (const lang of ["en", "fr"] as const) {
      const items = await buildTutorial(lang, books, read, "ws-tutorial", new Date(2026, 9, 17).getTime());
      const notes = items.filter((i): i is Note => i.kind === "note");
      const titles = notes.map((n) => n.title);
      expect(notes).toHaveLength(20);
      expect(items.filter((i) => i.kind === "subject")).toHaveLength(6);
      // Every [[link]] points at a tutorial note.
      for (const n of notes) for (const l of noteLinks(n.html)) expect(titles).toContain(l);
      expect(notes.flatMap((n) => noteTasks(n)).length).toBeGreaterThanOrEqual(9);
      const linking = notes.find((n) => passageLinks(n.html).length && /\[\[|data-note/.test(n.html) && unlinkedMentions(n.html, [notes[9].title]).length)!;
      expect(passageLinks(linking.html)[0]).toMatchObject({ bookId: "pp", paragraphId: "pp-p" });
      // Working documents, and the blocks that show them in notes.
      const sheet = items.find((i) => i.kind === "sheet")!;
      const charts = items.filter((i) => i.kind === "chart");
      const plan = items.find((i) => i.kind === "plan")!;
      expect(charts).toHaveLength(2);
      expect(charts.some((c) => c.kind === "chart" && c.source.kind === "sheet" && c.source.sheetId === sheet.id)).toBe(true);
      expect(items.find((i) => i.kind === "board")).toBeTruthy();
      const html = notes.map((n) => n.html).join("");
      for (const c of charts) expect(html).toContain(`data-chart="${c.id}"`);
      expect(html).toContain(`data-plan="${plan.id}"`);
      expect(html).toMatch(/data-type="block-math"/);
      expect(html).toMatch(/data-diagram="mindmap/);
      expect(html).toMatch(/data-embed="https:\/\/www\.youtube\.com/);
      expect(html).toMatch(/data-voice=""/);
      expect(html).toMatch(/data-ink="/);
      expect(items.some((i) => i.kind === "sticky")).toBe(true);
      // Cards from note lines and from the books (the picture needs a canvas,
      // which the test page does not have).
      const cards = items.filter((i) => i.kind === "card");
      expect(cards.length).toBeGreaterThanOrEqual(12);
      expect(cards.filter((c) => c.kind === "card" && c.source).length).toBe(2);
      // Everything that belongs to a workspace is in the tutorial's.
      const scoped = items.filter((i) => ["subject", "note", "card", "sheet", "chart", "board", "sticky", "plan", "picture"].includes(i.kind));
      expect(scoped.every((i) => (i as { workspace?: string }).workspace === "ws-tutorial")).toBe(true);
      expect(items.find((i) => i.kind === "subject" && "exam" in i && i.exam)).toBeTruthy();
      expect(JSON.stringify(items)).not.toMatch(/—/);
    }
  });
});
