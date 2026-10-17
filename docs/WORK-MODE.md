# Work Mode: research and design plan

Status: built (see PROGRESS.md, "Work Mode, first build" and "Connections models, tour, schedule and polish"). Written 2026-10-16.

Work Mode is the second half of Origami: one offline place to read, take notes, keep documents and study. Read Mode stays the calm, premium reader. Work Mode reuses its books, highlights, voices, vaults and local models, but adds a tidy desk around them.

The one-line pitch: **"Read it, note it, remember it. On your computer, nobody else's."**

---

## 1. Research findings

A note on evidence: the 2025-2026 sources are mostly forum threads, review sites (G2, Capterra, Trustpilot) and blogs. Several blogs sell a competing app. Treat the points below as consistent patterns, not survey statistics. Sources are listed at the end.

### 1.1 "Second brain" fatigue (Obsidian, Notion)

**Obsidian**
- **The setup becomes the hobby.** Forum users describe "sophisticated procrastination": hours spent formatting, splitting and linking notes and trying plugins instead of learning. Configuring feels productive and is easier than the real work.
- **Plugin overload.** Each plugin brings settings to learn, updates to watch and possible conflicts. Some are abandoned. Vaults with dozens of plugins open slowly, and desktop setups break on mobile.
- **Manual upkeep.** Links and tags are all manual, so the graph is only as connected as the work you put in. People with ADHD describe giving up and going back to paper.
- **The graph view is pretty but rarely useful.** Users say backlinks help more for finding things. The graph mostly helps spot orphan notes or judge the overall shape of a vault. You can't edit or link from it. The community joke is that it is "more fun to look at than navigate".
- **What people love, and Origami must keep:** plain local files, speed, no lock-in, Markdown.

**Notion**
- **The blank-canvas problem.** Endless blocks and databases cause decision fatigue, and new users feel lost in unfamiliar features.
- **Performance.** Reviews say large workspaces and heavy pages lag, and complaints grow as workspaces grow.
- **Offline is the most repeated complaint.** Only recently opened pages are reliably offline. Reviewers call it "limited and unreliable".
- **Cloud lock-in.** Your data lives on their servers in their format.
- **AI that gets in the way.** In May 2025 Notion moved AI from a paid add-on into the Business and Enterprise plans, a large price jump for Plus users who wanted it. Reviews complain about AI being pushed into the interface, such as pop-up banners, with no clear way to turn it off.

**What this means for Origami**
| Pitfall | Origami answer |
|---|---|
| Configuring instead of working | No plugin system. A small set of opinionated, finished features with good defaults. |
| Blank canvas | Work Mode opens on a "Today" desk with three clear actions, not an empty page. |
| Manual linking upkeep | Local AI suggests links; the user only says yes or no. |
| Graph as decoration | No full-screen graph in the first release. A small "neighbourhood map" lives in the Connections panel. |
| Slow on big vaults | SQLite with full-text search, lazy loading, a budget of under 100 ms to open a note. |
| Offline gaps and lock-in | Everything is local by design. One-click export to plain Markdown and Anki-compatible files. |
| Pushy AI | AI is quiet, local, explained, and has a single off switch. |

### 1.2 The study gap (Quizlet, Anki)

**Quizlet**
- **The paywall.** Learn mode, Test mode and Expert Solutions moved behind Quizlet Plus (about $8 a month or $36 a year in 2025). Students built habits on the free version and feel the rug was pulled. Common Sense Media notes that many users are frustrated by this.
- **Ads and limits** on the free tier.
- **What students use it for:** quick term and definition sets, shared class sets, the friendly matching and test games, and audio pronunciation for language classes.

**Anki**
- **Powerful but plain.** The interface is described as "plain" and hiding its depth. Making good cards takes time, and keeping up with decks eats study time.
- **The scheduler matters.** The old SM-2 scheduler led to "ease hell". FSRS, a modern open scheduler, became native in Anki 23.10 and many long-time users switch to it. Mochi added FSRS in June 2025.
- **What students use it for:** spaced repetition, cloze deletions, image occlusion (medicine), audio, and shared decks.

**The real gap: cards are cut off from their source.**
- MarginNote's best idea is that one excerpt is a PDF highlight, a mind-map node and a flashcard at the same time. Its recall mode blurs excerpts until you tap.
- RemNote users report that editing a card breaks its link back to the PDF location, and that large PDFs struggle.
- So the winning pattern is: **capture once, from the text, and keep the card tied to where it came from.**

