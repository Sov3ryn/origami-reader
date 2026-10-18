import { useEffect, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, GripHorizontal, Trash2 } from "lucide-react";
import { t } from "../../i18n";

// Sticky notes: small coloured notes stuck on a page, dragged anywhere on it,
// folded away or thrown out. Positions are kept as a share of the page width
// and a distance from its top, so they stay put when the window changes.
export type StickyNote = {
  id: string;
  kind: "sticky";
  doc: string;
  x: number;
  y: number;
  text: string;
  color: string;
  collapsed?: boolean;
  created: number;
  updated: number;
  workspace?: string;
  vault?: string;
};

export const stickyColors: Record<string, { bg: string; edge: string }> = {
  yellow: { bg: "#fff3a6", edge: "#e6cf52" },
  pink: { bg: "#ffd1e6", edge: "#e79ac0" },
  green: { bg: "#cdf3cf", edge: "#86cf8b" },
  blue: { bg: "#cfe6ff", edge: "#8ab8eb" },
  orange: { bg: "#ffdcb5", edge: "#eba864" },
  violet: { bg: "#e3d8ff", edge: "#ae98ea" },
};

const colorNames = (): Record<string, string> => ({
  yellow: t("Yellow"),
  pink: t("Pink"),
  green: t("Green"),
  blue: t("Blue"),
  orange: t("Orange"),
  violet: t("Violet"),
});

export function newSticky(doc: string, x: number, y: number, color = "yellow"): StickyNote {
  const now = Date.now();
  return { id: crypto.randomUUID(), kind: "sticky", doc, x, y, text: "", color, created: now, updated: now };
}

function Sticky({
  note,
  focus,
  onChange,
  onDelete,
  layer,
}: {
  note: StickyNote;
  focus: boolean;
  onChange: (patch: Partial<StickyNote>) => void;
  onDelete: () => void;
  layer: React.RefObject<HTMLDivElement | null>;
}) {
  const [text, setText] = useState(note.text);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);
  // Saves go through the latest props, so a late text save cannot bring back
  // an older colour or position. Typing not saved yet is saved on closing.
  const latest = useRef(onChange);
  latest.current = onChange;
  const unsaved = useRef<string | null>(null);
  const saveText = () => {
    window.clearTimeout(timer.current);
    const v = unsaved.current;
    unsaved.current = null;
    if (v !== null) latest.current({ text: v });
  };
  useEffect(() => setText(note.text), [note.text]);
  useEffect(() => {
    if (focus) area.current?.focus();
  }, [focus]);
  useEffect(() => () => saveText(), []);
  const color = stickyColors[note.color] || stickyColors.yellow;
  const pos = drag || { x: note.x, y: note.y };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, x: note.x, y: note.y };
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    const box = layer.current?.getBoundingClientRect();
    if (!s || !box) return;
    const x = Math.max(0, Math.min(0.97, s.x + (e.clientX - s.px) / box.width));
    const y = Math.max(0, s.y + (e.clientY - s.py));
    setDrag({ x, y });
  };
  const up = () => {
    if (drag) onChange({ x: drag.x, y: drag.y });
    start.current = null;
    setDrag(null);
  };
  return (
    <aside
      className={"sticky-note" + (note.collapsed ? " collapsed" : "") + (drag ? " dragging" : "")}
      style={{ left: `${pos.x * 100}%`, top: pos.y, background: color.bg, borderColor: color.edge }}
      aria-label={t("Sticky note")}
    >
      <header onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <GripHorizontal size={13} />
        {note.collapsed && <span className="sticky-peek">{note.text.split("\n")[0] || t("Sticky note")}</span>}
        <span className="sticky-spacer" />
        {!note.collapsed &&
          Object.entries(stickyColors).map(([name, c]) => (
            <button
              key={name}
              className={"sticky-color" + (note.color === name ? " active" : "")}
              style={{ background: c.bg, borderColor: c.edge }}
              aria-label={colorNames()[name] || name}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onChange({ color: name })}
            />
          ))}
        <button
          className="sticky-tool"
          data-tip={note.collapsed ? t("Unfold") : t("Fold")}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onChange({ collapsed: !note.collapsed })}
        >
          {note.collapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
        </button>
        <button
          className="sticky-tool"
          data-tip={t("Remove sticky note")}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (text.trim() && !window.confirm(t("Remove this sticky note and its text?"))) return;
            window.clearTimeout(timer.current);
            unsaved.current = null;
            onDelete();
          }}
        >
          <Trash2 size={13} />
        </button>
      </header>
      {!note.collapsed && (
        <textarea
          ref={area}
          value={text}
          placeholder={t("Write something…")}
          aria-label={t("Sticky note")}
          onChange={(e) => {
            const v = e.target.value.slice(0, 4000);
            setText(v);
            unsaved.current = v;
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(saveText, 500);
          }}
          onBlur={saveText}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
    </aside>
  );
}

// The layer of sticky notes over a page.
export function StickyLayer({
  notes,
  focusId,
  onChange,
  onDelete,
}: {
  notes: StickyNote[];
  focusId?: string | null;
  onChange: (note: StickyNote, patch: Partial<StickyNote>) => void;
  onDelete: (note: StickyNote) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  return (
    <div className="sticky-layer" ref={layer}>
      {notes.map((n) => (
        <Sticky key={n.id} note={n} focus={focusId === n.id} layer={layer} onChange={(p) => onChange(n, p)} onDelete={() => onDelete(n)} />
      ))}
    </div>
  );
}
