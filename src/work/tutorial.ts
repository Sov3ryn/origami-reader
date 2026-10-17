// A small tour of Work Mode, added once: a "Getting started" subject with
// linked notes, a schedule with dated tasks, and study cards (two of them tied
// to passages in the starter books, so "Show in book" works).
import type { Book, BookMeta } from "../types";
import { makeCard, syncNoteCards } from "./cards";
import { addDays, dayKey } from "./schedule";
import { escapeHtml, noteLinkHtml } from "./text";
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
const passageHtml = (p: Passage) =>
  `<blockquote><p>${escapeHtml(p.quote)}</p></blockquote><p><a data-book="${escapeHtml(p.bookId)}" data-paragraph="${escapeHtml(p.paragraphId)}" class="passage-link">${escapeHtml(p.title)}</a></p>`;
const task = (text: string, date?: string, done = false) =>
  `<li data-type="taskItem" data-checked="${done}"><p>${text}${date ? ` @${date}` : ""}</p></li>`;

export async function buildTutorial(
  lang: Lang,
  books: BookMeta[],
  readBook: (id: string) => Promise<Book>,
  now = Date.now(),
): Promise<WorkItem[]> {
  const d0 = dayKey(now);
  const d = (n: number) => addDays(d0, n);
  const pride = await findPassage(books, readBook, /pride and prejudice/i, /truth universally acknowledged/i);
  const dracula = await findPassage(books, readBook, /dracula/i, /Golden Krone Hotel/);

  const subject: Subject = {
    id: crypto.randomUUID(),
    kind: "subject",
    name: L(lang, "Getting started", "Prise en main"),
    color: "#8f7bd8",
    order: -1,
    created: now,
  };
  const T = {
    welcome: L(lang, "Welcome to Work mode", "Bienvenue dans le mode Travail"),
    linking: L(lang, "Linking ideas", "Relier les idées"),
    cards: L(lang, "Study cards", "Cartes d’étude"),
    schedule: L(lang, "My study schedule", "Mon planning d’étude"),
    reading: L(lang, "Reading notes: Pride and Prejudice", "Notes de lecture : Orgueil et Préjugés"),
  };
  const link = (t: string) => noteLinkHtml(t);

  const welcome = L(
    lang,
    `<div data-callout="tip"><p><strong>This is your desk.</strong> Notes, study cards and your schedule live here, beside your books. Everything stays on this computer.</p></div>
<h2>Try these first</h2>
<ul data-type="taskList">${task("Open Work mode with <code>Ctrl+Shift+W</code>", undefined, true)}${task(`Read ${link(T.linking)}`, d(0))}${task("Review today’s cards in <strong>Study</strong>", d(0))}${task(`Plan the week in ${link(T.schedule)}`, d(1))}</ul>
<h2>Writing</h2>
<p>Type <code>/</code> on an empty line for headings, lists, tables, callouts and cards. Select text for <strong>bold</strong>, <em>italic</em>, <u>underline</u> and <mark>highlight</mark>. Type <code>[[</code> to link a note.</p>
<div data-callout="note"><p>Pages made with AI tools, Word documents and Markdown files can be imported as notes from the <strong>···</strong> menu. Scripts are removed; text, tables, code and images stay.</p></div>
<h2>The panel on the right</h2>
<p>It always shows what links here, <strong>related</strong> notes and highlights, and notes you mention without linking. Nothing is linked for you unless you choose <em>Link for me</em> and confirm the summary.</p>
<p>Next: ${link(T.cards)} and ${link(T.reading)}.</p>`,
    `<div data-callout="tip"><p><strong>Voici votre bureau.</strong> Les notes, les cartes d’étude et votre planning vivent ici, à côté de vos livres. Tout reste sur cet ordinateur.</p></div>
<h2>À essayer d’abord</h2>
<ul data-type="taskList">${task("Ouvrir le mode Travail avec <code>Ctrl+Maj+W</code>", undefined, true)}${task(`Lire ${link(T.linking)}`, d(0))}${task("Réviser les cartes du jour dans <strong>Étudier</strong>", d(0))}${task(`Planifier la semaine dans ${link(T.schedule)}`, d(1))}</ul>
<h2>Écrire</h2>
<p>Tapez <code>/</code> sur une ligne vide pour les titres, listes, tableaux, encadrés et cartes. Sélectionnez du texte pour le mettre en <strong>gras</strong>, en <em>italique</em>, le <u>souligner</u> ou le <mark>surligner</mark>. Tapez <code>[[</code> pour lier une note.</p>
<div data-callout="note"><p>Les pages créées avec des outils d’IA, les documents Word et les fichiers Markdown s’importent comme notes depuis le menu <strong>···</strong>. Les scripts sont retirés ; le texte, les tableaux, le code et les images restent.</p></div>
<h2>Le panneau de droite</h2>
<p>Il montre toujours ce qui pointe ici, les notes et surlignages <strong>liés</strong>, et les notes que vous mentionnez sans les lier. Rien n’est lié à votre place, sauf si vous choisissez <em>Lier pour moi</em> et confirmez le résumé.</p>
<p>Ensuite : ${link(T.cards)} et ${link(T.reading)}.</p>`,
  );

  const linking = L(
    lang,
    `<p>Ideas get stronger when they meet. Type <code>[[</code> and a title to link a note, like ${link(T.welcome)}. Links work both ways: the other note lists this one under <em>Linked here</em>.</p>
<div data-callout="question"><p><strong>Spot the mention.</strong> This line names Study cards without linking it. Look at <em>Mentioned, not linked</em> on the right and press <strong>Link</strong>.</p></div>
<h2>Quotes from your books</h2>
<p>Open a book beside a note from <strong>Sources</strong>, then drag a paragraph in, or select a sentence and choose <em>Quote in note</em>. The quote keeps a link back to its page.</p>
${pride ? passageHtml(pride) : ""}
<h2>Related, by meaning</h2>
<p>With a Connections model installed (Settings, Work mode), Related finds notes about the same idea even in another language, such as <u>osmose</u> and <u>osmosis</u>. Without one, it matches shared words. Either way it only suggests.</p>`,
    `<p>Les idées se renforcent en se rencontrant. Tapez <code>[[</code> et un titre pour lier une note, comme ${link(T.welcome)}. Les liens vont dans les deux sens : l’autre note affiche celle-ci sous <em>Liées ici</em>.</p>
<div data-callout="question"><p><strong>Repérez la mention.</strong> Cette ligne nomme Cartes d’étude sans la lier. Regardez <em>Mentionnées, non liées</em> à droite et appuyez sur <strong>Lier</strong>.</p></div>
<h2>Citer vos livres</h2>
<p>Ouvrez un livre à côté d’une note depuis <strong>Sources</strong>, puis glissez-y un paragraphe, ou sélectionnez une phrase et choisissez <em>Citer dans la note</em>. La citation garde un lien vers sa page.</p>
${pride ? passageHtml(pride) : ""}
<h2>Liés, par le sens</h2>
<p>Avec un modèle de connexions installé (Paramètres, mode Travail), Liés trouve les notes sur la même idée, même dans une autre langue, comme <u>osmose</u> et <u>osmosis</u>. Sans modèle, il compare les mots communs. Dans tous les cas, il ne fait que suggérer.</p>`,
  );

  const cardsNote = L(
    lang,
    `<p>Any sentence can become a card: select it while reading or writing and choose <strong>Card</strong>. Four kinds: fill in the blank, question and answer, term and meaning, and translate.</p>
<h2>Cards written in a note</h2>
<p>Write a line with two colons and it becomes a card that stays in step with the note:</p>
<p>What does FSRS schedule? :: When each card comes back, right before you would forget it</p>
<p>Who wrote Dracula? :: Bram Stoker</p>
<div data-callout="important"><p>Study a few minutes a day. Answer honestly with <strong>Forgot</strong> or <strong>Got it</strong>; cards you know drift further apart, cards you miss come back soon.</p></div>
<p>Cards made from a book remember their passage. While studying, <em>Show in book</em> opens it. Plan sessions in ${link(T.schedule)}.</p>`,
    `<p>Chaque phrase peut devenir une carte : sélectionnez-la en lisant ou en écrivant et choisissez <strong>Carte</strong>. Quatre types : texte à trous, question et réponse, terme et signification, et traduction.</p>
<h2>Des cartes écrites dans une note</h2>
<p>Écrivez une ligne avec deux deux-points et elle devient une carte qui suit la note :</p>
<p>Que planifie FSRS ? :: Le retour de chaque carte, juste avant que vous l’oubliiez</p>
<p>Qui a écrit Dracula ? :: Bram Stoker</p>
<div data-callout="important"><p>Étudiez quelques minutes par jour. Répondez honnêtement avec <strong>Oublié</strong> ou <strong>Je sais</strong> : les cartes connues s’espacent, les cartes manquées reviennent vite.</p></div>
<p>Les cartes créées depuis un livre retiennent leur passage. Pendant l’étude, <em>Voir dans le livre</em> l’ouvre. Planifiez vos séances dans ${link(T.schedule)}.</p>`,
  );

  const scheduleNote = L(
    lang,
    `<p>Checklist items with a date like <code>@${d(3)}</code> appear on the <strong>Schedule</strong> page, beside the cards coming due each day.</p>
<h2>This week</h2>
<ul data-type="taskList">${task("Fifteen minutes of cards", d(0))}${task(`Finish ${link(T.reading)}`, d(2))}${task("Read two chapters of Dracula", d(3))}${task("Review the week and plan the next one", d(6))}</ul>
<h2>A simple plan</h2>
<table><tbody><tr><th><p>Day</p></th><th><p>Reading</p></th><th><p>Study</p></th></tr><tr><td><p>Weekdays</p></td><td><p>30 min</p></td><td><p>Cards, 10 min</p></td></tr><tr><td><p>Weekend</p></td><td><p>A long chapter</p></td><td><p>New cards from notes</p></td></tr></tbody></table>
<div data-callout="summary"><p>Small and regular beats long and rare. The Schedule shows the days you studied without streaks or guilt.</p></div>`,
    `<p>Les éléments de liste avec une date comme <code>@${d(3)}</code> apparaissent sur la page <strong>Planning</strong>, à côté des cartes à réviser chaque jour.</p>
<h2>Cette semaine</h2>
<ul data-type="taskList">${task("Quinze minutes de cartes", d(0))}${task(`Terminer ${link(T.reading)}`, d(2))}${task("Lire deux chapitres de Dracula", d(3))}${task("Faire le bilan de la semaine et planifier la suivante", d(6))}</ul>
<h2>Un plan simple</h2>
<table><tbody><tr><th><p>Jour</p></th><th><p>Lecture</p></th><th><p>Étude</p></th></tr><tr><td><p>En semaine</p></td><td><p>30 min</p></td><td><p>Cartes, 10 min</p></td></tr><tr><td><p>Week-end</p></td><td><p>Un long chapitre</p></td><td><p>Nouvelles cartes depuis les notes</p></td></tr></tbody></table>
<div data-callout="summary"><p>Peu mais souvent vaut mieux que beaucoup mais rarement. Le Planning montre les jours étudiés, sans série ni culpabilité.</p></div>`,
  );

  const reading = L(
    lang,
    `<p>A reading note collects quotes, thoughts and cards about one book.</p>
${pride ? passageHtml(pride) : ""}
<p>The famous first line is <mark>ironic</mark>: it is the families who want a rich husband, not the single men who want a wife. Austen writes about <u>marriage, money and class</u>.</p>
<div data-callout="note"><p>Try it: open <strong>Pride and Prejudice</strong> from Sources and quote another passage.</p></div>
<p>Who wrote Pride and Prejudice? :: Jane Austen, in 1813</p>
<p>Back to ${link(T.welcome)}.</p>`,
    `<p>Une note de lecture rassemble citations, réflexions et cartes sur un livre.</p>
${pride ? passageHtml(pride) : ""}
<p>La célèbre première phrase est <mark>ironique</mark> : ce sont les familles qui veulent un mari riche, pas les célibataires qui cherchent une épouse. Austen parle de <u>mariage, d’argent et de classe sociale</u>.</p>
<div data-callout="note"><p>Essayez : ouvrez <strong>Pride and Prejudice</strong> depuis Sources et citez un autre passage.</p></div>
<p>Qui a écrit Orgueil et Préjugés ? :: Jane Austen, en 1813</p>
<p>Retour à ${link(T.welcome)}.</p>`,
  );

  const make = (title: string, html: string, icon: string, offset: number, tags: string[]): Note => ({
    id: crypto.randomUUID(),
    kind: "note",
    title,
    html: html.replace(/\n/g, ""),
    subjectId: subject.id,
    icon,
    tags,
    created: now - offset,
    updated: now - offset,
  });
  const tag = L(lang, "tutorial", "tutoriel");
  const notes = [
    make(T.welcome, welcome, "👋", 0, [tag]),
    make(T.linking, linking, "🔗", 1000, [tag]),
    make(T.cards, cardsNote, "🗂️", 2000, [tag, L(lang, "study", "étude")]),
    make(T.schedule, scheduleNote, "📅", 3000, [tag, L(lang, "planning", "planning")]),
    make(T.reading, reading, "📖", 4000, [tag, L(lang, "books", "livres")]),
  ];
  const cards: StudyCard[] = [];
  for (const n of notes) cards.push(...syncNoteCards(n, cards, now).save);
  if (pride)
    cards.push(
      makeCard(
        {
          type: "cloze",
          front: pride.quote.replace(/universally acknowledged/i, (m) => `{{${m}}}`),
          back: "",
          source: { ...pride, start: 0, end: pride.quote.length },
          noteId: notes[4].id,
          subjectId: subject.id,
        },
        now,
      ),
    );
  if (dracula)
    cards.push(
      makeCard(
        {
          type: "qa",
          front: L(lang, "Where does Count Dracula send Jonathan Harker in Bistritz?", "Où le comte Dracula envoie-t-il Jonathan Harker à Bistritz ?"),
          back: L(lang, "To the Golden Krone Hotel", "À l’hôtel Golden Krone"),
          source: { ...dracula, start: 0, end: dracula.quote.length },
          subjectId: subject.id,
        },
        now,
      ),
    );
  return [subject, ...notes, ...cards];
}