**What this means for Origami**
- Cards are made from a highlight in one or two clicks, never in a separate app.
- Every card remembers its source passage. During review you can tap "Show in book".
- FSRS scheduling under the hood, with a simple two-button review by default.
- **Origami's unique edge: voices.** Cards can be read aloud by the user's own local voices, including hands-free "listen and recall" review. Neither Quizlet nor Anki has studio-quality local voices.
- Everything free and offline. No paywall for core study modes. That is a story students will share.

### 1.3 The AI paradox

- **People want help with organising.** Smart Connections, an Obsidian plugin that finds related notes using a small local embedding model, is popular for exactly this.
- **But AI that acts on its own is distrusted.** Auto-tagging, auto-filing and auto-summaries that rewrite your notes break the feeling that the notes are yours. Some users argue that writing your own notes is how you think. AI that skips that step removes the value.
- **Privacy.** Users worry about notes being uploaded and stored in the cloud. Local-first apps such as Reor, NoteWorthy and Notie market "on device" as the main feature.
- **Local has costs too.** It needs a capable device, the first index takes minutes, and very short notes embed poorly. Smart Connections' licence change in early 2026 also drew community anger, a reminder that trust is fragile.

**Design rules for Origami's AI**
1. **Suggest, never act.** The user makes every link. The AI never creates, moves, renames, tags or rewrites anything on its own. The one exception is "Link for me", which the user starts on purpose and which always ends on a review summary the user confirms (see 6.3).
2. **Explain every suggestion.** Show the two passages side by side and say why they match.
3. **Always there, never in the way.** The Connections panel always shows related notes for the open note. Nothing ever appears anywhere else: no pop-ups, toasts, banners or marks in the text.
4. **Best first.** The panel ranks related items by strength and shows the strongest ones first, with "Show more" for the rest.
5. **Learn from "no".** Dismissing a pair hides it forever. "Never for this note" and "never for this subject" exist.
6. **Local and visible.** A small chip says "On this computer". There are no network calls in any AI path.
7. **One off switch.** Settings → Work → "AI suggestions": on or off. Off empties the Related section and stops indexing. Locked vaults are never indexed.

---

## 2. Structure: how Work Mode relates to Read Mode

| | Read Mode | Work Mode |
|---|---|---|
| Purpose | Relax, immerse | Focus, capture, remember |
| Home | Library (grid, list or 3D room) | Today desk |
| Background | Living scenes, 3D library, ambient motion | The same scene, blurred and dimmed, with motion paused (or the planned 3D desk scene) |
| Density | Generous, one thing at a time | Three columns, more information |
| Main surface | The book | The note editor, with a source beside it |
| Shared | Books, highlights, notes, voices, vaults, settings | Same data, no copies |

The key decision: **Read and Work are two views of one library, not two apps.** A highlight made while reading is already in Work Mode. A card made in Work Mode shows in the book as a small marker.

---

## 3. Layout

### 3.1 The three columns

```
+-----------------+--------------------------------------+---------------------+
| SIDEBAR (240px) |  EDITOR / SOURCE (flexible)           |  CONNECTIONS (320px)|
|                 |                                      |                     |
| [Read | Work]   |  Breadcrumb: Biology > Cells          | [Links][Cards][Map] |
|                 |                                      |                     |
| Today           |  # Cell membranes                    |  Linked here (3)    |
| Inbox  (12)     |                                      |   • Osmosis         |
| Study  (24 due) |  The membrane is a lipid bilayer ... |   • Lecture 4 PDF   |
|                 |  > "quoted highlight" (Campbell p.82)|                     |
| SUBJECTS        |                                      |  Related (5)        |
|  ● Biology      |  [Card] What is the bilayer made of? |   ◌ Diffusion       |
|    Cells        |                                      |     "both mention   |
|    Genetics     |                                      |      concentration" |
|  ● French B2    |                                      |     [Link] [Hide]   |
|  ● Novel ideas  |                                      |                     |
|                 |                                      |   ◌ Campbell, ch. 7 |
| SOURCES         |                                      |  Mentioned (1)      |
|  Books          |                                      |  [Link for me…]     |
|  Documents      |                                      |                     |
|                 |                                      |  On this computer ● |
+-----------------+--------------------------------------+---------------------+
```

**Left: the sidebar ("Desk")**
- **Read | Work** switch at the top. It is always in the same place in both modes.
- **Today:** the home page.
- **Inbox:** every highlight and quick note not yet sorted into a subject. This is where reading flows into work.
- **Study:** cards due today, shown as a gentle count, never red.
- **Subjects:** coloured notebooks, at most two levels deep. Folders deeper than that are where people get lost.
- **Sources:** Books (the existing library) and Documents (imported PDF, Word and other files).
- **Vaults:** a locked vault appears as a single locked row, the same as in the library.

