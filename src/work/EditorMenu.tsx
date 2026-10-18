import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Code,
  Copy,
  FileDown,
  GalleryVerticalEnd,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Scissors,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
} from "lucide-react";
import { t } from "../i18n";
import { calloutKinds, markColors, underlineStyles, type MarkColor, type UnderlineStyle } from "./editorExtensions";
import { dayKey } from "./schedule";
import { shortcuts } from "./shortcuts";
import { keyLabel } from "../platform";

// "Ctrl+Shift+8" shown the platform's way.
const k = (combo: string) => combo.split("+").map(keyLabel).join(keyLabel("Ctrl") === "Ctrl" ? "+" : "");
import { parseCell, type CellValue } from "./sheets/model";

// The rows of the table around the cursor, as values.
function tableRows(editor: Editor): CellValue[][] {
  const $from = editor.state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name !== "table") continue;
    const rows: CellValue[][] = [];
    node.forEach((row) => {
      const cells: CellValue[] = [];
      row.forEach((cell) => cells.push(parseCell(cell.textContent)));
      rows.push(cells);
    });
    return rows;
  }
  return [];
}

const colorLabel = (): Record<MarkColor, string> => ({
  yellow: t("Yellow"),
  green: t("Green"),
  blue: t("Blue"),
  pink: t("Pink"),
  purple: t("Purple"),
  orange: t("Orange"),
  red: t("Red"),
  gray: t("Gray"),
});
const styleLabel = (): Record<UnderlineStyle, string> => ({
  solid: t("Solid"),
  wavy: t("Wavy"),
  double: t("Double"),
  dotted: t("Dotted"),
});
const calloutLabel = (): Record<string, string> => ({
  note: t("Note callout"),
  tip: t("Tip callout"),
  important: t("Important callout"),
  warning: t("Warning callout"),
  question: t("Question callout"),
  summary: t("Summary callout"),
});

