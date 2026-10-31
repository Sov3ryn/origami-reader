import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  Globe,
  ScanText,
  DraftingCompass,
  Puzzle,
  PenLine,
  Workflow,
  Sigma,
  CircleHelp,
  Code2,
  Info,
  Lightbulb,
  ListChecks,
  Star,
  TriangleAlert,
  Underline as UnderlineIcon,
  GalleryVerticalEnd,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table2,
  Mic,
} from "lucide-react";
import { t } from "../i18n";
import { ColorRow, EditorMenu } from "./EditorMenu";
import { shortcuts } from "./shortcuts";
import { noteExtensions } from "./editorExtensions";
import { FormulaDialog } from "./FormulaDialog";
import { markdownToHtml } from "./transfer";
import { dayKey } from "./schedule";
import type { CellValue } from "./sheets/model";
import { toEmbed } from "./embeds/providers";
import type { Note } from "./types";

export const PASSAGE_MIME = "application/x-origami-passage";
export type DraggedPassage = {
  bookId: string;
  paragraphId: string;
  quote: string;
  label: string;
};

type Trigger = {
  kind: "link" | "slash";
  query: string;
  from: number;
  to: number;
  x: number;
  y: number;
};
type Choice = { id: string; label: string; hint?: string; icon?: React.ReactNode; run: () => void };
export type PreviewTarget =
  | { kind: "note"; title: string }
  | { kind: "passage"; bookId: string; paragraphId: string };
export type LinkPreview = { title: string; icon?: string; meta?: string; text: string };