**Centre: the editor and source**
- One note at a time, at a comfortable reading width with the reader's typography.
- **Split view:** open a book or PDF on the left half and the note on the right half. This is the most important study layout: read the source, write beside it, drag quotes across.
- Tabs are optional and off by default. Back and forward buttons cover most needs.

**Right: the Connections panel (collapsible)**
- **Links tab:**
  - Backlinks ("Linked here").
  - AI suggestions as ghost cards with their reasons.
  - "From your library": books and passages related to this note.
- **Cards tab:** the cards made from this note or source, with an "Add card" button and "Study these now".
- **Map tab:** a small neighbourhood map, this note plus one or two hops, which you can click to navigate. It is not the whole universe.
- **Outline:** a heading list, shown as a small header above the tabs.

### 3.2 Why not a big graph or deep folders?
- **Graph:** research shows graphs are loved as eye candy and rarely used to navigate. A local map inside the panel gives the "wow" without being the main way to move around. A full "Constellation" view can come later as a premium visual, like the 3D library.
- **Folders:** deep trees create filing anxiety. Subjects plus links plus search cover nearly everything.
- **The recommendation:** shallow subjects for "where it lives", links for "what it relates to", search for everything else.

### 3.3 What makes it feel friendly and premium
- **The same craft as Read Mode:** the reader's fonts, paper surfaces and texture, soft shadows, and the existing scene behind glass panels.
- **Calm motion:**
  - Notes slide in like pages.
  - A card flips like the book animation.
  - An accepted suggestion "threads" in with a short line animation in the Map.
- **Warm empty states instead of blank pages:** "Your inbox is clear. Go read something nice."
- **Quiet numbers:** due counts are soft badges with no guilt streaks. Achievements can celebrate, as in the achievement design.
- **Keyboard first, but not required:**
  - Ctrl+K command palette.
  - `[[` to link.
  - Ctrl+Shift+C to make a card from a selection.
  - Everything is also reachable by mouse.
- **Tablet later:** the columns collapse to one, with the sidebar and Connections as slide-over sheets.

---

## 4. Switching between Read and Work

**The control**
- A two-option segmented switch, **Read | Work**, at the top of the sidebar or header in both modes.
- Shortcut: Ctrl+Shift+W. The current mode is remembered per session.

**What changes**
- Layout: one column becomes three.
- The background blurs and dims, and its motion pauses. Read Mode is "the room"; Work Mode is "sitting down at the desk in the room". This fits the planned 3D desk scene: when it exists, Work Mode uses the desk.
- The accent colour shifts slightly towards a cooler "ink" tone. Fonts and surfaces stay the same, so it still feels like one app.

**Context travels with you. This prevents most of the overload:**
- **Switch while reading a book:** Work Mode opens a split with that book at the same page and its notes beside it.
- **Switch on the library:** Work Mode opens on Today.
- **Switch back to Read:** you return to the exact page you left. Nothing is lost.

**Prevent overload**
- **Today shows only three things:**
  - "Continue: [last note]".
  - "[N] new highlights to sort".
  - "[N] cards ready (about 6 min)".
- Advanced panels (Map, Outline) stay folded until used once.
- Read Mode never shows Work features beyond the highlight toolbar's "Card" button and a tiny card marker. Readers who never want to study never see study noise.
- **First visit:** a three-step welcome ("Highlights land in your Inbox. Turn any sentence into a card. Your notes stay on this computer."), then it is gone.

---

## 5. Study Cards: how they work with the text

### 5.1 From a book or document (the main path)
1. Select text in Read Mode, or in a source opened in Work Mode.
2. The existing selection toolbar gains a **Card** button, next to Highlight, Note and Read aloud.
3. A small composer appears under the selection, already filled in:
   - **Fill in the blank (default):** the sentence is shown and you click a word to hide it. A likely key term is pre-selected using simple rules (capitalised, rare or bold words), and the local AI can do this later.
   - **Question and answer:** the front is empty with a placeholder ("What is ...?"); the back is the selected text.
   - **Term and meaning:** made when the selection looks like "X is Y" or "X: Y".
   - **Translate:** for language learners. Front in the book's language, back in the reader's language, using the translator tool that already exists.
