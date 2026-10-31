import { useEffect, useMemo, useState } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Check, Eraser, Hand, Highlighter, LoaderCircle, Pen, PenLine, PenTool, ScanText, Trash2, Undo2, X } from "lucide-react";
import { t } from "../../i18n";
import { escapeHtml } from "../text";
import { InkPad, type PadSettings, type PadTool } from "./InkPad";
import {
  emptyInk,
  handwritingAvailable,
  highlighterColors,
  inkColors,
  linesText,
  OWN_READER,
  parseInk,
  penSizes,
  READER_KEY,
  recognize,
  recognizers,
  serializeInk,
  type InkData,
  type RecognizedLine,
} from "./ink";

// Pen settings are shared by every ink block and remembered.
const SETTINGS_KEY = "origami.inkSettings";
export function loadPadSettings(): PadSettings {
  const base: PadSettings = { tool: "pen", color: "ink", highlight: "yellow", size: penSizes.medium, finger: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return base;
  }
}
export function savePadSettings(s: PadSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private window */
  }
}

export function InkToolbar({
  settings,
  onSettings,
  onUndo,
  onClear,
  extra,
}: {
  settings: PadSettings;
  onSettings: (s: PadSettings) => void;
  onUndo?: () => void;
  onClear?: () => void;
  extra?: React.ReactNode;
}) {
  const set = (patch: Partial<PadSettings>) => onSettings({ ...settings, ...patch });
  const tools: [PadTool, string, React.ReactNode][] = [
    ["pen", t("Pen"), <Pen size={15} />],
    ["marker", t("Marker"), <PenTool size={15} />],
    ["highlighter", t("Highlighter"), <Highlighter size={15} />],
    ["eraser", t("Eraser (or the pen's eraser end)"), <Eraser size={15} />],
  ];
  const colors = settings.tool === "highlighter" ? Object.entries(highlighterColors).map(([k, v]) => [k, v] as const) : Object.entries(inkColors).map(([k, v]) => [k, v.light] as const);
  return (
    <div className="ink-toolbar" role="toolbar" aria-label={t("Pen")} onPointerDown={(e) => e.stopPropagation()}>
      {tools.map(([id, label, icon]) => (
        <button key={id} type="button" className={"ink-tool" + (settings.tool === id ? " active" : "")} aria-pressed={settings.tool === id} aria-label={label} data-tip={label} onClick={() => set({ tool: id })}>
          {icon}
        </button>
      ))}
      {settings.tool !== "eraser" && (
        <>
          <span className="ink-sep" />
          {colors.map(([name, hex]) => {
            const active = settings.tool === "highlighter" ? settings.highlight === name : settings.color === name;
            return (
              <button
                key={name}
                type="button"
                className={"ink-swatch" + (active ? " active" : "")}
                style={{ "--swatch": hex } as React.CSSProperties}
                aria-pressed={active}
                aria-label={name}
                onClick={() => set(settings.tool === "highlighter" ? { highlight: name } : { color: name })}
              />
            );
          })}
          <span className="ink-sep" />
          {(Object.entries(penSizes) as [keyof typeof penSizes, number][]).map(([name, size]) => (
            <button
              key={name}
              type="button"
              className={"ink-size" + (settings.size === size ? " active" : "")}
              aria-pressed={settings.size === size}
              aria-label={name === "fine" ? t("Fine") : name === "medium" ? t("Medium") : t("Bold")}
              data-tip={name === "fine" ? t("Fine") : name === "medium" ? t("Medium") : t("Bold")}
              onClick={() => set({ size })}
            >
              <span style={{ width: size * 2 + 2, height: size * 2 + 2 }} />
            </button>
          ))}
        </>
      )}
      <span className="ink-sep" />
      <button
        type="button"
        className={"ink-tool" + (settings.finger ? " active" : "")}
        aria-pressed={settings.finger}
        aria-label={settings.finger ? t("Finger draws (touch to write)") : t("Finger scrolls (pen and mouse write)")}
        data-tip={settings.finger ? t("Finger draws (touch to write)") : t("Finger scrolls (pen and mouse write)")}
        onClick={() => set({ finger: !settings.finger })}
      >
        <Hand size={15} />
      </button>
      {onUndo && (
        <button type="button" className="ink-tool" aria-label={t("Undo stroke")} data-tip={t("Undo stroke")} onClick={onUndo}>
          <Undo2 size={15} />
        </button>
      )}
      {onClear && (
        <button type="button" className="ink-tool" aria-label={t("Clear")} data-tip={t("Clear")} onClick={onClear}>
          <Trash2 size={15} />
        </button>
      )}
      {extra}
    </div>
  );
}

