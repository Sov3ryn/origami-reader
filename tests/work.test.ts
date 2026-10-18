import { describe, expect, it } from "vitest";
import {
  addRelated,
  linkMentions,
  noteCardLines,
  noteLinkHtml,
  noteLinks,
  noteText,
  passageLinks,
  related,
  relatedIndex,
  removeRelated,
  renameLinks,
  terms,
  unlinkedMentions,
} from "../src/work/text";
import {
  answer,
  clozeFront,
  clozeParts,
  dueCards,
  makeCard,
  splitTerm,
  suggestBlank,
  syncNoteCards,
  todaysQueue,
  words,
} from "../src/work/cards";
import { exportFiles, htmlDocumentToNote, htmlToMarkdown, markdownToNote, safeName } from "../src/work/transfer";
import type { Note, WorkData } from "../src/work/types";

const note = (id: string, title: string, html: string, extra: Partial<Note> = {}): Note => ({
  id,
  kind: "note",
  title,
  html,
  created: 1,
  updated: 1,
  ...extra,
});

describe("note links", () => {
  it("reads note and passage links from note HTML", () => {
    const html = `<p>See ${noteLinkHtml("Cell membrane")} and ${noteLinkHtml("Osmosis & water")}.</p><p><a data-book="b1" data-paragraph="p9" class="passage-link">Campbell, Cells</a></p>`;
    expect(noteLinks(html)).toEqual(["Cell membrane", "Osmosis & water"]);
    expect(html).toContain("Osmosis &amp; water");
    expect(passageLinks(html)).toEqual([{ bookId: "b1", paragraphId: "p9", label: "Campbell, Cells" }]);
    expect(noteText(html)).toContain("See Cell membrane and Osmosis & water.");
  });
  it("finds mentions that are not linked yet and links them in text only", () => {
    const html = `<p>Osmosis moves water. osmosis again.</p><pre><code>osmosis()</code></pre><p>${noteLinkHtml("Diffusion")}</p>`;
    expect(unlinkedMentions(html, ["Osmosis", "Diffusion", "Os"])).toEqual([{ title: "Osmosis", count: 2 }]);
    const linked = linkMentions(html, "Osmosis");
    expect(noteLinks(linked)).toEqual(["Osmosis", "Diffusion"]);
    expect(linked).toContain("<code>osmosis()</code>");
    expect(unlinkedMentions(linked, ["Osmosis"])).toEqual([]);
  });
  it("adds and removes links in the Related list, and follows renames", () => {
    let html = "<p>Body</p>";
    html = addRelated(html, ["Osmosis", "Diffusion"], "Related");
    html = addRelated(html, ["Osmosis", "Cells"], "Related");
    expect(noteLinks(html)).toEqual(["Osmosis", "Diffusion", "Cells"]);
    expect(html.match(/<h2>Related<\/h2>/g)).toHaveLength(1);
    html = removeRelated(html, ["Osmosis", "Diffusion"], "Related");
    expect(noteLinks(html)).toEqual(["Cells"]);
    expect(removeRelated(html, ["Cells"], "Related")).toBe("<p>Body</p>");
    expect(noteLinks(renameLinks(html, "cells", "Cell biology"))).toEqual(["Cell biology"]);
  });
});

describe("related notes without a model", () => {
  it("folds accents and plurals, and skips stop words in English and French", () => {
    expect(terms("Les membranes cellulaires et the cells").map((t) => t.term)).toEqual(["membrane", "cellulaire", "cell"]);
  });
  it("ranks notes that share rare words and explains why", () => {
    const index = relatedIndex([
      { id: "a", title: "Membranes", text: "The phospholipid bilayer controls diffusion of ions." },
      { id: "b", title: "Transport", text: "Ions cross the phospholipid bilayer through channels." },
      { id: "c", title: "Recipes", text: "Bake the bread for forty minutes." },
    ]);
    const found = related(index, "a");
    expect(found[0].id).toBe("b");
    expect(found[0].shared).toContain("phospholipid");
    expect(found.some((m) => m.id === "c")).toBe(false);
  });
});