4. Press Enter. The card is saved with a **source anchor**: book, paragraph id, start, end and quote. This is the same anchor the existing `Annotation` type already uses, so cards are a new annotation kind and need no new location system.
5. The text gets a faint card marker in the margin. Hovering it shows the card; clicking it reviews that one card.

### 5.2 From notes
- **Select text in a note → Card.** This is the same composer.
- **Inline syntax for fast typists:**
  - `Question :: Answer` makes a question and answer card.
  - `==hidden words==` inside a line marked as a card makes a fill-in-the-blank card.
  - The editor shows these as a soft card chip, not raw syntax.
- Cards made from notes stay linked: editing the note line offers "Update the card too?" This fixes the RemNote complaint where editing breaks the link.

### 5.3 Where cards live
- There are no separate "decks" to manage. A card belongs to its note or source, and the note belongs to a subject.
- Study scopes are automatic: all due cards, one subject, one book, one note, or "cards from today's reading".
- Custom study sets are a Future feature, for exam prep.

### 5.4 Reviewing
- **Engine:** the FSRS scheduler. There are open implementations to evaluate, such as fsrs-rs for the Rust side. Check its licence before adopting it, as with every dependency.
- **Two buttons by default, "Forgot" and "Got it".** Advanced settings add "Hard" and "Easy".
- **The card shows its context:**
  - After answering, the source sentence and a "Show in book" link.
  - Clicking it opens Read Mode at that paragraph with the passage highlighted, and then returns you to review.
- **Listen mode:**
  - Your chosen Origami voice reads the front, waits a few seconds for you to recall, then reads the answer.
  - Works hands-free, for walks or cooking.
  - Audio is generated locally and cached per card.
- **Quick session sizes** of 5, 10 and 20 minutes, rather than "184 cards due".
- **No guilt:**
  - Missed days spread the backlog gently instead of producing one giant pile.
  - No red numbers, no streak shaming.
  - Achievements can reward gentle consistency.

### 5.5 Optional AI help for cards (later in the first release, or right after)
- "Suggest cards" on a highlight or note section: a local language model drafts one to three cards.
- Each draft has Keep, Edit and Discard buttons. Nothing is saved automatically.

---

## 6. AI Subject Linking: magical but controllable

### 6.1 What runs locally
| Job | Model type | Where it runs | When |
|---|---|---|---|
| Find related notes, highlights and book passages | `ibm-granite/granite-embedding-97m-multilingual-r2` (Apache-2.0, see 6.1.1) | CPU by default, GPU optional | In the background when idle, in small batches |
| Find unlinked mentions (panel only) | No model: exact and fuzzy matching of note titles | CPU | When a note opens or typing pauses |
| Draft cards, summarise a chapter, "ask my library" | Small local language model, an optional download (check the licence) | GPU | Only on click |

#### 6.1.1 Chosen embedding model (checked 2026-10-16)

**Default: IBM Granite Embedding 97M Multilingual R2** (`ibm-granite/granite-embedding-97m-multilingual-r2`, released May 2026)
- **Licence:** Apache-2.0. Commercial use and redistribution are allowed. We keep the licence text and any NOTICE in `docs/licenses`, and the third-party notices say the model is Apache-2.0, not PolyForm. This is the same arrangement as Qwen3-TTS, so it does not clash with PolyForm Strict or APP-LICENSE.md.
- **Size:** 97M parameters. IBM ships a quantised ONNX file of about 98 MB, plus OpenVINO weights. It needs a few hundred MB of RAM while indexing, and fits any 64-bit PC from the last decade and later tablets.
- **Languages:** trained on 200+ languages, with retrieval tuning for 52, including English and French.
- **Output:** 384-number vectors, so the index stays small (about 1.5 KB per chunk).
- **Context:** 32K tokens; we still chunk by paragraph.
- **Ease of use:** no query or passage prefixes are needed.
- **Quality:** IBM reports 60.3 on MTEB multilingual retrieval against 50.9 for multilingual-e5-small, with long-text scores far ahead. These are the vendor's numbers; we will confirm on a test set of English and French notes before shipping.

**Runtime:** ONNX Runtime (MIT) through the Rust `ort` crate, plus Hugging Face `tokenizers` (Apache-2.0).
- It runs inside the app process, with no Python worker and no GPU by default, so it cannot clash with speech or covers.
- DirectML (Windows) or CUDA and ROCm can be added later as an option.
- It also runs on ARM, which matters for a tablet version.

**Fallback: `intfloat/multilingual-e5-small`** (MIT, 118M parameters, 384 dimensions, 90+ languages, on the market since 2023).
- Use it if Granite R2 shows problems in testing; it is the most proven small multilingual model.
- It needs "query: " and "passage: " prefixes.
- Its vectors are not interchangeable with Granite's, so switching models means re-indexing. Store the model id with the index.