// The headings of a long note, in the free space beside it. Placed from the
// Work area's own edge, so it follows resized panels, and hidden when the
// note leaves too little room.
function Outline({ editor }: { editor: Editor }) {
  const items: { level: number; text: string; pos: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim())
      items.push({ level: node.attrs.level, text: node.textContent, pos });
    return node.type.name !== "heading";
  });
  const ref = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const shown = items.length >= 3;
  useEffect(() => {
    if (!shown) return;
    const main = ref.current?.closest(".work-main");
    const page = editor.view.dom;
    if (!main) return;
    const measure = () => {
      const area = main.getBoundingClientRect();
      const text = page.getBoundingClientRect();
      const room = text.left - area.left >= 168 + 56 && !main.classList.contains("split");
      setPlace(room ? { left: area.left + 24, top: area.top + 96 } : null);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(main);
    watch.observe(page);
    window.addEventListener("resize", measure);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [editor, shown]);
  if (!shown) return null;
  return (
    <nav
      ref={ref}
      className="note-outline"
      aria-label={t("Outline")}
      style={place ? { left: place.left, top: place.top } : { visibility: "hidden" }}
    >
      <span className="note-outline-title">{t("Outline")}</span>
      {items.map((h) => (
        <button
          key={h.pos}
          data-level={h.level}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null;
            dom?.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
}

export function NoteEditor({
  note,
  revision,
  titles,
  onChange,
  onOpenNote,
  onOpenPassage,
  onCard,
  onReady,
  preview,
  onChart,
  onEmbed,
  onPlan,
  onPhoto,
  commands,
  embedsAllowed = false,
}: {
  note: Note;
  // Raised by the parent when it changed the note's HTML itself.
  revision: number;
  titles: string[];
  onChange: (noteId: string, html: string) => void;
  onOpenNote: (title: string) => void;
  onOpenPassage: (bookId: string, paragraphId: string) => void;
  onCard: (text: string) => void;
  onReady?: (editor: Editor | null) => void;
  // What a link points to, for the card shown while hovering it.
  preview?: (target: PreviewTarget) => LinkPreview | null;
  // Make a chart: from a table's rows, or open the chart builder.
  onChart?: (rows?: CellValue[][]) => void;
  // Open the embed dialog; paste a supported link to embed it directly.
  onEmbed?: () => void;
  onPlan?: () => void;
  onPhoto?: () => void;
  // Commands added by plugins, shown at the end of the / menu.
  commands?: { id: string; label: string; run: () => void }[];
  embedsAllowed?: boolean;
}) {
  const [hover, setHover] = useState<(LinkPreview & { x: number; y: number }) | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  function onHover(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest<HTMLElement>("a.note-link, a.passage-link");
    window.clearTimeout(hoverTimer.current);
    if (!a || !preview) return setHover(null);
    hoverTimer.current = window.setTimeout(() => {
      const target: PreviewTarget = a.dataset.note
        ? { kind: "note", title: a.dataset.note }
        : { kind: "passage", bookId: a.dataset.book || "", paragraphId: a.dataset.paragraph || "" };
      const p = preview(target);
      const r = a.getBoundingClientRect();
      setHover(p ? { ...p, x: r.left, y: r.bottom + 8 } : null);
    }, 320);
  }
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [colors, setColors] = useState(false);
  // The formula being written: a new one, or the one clicked at `pos`.
  const [formula, setFormula] = useState<{ latex: string; block: boolean; pos?: number } | null>(null);
  const choicesRef = useRef<Choice[]>([]);
  const activeRef = useRef(0);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ onChange, onOpenNote, onOpenPassage, onCard, embedsAllowed });
  latest.current = { onChange, onOpenNote, onOpenPassage, onCard, embedsAllowed };
  const extensions = useMemo(
    () => noteExtensions(t("Write, or type / for blocks and [[ to link a note"), true),
    [],
  );

  // The note on screen; saves always go to the note they were typed in.
  const shown = useRef({ id: note.id, revision });
  const editor = useEditor({
    extensions,
    shouldRerenderOnTransaction: true,
    content: note.html,
    editorProps: {
      attributes: { class: "note-prose", spellcheck: "true" },
      handleKeyDown(view, event) {
        // Ctrl+Shift+C: a study card from the selection.
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c") {
          const { from, to } = view.state.selection;
          const text = view.state.doc.textBetween(from, to, " ").trim();
          if (text) {
            latest.current.onCard(text);
            return true;
          }
        }
        const list = choicesRef.current;
        if (!list.length) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const n = (activeRef.current + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
          activeRef.current = n;
          setActive(n);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          list[activeRef.current]?.run();
          return true;
        }
        if (event.key === "Escape") {
          setTrigger(null);
          return true;
        }
        return false;
      },
      handleClickOn(_view, _pos, node, nodePos, event) {
        if (node.type.name === "inlineMath" || node.type.name === "blockMath") {
          setFormula({ latex: node.attrs.latex, block: node.type.name === "blockMath", pos: nodePos });
          event.preventDefault();
          return true;
        }
        if (node.type.name === "noteLink") {
          latest.current.onOpenNote(node.attrs.title);
          event.preventDefault();
          return true;
        }
        if (node.type.name === "passageLink") {
          latest.current.onOpenPassage(node.attrs.book, node.attrs.paragraph);
          event.preventDefault();
          return true;
        }
        return false;
      },
      handleDrop(view, event) {
        const raw = event.dataTransfer?.getData(PASSAGE_MIME);
        if (!raw) return false;
        event.preventDefault();
        const p = JSON.parse(raw) as DraggedPassage;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        const content = [
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: p.quote }] }] },
          {
            type: "paragraph",
            content: [
              {
                type: "passageLink",
                attrs: { book: p.bookId, paragraph: p.paragraphId, label: p.label },
              },
            ],
          },
        ];
        editorRef.current
          ?.chain()
          .focus()
          .insertContentAt(at ?? view.state.doc.content.size, content)
          .run();
        return true;
      },
      handlePaste(_view, event) {
        const data = event.clipboardData;
        if (!data || data.types.includes("text/html")) return false;
        const text = data.getData("text/plain");
        // A lone link to a known service, pasted on an empty line, becomes an
        // embed once online embeds are allowed.
        const { $from } = editorRef.current?.state.selection || {};
        if (
          latest.current.embedsAllowed &&
          !/\s/.test(text.trim()) &&
          toEmbed(text) &&
          $from?.parent.type.name === "paragraph" &&
          !$from.parent.textContent.trim()
        ) {
          editorRef.current?.chain().focus().insertContent({ type: "mediaEmbed", attrs: { url: text.trim() } }).run();
          return true;
        }
        // Markdown from chat apps and AI tools keeps its structure.
        if (!/^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>\s|```|\|.+\|)|\*\*[^*]+\*\*/m.test(text)) return false;
        editorRef.current?.commands.insertContent(markdownToHtml(text));
        return true;
      },
    },
    onUpdate({ editor }) {
      window.clearTimeout(saveTimer.current);
      const id = shown.current.id;
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = undefined;
        latest.current.onChange(id, editor.getHTML());
      }, 450);
      updateTrigger(editor);
    },
    onSelectionUpdate({ editor }) {
      updateTrigger(editor);
      updateBubble(editor);
    },
    onBlur() {
      window.setTimeout(() => setBubble(null), 150);
    },
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  useEffect(() => {
    onReady?.(editor);
    return () => onReady?.(null);
  }, [editor, onReady]);

  // Another note, or this note changed elsewhere (a link was added).
  useEffect(() => {
    if (!editor) return;
    if (shown.current.id === note.id && shown.current.revision === revision) return;
    const sameNote = shown.current.id === note.id;
    if (saveTimer.current && !sameNote) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      latest.current.onChange(shown.current.id, editor.getHTML());
    }
    window.clearTimeout(saveTimer.current);
    shown.current = { id: note.id, revision };
    const at = editor.state.selection.from;
    editor.commands.setContent(note.html, { emitUpdate: false });
    if (sameNote) editor.commands.setTextSelection(Math.min(at, editor.state.doc.content.size));
    setTrigger(null);
  }, [editor, note.id, note.html, revision]);

  // Save what is typed when the editor closes.
  useEffect(
    () => () => {
      if (saveTimer.current && editorRef.current) {
        window.clearTimeout(saveTimer.current);
        latest.current.onChange(shown.current.id, editorRef.current.getHTML());
      }
    },
    [],
  );

  function updateTrigger(e: Editor) {
    const { selection } = e.state;
    if (!selection.empty) return setTrigger(null);
    const $from = selection.$from;
    const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 80), $from.parentOffset, undefined, "￼");
    const link = /\[\[([^\]\n￼]*)$/.exec(before);
    const slash = /^\/([\p{L}\p{N}]*)$/u.exec(before);
    const m = link || slash;
    if (!m) return setTrigger(null);
    const from = selection.from - m[0].length;
    const c = e.view.coordsAtPos(selection.from);
    activeRef.current = 0;
    setActive(0);
    setTrigger({ kind: link ? "link" : "slash", query: m[1], from, to: selection.from, x: c.left, y: c.bottom });
  }
  function updateBubble(e: Editor) {
    const { from, to, empty } = e.state.selection;
    if (empty || !e.state.doc.textBetween(from, to).trim()) return setBubble(null);
    const a = e.view.coordsAtPos(from);
    const b = e.view.coordsAtPos(to);
    setBubble({ x: (a.left + b.right) / 2, y: Math.min(a.top, b.top) });
  }

  const choices: Choice[] = useMemo(() => {
    if (!editor || !trigger) return [];
    const range = { from: trigger.from, to: trigger.to };
    if (trigger.kind === "link") {
      const q = trigger.query.trim().toLowerCase();
      const found = titles
        .filter((x) => x !== note.title && x.toLowerCase().includes(q))
        .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)))
        .slice(0, 7);
      const insert = (title: string) => () => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent([{ type: "noteLink", attrs: { title } }, { type: "text", text: " " }])
          .run();
        setTrigger(null);
      };
      const list: Choice[] = found.map((x) => ({ id: x, label: x, run: insert(x) }));
      const exact = titles.some((x) => x.toLowerCase() === q);
      if (q && !exact)
        list.push({
          id: "new",
          label: trigger.query.trim(),
          hint: t("New note"),
          run: insert(trigger.query.trim()),
        });
      return list;
    }
    const block = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () => {
      fn(editor.chain().focus().deleteRange(range)).run();
      setTrigger(null);
    };
    const all: Choice[] = [
      { id: "h1", label: t("Heading 1"), icon: <Heading1 size={16} />, run: block((c) => c.setNode("heading", { level: 1 })) },
      { id: "h2", label: t("Heading 2"), icon: <Heading2 size={16} />, run: block((c) => c.setNode("heading", { level: 2 })) },
      { id: "h3", label: t("Heading 3"), icon: <Heading3 size={16} />, run: block((c) => c.setNode("heading", { level: 3 })) },
      { id: "bullets", label: t("Bulleted list"), icon: <List size={16} />, run: block((c) => c.toggleBulletList()) },
      { id: "numbers", label: t("Numbered list"), icon: <ListOrdered size={16} />, run: block((c) => c.toggleOrderedList()) },
      { id: "tasks", label: t("Checklist"), icon: <CheckSquare size={16} />, run: block((c) => c.toggleTaskList()) },
      { id: "quote", label: t("Quote"), icon: <Quote size={16} />, run: block((c) => c.toggleBlockquote()) },
      { id: "code", label: t("Code"), icon: <Code2 size={16} />, run: block((c) => c.toggleCodeBlock()) },
      {
        id: "table",
        label: t("Table"),
        icon: <Table2 size={16} />,
        run: block((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
      },
      { id: "divider", label: t("Divider"), icon: <Minus size={16} />, run: block((c) => c.setHorizontalRule()) },
      ...(
        [
          ["note", t("Note callout"), <Info size={16} />],
          ["tip", t("Tip callout"), <Lightbulb size={16} />],
          ["important", t("Important callout"), <Star size={16} />],
          ["warning", t("Warning callout"), <TriangleAlert size={16} />],
          ["question", t("Question callout"), <CircleHelp size={16} />],
          ["summary", t("Summary callout"), <ListChecks size={16} />],
        ] as const
      ).map(([kind, label, icon]) => ({
        id: "callout-" + kind,
        label,
        icon,
        run: block((c) => c.wrapIn("callout", { kind })),
      })),
      {
        id: "embed",
        label: t("Embed"),
        hint: t("video, post, map…"),
        icon: <Globe size={16} />,
        run: () => {
          editor.chain().focus().deleteRange(range).run();
          setTrigger(null);
          onEmbed?.();
        },
      },
      {
        id: "ink",
        label: t("Handwriting"),
        hint: t("write or draw with a pen"),
        icon: <PenLine size={16} />,
        run: () => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([{ type: "inkBlock", attrs: { id: crypto.randomUUID().slice(0, 8) } }, { type: "paragraph" }])
            .run();
          setTrigger(null);
        },
      },
      {
        id: "diagram",
        label: t("Diagram"),
        hint: t("flowchart, mind map, timeline…"),
        icon: <Workflow size={16} />,
        run: () => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([{ type: "diagramBlock", attrs: { code: "" } }, { type: "paragraph" }])
            .run();
          setTrigger(null);
        },
      },
      {
        id: "photo",
        label: t("Photo of handwriting"),
        hint: t("the photo, and the text read from it"),
        icon: <ScanText size={16} />,
        run: () => {
          editor.chain().focus().deleteRange(range).run();
          setTrigger(null);
          onPhoto?.();
        },
      },
      {
        id: "voice",
        label: t("Voice note"),
        hint: t("record, then get the text"),
        icon: <Mic size={16} />,
        run: () => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([{ type: "voiceNote", attrs: { id: "" } }, { type: "paragraph" }])
            .run();
          setTrigger(null);
        },
      },
      {
        id: "plan",
        label: t("Plan"),
        hint: t("a precise drawing with dimensions"),
        icon: <DraftingCompass size={16} />,
        run: () => {
          editor.chain().focus().deleteRange(range).run();
          setTrigger(null);
          onPlan?.();
        },
      },
      {
        id: "formula",
        label: t("Formula"),
        hint: t("maths and science, in LaTeX"),
        icon: <Sigma size={16} />,
        run: () => {
          editor.chain().focus().deleteRange(range).run();
          setTrigger(null);
          setFormula({ latex: "", block: true });
        },
      },
      {
        id: "chart",
        label: t("Chart"),
        hint: t("from a sheet or data"),
        icon: <ChartColumn size={16} />,
        run: () => {
          editor.chain().focus().deleteRange(range).run();
          setTrigger(null);
          onChart?.();
        },
      },
      {
        id: "date",
        label: t("Date"),
        hint: "@" + dayKey(Date.now()),
        icon: <CalendarDays size={16} />,
        run: block((c) => c.insertContent("@" + dayKey(Date.now()) + " ")),
      },
      {
        id: "card",
        label: t("Study card"),
        hint: t("question :: answer"),
        icon: <GalleryVerticalEnd size={16} />,
        run: block((c) => c.insertContent(t("Question") + " :: " + t("Answer"))),
      },
      ...(commands || []).map((cmd) => ({
        id: "plugin-" + cmd.id,
        label: cmd.label,
        hint: t("Plugin"),
        icon: <Puzzle size={16} />,
        run: () => {
          editor.chain().focus().deleteRange(range).run();
          setTrigger(null);
          cmd.run();
        },
      })),
    ];
    const q = trigger.query.toLowerCase();
    return all.filter((c) => !q || c.label.toLowerCase().includes(q) || c.id.startsWith(q));
  }, [editor, trigger, titles, note.title, commands]);
  choicesRef.current = trigger ? choices : [];

  // The colour popover closes on a click outside it (the Colours button
  // toggles it itself) and on Escape.
  const colorsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colors) return;
    const outside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (colorsRef.current?.contains(target)) return;
      if (target.closest?.(".note-toolbar button")?.querySelector(".toolbar-colors")) return;
      setColors(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setColors(false);
      editor?.commands.focus();
    };
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", key);
    };
  }, [colors, editor]);

  const selectedText = () => {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ").trim();
  };

  return (
    <div className="note-editor-shell" style={{ ["--card-label" as string]: JSON.stringify(t("Card")) }}>
      {editor && (
        <div className="note-toolbar" role="toolbar" aria-label={t("Formatting")}>
          {(
            [
              ["bold", t("Bold"), <Bold size={15} />, () => editor.chain().focus().toggleBold().run()],
              ["italic", t("Italic"), <Italic size={15} />, () => editor.chain().focus().toggleItalic().run()],
              ["underline", t("Underline"), <UnderlineIcon size={15} />, () => editor.chain().focus().toggleUnderline().run()],
              ["strike", t("Strikethrough"), <Strikethrough size={15} />, () => editor.chain().focus().toggleStrike().run()],
              ["highlight", t("Highlight"), <Highlighter size={15} />, () => editor.chain().focus().toggleHighlight({ color: "yellow" }).run()],
              ["colors", t("Colours"), <span className="toolbar-colors" />, () => setColors(!colors)],
              ["sep1"],
              ["heading", t("Heading"), <Heading2 size={15} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), { level: 2 }],
              ["bulletList", t("Bulleted list"), <List size={15} />, () => editor.chain().focus().toggleBulletList().run()],
              ["taskList", t("Checklist"), <CheckSquare size={15} />, () => editor.chain().focus().toggleTaskList().run()],
              ["blockquote", t("Quote"), <Quote size={15} />, () => editor.chain().focus().toggleBlockquote().run()],
            ] as const
          ).map((b) =>
            b.length === 1 ? (
              <span key={b[0]} className="note-toolbar-sep" />
            ) : (
              <button
                key={b[0]}
                type="button"
                data-tip={b[1]}
                data-keys={(shortcuts as Record<string, string>)[b[0]]}
                aria-label={b[1]}
                aria-pressed={editor.isActive(b[0], b.length > 4 ? b[4] : undefined)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={b[3]}
              >
                {b[2]}
              </button>
            ),
          )}
        </div>
      )}
      <EditorContent
        editor={editor}
        className="note-content"
        onMouseOver={onHover}
        onContextMenu={(e) => {
          if (!editor) return;
          e.preventDefault();
          // A right-click outside the selection moves the caret there first.
          const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
          const { from, to } = editor.state.selection;
          if (pos !== undefined && (pos < from || pos > to)) editor.commands.setTextSelection(pos);
          setBubble(null);
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onMouseLeave={() => {
          window.clearTimeout(hoverTimer.current);
          setHover(null);
        }}
      />
      {editor && <Outline editor={editor} />}
      {hover && (
        <div className="link-preview" style={{ left: hover.x, top: hover.y }} role="tooltip">
          <span className="link-preview-head">
            {hover.icon && <span className="link-preview-icon">{hover.icon}</span>}
            <strong>{hover.title}</strong>
          </span>
          {hover.meta && <small>{hover.meta}</small>}
          <p>{hover.text || t("Empty note")}</p>
        </div>
      )}
      {trigger && choices.length > 0 && (
        <div
          className="note-popup"
          role="listbox"
          aria-label={trigger.kind === "link" ? t("Link a note") : t("Insert a block")}
          style={{ left: trigger.x, top: trigger.y + 6 }}
        >
          {choices.map((c, i) => (
            <button
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => {
                activeRef.current = i;
                setActive(i);
              }}
              onClick={c.run}
            >
              {c.icon ?? <Link2 size={15} />}
              <span>{c.label}</span>
              {c.hint && <small>{c.hint}</small>}
            </button>
          ))}
        </div>
      )}
      {colors && editor && (
        <div ref={colorsRef} className="toolbar-color-pop" onMouseLeave={() => setColors(false)}>
          <small>{t("Highlight")}</small>
          <ColorRow kind="highlight" editor={editor} onDone={() => setColors(false)} />
          <small>{t("Underline colour")}</small>
          <ColorRow kind="underline" editor={editor} onDone={() => setColors(false)} />
        </div>
      )}
      {formula && editor && (
        <FormulaDialog
          latex={formula.latex}
          block={formula.block}
          editing={formula.pos !== undefined}
          onClose={() => (setFormula(null), editor.commands.focus())}
          onRemove={
            formula.pos !== undefined
              ? () => {
                  const pos = formula.pos!;
                  const node = editor.state.doc.nodeAt(pos);
                  if (node) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
                  setFormula(null);
                }
              : undefined
          }
          onSave={(latex, block) => {
            const content = { type: block ? "blockMath" : "inlineMath", attrs: { latex } };
            const chain = editor.chain().focus();
            if (formula.pos !== undefined) {
              const node = editor.state.doc.nodeAt(formula.pos);
              if (node) chain.insertContentAt({ from: formula.pos, to: formula.pos + node.nodeSize }, content);
            } else chain.insertContent(content);
            chain.run();
            setFormula(null);
          }}
        />
      )}
      {menu && editor && (
        <EditorMenu
          editor={editor}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onCard={(text) => text && onCard(text)}
          onLinkNote={(text) => editor.chain().focus().insertContent({ type: "noteLink", attrs: { title: text } }).run()}
          onCopyMarkdown={() => void navigator.clipboard.writeText(editor.getMarkdown()).catch(() => {})}
          onChartTable={onChart ? (rows) => onChart(rows) : undefined}
        />
      )}
      {bubble && editor && !trigger && !menu && (
        <div className="note-bubble" style={{ left: bubble.x, top: bubble.y }} role="toolbar" aria-label={t("Selection")}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} aria-label={t("Bold")} data-tip={t("Bold")} data-keys={shortcuts.bold}>
            <Bold size={14} />
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHighlight().run()} aria-label={t("Highlight")} data-tip={t("Highlight")} data-keys={shortcuts.highlight}>
            <Highlighter size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const text = selectedText();
              if (!text || text.length > 120) return;
              editor.chain().focus().insertContent({ type: "noteLink", attrs: { title: text } }).run();
            }}
          >
            <Link2 size={14} />
            {t("Link note")}
          </button>
          <button
            type="button"
            className="bubble-card"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const text = selectedText();
              if (text) onCard(text);
              setBubble(null);
            }}
          >
            <GalleryVerticalEnd size={14} />
            {t("Card")}
          </button>
        </div>
      )}
    </div>
  );
}
