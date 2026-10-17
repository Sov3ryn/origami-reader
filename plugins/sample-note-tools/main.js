// A sample Origami plugin. It runs in a sandboxed frame: no network, no app
// internals. Everything goes through window.origami (see docs/PLUGINS.md).
const api = window.origami;
const $ = (id) => document.getElementById(id);
const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function stats(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+(\s|$)/).filter((s) => s && s.trim().length > 1).length;
  const counts = new Map();
  for (const w of words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "")).filter((w) => w.length > 4))
    counts.set(w, (counts.get(w) || 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  return { words: words.length, sentences, minutes: Math.max(1, Math.round(words.length / 230)), top };
}

// --- The panel and commands --------------------------------------------------------
async function refresh() {
  const note = await api.notes.current();
  if (!note) {
    $("title").textContent = "Open a note to see its statistics.";
    $("numbers").innerHTML = "";
    return;
  }
  const s = stats(note.text);
  $("title").textContent = note.title || "Untitled";
  $("numbers").innerHTML = `
    <div><strong>${s.words}</strong><span>words</span></div>
    <div><strong>${s.sentences}</strong><span>sentences</span></div>
    <div><strong>${s.minutes} min</strong><span>to read</span></div>
    ${s.top.length ? `<p>Frequent words: ${s.top.map(escape).join(", ")}</p>` : ""}`;
}

async function tableOfContents() {
  const note = await api.notes.current();
  if (!note) return api.ui.notify("Open a note first.");
  const d = document.createElement("div");
  d.innerHTML = note.html;
  const heads = [...d.querySelectorAll("h1, h2, h3")].map((h) => ({ level: +h.tagName[1], text: h.textContent.trim() })).filter((h) => h.text);
  if (!heads.length) return api.ui.notify("This note has no headings yet.");
  const items = heads.map((h) => `<li><p>${"  ".repeat(h.level - 1)}${escape(h.text)}</p></li>`).join("");
  await api.editor.insert(`<h3>Contents</h3><ul>${items}</ul>`);
}

async function insertDate() {
  const today = new Date().toISOString().slice(0, 10);
  await api.editor.insert(`<p>@${today}</p>`);
}

function panel() {
  document.body.innerHTML = `
    <main>
      <h1 id="title">…</h1>
      <section id="numbers" class="numbers"></section>
      <div class="actions">
        <button id="refresh">Refresh</button>
        <button id="toc">Insert contents</button>
        <button id="date">Insert today's date</button>
      </div>
    </main>`;
  $("refresh").onclick = () => refresh();
  $("toc").onclick = () => tableOfContents();
  $("date").onclick = () => insertDate();
  api.commands.register("stats", "Note statistics", async () => {
    const note = await api.notes.current();
    if (!note) return api.ui.notify("Open a note first.");
    const s = stats(note.text);
    api.ui.notify(`${s.words} words, ${s.sentences} sentences, about ${s.minutes} min to read.`);
  });
  api.commands.register("toc", "Insert a table of contents", tableOfContents);
  api.commands.register("date", "Insert today's date", insertDate);
  api.blocks.register("timer", "Focus timer");
  api.notes.onOpen(() => refresh());
  refresh();
}

// --- A block in a note: a focus timer ------------------------------------------------
// A 25-minute timer; finished sessions are saved with the block.
async function focusTimer() {
  const saved = (await api.block.get()) || { sessions: 0, minutes: 25 };
  let left = saved.minutes * 60;
  let running = null;
  document.body.innerHTML = `
    <main class="timer">
      <div id="clock" class="clock"></div>
      <div class="actions">
        <button id="go">Start</button>
        <button id="reset">Reset</button>
        <select id="len">${[15, 25, 45, 50].map((m) => `<option value="${m}" ${m === saved.minutes ? "selected" : ""}>${m} min</option>`).join("")}</select>
      </div>
      <p id="count"></p>
    </main>`;
  const show = () => {
    const m = Math.floor(left / 60);
    const s = left % 60;
    $("clock").textContent = `${m}:${String(s).padStart(2, "0")}`;
    $("count").textContent = saved.sessions ? `${saved.sessions} session${saved.sessions === 1 ? "" : "s"} finished` : "No session finished yet";
    $("go").textContent = running ? "Pause" : "Start";
  };
  $("go").onclick = () => {
    if (running) {
      clearInterval(running);
      running = null;
    } else {
      running = setInterval(async () => {
        left -= 1;
        if (left <= 0) {
          clearInterval(running);
          running = null;
          saved.sessions += 1;
          left = saved.minutes * 60;
          await api.block.save(saved);
          api.ui.notify("Focus session finished. Take a short break.");
        }
        show();
      }, 1000);
    }
    show();
  };
  $("reset").onclick = () => {
    left = saved.minutes * 60;
    show();
  };
  $("len").onchange = async (e) => {
    saved.minutes = Number(e.target.value);
    left = saved.minutes * 60;
    await api.block.save(saved);
    show();
  };
  show();
  // As tall as the timer, so the note shows it without a scrollbar.
  api.block.resize(document.documentElement.scrollHeight + 2);
}

// In a note this plugin draws its block; elsewhere it is the panel.
if (api.block) focusTimer();
else panel();