**Both IBM models are offered** in Settings → Work → "Connections model", like the speech models:
| Option | Model | Download | Best for |
|---|---|---|---|
| Standard (default) | `granite-embedding-97m-multilingual-r2` | ~98 MB (quantised ONNX) | Every PC and future tablets, CPU only |
| Precise | `granite-embedding-311m-multilingual-r2` | ~300 MB quantised (larger unquantised) | Strong PCs; GPU optional. 65.2 on multilingual retrieval, Matryoshka vectors cut to 384 to keep the index the same size |

Switching re-indexes in the background (the old index keeps working until the new one is ready). Both are Apache-2.0 and need the same licence notice.

**Rejected:**
- **EmbeddingGemma-300m:** Gemma Terms of Use and Prohibited Use Policy. These are extra use restrictions we would have to pass on to users, and a gated download.
- **jina-embeddings-v3:** non-commercial licence (CC BY-NC).
- **Qwen3-Embedding-0.6B:** Apache-2.0 and excellent, but six times larger and slow on CPU; it only fits as a GPU option.

**GPU care:** speech and cover generation already compete for the GPU. That contention caused the AMD Linux crash work. So:
- Embeddings run on CPU.
- Indexing pauses while Play or cover generation runs.
- The language model loads only on demand and unloads after use.

**Storage:**
- Vectors live in the same SQLite store, through a vector extension such as sqlite-vec or a simple table with brute-force search (fast enough for tens of thousands of chunks).
- Each vault's index is encrypted with the vault key and exists only while the vault is unlocked.

### 6.2 The Connections panel: always showing related notes
The right panel is the only place AI results appear. It is always visible in Work Mode, unless the user collapses it, and updates quietly when another note opens, or a few seconds after the user stops typing. It has three sections:

1. **Linked here:** links the user already made, both ways. No AI is involved.
2. **Related:** notes, highlights, book passages and documents that the local model finds similar, best first. Each row shows:
   - The title and where it is (subject, or book and chapter).
   - A one-line reason, e.g. "Both talk about concentration gradients". Expanding the row shows the two matching snippets side by side.
   - Buttons: **Link** (adds a `[[link]]` in a "Related" section at the end of the note, or at the cursor), **Open** (beside the note, in split view) and **Hide** (never suggest this pair again).
3. **Mentioned, not linked:** notes whose title appears in the text without a link, e.g. "Osmosis is mentioned twice". This is plain text matching with no model. Clicking **Link** turns those mentions into links; it does not mark them in the editor.

At the bottom of the panel:
- **Link for me…** (see 6.3).
- A small "On this computer" chip.

**What never happens:**
- No pop-ups, toasts, banners or notifications.
- No underlines, ghost text or marks inside the editor.
- No link, note, tag or folder created without the user's click and confirmation.
- No "AI reorganised your notes".
- No AI results in Read Mode.

### 6.3 "Link for me": automatic linking with a review step
For users who want the AI to do the linking, the work is done in one batch that they always check first.

1. The user clicks **Link for me…** in the panel and picks a scope: **This note**, **This subject** or **All my notes**.
2. The AI prepares the proposed links in the background. A progress bar appears in the panel only.
3. A **review summary** opens. This is a dialog the user asked for, not a pop-up. It shows:
   - A header line, e.g. "24 links across 9 notes".
   - The proposed links grouped by note. Each has a checkbox (ticked by default), the reason, an expandable pair of snippets, and where the link will go.
   - A **strength filter** (Strong only / Strong and likely / Everything) that unticks the weaker links in one move.
   - **Untick all** and **Tick all**.
4. The user unticks anything unwanted, then presses **Link 18**. The button always shows the live count.
5. Every link from that batch is tagged together, so **Undo this batch** appears in the panel and in Settings → Work → History. Unticked links count as "Hide" and are not proposed again.

It does not:
- Run on a schedule or by itself.
- Change any note text other than adding links in each note's "Related" section.
- Touch vault notes unless the vault is unlocked and its scope was chosen.

### 6.4 The "magic" moments, kept small
- Linking animates a thread between the two notes in the Map tab.
- **Related** surfaces a highlight made months ago in another book. This is the moment people screenshot.

---

## 7. Feature lists

### 7.1 Minimum viable Work Mode (first release)

