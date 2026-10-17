// The tutorial workspace: five chapters (subjects) of linked notes that show
// Work mode by doing, with working examples of every kind of document: a
// sheet and its charts, a board, a plan, picture cards, formulas, diagrams,
// an embed, ink, a voice note, sticky notes, cards, an exam date and dated
// tasks. It is built once; people make their own workspace beside it.
import type { Book, BookMeta } from "../types";
import { makeCard, syncNoteCards } from "./cards";
import { addDays, dayKey } from "./schedule";
import { escapeHtml, noteLinkHtml } from "./text";
import { blankWorkbook } from "./sheets/model";
import type { SheetDoc } from "./sheets/model";
import { defaultSpec, type ChartSpec } from "./charts/spec";
import { newPlan, type PlanDoc, type Shape } from "./plans/model";
import type { BoardDoc } from "./boards/model";
import { newPictureSet, syncPictureCards, type PictureSet } from "./pictures";
import type { StickyNote } from "./stickies/Stickies";
import type { Note, StudyCard, Subject, WorkItem } from "./types";

type Lang = "en" | "fr";
const L = <T,>(lang: Lang, en: T, fr: T) => (lang === "fr" ? fr : en);

type Passage = { bookId: string; paragraphId: string; quote: string; title: string };
async function findPassage(
  books: BookMeta[],
  readBook: (id: string) => Promise<Book>,
  title: RegExp,
  phrase: RegExp,
): Promise<Passage | null> {
  const meta = books.find((b) => title.test(b.title) && !b.deleted && !b.vault);
  if (!meta) return null;
  try {
    const book = await readBook(meta.id);
    const p = book.paragraphs.find((x) => phrase.test(x.text));
    if (!p) return null;
    const m = phrase.exec(p.text)!;
    // The sentence holding the phrase.
    const start = Math.max(0, p.text.lastIndexOf(".", m.index) + 1);
    const endDot = p.text.indexOf(".", m.index + m[0].length);
    const quote = p.text.slice(start, endDot < 0 ? undefined : endDot + 1).trim();
    return { bookId: meta.id, paragraphId: p.id, quote, title: meta.title };
  } catch {
    return null;
  }
}

// --- HTML pieces --------------------------------------------------------------------
const attr = (s: string) => escapeHtml(s).replace(/\n/g, "&#10;");
const passageHtml = (p: Passage) =>
  `<blockquote><p>${escapeHtml(p.quote)}</p></blockquote><p><a data-book="${escapeHtml(p.bookId)}" data-paragraph="${escapeHtml(p.paragraphId)}" class="passage-link">${escapeHtml(p.title)}</a></p>`;
const task = (text: string, date?: string, done = false) =>
  `<li data-type="taskItem" data-checked="${done}"><p>${text}${date ? ` @${date}` : ""}</p></li>`;
const tasks = (...items: string[]) => `<ul data-type="taskList">${items.join("")}</ul>`;
const callout = (kind: string, html: string) => `<div data-callout="${kind}"><p>${html}</p></div>`;
const math = (latex: string) => `<span data-type="inline-math" data-latex="${attr(latex)}"></span>`;
const mathBlock = (latex: string) => `<div data-type="block-math" data-latex="${attr(latex)}"></div>`;
const diagram = (code: string) => `<div data-diagram="${attr(code)}"></div>`;
const kbd = (k: string) => `<code>${k}</code>`;