describe("study cards", () => {
  it("builds fill-in-the-blank cards from chosen words", () => {
    const s = "The mitochondria is the powerhouse of the cell.";
    const list = words(s);
    const idx = (w: string) => list.findIndex((x) => x.text === w);
    const front = clozeFront(s, new Set([idx("mitochondria")]));
    expect(front).toBe("The {{mitochondria}} is the powerhouse of the cell.");
    expect(clozeFront(s, new Set([idx("powerhouse"), idx("of")]))).toBe("The mitochondria is the {{powerhouse of}} the cell.");
    expect(clozeParts(front).filter((p) => p.hidden).map((p) => p.text)).toEqual(["mitochondria"]);
    const other = "In 1953 Watson described DNA.";
    expect(words(other)[suggestBlank(other)[0]].text).toBe("Watson");
  });
  it("recognises terms and definitions", () => {
    expect(splitTerm("Osmosis: water moving across a membrane")).toEqual({ term: "Osmosis", meaning: "water moving across a membrane" });
    expect(splitTerm("La mitose est la division cellulaire")).toEqual({ term: "La mitose", meaning: "la division cellulaire" });
    expect(splitTerm("Just a sentence without a definition")).toBeNull();
  });
  it("schedules with FSRS: forgotten cards return soon, remembered ones later", () => {
    const now = Date.UTC(2026, 9, 16, 9);
    const card = makeCard({ type: "qa", front: "Q", back: "A" }, now);
    expect(dueCards([card], now)).toHaveLength(1);
    const forgot = answer(card, "again", now);
    const good = answer(card, "good", now);
    expect(forgot.schedule.due - now).toBeLessThan(20 * 60_000);
    expect(good.schedule.due).toBeGreaterThan(forgot.schedule.due);
    const later = answer(answer(good, "good", good.schedule.due), "good", good.schedule.due + 86_400_000 * 3);
    expect(later.schedule.due - now).toBeGreaterThan(86_400_000 * 3);
  });
  it("limits new cards per day", () => {
    const now = Date.now();
    const fresh = Array.from({ length: 30 }, (_, i) => makeCard({ type: "qa", front: "Q" + i, back: "A" }, now - 1000));
    expect(todaysQueue(fresh, 10, now)).toHaveLength(10);
  });
  it("counts older cards first studied today against the daily limit", () => {
    const now = new Date(2026, 9, 18, 15).getTime();
    const lastWeek = now - 7 * 86_400_000;
    const old = Array.from({ length: 30 }, (_, i) => makeCard({ type: "qa", front: "Q" + i, back: "A" }, lastWeek));
    // Six of last week's cards are studied for the first time this morning.
    const studied = old.slice(0, 6).map((c) => answer(c, "good", now - 3_600_000));
    expect(studied.every((c) => c.introduced === now - 3_600_000)).toBe(true);
    const cards = [...studied, ...old.slice(6)];
    expect(todaysQueue(cards, 10, now).filter((c) => c.schedule.reps === 0)).toHaveLength(4);
    // A second answer keeps the first day.
    expect(answer(studied[0], "good", now).introduced).toBe(now - 3_600_000);
    // Cards studied before the field existed count from their only review.
    const legacy = studied.map(({ introduced: _i, ...c }) => c);
    expect(todaysQueue([...legacy, ...old.slice(6)], 10, now).filter((c) => c.schedule.reps === 0)).toHaveLength(4);
  });
  it("keeps cards written as question :: answer lines in step with the note", () => {
    const n = note("n1", "Cells", "<p>Mitochondria :: power plant</p><p>Not a card</p><ul><li><p>DNA :: the genome</p></li></ul>");
    expect(noteCardLines(n.html)).toEqual([
      { front: "Mitochondria", back: "power plant" },
      { front: "DNA", back: "the genome" },
    ]);
    const first = syncNoteCards(n, []);
    expect(first.save).toHaveLength(2);
    expect(first.remove).toEqual([]);
    const reviewed = first.save.map((c) => answer(c, "good"));
    const edited = { ...n, html: "<p>Mitochondria :: the cell's power plant</p>" };
    const next = syncNoteCards(edited, reviewed);
    expect(next.save).toHaveLength(1);
    expect(next.save[0].back).toBe("the cell's power plant");
    // Editing the answer keeps the card and its schedule.
    expect(next.save[0].schedule.reps).toBe(1);
    expect(next.remove).toEqual([reviewed[1].id]);
  });
});

describe("import and export", () => {
  it("imports AI-made HTML pages as clean notes without scripts or styles", () => {
    const page = `<!doctype html><html><head><title>Photosynthesis guide</title><style>body{color:red}</style><script>alert(1)</script></head>
      <body><main><h1>Photosynthesis guide</h1><h2>Steps</h2><p onclick="steal()">Light <b>reactions</b> first.</p>
      <table><tr><th>Stage</th></tr><tr><td>Calvin</td></tr></table><button>Click</button><iframe src="https://x"></iframe></main></body></html>`;
    const n = htmlDocumentToNote(page, "file");
    expect(n.title).toBe("Photosynthesis guide");
    expect(n.html).toContain("<h2>Steps</h2>");
    expect(n.html).toContain("<strong>reactions</strong>");
    expect(n.html).toContain("Calvin");
    expect(n.html).not.toMatch(/script|onclick|alert|iframe|color:red|<h1>/);
  });
  it("reads Markdown, including [[links]], and writes it back", () => {
    const n = markdownToNote("# Cells\n\nSee [[Osmosis]] and **this**.\n\n- one\n- two\n", "file");
    expect(n.title).toBe("Cells");
    expect(noteLinks(n.html)).toEqual(["Osmosis"]);
    const md = htmlToMarkdown(n.html);
    expect(md).toContain("[[Osmosis]]");
    expect(md).toContain("**this**");
    expect(md).toMatch(/- one/);
  });
  it("exports notes as HTML and Markdown in subject folders, and cards for Anki", () => {
    const data: WorkData = {
      subjects: [{ id: "s", kind: "subject", name: "Bio/Chem", color: "#fff", order: 1, created: 1 }],
      notes: [note("a", "CON", "<p>x</p>", { subjectId: "s" }), note("b", "CON", "<p>y</p>", { subjectId: "s" })],
      cards: [
        makeCard({ type: "cloze", front: "The {{cell}} is {{small}}.", back: "" }),
        makeCard({ type: "qa", front: "Q\tone", back: "A" }),
      ],
      batches: [],
      hidden: [],
    };
    const files = Object.fromEntries(exportFiles(data));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["Bio-Chem/_CON.html", "Bio-Chem/_CON.md", "Bio-Chem/_CON (2).html", "Study cards/anki-cloze.txt"]),
    );
    expect(files["Study cards/anki-cloze.txt"]).toBe("The {{c1::cell}} is {{c2::small}}.\t");
    expect(files["Study cards/anki-basic.txt"]).toBe("Q one\tA");
    expect(files["Bio-Chem/_CON.html"]).toContain("<!doctype html>");
    expect(safeName(" ..a:b?. ")).toBe("a-b-");
  });
});
