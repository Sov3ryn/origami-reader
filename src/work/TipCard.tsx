import { useEffect, useRef, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { t } from "../i18n";
import { Keys } from "./HoverTips";
import { shortcuts } from "./shortcuts";
import "./tips.css";

type Tip = { id: string; text: string; keys?: string };
const tips = (): Tip[] => [
  { id: "slash", text: t("Type / on an empty line to insert headings, tables, callouts, charts and more."), keys: shortcuts.blocks },
  { id: "link", text: t("Type [[ to link another note. The other note lists the link too."), keys: shortcuts.link },
  { id: "card", text: t("Select text and press this to turn it into a study card, in notes and while reading."), keys: shortcuts.card },
  { id: "card-line", text: t("Write a line like “Mitochondria :: the cell’s power plant” and it becomes a study card.") },
  { id: "search", text: t("Search notes, sheets, books and actions from anywhere."), keys: shortcuts.search },
  { id: "menu", text: t("Right-click in a note for colours, tables, turning blocks into callouts and more.") },
  { id: "dates", text: t("Add a date like @2026-10-20 to a checklist item and it appears on the Schedule page.") },
  { id: "drag", text: t("Open a book beside a note from Sources, then drag a paragraph in to quote it with a link back.") },
  { id: "mode", text: t("Switch between Read and Work without losing your place."), keys: shortcuts.mode },
  { id: "study", text: t("In a study session, Space shows the answer, then 1 or 2 answers."), keys: `${shortcuts.showAnswer} / ${shortcuts.forgot} / ${shortcuts.gotIt}` },
  { id: "listen", text: t("Listen mode reads your cards aloud with your Origami voice, even hands-free.") },
  { id: "table-chart", text: t("Right-click a table in a note and choose Make a chart from this table.") },
  { id: "live-chart", text: t("Charts made from a sheet redraw when you change its numbers.") },
  { id: "excel", text: t("Import an Excel file with the import button: formulas, styles and every tab come along.") },
  { id: "preview", text: t("Hover a link to another note to preview it without leaving the page.") },
  { id: "pin", text: t("Pin the notes you use most; they stay at the top of the sidebar.") },
  { id: "lfm", text: t("Link for me proposes links in one batch you review first, and can undo in one click.") },
  { id: "sources", text: t("Choose “Use in Work mode” on a book's menu to quote and study it here.") },
  { id: "sheet", text: t("Make a new spreadsheet from anywhere in Work mode."), keys: shortcuts.newSheet },
  { id: "themes", text: t("The professional themes in the ··· menu give Work a plain, quiet look.") },
  { id: "day", text: t("Switch the scene between day and night."), keys: shortcuts.dayNight },
  { id: "export", text: t("Export all saves notes as HTML and Markdown, sheets as Excel files and cards for Anki.") },
];

const KEY = "origami-work-tips";
type Memory = { seen: string[]; last: number; day: string; today: number };
const read = (): Memory => {
  try {
    return { seen: [], last: 0, day: "", today: 0, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { seen: [], last: 0, day: "", today: 0 };
  }
};
const write = (m: Memory) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // Tips still work for this session.
  }
};
const FIRST_DELAY = 75_000;
const BETWEEN = 25 * 60_000;
const PER_DAY = 3;

// "Did you know?": now and then, in the bottom-right corner. Never while
// typing or studying, at most three a day, each tip once before any repeats.
export function TipCard({ enabled, quiet, onNever }: { enabled: boolean; quiet: boolean; onNever: () => void }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const typed = useRef(0);
  const quietRef = useRef(quiet);
  quietRef.current = quiet;

  function pick(): Tip | null {
    const list = tips();
    const mem = read();
    const fresh = list.filter((x) => !mem.seen.includes(x.id));
    const pool = fresh.length ? fresh : list;
    const next = pool[Math.floor(Math.random() * pool.length)];
    const day = new Date().toDateString();
    write({
      seen: fresh.length ? [...mem.seen, next.id] : [next.id],
      last: Date.now(),
      day,
      today: (mem.day === day ? mem.today : 0) + 1,
    });
    return next;
  }

  useEffect(() => {
    if (!enabled) {
      setTip(null);
      return;
    }
    const key = () => (typed.current = Date.now());
    window.addEventListener("keydown", key, true);
    const check = () => {
      const mem = read();
      const day = new Date().toDateString();
      if (mem.day === day && mem.today >= PER_DAY) return;
      if (Date.now() - mem.last < BETWEEN) return;
      if (quietRef.current || Date.now() - typed.current < 8000) return;
      setTip((old) => old ?? pick());
    };
    const first = window.setTimeout(check, FIRST_DELAY);
    const every = window.setInterval(check, 60_000);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.clearTimeout(first);
      window.clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!tip || !enabled) return null;
  return (
    <aside className="tip-card hover-tip-skip" role="status" aria-live="polite">
      <header>
        <Lightbulb size={16} />
        <strong>{t("Did you know?")}</strong>
        <button aria-label={t("Close")} onClick={() => setTip(null)}>
          <X size={14} />
        </button>
      </header>
      <p>{tip.text}</p>
      {tip.keys && <Keys keys={tip.keys} />}
      <footer>
        <button className="never" onClick={onNever}>
          {t("Never show tips again")}
        </button>
        <span className="spacer" />
        <button onClick={() => setTip(pick())}>{t("Another tip")}</button>
      </footer>
    </aside>
  );
}