**Shell**
- Read | Work switch with context hand-off, and the Today desk.
- A three-column layout with collapsible side columns, and a split source and note view.
- Subjects (two levels), Inbox, Sources (Books and Documents).
- Ctrl+K quick switcher and full-text search across notes, highlights and book text (SQLite FTS5).

**Notes**
- Rich-text editor that saves Markdown underneath: headings, lists, checkboxes, quotes, code, tables, images and links.
- `[[note links]]` with autocomplete; links to a book passage via "Copy link to passage" in Read Mode.
- Dragging a highlight into a note pastes a quote block with a live link back to the source.
- Backlinks, autosave, and note history (last 50 versions).
- Vault support: notes in a vault are encrypted like books.

**Documents**
- Import PDF (with its text layer) and EPUB through the existing reader.
- Import Word (.docx) as an editable note or as a read-only source (needs a .docx-to-HTML library; check the licence).
- Import Markdown, plain text and HTML.
- Highlights and notes on all of these work the same as on books.

**Study Cards**
- Card from selection in Read Mode and in Work Mode.
- Four types: fill in the blank, question and answer, term and meaning, translate.
- Inline `::` syntax in notes.
- Source anchors with "Show in book".
- FSRS review with two buttons, quick session sizes, and study scopes by subject, book or note.
- Listen mode with Origami voices.

**AI (local, opt-out)**
- The Connections panel always shows Linked here, Related (with reasons) and Mentioned, not linked.
- **Link for me…** with the review summary, untick, confirm and batch undo.
- A settings switch to turn AI suggestions off, "Hide" memory, and indexing that pauses during speech and cover generation.

**Ownership**
- Export everything to a folder of Markdown files (one per note, with links kept) plus a CSV of cards.
- Export a subject as an Anki-compatible deck (CSV import format first, `.apkg` later).
- Import Markdown folders, which covers Obsidian vaults.

**Languages:** English and French strings from day one.

### 7.2 Future features
- **Voice:**
  - **Audio notes:** record from the microphone and transcribe with a local speech-to-text model; the audio stays attached.
  - **Read my notes aloud** with Origami voices, and "podcast" a subject for listening on the go.
- **Visual:**
  - **Constellation view:** a full, beautiful graph as a premium visual theme, alongside the 3D library.
  - **Mind maps** built from headings and links (MarginNote-style), editable.
  - **Image occlusion cards** on diagrams in PDFs and images.
- **Documents:**
  - **OCR** for scanned PDFs and photos of whiteboards.
  - **Live folder mirror:** two-way sync with a folder of Markdown files, for people who want Obsidian and Origami side by side.
- **AI:**
  - **Ask my library:** a local question-and-answer tool over your books and notes, always showing citations.
  - **AI card drafts and chapter summaries,** if they are not in the first release.
- **Study:**
  - **Practice tests:** generate a short quiz from a subject's cards (multiple choice, typed answers).
  - **Custom study sets and exam countdown:** "Exam on 3 Dec": the scheduler spreads reviews before the date.
- **Organisation:**
  - **Templates:** lecture notes, book summary, vocabulary list, Cornell notes.
  - **Tasks and a calendar-light** reading and study plan on Today.
- **Sharing:**
  - **Card set sharing** as a file. Never a cloud: an `.origami-cards` file you send yourself.
  - **Sync between your own devices** over the local network or a user-chosen folder (Syncthing-style). Never Origami servers.
- **Platform:**
  - **Tablet layout** with pencil highlighting.
  - **3D desk scene** for Work Mode, day and night.

### 7.3 Achievements tie-in (from the achievement design)
Possible cards:
- "First card made".
- "100 cards remembered".
- "Linked a book to a note".
- "Studied while it snowed" (December).
- "Inbox zero".

---

## 8. Data model sketch

```ts
type Subject = { id; name; color; parent?: string; vault?: string; order: number };
type Note = { id; subjectId?: string; title; body: string /* Markdown */; created; updated; vault?: string };
type Link = { from: string; to: string /* note id or "book:<id>#<paragraphId>" */; origin: "typed" | "suggestion" | "auto"; batch?: string /* "Link for me" run, for undo */ };
type Card = {
  id; kind: "cloze" | "qa" | "term" | "translate";
  front: string; back: string;
  source?: { bookId: string; paragraphId: string; start: number; end: number; quote: string };
  noteId?: string; subjectId?: string;
  fsrs: { due: number; stability: number; difficulty: number; reps: number; lapses: number; state: number };
  created: number; suspended?: boolean; vault?: string;
};
type Review = { cardId; at: number; grade: 1 | 2 | 3 | 4; elapsedDays: number };
type Hidden = { a: string; b: string };   // pairs hidden or unticked, never proposed again
```

