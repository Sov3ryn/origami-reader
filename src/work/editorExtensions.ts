import { Extension, Node, nodeInputRule, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Mathematics } from "@tiptap/extension-mathematics";
import { inkBlock } from "./ink/InkBlock";
import { diagramBlock } from "./diagrams/DiagramBlock";
import { planBlock } from "./plans/PlanBlock";
import { pluginBlock } from "./plugins/PluginBlock";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { dayKey } from "./schedule";
import { chartBlock } from "./charts/ChartBlock";
import { embedBlock } from "./embeds/EmbedBlock";

// A link to another note: <a data-note="Title">. Written [[Title]] in Markdown.
export const NoteLink = Node.create({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-note") || el.textContent || "",
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-note]", priority: 60 }];
  },
  renderHTML({ node }) {
    return ["a", { "data-note": node.attrs.title, class: "note-link" }, node.attrs.title];
  },
  renderText({ node }) {
    return node.attrs.title;
  },
  markdownTokenName: "noteLink",
  markdownTokenizer: {
    name: "noteLink",
    level: "inline",
    start: (src: string) => src.indexOf("[["),
    tokenize(src: string) {
      const m = /^\[\[([^[\]\n]+?)\]\]/.exec(src);
      if (m) return { type: "noteLink", raw: m[0], title: m[1].split("|")[0].trim() };
    },
  },
  parseMarkdown: (token) => ({
    type: "noteLink",
    attrs: { title: String((token as { title?: string }).title || "") },
  }),
  renderMarkdown: (node: { attrs?: { title?: string } }) => `[[${node.attrs?.title || ""}]]`,
  addInputRules() {
    return [
      nodeInputRule({
        find: /\[\[([^[\]\n]+)\]\]$/,
        type: this.type,
        getAttributes: (m) => ({ title: m[1].trim() }),
      }),
    ];
  },
});

// A link to a passage in a book from the library.
export const PassageLink = Node.create({
  name: "passageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      book: { default: "", parseHTML: (el) => el.getAttribute("data-book") || "", renderHTML: () => ({}) },
      paragraph: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-paragraph") || "",
        renderHTML: () => ({}),
      },
      label: { default: "", parseHTML: (el) => el.textContent || "", renderHTML: () => ({}) },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-book]", priority: 60 }];
  },
  renderHTML({ node }) {
    return [
      "a",
      { "data-book": node.attrs.book, "data-paragraph": node.attrs.paragraph, class: "passage-link" },
      node.attrs.label,
    ];
  },
  renderText({ node }) {
    return node.attrs.label;
  },
  renderMarkdown: (node: { attrs?: { label?: string } }) => `*${node.attrs?.label || ""}*`,
});

// Colours for highlights and underlines, named so themes can tune them.
export const markColors = ["yellow", "green", "blue", "pink", "purple", "orange", "red", "gray"] as const;
export type MarkColor = (typeof markColors)[number];
export const underlineStyles = ["solid", "wavy", "double", "dotted"] as const;
export type UnderlineStyle = (typeof underlineStyles)[number];
const named = (list: readonly string[], attr: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(attr);
    return v && list.includes(v) ? v : null;
  },
  renderHTML: (attrs: Record<string, unknown>) => {
    const key = attr.replace("data-", "");
    return attrs[key] ? { [attr]: attrs[key] } : {};
  },
});
const ColorHighlight = Highlight.extend({
  addAttributes() {
    return { color: named(markColors, "data-color") };
  },
}).configure({ multicolor: true });
const ColorUnderline = Underline.extend({
  addAttributes() {
    return { color: named(markColors, "data-color"), style: named(underlineStyles, "data-style") };
  },
});

// Callouts, like a modded Markdown vault: <div data-callout="tip">. Written
// GitHub-style in Markdown (> [!TIP]).
export const calloutKinds = ["note", "tip", "important", "warning", "question", "summary"] as const;
export type CalloutKind = (typeof calloutKinds)[number];
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: "note",
        parseHTML: (el) => {
          const k = el.getAttribute("data-callout") || "note";
          return (calloutKinds as readonly string[]).includes(k) ? k : "note";
        },
        renderHTML: (attrs) => ({ "data-callout": attrs.kind }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, class: "callout" }, 0];
  },
  renderMarkdown: (node: { attrs?: { kind?: string }; content?: unknown[] }, h: { renderChildren: (n: never, sep?: string) => string }) => {
    const body = h.renderChildren((node.content || []) as never, "\n\n");
    const head = `> [!${String(node.attrs?.kind || "note").toUpperCase()}]\n`;
    return head + body.split("\n").map((l: string) => "> " + l).join("\n");
  },
});

// Dates written in a note as @2026-10-20 become chips, and checklist items
// with a date appear on the Schedule page.
const DateChips = Extension.create({
  name: "dateChips",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("dateChips"),
        props: {
          decorations(state) {
            const marks: Decoration[] = [];
            const today = dayKey(Date.now());
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const m of node.text.matchAll(/@(\d{4}-\d{2}-\d{2})\b/g)) {
                const when = m[1] < today ? "past" : m[1] === today ? "today" : "future";
                marks.push(
                  Decoration.inline(pos + m.index!, pos + m.index! + m[0].length, { class: "date-chip " + when }),
                );
              }
            });
            return DecorationSet.create(state.doc, marks);
          },
        },
      }),
    ];
  },
});

// Lines written as "question :: answer" are study cards; they get a soft chip.
const CardLines = Extension.create({
  name: "cardLines",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("cardLines"),
        props: {
          decorations(state) {
            const marks: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "paragraph") return;
              const text = node.textContent;
              const at = text.indexOf("::");
              if (at > 0 && text.slice(at + 2).trim())
                marks.push(Decoration.node(pos, pos + node.nodeSize, { class: "card-line" }));
              return false;
            });
            return DecorationSet.create(state.doc, marks);
          },
        },
      }),
    ];
  },
});

// interactive: the editor on screen (chart blocks draw live charts there).
export function noteExtensions(placeholder = "", interactive = false): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      underline: false,
    }),
    Placeholder.configure({ placeholder }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ allowBase64: true }),
    ColorHighlight,
    ColorUnderline,
    Markdown,
    NoteLink,
    PassageLink,
    CardLines,
    Callout,
    DateChips,
    chartBlock(interactive),
    embedBlock(interactive),
    inkBlock(interactive),
    diagramBlock(interactive),
    planBlock(interactive),
    pluginBlock(interactive),
    // Formulas: $$x^2$$ inline, $$$x^2$$$ on its own line; LaTeX with KaTeX.
    Mathematics.configure({ katexOptions: { throwOnError: false, strict: "ignore" } }),
  ];
}