// Colour dots for highlights or underlines.
export function ColorRow({
  kind,
  editor,
  onDone,
}: {
  kind: "highlight" | "underline";
  editor: Editor;
  onDone?: () => void;
}) {
  const [style, setStyle] = useState<UnderlineStyle>(
    (editor.getAttributes("underline").style as UnderlineStyle) || "solid",
  );
  const apply = (color: MarkColor | null) => {
    const chain = editor.chain().focus();
    if (kind === "highlight") (color ? chain.setHighlight({ color }) : chain.unsetHighlight()).run();
    else (color ? chain.setMark("underline", { color, style }) : chain.unsetMark("underline")).run();
    onDone?.();
  };
  const current = editor.getAttributes(kind).color as string | undefined;
  return (
    <div className="color-row-wrap">
      <div className="color-row" role="group" aria-label={kind === "highlight" ? t("Highlight colour") : t("Underline colour")}>
        {markColors.map((c) => (
          <button
            key={c}
            className={"mark-dot " + kind}
            data-color={c}
            data-style={kind === "underline" ? style : undefined}
            aria-label={colorLabel()[c]}
            aria-pressed={editor.isActive(kind) && current === c}
            title={colorLabel()[c]}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(c)}
          >
            {kind === "underline" ? <span>A</span> : null}
          </button>
        ))}
        <button className="mark-dot none" aria-label={t("None")} title={t("None")} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(null)}>
          ∅
        </button>
      </div>
      {kind === "underline" && (
        <div className="underline-styles" role="radiogroup" aria-label={t("Underline style")}>
          {underlineStyles.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={style === s}
              data-style={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setStyle(s);
                if (editor.isActive("underline"))
                  editor.chain().focus().setMark("underline", { ...editor.getAttributes("underline"), style: s }).run();
              }}
            >
              <span>{styleLabel()[s]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Sub = "highlight" | "underline" | "turn" | "insert" | "table" | null;

// The editor's right-click menu: clipboard, formatting, colours, turning a
// block into another kind, inserting, tables, and study cards.
export function EditorMenu({
  editor,
  x,
  y,
  onClose,
  onCard,
  onLinkNote,
  onCopyMarkdown,
  onChartTable,
}: {
  editor: Editor;
  x: number;
  y: number;
  onClose: () => void;
  onCard: (text: string) => void;
  onLinkNote: (text: string) => void;
  onCopyMarkdown: () => void;
  onChartTable?: (rows: CellValue[][]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  // Submenus open to the right, or to the left when the window edge is near.
  const [flip, setFlip] = useState(false);
  const [subTop, setSubTop] = useState(0);
  const main = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const { from, to, empty } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, " ").trim();
  const inTable = editor.isActive("table");

  // Placed once, from the main column only, so opening a submenu never moves
  // the menu under the pointer. A blurred or transformed ancestor makes
  // "fixed" relative to itself, so the menu measures where it really lands.
  useLayoutEffect(() => {
    const el = ref.current;
    const col = main.current;
    if (!el || !col) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // The opening animation scales and shifts the menu; measure without it.
    el.style.animation = "none";
    const r = el.getBoundingClientRect();
    el.style.animation = "";
    const dx = r.left - x;
    const dy = r.top - y;
    const left = Math.max(8, Math.min(x, window.innerWidth - col.offsetWidth - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - col.offsetHeight - 8));
    setPlace({ left: left - dx, top: top - dy });
    setFlip(left + col.offsetWidth + 4 + 240 > window.innerWidth - 8);
  }, [x, y]);
  // A submenu starts level with its item and stays inside the window.
  useLayoutEffect(() => {
    const panel = subRef.current;
    const opener = main.current?.querySelector<HTMLElement>("button[aria-expanded='true']");
    if (!panel || !opener || !main.current) return;
    const base = main.current.getBoundingClientRect().top;
    const wanted = opener.getBoundingClientRect().top - base - 5;
    const room = window.innerHeight - 8 - (base + panel.offsetHeight);
    setSubTop(Math.max(8 - base, Math.min(wanted, room)));
  }, [sub]);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const chain = () => editor.chain().focus();
  const item = (label: string, icon: React.ReactNode, fn: () => void, opts: { disabled?: boolean; hint?: string; danger?: boolean } = {}) => (
    <button role="menuitem" className={opts.danger ? "danger" : ""} disabled={opts.disabled} onMouseDown={(e) => e.preventDefault()} onClick={run(fn)}>
      {icon}
      <span>{label}</span>
      {opts.hint && <kbd>{opts.hint}</kbd>}
    </button>
  );
  const parent = (id: Exclude<Sub, null>, label: string, icon: React.ReactNode) => (
    <button
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={sub === id}
      className={sub === id ? "open" : ""}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setSub(id)}
      onClick={() => setSub(sub === id ? null : id)}
    >
      {icon}
      <span>{label}</span>
      <ChevronRight size={14} className="sub-chevron" />
    </button>
  );

  return (
    <div ref={ref} className={"editor-menu" + (flip ? " flip" : "")} role="menu" style={place} onContextMenu={(e) => e.preventDefault()}>
      <div className="editor-menu-col" ref={main}>
        <div className="editor-menu-format" role="group" aria-label={t("Formatting")}>
          {(
            [
              ["bold", <Bold size={15} />, () => chain().toggleBold().run(), t("Bold"), shortcuts.bold],
              ["italic", <Italic size={15} />, () => chain().toggleItalic().run(), t("Italic"), shortcuts.italic],
              ["underline", <Underline size={15} />, () => chain().toggleUnderline().run(), t("Underline"), shortcuts.underline],
              ["strike", <Strikethrough size={15} />, () => chain().toggleStrike().run(), t("Strikethrough"), shortcuts.strike],
              ["code", <Code size={15} />, () => chain().toggleCode().run(), t("Code"), shortcuts.code],
            ] as const
          ).map(([id, icon, fn, label, keys]) => (
            <button
              key={id}
              aria-label={label}
              data-tip={label}
              data-keys={keys}
              aria-pressed={editor.isActive(id)}
              disabled={empty}
              onMouseDown={(e) => e.preventDefault()}
              onClick={fn}
            >
              {icon}
            </button>
          ))}
        </div>
        {item(t("Cut"), <Scissors size={15} />, () => document.execCommand("cut"), { disabled: empty, hint: k(shortcuts.cut) })}
        {item(t("Copy"), <Copy size={15} />, () => document.execCommand("copy"), { disabled: empty, hint: k(shortcuts.copy) })}
        {item(
          t("Paste"),
          <ClipboardPaste size={15} />,
          () =>
            void navigator.clipboard
              .readText()
              .then((s) => s && editor.chain().focus().insertContent(s, { contentType: "markdown" }).run())
              .catch(() => {}),
          { hint: k(shortcuts.paste) },
        )}
        {item(t("Copy note as Markdown"), <ClipboardCopy size={15} />, onCopyMarkdown)}
        <div className="editor-menu-sep" role="separator" />
        {parent("highlight", t("Highlight"), <span className="menu-swatch highlight" />)}
        {parent("underline", t("Underline colour"), <span className="menu-swatch underline" />)}
        {parent("turn", t("Turn into"), <Pilcrow size={15} />)}
        {parent("insert", t("Insert"), <Table2 size={15} />)}
        {inTable && parent("table", t("Table"), <Table2 size={15} />)}
        <div className="editor-menu-sep" role="separator" />
        {item(t("Make a study card"), <GalleryVerticalEnd size={15} />, () => onCard(text), { disabled: !text, hint: k(shortcuts.card) })}
        {item(t("Link as a note"), <Link2 size={15} />, () => onLinkNote(text), { disabled: !text || text.length > 120 })}
      </div>
      {sub && (
        <div className="editor-menu-col sub" role="menu" ref={subRef} style={{ top: subTop }}>
          {sub === "highlight" && <ColorRow kind="highlight" editor={editor} onDone={onClose} />}
          {sub === "underline" && <ColorRow kind="underline" editor={editor} onDone={onClose} />}
          {sub === "turn" && (
            <>
              {item(t("Text"), <Pilcrow size={15} />, () => chain().clearNodes().run())}
              {item(t("Heading 1"), <Heading1 size={15} />, () => chain().setNode("heading", { level: 1 }).run(), { hint: k(shortcuts.heading1) })}
              {item(t("Heading 2"), <Heading2 size={15} />, () => chain().setNode("heading", { level: 2 }).run(), { hint: k(shortcuts.heading) })}
              {item(t("Heading 3"), <Heading3 size={15} />, () => chain().setNode("heading", { level: 3 }).run(), { hint: k(shortcuts.heading3) })}
              {item(t("Bulleted list"), <List size={15} />, () => chain().toggleBulletList().run(), { hint: k(shortcuts.bulletList) })}
              {item(t("Numbered list"), <ListOrdered size={15} />, () => chain().toggleOrderedList().run(), { hint: k(shortcuts.orderedList) })}
              {item(t("Checklist"), <ListChecks size={15} />, () => chain().toggleTaskList().run(), { hint: k(shortcuts.taskList) })}
              {item(t("Quote"), <Quote size={15} />, () => chain().toggleBlockquote().run(), { hint: k(shortcuts.blockquote) })}
              <div className="editor-menu-sep" role="separator" />
              {calloutKinds.map((k) => (
                <button key={k} role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={run(() => chain().wrapIn("callout", { kind: k }).run())}>
                  <span className={"menu-callout " + k} />
                  <span>{calloutLabel()[k]}</span>
                </button>
              ))}
            </>
          )}
          {sub === "insert" && (
            <>
              {item(t("Table"), <Table2 size={15} />, () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
              {item(t("Divider"), <Minus size={15} />, () => chain().setHorizontalRule().run())}
              {item(t("Date"), <CalendarDays size={15} />, () => chain().insertContent("@" + dayKey(Date.now()) + " ").run())}
              {item(t("Study card"), <GalleryVerticalEnd size={15} />, () => chain().insertContent(t("Question") + " :: " + t("Answer")).run())}
              {item(t("Code"), <FileDown size={15} />, () => chain().toggleCodeBlock().run())}
            </>
          )}
          {sub === "table" && (
            <>
              {item(t("Row above"), <span className="menu-glyph">↑</span>, () => chain().addRowBefore().run())}
              {item(t("Row below"), <span className="menu-glyph">↓</span>, () => chain().addRowAfter().run())}
              {item(t("Column left"), <span className="menu-glyph">←</span>, () => chain().addColumnBefore().run())}
              {item(t("Column right"), <span className="menu-glyph">→</span>, () => chain().addColumnAfter().run())}
              {onChartTable && item(t("Make a chart from this table"), <ChartColumn size={15} />, () => onChartTable(tableRows(editor)))}
              {item(t("Header row on or off"), <span className="menu-glyph">H</span>, () => chain().toggleHeaderRow().run())}
              {item(t("Merge or split cells"), <span className="menu-glyph">⊞</span>, () => chain().mergeOrSplit().run())}
              <div className="editor-menu-sep" role="separator" />
              {item(t("Delete row"), <Trash2 size={15} />, () => chain().deleteRow().run(), { danger: true })}
              {item(t("Delete column"), <Trash2 size={15} />, () => chain().deleteColumn().run(), { danger: true })}
              {item(t("Delete table"), <Trash2 size={15} />, () => chain().deleteTable().run(), { danger: true })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