- Cards reuse the `Annotation` anchor fields: `bookId`, `paragraphId`, `start`, `end`, `quote`.
- Vault items use the existing seal and open path, with the item id as associated data.
- Documents are books with `format: "pdf" | "docx" | ...`, so the library, covers, vaults and speech all work for free.

---

## 9. Suggested build order

1. **Foundations:** the Read | Work switch, the three-column shell, Today, subjects, a plain note editor, search and Markdown export.
2. **Reading into work:** the Inbox, dragging highlights into notes, passage links, split view, and Word import.
3. **Study Cards:** card from selection, the four types, FSRS review, Show in book, then Listen mode.
4. **Local AI:** Mentioned, not linked (no model), then Related in the Connections panel, then Link for me with its review summary and batch undo.
5. **Polish:** the Map tab, animations, achievements, French strings, and Anki export.

Each step is shippable on its own, and steps 1 to 3 already beat Quizlet's free tier for a student.

## 10. Risks
- **Scope creep into "Notion again".** Keep a written "not doing" list: databases, plugins, web clipper, cloud sync.
- **GPU contention** with speech and covers: use the scheduling rules in 6.1.
- **Editor complexity:** use a proven editor framework (ProseMirror-based, for example TipTap or Milkdown; check the licences) rather than a custom one.
- **Licences:** every new model and library goes through the same review as `docs/LICENSING-REVIEW-2026-10-13.md`.