function InkView({ node, updateAttributes, deleteNode, editor, getPos }: ReactNodeViewProps) {
  const ink = useMemo(() => parseInk(node.attrs.ink), [node.attrs.ink]);
  const editable = editor.isEditable;
  const [editingState, setEditing] = useState(() => editable && !ink.strokes.length);
  const editing = editable && editingState;
  const [settings, setSettings] = useState(loadPadSettings);
  const [reading, setReading] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [lines, setLines] = useState<RecognizedLine[]>([]);
  const [choice, setChoice] = useState<Record<number, number>>({});
  const [problem, setProblem] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [recognizer, setRecognizer] = useState(() => {
    try {
      return localStorage.getItem(READER_KEY) || "";
    } catch {
      return "";
    }
  });
  useEffect(() => void recognizers().then(setNames), []);
  useEffect(() => {
    if (!editing) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setEditing(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [editing]);

  const save = (next: InkData) => updateAttributes({ ink: serializeInk(next) });
  const changeSettings = (s: PadSettings) => {
    setSettings(s);
    savePadSettings(s);
  };
  const read = async () => {
    setReading("busy");
    setProblem("");
    try {
      const found = await recognize(ink, recognizer);
      setLines(found);
      setChoice({});
      setReading("done");
      updateAttributes({ text: linesText(found) });
    } catch (e) {
      setProblem(String(e));
      setReading("error");
    }
  };
  const text = linesText(lines, choice);
  const after = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    return pos === undefined ? undefined : pos + node.nodeSize;
  };
  const paragraphs = () =>
    text
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `<p>${escapeHtml(l)}</p>`)
      .join("");
  const insertBelow = () => {
    const at = after();
    if (at !== undefined && text.trim()) editor.chain().focus().insertContentAt(at, paragraphs()).run();
    setReading("idle");
  };
  const replace = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (pos !== undefined && text.trim())
      editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, paragraphs()).run();
  };

  const canRead = handwritingAvailable() && ink.strokes.some((s) => s.tool !== "highlighter");
  return (
    <NodeViewWrapper className={"ink-block" + (editing ? " editing" : "")} contentEditable={false} data-ink-block="">
      {editing ? (
        <InkToolbar
          settings={settings}
          onSettings={changeSettings}
          onUndo={ink.strokes.length ? () => save({ ...ink, strokes: ink.strokes.slice(0, -1) }) : undefined}
          onClear={ink.strokes.length ? () => save({ ...ink, strokes: [] }) : undefined}
          extra={
            <>
              <span className="ink-spacer" />
              {canRead && (
                <button type="button" className="ink-tool" onClick={() => void read()} disabled={reading === "busy"} aria-label={t("Read handwriting")} data-tip={t("Read handwriting")}>
                  {reading === "busy" ? <LoaderCircle size={15} className="spin" /> : <ScanText size={15} />}
                </button>
              )}
              <button type="button" className="mini primary" onClick={() => setEditing(false)} data-tip={t("Done")} data-keys="Esc">
                <Check size={13} />
                {t("Done")}
              </button>
            </>
          }
        />
      ) : !editable ? null : (
        <div className="ink-bar">
          <PenLine size={13} />
          <span>{node.attrs.text ? node.attrs.text.split("\n")[0] : t("Handwriting")}</span>
          <span className="ink-spacer" />
          {canRead && (
            <button type="button" className="mini quiet" onClick={() => void read()} disabled={reading === "busy"}>
              {reading === "busy" ? <LoaderCircle size={13} className="spin" /> : <ScanText size={13} />}
              {t("Read handwriting")}
            </button>
          )}
          <button type="button" className="mini quiet" onClick={() => setEditing(true)}>
            <Pen size={13} />
            {t("Draw")}
          </button>
          <button type="button" className="mini quiet" aria-label={t("Remove from note")} onClick={deleteNode}>
            <Trash2 size={13} />
          </button>
        </div>
      )}
      <div onClick={() => editable && !editing && setEditing(true)}>
        <InkPad ink={ink} onChange={save} editing={editing} settings={settings} label={node.attrs.text || t("Handwriting")} />
      </div>
      {!ink.strokes.length && editing && <p className="ink-hint">{t("Write or draw here with a pen, the mouse, or a finger (turn on the hand).")}</p>}
      {reading === "error" && (
        <p className="ink-result-error" role="alert">
          {problem}
        </p>
      )}
      {reading === "done" && (
        <div className="ink-result" role="status">
          <div className="ink-result-head">
            <ScanText size={14} />
            <strong>{lines.length ? t("Handwriting read") : t("No words found")}</strong>
            {names.length > 0 && (
              <select
                value={recognizer}
                aria-label={t("Handwriting language")}
                onChange={(e) => {
                  setRecognizer(e.target.value);
                  try {
                    localStorage.setItem(READER_KEY, e.target.value);
                  } catch {
                    /* private window */
                  }
                }}
              >
                <option value="">{t("System language")}</option>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n === OWN_READER ? t("Origami handwriting model (English)") : n.replace(/^Microsoft /, "").replace(/ Handwriting Recognizer$/, "")}
                  </option>
                ))}
              </select>
            )}
            <span className="ink-spacer" />
            <button type="button" className="icon-only" aria-label={t("Close")} onClick={() => setReading("idle")}>
              <X size={14} />
            </button>
          </div>
          {lines.length > 0 && (
            <p className="ink-words">
              {lines.map((l, i) =>
                l.candidates.length > 1 ? (
                  <select key={i} className={l.unsure ? "unsure" : undefined} title={l.unsure ? t("Not sure about this word") : undefined} value={choice[i] ?? 0} onChange={(e) => setChoice({ ...choice, [i]: +e.target.value })} aria-label={t("Word {n}", { n: i + 1 })}>
                    {l.candidates.slice(0, 6).map((c, k) => (
                      <option key={k} value={k}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span key={i} className={l.unsure ? "unsure" : undefined} data-tip={l.unsure ? t("Not sure about this word") : undefined}>
                    {l.candidates[0]}
                  </span>
                ),
              )}
            </p>
          )}
          <p className="hint">
            {lines.some((l) => l.unsure)
              ? t("Words underlined in orange may be wrong: check them, or pick another reading.")
              : t("Pick another reading for a word if needed. The text is also kept with the drawing, so search and Related find it.")}
          </p>
          <div className="ink-result-actions">
            <button type="button" className="mini" disabled={!text.trim()} onClick={() => (updateAttributes({ text }), setReading("idle"))}>
              {t("Keep with the drawing")}
            </button>
            <button type="button" className="mini" disabled={!text.trim()} onClick={insertBelow}>
              {t("Insert as text below")}
            </button>
            <button type="button" className="mini" disabled={!text.trim()} onClick={replace}>
              {t("Replace drawing with text")}
            </button>
            <button type="button" className="mini quiet" onClick={() => void read()}>
              {t("Read again")}
            </button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

// <div data-ink="{...}"> in notes: handwriting and drawings as vector strokes,
// with the recognised text (if read) for search and Related.
export function inkBlock(interactive: boolean) {
  return Node.create({
    name: "inkBlock",
    group: "block",
    atom: true,
    draggable: false,
    selectable: true,
    addAttributes() {
      return {
        ink: {
          default: serializeInk(emptyInk()),
          parseHTML: (el) => serializeInk(parseInk(el.getAttribute("data-ink"))),
          renderHTML: (attrs) => ({ "data-ink": attrs.ink }),
        },
        id: {
          default: "",
          parseHTML: (el) => (el.getAttribute("data-ink-id") || "").replace(/[^\w-]/g, "").slice(0, 40) || crypto.randomUUID().slice(0, 8),
          renderHTML: (attrs) => (attrs.id ? { "data-ink-id": attrs.id } : {}),
        },
        text: {
          default: "",
          parseHTML: (el) => (el.getAttribute("data-ink-text") || "").slice(0, 20000),
          renderHTML: (attrs) => (attrs.text ? { "data-ink-text": attrs.text } : {}),
        },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-ink]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, class: "ink-block" }];
    },
    renderMarkdown: (node: { attrs?: { id?: string; text?: string } }) =>
      `![${(node.attrs?.text || "Handwriting").replace(/[\[\]\n]+/g, " ").trim()}](ink:${node.attrs?.id || ""})`,
    ...(interactive
      ? { addNodeView: () => ReactNodeViewRenderer(InkView, { stopEvent: ({ event }) => !event.type.startsWith("drag") }) }
      : {}),
  });
}