// A picture for the picture card example, drawn here: a flower with labels.
function flowerPicture(lang: Lang): { image: string; width: number; height: number; labels: { text: string; x: number; y: number }[] } | null {
  try {
    const width = 900;
    const height = 600;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#f6f2e8";
    g.fillRect(0, 0, width, height);
    // Stem, leaf and roots.
    g.strokeStyle = "#3f7d3a";
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(450, 250);
    g.lineTo(450, 470);
    g.stroke();
    g.fillStyle = "#5aa152";
    g.beginPath();
    g.ellipse(520, 380, 70, 28, -0.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#8a6a43";
    g.lineWidth = 6;
    for (const dx of [-60, -25, 20, 60]) {
      g.beginPath();
      g.moveTo(450, 470);
      g.quadraticCurveTo(450 + dx / 2, 510, 450 + dx, 545);
      g.stroke();
    }
    g.fillStyle = "#c9b38d";
    g.fillRect(330, 470, 240, 6);
    // Petals and centre.
    g.fillStyle = "#e58fb3";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.ellipse(450 + Math.cos(a) * 70, 180 + Math.sin(a) * 70, 52, 30, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#f2c14e";
    g.beginPath();
    g.arc(450, 180, 42, 0, Math.PI * 2);
    g.fill();
    const labels = [
      { text: L(lang, "Petal", "Pétale"), x: 690, y: 110 },
      { text: L(lang, "Centre (pistil)", "Cœur (pistil)"), x: 200, y: 150 },
      { text: L(lang, "Leaf", "Feuille"), x: 690, y: 360 },
      { text: L(lang, "Stem", "Tige"), x: 230, y: 380 },
      { text: L(lang, "Roots", "Racines"), x: 690, y: 540 },
    ];
    g.strokeStyle = "#555";
    g.lineWidth = 2;
    const points: [number, number][] = [[560, 150], [415, 180], [560, 375], [445, 380], [500, 530]];
    labels.forEach((l, i) => {
      g.beginPath();
      g.moveTo(l.x + (l.x > 450 ? -10 : 150), l.y - 8);
      g.lineTo(points[i][0], points[i][1]);
      g.stroke();
    });
    g.fillStyle = "#222";
    g.font = "28px Segoe UI, Inter, sans-serif";
    for (const l of labels) g.fillText(l.text, l.x, l.y);
    return { image: canvas.toDataURL("image/jpeg", 0.9), width, height, labels };
  } catch {
    return null;
  }
}

// A few strokes for the ink example: an underlined wave.
function sampleInk() {
  const wave: number[][] = [];
  for (let x = 120; x <= 520; x += 10) wave.push([x, 120 + Math.sin((x - 120) / 40) * 40, 0.5]);
  const line: number[][] = [];
  for (let x = 110; x <= 540; x += 20) line.push([x, 200, 0.5]);
  const circle: number[][] = [];
  for (let a = 0; a <= 6.4; a += 0.2) circle.push([720 + Math.cos(a) * 70, 150 + Math.sin(a) * 70, 0.5]);
  return JSON.stringify({ h: 280, strokes: [
    { tool: "pen", c: "blue", s: 4, p: wave },
    { tool: "marker", c: "orange", s: 6, p: line },
    { tool: "pen", c: "green", s: 4, p: circle },
  ] });
}

// A board scene: Excalidraw fills in what is left out when it opens.
function boardScene(lang: Lang, now: number) {
  let seed = 1;
  const base = (type: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}) => ({
    id: `tutorial-${type}-${seed}`, type, x, y, width: w, height: h, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null,
    roundness: type === "rectangle" ? { type: 3 } : null, seed: seed++, version: 1, versionNonce: seed * 7, isDeleted: false,
    boundElements: null, updated: now, link: null, locked: false, ...extra,
  });
  const text = (x: number, y: number, s: string, size = 24) =>
    base("text", x, y, s.length * size * 0.55, size * 1.3, { text: s, originalText: s, fontSize: size, fontFamily: 1, textAlign: "left", verticalAlign: "top", containerId: null, lineHeight: 1.25, autoResize: true });
  const notes = L(lang, ["Read a chapter", "Make cards", "Practice test"], ["Lire un chapitre", "Créer des cartes", "Test d'entraînement"]);
  const colors = ["#ffec99", "#b2f2bb", "#a5d8ff"];
  const elements: Record<string, unknown>[] = [text(80, 30, L(lang, "My study loop", "Ma boucle d'étude"), 32)];
  notes.forEach((n, i) => {
    elements.push(base("rectangle", 80 + i * 300, 120, 240, 120, { backgroundColor: colors[i] }));
    elements.push(text(100 + i * 300, 165, n, 22));
    if (i < 2) elements.push(base("arrow", 325 + i * 300, 180, 50, 0, { points: [[0, 0], [50, 0]], startArrowhead: null, endArrowhead: "arrow", lastCommittedPoint: null }));
  });
  elements.push(text(80, 290, L(lang, "Double-click anywhere to write. Drag shapes from the toolbar.", "Double-cliquez n'importe où pour écrire. Prenez des formes dans la barre d'outils."), 18));
  return { elements, appState: { viewBackgroundColor: "#ffffff" }, files: {} };
}

function bookshelf(): Shape[] {
  return [
    { id: "s1", type: "rect", x: 0, y: 0, w: 800, h: 1200, weight: "bold" },
    { id: "s2", type: "line", a: [0, 300], b: [800, 300] },
    { id: "s3", type: "line", a: [0, 600], b: [800, 600] },
    { id: "s4", type: "line", a: [0, 900], b: [800, 900] },
    { id: "s5", type: "dim", a: [0, 0], b: [800, 0], offset: -80 },
    { id: "s6", type: "dim", a: [0, 0], b: [0, 1200], offset: 80 },
    { id: "s7", type: "dim", a: [800, 600], b: [800, 900], offset: -60 },
    { id: "s8", type: "circle", c: [740, 750], r: 18, dash: "center" },
  ] as Shape[];
}

export async function buildTutorial(
  lang: Lang,
  books: BookMeta[],
  readBook: (id: string) => Promise<Book>,
  workspace = "main",
  now = Date.now(),
): Promise<WorkItem[]> {
  const d0 = dayKey(now);
  const d = (n: number) => addDays(d0, n);
  const pride = await findPassage(books, readBook, /pride and prejudice/i, /truth universally acknowledged/i);
  const dracula = await findPassage(books, readBook, /dracula/i, /Golden Krone Hotel/);
  const ws = workspace === "main" ? {} : { workspace };
  const link = (t: string) => noteLinkHtml(t);

  const subject = (name: string, order: number, color: string, extra: Partial<Subject> = {}): Subject => ({
    id: crypto.randomUUID(), kind: "subject", name, color, order, created: now, ...ws, ...extra,
  });
  const S1 = subject(L(lang, "1 · Start here", "1 · Commencer ici"), -5, "#8f7bd8");
  const S2 = subject(L(lang, "2 · Writing", "2 · Écrire"), -4, "#5aa6d6");
  const S3 = subject(L(lang, "3 · Studying", "3 · Étudier"), -3, "#4fb58a", { exam: d(14) });
  const S3b = subject(L(lang, "Vocabulary", "Vocabulaire"), -2.5, "#4fb58a", { parent: S3.id });
  const S4 = subject(L(lang, "4 · Sheets, charts and boards", "4 · Tableaux, graphiques et tableaux blancs"), -2, "#d6a24f");
  const S5 = subject(L(lang, "5 · Organising", "5 · Organiser"), -1, "#c779b8");

  const T = {
    welcome: L(lang, "Welcome to the tutorial", "Bienvenue dans le tutoriel"),
    find: L(lang, "Finding your way", "Se repérer"),
    basics: L(lang, "Writing basics", "Les bases de l’écriture"),
    formulas: L(lang, "Formulas", "Formules"),
    diagrams: L(lang, "Diagrams", "Diagrammes"),
    linking: L(lang, "Linking ideas", "Relier les idées"),
    reading: L(lang, "Reading notes: Pride and Prejudice", "Notes de lecture : Orgueil et Préjugés"),
    hand: L(lang, "Handwriting, photos and voice", "Écriture manuscrite, photos et voix"),
    embeds: L(lang, "Videos, maps and web pages", "Vidéos, cartes et pages web"),
    cards: L(lang, "Study cards", "Cartes d’étude"),
    pictures: L(lang, "Picture cards", "Cartes image"),
    exams: L(lang, "Practice tests and exams", "Tests d’entraînement et examens"),
    schedule: L(lang, "My study schedule", "Mon planning d’étude"),
    vocab: L(lang, "French words", "Mots anglais"),
    charts: L(lang, "Charts from a sheet", "Graphiques depuis un tableau"),
    plans: L(lang, "Boards and plans", "Tableaux blancs et plans"),
    spaces: L(lang, "Workspaces and vaults", "Espaces de travail et coffres"),
    templates: L(lang, "Templates, import and export", "Modèles, import et export"),
    plugins: L(lang, "Plugins", "Extensions"),
    privacy: L(lang, "Your data, models and updates", "Vos données, modèles et mises à jour"),
  };

  // --- Documents ----------------------------------------------------------------------
  const sheetTitle = L(lang, "Reading log", "Journal de lecture");
  const tab = L(lang, "Log", "Journal");
  const months = L(lang, ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], ["janv.", "févr.", "mars", "avr.", "mai", "juin"]);
  const minutes = [320, 410, 380, 520, 610, 560];
  const pages = [140, 180, 150, 230, 260, 240];
  const sheet: SheetDoc = {
    id: crypto.randomUUID(), kind: "sheet", title: sheetTitle, subjectId: S4.id, created: now, updated: now, ...ws,
    data: blankWorkbook(sheetTitle, tab, [
      [L(lang, "Month", "Mois"), L(lang, "Minutes read", "Minutes lues"), L(lang, "Pages", "Pages")],
      ...months.map((m, i) => [m, minutes[i], pages[i]]),
      [L(lang, "Total", "Total"), "=SUM(B2:B7)", "=SUM(C2:C7)"],
    ]),
  } as SheetDoc;
  const chart1: ChartSpec = {
    ...defaultSpec({ source: { kind: "sheet", sheetId: sheet.id, range: `${tab}!A1:C7` }, type: "column", title: L(lang, "Reading by month", "Lecture par mois") }, now),
    ...ws,
  } as ChartSpec;
  const chart2: ChartSpec = {
    ...defaultSpec({
      source: { kind: "data", rows: [
        [L(lang, "Activity", "Activité"), L(lang, "Hours", "Heures")],
        [L(lang, "Reading", "Lecture"), 6], [L(lang, "Notes", "Notes"), 3], [L(lang, "Cards", "Cartes"), 2], [L(lang, "Listening", "Écoute"), 4],
      ] },
      type: "donut", title: L(lang, "A week of study", "Une semaine d’étude"), legend: "right", labels: true,
    }, now),
    ...ws,
  } as ChartSpec;
  const board: BoardDoc = {
    id: crypto.randomUUID(), kind: "board", title: L(lang, "Study loop board", "Tableau de la boucle d’étude"), subjectId: S4.id,
    scene: boardScene(lang, now) as unknown as BoardDoc["scene"], created: now, updated: now, ...ws,
  } as BoardDoc;
  const plan: PlanDoc = {
    ...newPlan(L(lang, "Bookshelf", "Bibliothèque"), "mm"), id: crypto.randomUUID(), subjectId: S4.id, created: now, updated: now,
    shapes: bookshelf(), ...ws,
  } as PlanDoc;
  const flower = flowerPicture(lang);
  const picture: PictureSet | null = flower
    ? {
        ...newPictureSet(S3.id, now),
        title: L(lang, "Parts of a flower", "Les parties d’une fleur"),
        image: flower.image, width: flower.width, height: flower.height, hide: "all",
        masks: flower.labels.map((l, i) => ({
          id: "m" + i, label: l.text,
          x: (l.x - 6) / flower.width, y: (l.y - 32) / flower.height, w: (l.text.length * 15 + 16) / flower.width, h: 44 / flower.height,
        })),
        ...ws,
      }
    : null;

  // --- Notes --------------------------------------------------------------------------
  const welcome = L(lang, `
${callout("tip", "<strong>This whole workspace is a sandbox.</strong> Change, delete or break anything: it only teaches. When you are ready, open the workspace menu at the top left and choose <em>New workspace</em> for your own notes. This tutorial stays here for later.")}
<h2>What Work mode is</h2>
<p>A desk beside your books: notes, study cards, a schedule, sheets, boards and plans, all on this computer. Switch between reading and working with ${kbd("Ctrl+Shift+W")}.</p>
<h2>The chapters</h2>
<ol><li><p>${link(T.find)}: search, shortcuts and the panels.</p></li><li><p>${link(T.basics)}, ${link(T.formulas)}, ${link(T.diagrams)}, ${link(T.linking)}, ${link(T.hand)} and ${link(T.embeds)}.</p></li><li><p>${link(T.cards)}, ${link(T.pictures)}, ${link(T.exams)} and ${link(T.schedule)}.</p></li><li><p>${link(T.charts)} and ${link(T.plans)}, with a real sheet, board and plan.</p></li><li><p>${link(T.spaces)}, ${link(T.templates)}, ${link(T.plugins)} and ${link(T.privacy)}.</p></li></ol>
<h2>Try these first</h2>
${tasks(task(`Open Work mode with ${kbd("Ctrl+Shift+W")}`, undefined, true), task(`Read ${link(T.find)}`, d(0)), task("Review today’s cards in <strong>Study</strong>", d(0)), task("Make your own workspace", d(1)))}
<p>These checklist items have dates, so they also appear on the <strong>Schedule</strong> page.</p>`, `
${callout("tip", "<strong>Tout cet espace est un bac à sable.</strong> Modifiez, supprimez ou cassez ce que vous voulez : il ne sert qu’à apprendre. Quand vous êtes prêt, ouvrez le menu des espaces en haut à gauche et choisissez <em>Nouvel espace de travail</em> pour vos propres notes. Ce tutoriel reste ici pour plus tard.")}
<h2>Le mode Travail</h2>
<p>Un bureau à côté de vos livres : notes, cartes d’étude, planning, tableaux, tableaux blancs et plans, tout sur cet ordinateur. Passez de la lecture au travail avec ${kbd("Ctrl+Maj+W")}.</p>
<h2>Les chapitres</h2>
<ol><li><p>${link(T.find)} : recherche, raccourcis et panneaux.</p></li><li><p>${link(T.basics)}, ${link(T.formulas)}, ${link(T.diagrams)}, ${link(T.linking)}, ${link(T.hand)} et ${link(T.embeds)}.</p></li><li><p>${link(T.cards)}, ${link(T.pictures)}, ${link(T.exams)} et ${link(T.schedule)}.</p></li><li><p>${link(T.charts)} et ${link(T.plans)}, avec un vrai tableau, un tableau blanc et un plan.</p></li><li><p>${link(T.spaces)}, ${link(T.templates)}, ${link(T.plugins)} et ${link(T.privacy)}.</p></li></ol>
<h2>À essayer d’abord</h2>
${tasks(task(`Ouvrir le mode Travail avec ${kbd("Ctrl+Maj+W")}`, undefined, true), task(`Lire ${link(T.find)}`, d(0)), task("Réviser les cartes du jour dans <strong>Étudier</strong>", d(0)), task("Créer votre propre espace de travail", d(1)))}
<p>Ces éléments de liste ont une date : ils apparaissent aussi sur la page <strong>Planning</strong>.</p>`);

  const find = L(lang, `
<h2>Search everything</h2>
<p>${kbd("Ctrl+K")} searches notes, sheets, boards, plans, subjects and books, and runs commands such as <em>New picture cards</em>. Hover any button to see its name and shortcut.</p>
<h2>Useful shortcuts</h2>
<table><tbody><tr><th><p>Keys</p></th><th><p>What they do</p></th></tr><tr><td><p>${kbd("Ctrl+N")}</p></td><td><p>New note</p></td></tr><tr><td><p>${kbd("Ctrl+Shift+N")}</p></td><td><p>New note from a template</p></td></tr><tr><td><p>${kbd("/")}</p></td><td><p>Blocks: headings, tables, formulas, diagrams, voice notes, plans…</p></td></tr><tr><td><p>${kbd("[[")}</p></td><td><p>Link another note</p></td></tr><tr><td><p>${kbd("Ctrl+Alt+S")}</p></td><td><p>Sticky note on the open document</p></td></tr></tbody></table>
<h2>The pages on the left</h2>
<p><strong>Today</strong> shows what is due and upcoming exams. <strong>Inbox</strong> collects highlights from your books that are not in a note yet. <strong>Study</strong> starts today’s cards. <strong>Schedule</strong> shows dated tasks and cards coming due.</p>
<h2>The panel on the right</h2>
<p>It shows notes that link here, <strong>related</strong> notes and highlights, and notes you mention without linking. Both side panels fold away with the buttons at their edge.</p>
<p>Next: ${link(T.basics)}.</p>`, `
<h2>Tout rechercher</h2>
<p>${kbd("Ctrl+K")} cherche dans les notes, tableaux, tableaux blancs, plans, sujets et livres, et lance des commandes comme <em>Nouvelles cartes image</em>. Survolez un bouton pour voir son nom et son raccourci.</p>
<h2>Raccourcis utiles</h2>
<table><tbody><tr><th><p>Touches</p></th><th><p>Effet</p></th></tr><tr><td><p>${kbd("Ctrl+N")}</p></td><td><p>Nouvelle note</p></td></tr><tr><td><p>${kbd("Ctrl+Maj+N")}</p></td><td><p>Nouvelle note depuis un modèle</p></td></tr><tr><td><p>${kbd("/")}</p></td><td><p>Blocs : titres, tableaux, formules, diagrammes, notes vocales, plans…</p></td></tr><tr><td><p>${kbd("[[")}</p></td><td><p>Lier une autre note</p></td></tr><tr><td><p>${kbd("Ctrl+Alt+S")}</p></td><td><p>Pense-bête sur le document ouvert</p></td></tr></tbody></table>
<h2>Les pages à gauche</h2>
<p><strong>Aujourd’hui</strong> montre ce qui est à faire et les examens à venir. <strong>Boîte de réception</strong> rassemble les surlignages de vos livres qui ne sont pas encore dans une note. <strong>Étudier</strong> lance les cartes du jour. <strong>Planning</strong> montre les tâches datées et les cartes à venir.</p>
<h2>Le panneau de droite</h2>
<p>Il montre les notes qui pointent ici, les notes et surlignages <strong>liés</strong>, et les notes mentionnées sans lien. Les deux panneaux latéraux se replient avec les boutons sur leur bord.</p>
<p>Ensuite : ${link(T.basics)}.</p>`);

  const basics = L(lang, `
<p>Type ${kbd("/")} on an empty line for blocks. Select text for <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s>, <mark>highlight</mark> and colours.</p>
<h2>Callouts</h2>
${callout("note", "<strong>Note.</strong> A side remark.")}${callout("tip", "<strong>Tip.</strong> Something useful.")}${callout("important", "<strong>Important.</strong> Do not miss this.")}${callout("warning", "<strong>Warning.</strong> Be careful here.")}${callout("question", "<strong>Question.</strong> Something to find out.")}
<h2>Lists and tables</h2>
<ul><li><p>Bullet lists</p></li><li><p>Numbered lists</p></li></ul>
${tasks(task("A checklist item"), task("A dated item reaches the Schedule", d(2)))}
<table><tbody><tr><th><p>Book</p></th><th><p>Author</p></th><th><p>Year</p></th></tr><tr><td><p>Dracula</p></td><td><p>Bram Stoker</p></td><td><p>1897</p></td></tr><tr><td><p>Pride and Prejudice</p></td><td><p>Jane Austen</p></td><td><p>1813</p></td></tr></tbody></table>
<pre><code>Code blocks keep their spacing.</code></pre>
<h2>Paper, history and sticky notes</h2>
<p>The header above this note chooses its <strong>paper</strong> (lined, math grid, blueprint and more), shows its <strong>history</strong> (an earlier version every ten minutes of editing) and adds a <strong>sticky note</strong>. There is one on this page: drag it, fold it, change its colour.</p>
<p>Next: ${link(T.formulas)}.</p>`, `
<p>Tapez ${kbd("/")} sur une ligne vide pour les blocs. Sélectionnez du texte pour le <strong>gras</strong>, l’<em>italique</em>, le <u>souligné</u>, le <s>barré</s>, le <mark>surlignage</mark> et les couleurs.</p>
<h2>Encadrés</h2>
${callout("note", "<strong>Note.</strong> Une remarque.")}${callout("tip", "<strong>Astuce.</strong> Quelque chose d’utile.")}${callout("important", "<strong>Important.</strong> À ne pas manquer.")}${callout("warning", "<strong>Attention.</strong> Prudence ici.")}${callout("question", "<strong>Question.</strong> Quelque chose à découvrir.")}
<h2>Listes et tableaux</h2>
<ul><li><p>Listes à puces</p></li><li><p>Listes numérotées</p></li></ul>
${tasks(task("Un élément de liste"), task("Un élément daté rejoint le Planning", d(2)))}
<table><tbody><tr><th><p>Livre</p></th><th><p>Auteur</p></th><th><p>Année</p></th></tr><tr><td><p>Dracula</p></td><td><p>Bram Stoker</p></td><td><p>1897</p></td></tr><tr><td><p>Orgueil et Préjugés</p></td><td><p>Jane Austen</p></td><td><p>1813</p></td></tr></tbody></table>
<pre><code>Les blocs de code gardent leurs espaces.</code></pre>
<h2>Papier, historique et pense-bêtes</h2>
<p>L’en-tête de cette note choisit son <strong>papier</strong> (ligné, quadrillé, plan et plus), montre son <strong>historique</strong> (une version toutes les dix minutes d’écriture) et ajoute un <strong>pense-bête</strong>. Il y en a un sur cette page : déplacez-le, repliez-le, changez sa couleur.</p>
<p>Ensuite : ${link(T.formulas)}.</p>`);

  const formulas = L(lang, `
<p>Formulas use LaTeX. Inline, like ${math("E = mc^2")} or ${math("\\frac{a}{b}")}, or on their own line:</p>
${mathBlock("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}")}
${mathBlock("\\int_0^1 x^2 \\, dx = \\frac{1}{3}")}
<p>Choose <em>Formula</em> in the ${kbd("/")} menu to write one with a preview and a list of symbols. Click a formula to change it.</p>
<p>Cards can hold formulas too: What is the area of a circle? :: $$\\pi r^2$$</p>
<p>Next: ${link(T.diagrams)}.</p>`, `
<p>Les formules s’écrivent en LaTeX. Dans le texte, comme ${math("E = mc^2")} ou ${math("\\frac{a}{b}")}, ou sur leur propre ligne :</p>
${mathBlock("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}")}
${mathBlock("\\int_0^1 x^2 \\, dx = \\frac{1}{3}")}
<p>Choisissez <em>Formule</em> dans le menu ${kbd("/")} pour en écrire une avec un aperçu et une liste de symboles. Cliquez sur une formule pour la modifier.</p>
<p>Les cartes acceptent aussi les formules : Quelle est l’aire d’un disque ? :: $$\\pi r^2$$</p>
<p>Ensuite : ${link(T.diagrams)}.</p>`);

  const diagrams = L(lang, `
<p>Diagrams are written as short text (Mermaid) and drawn for you. Click one to edit it; choose <em>Diagram</em> in the ${kbd("/")} menu for templates.</p>
<h3>Flowchart</h3>
${diagram("flowchart LR\n  A[Read a chapter] --> B{Understood?}\n  B -- Yes --> C[Make cards]\n  B -- No --> D[Read again]\n  D --> B")}
<h3>Mind map</h3>
${diagram("mindmap\n  root((Origami))\n    Read\n      Books\n      Voices\n    Work\n      Notes\n      Cards\n      Sheets")}
<h3>Timeline</h3>
${diagram("timeline\n  title Novels\n  1813 : Pride and Prejudice\n  1868 : The Moonstone\n  1897 : Dracula")}
<p>Next: ${link(T.linking)}.</p>`, `
<p>Les diagrammes s’écrivent en texte court (Mermaid) et se dessinent seuls. Cliquez dessus pour les modifier ; choisissez <em>Diagramme</em> dans le menu ${kbd("/")} pour des modèles.</p>
<h3>Organigramme</h3>
${diagram("flowchart LR\n  A[Lire un chapitre] --> B{Compris ?}\n  B -- Oui --> C[Créer des cartes]\n  B -- Non --> D[Relire]\n  D --> B")}
<h3>Carte mentale</h3>
${diagram("mindmap\n  root((Origami))\n    Lire\n      Livres\n      Voix\n    Travailler\n      Notes\n      Cartes\n      Tableaux")}
<h3>Frise</h3>
${diagram("timeline\n  title Romans\n  1813 : Orgueil et Préjugés\n  1868 : La Pierre de lune\n  1897 : Dracula")}
<p>Ensuite : ${link(T.linking)}.</p>`);

  const linking = L(lang, `
<p>Type ${kbd("[[")} and a title to link a note, like ${link(T.welcome)}. Links work both ways: the other note lists this one under <em>Linked here</em>.</p>
${callout("question", "<strong>Spot the mention.</strong> This line names Study cards without linking it. Look at <em>Mentioned, not linked</em> on the right and press <strong>Link</strong>.")}
<h2>Quotes from your books</h2>
<p>Open a book beside a note from <strong>Sources</strong>, then drag a paragraph in, or select a sentence and choose <em>Quote in note</em>. The quote keeps a link back to its page.</p>
${pride ? passageHtml(pride) : ""}
<h2>Related, by meaning</h2>
<p>Related finds notes about the same idea, even in another language, such as <u>osmose</u> and <u>osmosis</u>. The <strong>Map</strong> tab draws the links around a note. <em>Link for me</em> suggests links in a batch you confirm and can undo.</p>
<p>Next: ${link(T.reading)}.</p>`, `
<p>Tapez ${kbd("[[")} et un titre pour lier une note, comme ${link(T.welcome)}. Les liens vont dans les deux sens : l’autre note affiche celle-ci sous <em>Liées ici</em>.</p>
${callout("question", "<strong>Repérez la mention.</strong> Cette ligne nomme Cartes d’étude sans la lier. Regardez <em>Mentionnées, non liées</em> à droite et appuyez sur <strong>Lier</strong>.")}
<h2>Citer vos livres</h2>
<p>Ouvrez un livre à côté d’une note depuis <strong>Sources</strong>, puis glissez-y un paragraphe, ou sélectionnez une phrase et choisissez <em>Citer dans la note</em>. La citation garde un lien vers sa page.</p>
${pride ? passageHtml(pride) : ""}
<h2>Liés, par le sens</h2>
<p>Liés trouve les notes sur la même idée, même dans une autre langue, comme <u>osmose</u> et <u>osmosis</u>. L’onglet <strong>Carte</strong> dessine les liens autour d’une note. <em>Lier pour moi</em> propose des liens par lot, à confirmer et annulables.</p>
<p>Ensuite : ${link(T.reading)}.</p>`);

  const reading = L(lang, `
<p>A reading note collects quotes, thoughts and cards about one book.</p>
${pride ? passageHtml(pride) : ""}
<p>The famous first line is <mark>ironic</mark>: it is the families who want a rich husband, not the single men who want a wife. Austen writes about <u>marriage, money and class</u>.</p>
${callout("note", "Try it: open <strong>Pride and Prejudice</strong> from Sources and quote another passage.")}
<p>Who wrote Pride and Prejudice? :: Jane Austen, in 1813</p>
<p>Next: ${link(T.hand)}.</p>`, `
<p>Une note de lecture rassemble citations, réflexions et cartes sur un livre.</p>
${pride ? passageHtml(pride) : ""}
<p>La célèbre première phrase est <mark>ironique</mark> : ce sont les familles qui veulent un mari riche, pas les célibataires qui cherchent une épouse. Austen parle de <u>mariage, d’argent et de classe sociale</u>.</p>
${callout("note", "Essayez : ouvrez <strong>Pride and Prejudice</strong> depuis Sources et citez un autre passage.")}
<p>Qui a écrit Orgueil et Préjugés ? :: Jane Austen, en 1813</p>
<p>Ensuite : ${link(T.hand)}.</p>`);

  const hand = L(lang, `
<h2>Writing with a pen</h2>
<p>An ink block takes a pen, a finger or the mouse. Draw below, then choose <em>Read handwriting</em> to turn writing into text (unsure words are underlined in orange, with other readings offered).</p>
<div data-ink="${attr(sampleInk())}"></div>
<h2>Photos of handwritten pages</h2>
<p>Choose <em>Photo of handwriting</em> in the ${kbd("/")} menu: the note keeps the photo and the text read from it.</p>
<h2>Voice notes</h2>
<p>Record yourself below. When you stop, Origami can write down what you said, on this computer (Whisper, downloaded once from Settings, Work mode, Voice notes, or from the block). The text stays searchable.</p>
<div data-voice="" data-duration="0"><p></p></div>
<p>Next: ${link(T.embeds)}.</p>`, `
<h2>Écrire au stylet</h2>
<p>Un bloc d’encre accepte un stylet, un doigt ou la souris. Dessinez ci-dessous, puis choisissez <em>Lire l’écriture</em> pour transformer l’écriture en texte (les mots incertains sont soulignés en orange, avec d’autres lectures proposées).</p>
<div data-ink="${attr(sampleInk())}"></div>
<h2>Photos de pages manuscrites</h2>
<p>Choisissez <em>Photo d’écriture manuscrite</em> dans le menu ${kbd("/")} : la note garde la photo et le texte lu.</p>
<h2>Notes vocales</h2>
<p>Enregistrez-vous ci-dessous. À la fin, Origami peut écrire ce que vous avez dit, sur cet ordinateur (Whisper, téléchargé une fois depuis Paramètres, mode Travail, Notes vocales, ou depuis le bloc). Le texte reste cherchable.</p>
<div data-voice="" data-duration="0"><p></p></div>
<p>Ensuite : ${link(T.embeds)}.</p>`);

  const embeds = L(lang, `
<p>Paste a link to a video, a map, a post or a document on its own line and choose <em>Embed</em>. Nothing loads from the internet until you allow it, once per site.</p>
<div data-embed="https://www.youtube.com/watch?v=aqz-KE-bpKQ"></div>
<p>That is <em>Big Buck Bunny</em>, a short film by the Blender Foundation (Creative Commons). Embeds become plain links in exports.</p>
<p>Next chapter: ${link(T.cards)}.</p>`, `
<p>Collez un lien vers une vidéo, une carte, une publication ou un document sur sa propre ligne et choisissez <em>Intégrer</em>. Rien ne se charge depuis internet tant que vous ne l’autorisez pas, une fois par site.</p>
<div data-embed="https://www.youtube.com/watch?v=aqz-KE-bpKQ"></div>
<p>C’est <em>Big Buck Bunny</em>, un court métrage de la Blender Foundation (Creative Commons). Les intégrations deviennent de simples liens dans les exports.</p>
<p>Chapitre suivant : ${link(T.cards)}.</p>`);

  const cardsNote = L(lang, `
<p>Any sentence can become a card: select it while reading or writing and choose <strong>Card</strong>. Kinds: fill in the blank, question and answer, term and meaning, translate, and ${link(T.pictures)}.</p>
<h2>Cards written in a note</h2>
<p>Write a line with two colons and it becomes a card that stays in step with the note:</p>
<p>What does FSRS schedule? :: When each card comes back, right before you would forget it</p>
<p>Who wrote Dracula? :: Bram Stoker</p>
<p>What does a plant’s root do? :: It takes in water and holds the plant in the ground</p>
${callout("important", "Study a few minutes a day. Answer honestly; cards you know drift further apart, cards you miss come back soon. The <strong>Listen</strong> and <strong>Write</strong> buttons read cards aloud or let you answer with a pen.")}
<p>Next: ${link(T.pictures)}.</p>`, `
<p>Chaque phrase peut devenir une carte : sélectionnez-la en lisant ou en écrivant et choisissez <strong>Carte</strong>. Types : texte à trous, question et réponse, terme et signification, traduction, et ${link(T.pictures)}.</p>
<h2>Des cartes écrites dans une note</h2>
<p>Écrivez une ligne avec deux deux-points et elle devient une carte qui suit la note :</p>
<p>Que planifie FSRS ? :: Le retour de chaque carte, juste avant que vous l’oubliiez</p>
<p>Qui a écrit Dracula ? :: Bram Stoker</p>
<p>À quoi sert la racine d’une plante ? :: Elle absorbe l’eau et tient la plante dans le sol</p>
${callout("important", "Étudiez quelques minutes par jour. Répondez honnêtement : les cartes connues s’espacent, les cartes manquées reviennent vite. Les boutons <strong>Écouter</strong> et <strong>Écrire</strong> lisent les cartes à voix haute ou permettent de répondre au stylet.")}
<p>Ensuite : ${link(T.pictures)}.</p>`);

  const picturesNote = L(lang, `
<p>Picture cards hide parts of a diagram, a map or a photo. Each box is a card; its label is the answer.</p>
<p>This chapter has one: <strong>Parts of a flower</strong>. Open it from the ··· menu, <em>All study cards</em>, then the picture at the top. Move or resize the boxes, add one by dragging over a part, and study.</p>
${callout("tip", "Paste a screenshot of a diagram with Ctrl+V in a new picture card set to start in seconds.")}
<p>Next: ${link(T.exams)}.</p>`, `
<p>Les cartes image cachent des parties d’un schéma, d’une carte ou d’une photo. Chaque cadre est une carte ; son étiquette est la réponse.</p>
<p>Ce chapitre en contient une : <strong>Les parties d’une fleur</strong>. Ouvrez-la depuis le menu ···, <em>Toutes les cartes d’étude</em>, puis l’image en haut. Déplacez ou redimensionnez les cadres, ajoutez-en un en glissant sur une partie, et étudiez.</p>
${callout("tip", "Collez une capture d’un schéma avec Ctrl+V dans un nouvel ensemble de cartes image pour commencer en quelques secondes.")}
<p>Ensuite : ${link(T.exams)}.</p>`);

  const exams = L(lang, `
<p>This chapter’s subject has an <strong>exam date</strong> in two weeks. Before an exam, Origami brings cards forward so every one is seen in time, and <strong>Today</strong> shows the days left. Open the subject <em>3 · Studying</em> on the left to change the date.</p>
<h2>Practice tests</h2>
<p>On the subject page or the cards page, <strong>Practice test</strong> asks questions without changing your schedule: multiple choice (with at least four different answers) or typed. Missed questions can be practised again or studied now.</p>
<h2>Sharing a set</h2>
<p><strong>Share</strong> saves cards as a file friends can import, without your review history. Picture cards bring their picture.</p>
<p>Subjects can sit inside each other: <em>Vocabulary</em> is inside <em>3 · Studying</em>, with ${link(T.vocab)}.</p>
<p>Next: ${link(T.schedule)}.</p>`, `
<p>Le sujet de ce chapitre a une <strong>date d’examen</strong> dans deux semaines. Avant un examen, Origami avance les cartes pour que chacune soit vue à temps, et <strong>Aujourd’hui</strong> affiche les jours restants. Ouvrez le sujet <em>3 · Étudier</em> à gauche pour changer la date.</p>
<h2>Tests d’entraînement</h2>
<p>Sur la page du sujet ou des cartes, <strong>Test d’entraînement</strong> pose des questions sans changer votre planning : choix multiple (avec au moins quatre réponses différentes) ou réponse tapée. Les questions manquées peuvent être reprises ou étudiées tout de suite.</p>
<h2>Partager un ensemble</h2>
<p><strong>Partager</strong> enregistre les cartes dans un fichier que vos amis peuvent importer, sans votre historique de révision. Les cartes image emportent leur image.</p>
<p>Les sujets peuvent s’imbriquer : <em>Vocabulaire</em> est dans <em>3 · Étudier</em>, avec ${link(T.vocab)}.</p>
<p>Ensuite : ${link(T.schedule)}.</p>`);

  const vocab = L(lang, `
<p>Term cards from lines with two colons. Try a practice test on this subject.</p>
<p>le livre :: the book</p><p>la plume :: the pen, the feather</p><p>la bibliothèque :: the library, the bookcase</p><p>apprendre :: to learn</p><p>la page :: the page</p>`, `
<p>Des cartes de vocabulaire depuis des lignes à deux deux-points. Essayez un test d’entraînement sur ce sujet.</p>
<p>the book :: le livre</p><p>the pen :: le stylo</p><p>the bookcase :: la bibliothèque (le meuble)</p><p>to learn :: apprendre</p><p>the page :: la page</p>`);

  const schedule = L(lang, `
<p>Checklist items with a date like <code>@${d(3)}</code> appear on the <strong>Schedule</strong> page, beside the cards coming due each day.</p>
<h2>This week</h2>
${tasks(task("Fifteen minutes of cards", d(0)), task(`Finish ${link(T.reading)}`, d(2)), task("Read two chapters of Dracula", d(3)), task("Practice test on 3 · Studying", d(5)), task("Review the week and plan the next one", d(6)))}
${callout("summary", "Small and regular beats long and rare. The Schedule shows the days you studied, without streaks or guilt.")}
<p>Next chapter: ${link(T.charts)}.</p>`, `
<p>Les éléments de liste avec une date comme <code>@${d(3)}</code> apparaissent sur la page <strong>Planning</strong>, à côté des cartes à réviser chaque jour.</p>
<h2>Cette semaine</h2>
${tasks(task("Quinze minutes de cartes", d(0)), task(`Terminer ${link(T.reading)}`, d(2)), task("Lire deux chapitres de Dracula", d(3)), task("Test d’entraînement sur 3 · Étudier", d(5)), task("Faire le bilan de la semaine et planifier la suivante", d(6)))}
${callout("summary", "Peu mais souvent vaut mieux que beaucoup mais rarement. Le Planning montre les jours étudiés, sans série ni culpabilité.")}
<p>Chapitre suivant : ${link(T.charts)}.</p>`);

  const charts = L(lang, `
<p>The sheet <strong>${escapeHtml(sheetTitle)}</strong> in this chapter holds six months of reading, with totals made by formulas (<code>=SUM(B2:B7)</code>). Open it from the left: it works like a spreadsheet, imports and exports Excel files, and has many functions.</p>
<p>This chart reads the sheet and follows its changes. Change a number in the sheet and come back:</p>
<div data-chart="${chart1.id}"></div>
<p>Charts can also hold their own numbers:</p>
<div data-chart="${chart2.id}"></div>
<p>Choose <em>Chart</em> in the ${kbd("/")} menu to make one: columns, lines, areas, pies, radar, heatmaps and more, with palettes and labels.</p>
<p>Next: ${link(T.plans)}.</p>`, `
<p>Le tableau <strong>${escapeHtml(sheetTitle)}</strong> de ce chapitre contient six mois de lecture, avec des totaux calculés par des formules (<code>=SUM(B2:B7)</code>). Ouvrez-le à gauche : il fonctionne comme un tableur, importe et exporte des fichiers Excel et propose de nombreuses fonctions.</p>
<p>Ce graphique lit le tableau et suit ses changements. Modifiez un nombre dans le tableau et revenez :</p>
<div data-chart="${chart1.id}"></div>
<p>Un graphique peut aussi contenir ses propres nombres :</p>
<div data-chart="${chart2.id}"></div>
<p>Choisissez <em>Graphique</em> dans le menu ${kbd("/")} pour en créer un : colonnes, courbes, aires, secteurs, radar, cartes de chaleur et plus, avec palettes et étiquettes.</p>
<p>Ensuite : ${link(T.plans)}.</p>`);

  const plansNote = L(lang, `
<h2>Boards</h2>
<p>The board <strong>${escapeHtml(board.title)}</strong> is a whiteboard for sketches, arrows and sticky ideas. Open it from the left and draw.</p>
<h2>Plans</h2>
<p>Plans are precise drawings with real dimensions, in millimetres or inches, with snapping. This bookshelf is 800 by 1200 mm; it redraws here whenever the plan changes:</p>
<div data-plan="${plan.id}"></div>
<p>Plans export as real-size SVG and as DXF for AutoCAD, LibreCAD and FreeCAD. Choose <em>Plan</em> in the ${kbd("/")} menu to place one in a note.</p>
<p>Next chapter: ${link(T.spaces)}.</p>`, `
<h2>Tableaux blancs</h2>
<p>Le tableau blanc <strong>${escapeHtml(board.title)}</strong> sert aux croquis, flèches et idées. Ouvrez-le à gauche et dessinez.</p>
<h2>Plans</h2>
<p>Les plans sont des dessins précis aux vraies dimensions, en millimètres ou en pouces, avec aimantation. Cette bibliothèque mesure 800 sur 1200 mm ; elle se redessine ici dès que le plan change :</p>
<div data-plan="${plan.id}"></div>
<p>Les plans s’exportent en SVG à taille réelle et en DXF pour AutoCAD, LibreCAD et FreeCAD. Choisissez <em>Plan</em> dans le menu ${kbd("/")} pour en placer un dans une note.</p>
<p>Chapitre suivant : ${link(T.spaces)}.</p>`);

  const spaces = L(lang, `
<h2>Workspaces</h2>
<p>Each workspace has its own subjects, notes, cards, sheets, boards and plans: one for a course, one for work, one for a hobby. Use the menu at the top left to make, rename, duplicate, export or import one. <strong>Make yours now</strong>; this tutorial stays here.</p>
<h2>Vaults</h2>
<p>A vault locks with a PIN. A whole workspace, or a single note, sheet, board or plan, can live in a vault: it is encrypted on this computer and hides when the vault locks. Make vaults in Read mode; unlock and lock them from the workspace menu.</p>
<h2>Trash</h2>
<p>Deleted books wait in the Trash for the time you choose in Settings before going for good.</p>
<p>Next: ${link(T.templates)}.</p>`, `
<h2>Espaces de travail</h2>
<p>Chaque espace a ses propres sujets, notes, cartes, tableaux, tableaux blancs et plans : un pour un cours, un pour le travail, un pour un loisir. Le menu en haut à gauche permet d’en créer, renommer, dupliquer, exporter ou importer. <strong>Créez le vôtre maintenant</strong> ; ce tutoriel reste ici.</p>
<h2>Coffres</h2>
<p>Un coffre se verrouille avec un code. Un espace entier, ou une seule note, un tableau, un tableau blanc ou un plan, peut vivre dans un coffre : chiffré sur cet ordinateur, il disparaît quand le coffre se verrouille. Créez les coffres en mode Lecture ; déverrouillez-les et verrouillez-les depuis le menu des espaces.</p>
<h2>Corbeille</h2>
<p>Les livres supprimés attendent dans la Corbeille le temps choisi dans les Paramètres avant de partir pour de bon.</p>
<p>Ensuite : ${link(T.templates)}.</p>`);

  const templates = L(lang, `
<h2>Templates</h2>
<p>${kbd("Ctrl+Shift+N")} starts a note from a template: Cornell notes, lecture notes, book summary, vocabulary list, meeting notes, project brief, research paper, weekly review and exam revision.</p>
<h2>Import</h2>
<p>The ··· menu imports Word, Markdown, HTML and text files as notes, Excel files as sheets, a whole folder of Markdown or Obsidian notes (folders become subjects), and shared card sets. Imported content is data: scripts are removed.</p>
<h2>Export</h2>
<p><em>Export all notes and cards</em> writes HTML or Markdown files, sheets as Excel files and charts as images, into a folder you choose. Exports are yours: deleting things in Origami never removes them.</p>
<p>Next: ${link(T.plugins)}.</p>`, `
<h2>Modèles</h2>
<p>${kbd("Ctrl+Maj+N")} crée une note depuis un modèle : notes Cornell, notes de cours, résumé de livre, liste de vocabulaire, compte rendu de réunion, fiche de projet, article de recherche, bilan de la semaine et révision d’examen.</p>
<h2>Importer</h2>
<p>Le menu ··· importe des fichiers Word, Markdown, HTML et texte comme notes, des fichiers Excel comme tableaux, un dossier entier de notes Markdown ou Obsidian (les dossiers deviennent des sujets) et des ensembles de cartes partagés. Le contenu importé reste des données : les scripts sont retirés.</p>
<h2>Exporter</h2>
<p><em>Exporter toutes les notes et cartes</em> écrit des fichiers HTML ou Markdown, les tableaux en fichiers Excel et les graphiques en images, dans un dossier de votre choix. Les exports vous appartiennent : supprimer dans Origami ne les efface jamais.</p>
<p>Ensuite : ${link(T.plugins)}.</p>`);

  const plugins = L(lang, `
<p>Plugins add commands, panels and blocks. Each runs in a sealed frame with no internet and asks before reading or changing notes.</p>
${tasks(task("Open Settings, Work mode, Plugins and add the sample <em>Note tools</em>"), task("Type / then <em>Focus timer</em> to put its timer in a note"), task("Search with Ctrl+K for <em>Note statistics</em>"))}
<p>Next: ${link(T.privacy)}.</p>`, `
<p>Les extensions ajoutent des commandes, des panneaux et des blocs. Chacune tourne dans un cadre isolé sans internet et demande avant de lire ou de modifier des notes.</p>
${tasks(task("Ouvrir Paramètres, mode Travail, Extensions et ajouter l’exemple <em>Note tools</em>"), task("Taper / puis <em>Focus timer</em> pour mettre son minuteur dans une note"), task("Chercher <em>Note statistics</em> avec Ctrl+K"))}
<p>Ensuite : ${link(T.privacy)}.</p>`);

  const privacy = L(lang, `
<p>Origami works offline. No account, no ads, no tracking. Your notes, cards and recordings stay on this computer.</p>
<h2>Models</h2>
<p>Settings, Work mode lists the optional models: Related notes (IBM Granite), handwriting (TrOCR) and voice notes (Whisper). Each downloads once from its publisher, is checked before use and runs on this computer.</p>
<h2>Updates</h2>
<p>Origami checks once a day and tells you when a new version is ready. Install it in Settings, About and support, Updates; only what changed is downloaded.</p>
${callout("tip", "Liked the tour? Make your own workspace now from the menu at the top left, and come back here whenever you want a reminder.")}
<p>Back to ${link(T.welcome)}.</p>`, `
<p>Origami fonctionne hors ligne. Pas de compte, pas de publicité, pas de pistage. Vos notes, cartes et enregistrements restent sur cet ordinateur.</p>
<h2>Modèles</h2>
<p>Paramètres, mode Travail liste les modèles facultatifs : notes liées (IBM Granite), écriture manuscrite (TrOCR) et notes vocales (Whisper). Chacun se télécharge une fois depuis son éditeur, est vérifié avant usage et fonctionne sur cet ordinateur.</p>
<h2>Mises à jour</h2>
<p>Origami vérifie une fois par jour et vous prévient quand une nouvelle version est prête. Installez-la dans Paramètres, À propos et soutien, Mises à jour ; seul ce qui a changé est téléchargé.</p>
${callout("tip", "Le tour vous a plu ? Créez votre propre espace maintenant depuis le menu en haut à gauche, et revenez ici quand vous voulez un rappel.")}
<p>Retour à ${link(T.welcome)}.</p>`);

  let offset = 0;
  const make = (title: string, html: string, icon: string, subjectId: string, tags: string[]): Note => {
    offset += 1000;
    return {
      id: crypto.randomUUID(), kind: "note", title, html: html.replace(/\n/g, ""), subjectId, icon, tags,
      created: now - offset, updated: now - offset, ...ws,
    } as Note;
  };
  const tag = L(lang, "tutorial", "tutoriel");
  const notes = [
    make(T.welcome, welcome, "👋", S1.id, [tag]),
    make(T.find, find, "🧭", S1.id, [tag]),
    make(T.basics, basics, "✍️", S2.id, [tag]),
    make(T.formulas, formulas, "∑", S2.id, [tag]),
    make(T.diagrams, diagrams, "🔀", S2.id, [tag]),
    make(T.linking, linking, "🔗", S2.id, [tag]),
    make(T.reading, reading, "📖", S2.id, [tag, L(lang, "books", "livres")]),
    make(T.hand, hand, "🎙️", S2.id, [tag]),
    make(T.embeds, embeds, "🎬", S2.id, [tag]),
    make(T.cards, cardsNote, "🗂️", S3.id, [tag, L(lang, "study", "étude")]),
    make(T.pictures, picturesNote, "🖼️", S3.id, [tag, L(lang, "study", "étude")]),
    make(T.exams, exams, "🎯", S3.id, [tag, L(lang, "study", "étude")]),
    make(T.schedule, schedule, "📅", S3.id, [tag, L(lang, "planning", "planning")]),
    make(T.vocab, vocab, "🔤", S3b.id, [tag]),
    make(T.charts, charts, "📊", S4.id, [tag]),
    make(T.plans, plansNote, "📐", S4.id, [tag]),
    make(T.spaces, spaces, "🗄️", S5.id, [tag]),
    make(T.templates, templates, "📄", S5.id, [tag]),
    make(T.plugins, plugins, "🧩", S5.id, [tag]),
    make(T.privacy, privacy, "🔒", S5.id, [tag]),
  ];
  const sticky: StickyNote = {
    id: crypto.randomUUID(), kind: "sticky", doc: notes[2].id, x: 0.62, y: 120, color: "yellow", created: now, updated: now,
    text: L(lang, "I am a sticky note. Drag me, fold me, or press Ctrl+Alt+S to add another.", "Je suis un pense-bête. Déplacez-moi, repliez-moi, ou appuyez sur Ctrl+Alt+S pour en ajouter un autre."),
    ...ws,
  } as StickyNote;

  const cards: StudyCard[] = [];
  for (const n of notes) cards.push(...syncNoteCards(n, cards, now).save.map((c) => ({ ...c, ...ws }) as StudyCard));
  if (picture) cards.push(...syncPictureCards(picture, [], now).save.map((c) => ({ ...c, ...ws }) as StudyCard));
  const readingNote = notes.find((n) => n.title === T.reading)!;
  if (pride)
    cards.push({
      ...makeCard(
        { type: "cloze", front: pride.quote.replace(/universally acknowledged/i, (m) => `{{${m}}}`), back: "", source: { ...pride, start: 0, end: pride.quote.length }, noteId: readingNote.id, subjectId: S2.id },
        now,
      ),
      ...ws,
    } as StudyCard);
  if (dracula)
    cards.push({
      ...makeCard(
        {
          type: "qa",
          front: L(lang, "Where does Count Dracula send Jonathan Harker in Bistritz?", "Où le comte Dracula envoie-t-il Jonathan Harker à Bistritz ?"),
          back: L(lang, "To the Golden Krone Hotel", "À l’hôtel Golden Krone"),
          source: { ...dracula, start: 0, end: dracula.quote.length },
          subjectId: S3.id,
        },
        now,
      ),
      ...ws,
    } as StudyCard);
  return [S1, S2, S3, S3b, S4, S5, ...notes, sticky, sheet, chart1, chart2, board, plan, ...(picture ? [picture] : []), ...cards];
}