## Sources
- Obsidian forum: [A maintainable second brain for someone with ADHD](https://forum.obsidian.md/t/a-maintainable-second-braind-for-someone-with-adhd/36106/14), [Sophisticated procrastination](https://forum.obsidian.md/t/sophisticated-procrastination/55064), [Usage of Graph View](https://forum.obsidian.md/t/usage-of-graph-view/19692), [What's the point of the graph view?](https://forum.obsidian.md/t/whats-the-point-of-the-graph-view-how-are-you-using-it/71316), [Principles for metadata minimalism](https://forum.obsidian.md/t/principles-for-metadata-minimalism/11379/5)
- [Android Authority: second brain apps](https://androidauthority.com/second-brain-apps-alternatives-3695946)
- [In defense of Obsidian's graph view (Eleanor Konik)](https://www.eleanorkonik.com/its-not-just-a-pretty-gimmick-in-defense-of-obsidians-graph-view), [Interactive graph view article](https://digitalbiztalk.com/article/beyond-visualization-an-interactive-graph-view-for-obsidian), [Graph view is beautiful and almost useless](https://codeculture.store/blogs/developer-culture/obsidian-graph-view-useful)
- [Obsidian plugin chaos (Yaps, vendor)](https://www.yaps.ai/blog/obsidian-plugin-chaos.md)
- Notion: [G2 reviews](https://www.g2.com/products/notion), [Power user complaints 2026 (unstar)](https://unstar.app/blog/productivity-app-reviews-what-power-users-complain-about-2026), [Trustpilot](https://www.trustpilot.com/review/notion.so?page=2), [Notion pricing (Toolradar)](https://toolradar.com/tools/notion/pricing), [Sacra: AI bundling](https://sacra.com/chat/h/d8b2f729-4ad9-44e8-b155-5fccf72ba492/)
- Quizlet: [Common Sense Media](https://www.commonsensemedia.org/website-reviews/quizlet), [RemNote: Quizlet alternatives (vendor)](https://alpha.remnote.com/blog/best-quizlet-alternatives), [Spartan Shield opinion](https://spartanshield.org/33765/opinion/new-year-new-frustrations-quizlet-switches-to-payment-based-plans/), [SkillNation on Quizlet Plus](https://skillnation.in/posts/quizlet-plus-for-students/), [Flashcard apps ranked 2026 (unstar)](https://unstar.app/blog/quizlet-anki-brainscape-knowt-studysmarter-flashcard-study-apps-ranked-2026)
- Anki: [Nibble Anki review (vendor)](https://nibble-app.com/blog/anki-review), [RemNote vs Anki (Mindomax)](https://www.mindomax.com/remnote-vs-anki), [fsrs4anki overview](https://best-of-web.builder.io/library/open-spaced-repetition/fsrs4anki)
- MarginNote and RemNote: [MarginNote 4 App Store](https://apps.apple.com/us/app/marginnote-4-ai-notes-mindmap/id1531657269), [RemNote forum: PDF incremental reading](https://forum.remnote.io/t/pdf-editor-incremental-reading-anki-add-on-as-a-case-study/2905), [RemNote forum: annotation support](https://forum.remnote.io/t/pdf-document-annotation-support/1151)
- Local AI: [Smart Connections review (PromptQuorum)](https://www.promptquorum.com/power-local-llm/smart-connections-review), [Smart Connections + MCP](https://blog.krzywil.people.aws.dev/posts/obsidian-smart-connections-mcp), [Reor](https://stackshare.io/reor), [NoteWorthy](https://toolradar.com/tools/noteworthy), [Analytics India Magazine on AI note-taking](https://analyticsindiamag.com/ai-features/generative-ai-is-complicating-the-process-of-note-taking), [TechGenyz on AI note apps](https://techgenyz.com/ai-note-apps-smart-systems/)

---

## 11. Professional roadmap (17 October 2026)

Goal: Work Mode for professionals as well as students, still local and offline. Done in this round: a Work-sources filter (leisure books stay out unless marked "Use in Work mode" or imported in Work), professional light and dark themes, eight highlight colours and coloured underlines in four styles, and a right-click menu (clipboard, formatting, colours, turn into, insert, table editing, cards, links).

**New document kinds.** Notes stay the core; three new kinds sit beside them in subjects, link with [[ ]] and appear in Related:
| Kind | What | Library (licence) | Notes |
|---|---|---|---|
| Sheet | Spreadsheet: formulas, formatting, sort and filter, freeze panes, conditional formatting, data validation, multiple sheets | Univer core (Apache-2.0); SheetJS Community (Apache-2.0) for .xlsx and .csv import and export | Avoid HyperFormula (GPL-3.0). Univer's charts, pivot tables and its own xlsx tools are in its paid Pro tier, so charts come from ECharts and files from SheetJS. |
| Chart | Charts from a sheet range or a table in a note, as a live block | Apache ECharts (Apache-2.0) | Line, bar, area, pie, scatter, heatmap, radar, candlestick, sankey, treemap; theme-aware; export PNG and SVG. |
| Board | Whiteboard and diagrams, pen-friendly | Excalidraw (MIT); Mermaid (MIT) for text diagrams | Avoid tldraw (its licence requires a key in production). |

Plus KaTeX (MIT) for formulas in notes and cards.

**Pen and touch.** Pointer Events give pressure and tilt from Windows Ink pens and touch screens in WebView2. Ink is drawn with perfect-freehand (MIT) and stored as vector strokes:
- an ink block inside any note (write between paragraphs, annotate a pasted image or PDF page), with palm rejection (pen draws, touch scrolls);
- handwriting on study cards: answer by writing, then compare with the recognised text;
- the Schedule and checklists accept handwritten items.

**Handwriting recognition.**
- **Windows:** the built-in offline handwriting recogniser (Windows.UI.Input.Inking), many languages, nothing to download.
- **Linux and tablets:** TrOCR handwritten (Microsoft, MIT) through the ONNX Runtime already shipped for Related, one line at a time.
- **"Like IBM does":** IBM's Granite-Docling (Apache-2.0), to evaluate for turning scanned pages and photos into structured notes (headings, tables, formulas). It runs on the processor, like the Connections models.

**Plugins.** Plugins are a folder with a manifest and JavaScript, run in a sandboxed frame with no access to the app's internals or the network, talking through a small message API:
- **What a plugin can add:** slash commands, block types (rendered in the sandbox), sidebar panels, exporters and importers, themes.
- **Permissions:** declared in the manifest and approved by the reader; for example "read the open note", "write notes", "read cards".
- **Turning plugins off:** they are off for vault notes unless allowed, and one switch turns them all off. A plugin page in Settings lists, enables and removes them.
- **Ships with:** a sample plugin and the API documentation.

**Suggested order:** Sheet and Chart first (the biggest gap for professionals), then the pen (ink blocks, handwriting on cards) with Windows recognition, then Board, then plugins once the block and command APIs are stable, then TrOCR and Docling.

**Status, 17 October 2026.** Built: Sheet and Chart, Board (Excalidraw), Mermaid diagrams, KaTeX formulas, ink blocks with pressure and palm rejection, handwriting on study cards, Windows handwriting recognition, plugins with permissions and a sample, note history, templates, per-document papers, sticky notes, workspaces with vaults and export, and Plans (precise drawings with metric and imperial units, exported as SVG and DXF). Still open: TrOCR and Granite-Docling (waiting on which handwriting reading matters most), plugin block types inside notes, and plans as live note blocks. See PROGRESS.md.
