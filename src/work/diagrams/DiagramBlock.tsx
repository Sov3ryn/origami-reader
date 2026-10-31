import { useEffect, useRef, useState } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Check, Code2, Copy, Download, LoaderCircle, Trash2, Workflow } from "lucide-react";
import { t } from "../../i18n";

// Diagrams written as text (Mermaid): flowcharts, sequences, mind maps,
// timelines, Gantt charts and more, drawn locally. Mermaid loads only when a
// note has a diagram, in strict mode (no scripts or links in diagrams).
type Mermaid = typeof import("mermaid").default;
let loading: Promise<Mermaid> | null = null;
let lastTheme = "";
async function loadMermaid(dark: boolean): Promise<Mermaid> {
  loading ||= import("mermaid").then((m) => m.default);
  const mermaid = await loading;
  const theme = dark ? "dark" : "neutral";
  if (theme !== lastTheme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      // Throw on bad text instead of leaving a "Syntax error" drawing in <body>.
      suppressErrorRendering: true,
      theme,
      fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
      htmlLabels: false,
      flowchart: { htmlLabels: false, curve: "basis" },
    });
    lastTheme = theme;
  }
  return mermaid;
}
let counter = 0;
export async function renderDiagram(code: string, dark = false): Promise<string> {
  const mermaid = await loadMermaid(dark);
  const { svg } = await mermaid.render(`origami-diagram-${++counter}`, code);
  // Without HTML labels, Mermaid leaves a mind map's root label anchored at its start,
  // so it spills out of the circle; centre it like the other nodes.
  return svg.includes("section-root") ? svg.replace("</style>", ".section-root text{text-anchor:middle}</style>") : svg;
}
export async function diagramError(code: string): Promise<string> {
  const mermaid = await loadMermaid(false);
  try {
    await mermaid.parse(code);
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export const diagramTemplates = (): { id: string; label: string; code: string }[] => [
  {
    id: "flowchart",
    label: t("Flowchart"),
    code: "flowchart LR\n  A[Question] --> B{Enough data?}\n  B -- Yes --> C[Analyse]\n  B -- No --> D[Collect more]\n  D --> B\n  C --> E[Write up]",
  },
  {
    id: "mindmap",
    label: t("Mind map"),
    code: "mindmap\n  root((Topic))\n    Causes\n      First\n      Second\n    Effects\n      Short term\n      Long term\n    Examples",
  },
  {
    id: "sequence",
    label: t("Sequence"),
    code: "sequenceDiagram\n  participant Client\n  participant Server\n  Client->>Server: Request\n  Server-->>Client: Response",
  },
  {
    id: "timeline",
    label: t("Timeline"),
    code: "timeline\n  title Key dates\n  1789 : Revolution begins\n  1804 : Empire\n  1815 : Restoration",
  },
  {
    id: "gantt",
    label: t("Gantt chart"),
    code: "gantt\n  title Project plan\n  dateFormat YYYY-MM-DD\n  section Research\n  Reading      :a1, 2026-10-20, 7d\n  Interviews   :a2, after a1, 5d\n  section Writing\n  First draft  :b1, after a2, 10d",
  },
  {
    id: "class",
    label: t("Class diagram"),
    code: "classDiagram\n  class Animal {\n    +name\n    +eat()\n  }\n  Animal <|-- Dog\n  Animal <|-- Cat",
  },
  {
    id: "state",
    label: t("States"),
    code: "stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review\n  Review --> Draft: changes\n  Review --> Published\n  Published --> [*]",
  },
  {
    id: "er",
    label: t("Entity relationships"),
    code: "erDiagram\n  STUDENT ||--o{ ENROLMENT : has\n  COURSE ||--o{ ENROLMENT : includes",
  },
  {
    id: "pie",
    label: t("Pie"),
    code: 'pie title Time spent\n  "Reading" : 45\n  "Notes" : 30\n  "Review" : 25',
  },
  {
    id: "quadrant",
    label: t("Quadrant"),
    code: "quadrantChart\n  title Priorities\n  x-axis Low effort --> High effort\n  y-axis Low impact --> High impact\n  quadrant-1 Plan\n  quadrant-2 Do first\n  quadrant-3 Later\n  quadrant-4 Delegate\n  Task A: [0.3, 0.8]\n  Task B: [0.7, 0.6]",
  },
];

function isDarkText(el: HTMLElement | null) {
  if (!el) return false;
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).color);
  return Boolean(m && (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 > 0.55);
}

function DiagramView({ node, updateAttributes, deleteNode, editor }: ReactNodeViewProps) {
  const code: string = node.attrs.code;
  const editable = editor.isEditable;
  const [editingState, setEditing] = useState(() => editable && !code.trim());
  const editing = editable && editingState;
  const [draft, setDraft] = useState(code);
  const [svg, setSvg] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const shown = editing ? draft : code;
  useEffect(() => {
    let live = true;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      if (!shown.trim()) {
        if (live) (setSvg(""), setProblem(""), setBusy(false));
        return;
      }
      try {
        const out = await renderDiagram(shown, isDarkText(box.current));
        if (live) (setSvg(out), setProblem(""));
      } catch (e) {
        if (live) setProblem(e instanceof Error ? e.message : String(e));
      } finally {
        if (live) setBusy(false);
      }
    }, editing ? 350 : 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [shown, editing]);

  const save = () => {
    updateAttributes({ code: draft });
    setEditing(false);
  };
  const exportSvg = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "diagram.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <NodeViewWrapper className={"diagram-block" + (editing ? " editing" : "")} contentEditable={false}>
      <div className="diagram-bar" hidden={!editable}>
        <Workflow size={13} />
        <span>{t("Diagram")}</span>
        <span className="ink-spacer" />
        {!editing && (
          <>
            <button type="button" className="mini quiet" onClick={() => (setDraft(code), setEditing(true))}>
              <Code2 size={13} />
              {t("Edit")}
            </button>
            {svg && (
              <>
                <button type="button" className="mini quiet" aria-label={t("Copy the diagram's text")} data-tip={t("Copy the diagram's text")} onClick={() => void navigator.clipboard.writeText(code).catch(() => {})}>
                  <Copy size={13} />
                </button>
                <button type="button" className="mini quiet" aria-label={t("Save as SVG")} data-tip={t("Save as SVG")} onClick={exportSvg}>
                  <Download size={13} />
                </button>
              </>
            )}
          </>
        )}
        <button type="button" className="mini quiet" aria-label={t("Remove from note")} onClick={deleteNode}>
          <Trash2 size={13} />
        </button>
      </div>
      <div className={editing ? "diagram-split" : ""}>
        {editing && (
          <div className="diagram-editor">
            <div className="diagram-templates">
              {diagramTemplates().map((tpl) => (
                <button key={tpl.id} type="button" className="mini" onClick={() => setDraft(tpl.code)}>
                  {tpl.label}
                </button>
              ))}
            </div>
            <textarea
              autoFocus
              spellCheck={false}
              value={draft}
              rows={10}
              aria-label={t("Diagram text (Mermaid)")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  save();
                } else if (e.key === "Escape") {
                  setDraft(code);
                  setEditing(false);
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const at = el.selectionStart;
                  setDraft(draft.slice(0, at) + "  " + draft.slice(el.selectionEnd));
                  requestAnimationFrame(() => el.setSelectionRange(at + 2, at + 2));
                }
              }}
            />
            <div className="diagram-actions">
              <a className="hint" href="#" onClick={(e) => e.preventDefault()} data-tip={t("Mermaid syntax: flowchart, sequenceDiagram, mindmap, timeline, gantt, classDiagram, stateDiagram-v2, erDiagram, pie, quadrantChart")}>
                {t("Written in Mermaid")}
              </a>
              <span className="ink-spacer" />
              <button type="button" onClick={() => (setDraft(code), setEditing(false))} disabled={!code.trim()}>
                {t("Cancel")}
              </button>
              <button type="button" className="primary" onClick={save} disabled={!draft.trim() || Boolean(problem)} data-tip={t("Save")} data-keys="Ctrl+Enter">
                <Check size={14} />
                {t("Done")}
              </button>
            </div>
          </div>
        )}
        <div className="diagram-view" ref={box} onDoubleClick={() => editable && !editing && (setDraft(code), setEditing(true))}>
          {busy && !svg && <LoaderCircle className="spin" size={18} />}
          {problem ? (
            <p className="diagram-error">{problem.split("\n").slice(0, 4).join("\n")}</p>
          ) : svg ? (
            <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            !busy && <p className="hint">{t("Pick a template or write a diagram.")}</p>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// <div data-diagram="mermaid text">. Markdown keeps it as a ```mermaid block,
// which GitHub, Obsidian and many editors draw too, and imports turn such
// blocks back into diagrams.
export function diagramBlock(interactive: boolean) {
  return Node.create({
    name: "diagramBlock",
    group: "block",
    atom: true,
    draggable: false,
    selectable: true,
    priority: 120,
    addAttributes() {
      return {
        code: {
          default: "",
          parseHTML: (el) => (el.hasAttribute("data-diagram") ? el.getAttribute("data-diagram") || "" : el.textContent || "").slice(0, 50000),
          renderHTML: (attrs) => ({ "data-diagram": attrs.code }),
        },
      };
    },
    parseHTML() {
      return [
        { tag: "div[data-diagram]" },
        // ```mermaid blocks from Markdown and AI pages.
        {
          tag: "pre",
          priority: 120,
          getAttrs: (el) => ((el as HTMLElement).querySelector("code.language-mermaid") ? {} : false),
        },
      ];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, class: "diagram-block" }];
    },
    renderMarkdown: (node: { attrs?: { code?: string } }) => "```mermaid\n" + (node.attrs?.code || "").trim() + "\n```",
    ...(interactive ? { addNodeView: () => ReactNodeViewRenderer(DiagramView, { stopEvent: () => true }) } : {}),
  });
}

// Exports: each diagram drawn once as SVG, keyed by its text.
export async function diagramSvgs(htmls: string[]) {
  const out = new Map<string, string>();
  for (const html of htmls)
    for (const m of html.matchAll(/<div\b[^>]*\bdata-diagram="([^"]*)"[^>]*>/g)) {
      const code = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      if (!out.has(code))
        try {
          out.set(code, await renderDiagram(code, false));
        } catch {
          /* drawn as text instead */
        }
    }
  return out;
}
