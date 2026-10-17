import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { INK_WIDTH, inkBounds, inkColor, strokePath, strokesNear, type InkData, type InkStroke, type InkTool } from "./ink";

export type PadTool = InkTool | "eraser";
export type PadSettings = { tool: PadTool; color: string; highlight: string; size: number; finger: boolean };

// Highlighter goes under the writing, whatever order it was drawn in.
const order = (strokes: InkStroke[]) =>
  strokes.map((s, i) => [s, i] as const).sort((a, b) => Number(b[0].tool === "highlighter") - Number(a[0].tool === "highlighter"));

// Is the text light (a dark theme)? Ink colours follow it.
function useDarkInk(ref: React.RefObject<HTMLElement | null>) {
  const [dark, setDark] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).color);
      if (m) setDark((0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 > 0.55);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, subtree: false });
    const work = el.closest(".work-mode");
    if (work) observer.observe(work, { attributes: true, attributeFilter: ["data-work-theme", "class", "style"] });
    // A note's paper can change the text colour too.
    const sheet = el.closest(".note-sheet");
    if (sheet) observer.observe(sheet, { attributes: true, attributeFilter: ["data-paper"] });
    return () => observer.disconnect();
  }, [ref]);
  return dark;
}

// A drawing surface. Pens and the mouse draw; fingers scroll unless finger
// drawing is on, and while a pen is near, touches are ignored (palm rejection).
// The pen's eraser end erases.
export function InkPad({
  ink: given,
  onChange,
  editing,
  settings,
  label,
  autoGrow = true,
}: {
  ink: InkData;
  onChange: (ink: InkData) => void;
  editing: boolean;
  settings: PadSettings;
  label: string;
  autoGrow?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const dark = useDarkInk(box);
  const [live, setLive] = useState<InkStroke | null>(null);
  const [erasing, setErasing] = useState<Set<number>>(new Set());
  const drawing = useRef<{ id: number; stroke: InkStroke | null; erase: boolean; removed: Set<number> } | null>(null);
  const penSeen = useRef(0);
  // A pen hovering near the pad: stop panning so it draws (pens hover first).
  const [penNear, setPenNear] = useState(false);
  const penTimer = useRef<number | undefined>(undefined);
  const notePen = () => {
    penSeen.current = Date.now();
    setPenNear(true);
    window.clearTimeout(penTimer.current);
    penTimer.current = window.setTimeout(() => setPenNear(false), 2500);
  };
  const frame = useRef(0);
  // The pad's own copy, updated the moment a stroke ends: saving reaches the
  // note a moment later, and fast handwriting must not lose strokes meanwhile.
  const local = useRef(given);
  const lastGiven = useRef(given);
  if (given !== lastGiven.current) {
    lastGiven.current = given;
    local.current = given;
  }
  const [, redraw] = useState(0);
  const ink = local.current;
  const commit = (next: InkData) => {
    local.current = next;
    redraw((n) => n + 1);
    latest.current.onChange(next);
  };
  const latest = useRef({ onChange });
  latest.current = { onChange };

  const toPoint = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }) => {
    const r = box.current!.getBoundingClientRect();
    const scale = INK_WIDTH / r.width;
    const pressure = e.pointerType === "pen" ? Math.max(0.05, e.pressure || 0.5) : 0.5;
    return [(e.clientX - r.left) * scale, (e.clientY - r.top) * scale, pressure];
  };
  const radius = () => 14 * (INK_WIDTH / (box.current?.getBoundingClientRect().width || INK_WIDTH));

  function down(e: React.PointerEvent) {
    if (!editing) return;
    if (e.pointerType === "pen") notePen();
    if (e.pointerType === "touch" && (!settings.finger || Date.now() - penSeen.current < 1500)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const erase = settings.tool === "eraser" || (e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) !== 0));
    const p = toPoint(e);
    if (erase) {
      const hit = strokesNear(local.current, p[0], p[1], radius());
      drawing.current = { id: e.pointerId, stroke: null, erase: true, removed: hit };
      setErasing(new Set(hit));
      return;
    }
    const tool = settings.tool as InkTool;
    const stroke: InkStroke = {
      tool,
      c: tool === "highlighter" ? settings.highlight : settings.color,
      s: settings.size,
      p: [p],
    };
    drawing.current = { id: e.pointerId, stroke, erase: false, removed: new Set() };
    setLive({ ...stroke });
  }
  function move(e: React.PointerEvent) {
    if (e.pointerType === "pen" && !drawing.current) notePen();
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const events = (e.nativeEvent.getCoalescedEvents?.() || []) as PointerEvent[];
    const list = events.length ? events : [e.nativeEvent];
    if (d.erase) {
      for (const ev of list) {
        const p = toPoint(ev);
        for (const i of strokesNear(local.current, p[0], p[1], radius())) d.removed.add(i);
      }
      setErasing(new Set(d.removed));
      return;
    }
    for (const ev of list) d.stroke!.p.push(toPoint(ev));
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => d.stroke && setLive({ ...d.stroke, p: [...d.stroke.p] }));
  }
  function up(e: React.PointerEvent) {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    drawing.current = null;
    cancelAnimationFrame(frame.current);
    const now = local.current;
    const save = commit;
    if (d.erase) {
      setErasing(new Set());
      if (d.removed.size) save({ ...now, strokes: now.strokes.filter((_, i) => !d.removed.has(i)) });
      return;
    }
    setLive(null);
    const stroke = d.stroke!;
    if (stroke.p.length === 1) {
      // A tap leaves a dot.
      const [x, y, pr] = stroke.p[0];
      stroke.p.push([x + 0.5, y + 0.5, pr]);
    }
    let h = now.h;
    const lowest = Math.max(...stroke.p.map((p) => p[1]));
    if (autoGrow && lowest > h - 70) h = Math.min(6000, h + 220);
    save({ h, strokes: [...now.strokes, stroke] });
  }

  // Dragging the bottom edge changes the height (never above the ink).
  const resizing = useRef<{ y: number; h: number } | null>(null);
  function resizeDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    resizing.current = { y: e.clientY, h: local.current.h };
  }
  function resizeMove(e: React.PointerEvent) {
    const r = resizing.current;
    if (!r || !box.current) return;
    const scale = INK_WIDTH / box.current.getBoundingClientRect().width;
    const min = Math.max(80, inkBounds(local.current).bottom + 12);
    const h = Math.max(min, Math.min(6000, r.h + (e.clientY - r.y) * scale));
    commit({ ...local.current, h });
  }
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(penTimer.current);
    },
    [],
  );

  const paths = useMemo(() => ink.strokes.map((s) => strokePath(s)), [ink.strokes]);
  const livePath = live ? strokePath(live, true) : "";
  const cursor = !editing ? "default" : settings.tool === "eraser" ? "cell" : "crosshair";
  return (
    <div
      ref={box}
      className={"ink-pad" + (editing ? " editing" : "") + (settings.finger || penNear ? " finger" : "")}
      style={{ aspectRatio: `${INK_WIDTH} / ${Math.round(ink.h)}`, cursor }}
      onPointerDown={down}
      onPointerEnter={(e) => e.pointerType === "pen" && notePen()}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <svg viewBox={`0 0 ${INK_WIDTH} ${Math.round(ink.h)}`} role="img" aria-label={label} preserveAspectRatio="none">
        {order(ink.strokes).map(([s, i]) => (
          <path
            key={i}
            d={paths[i]}
            fill={inkColor(s, dark)}
            fillOpacity={s.tool === "highlighter" ? 0.45 : 1}
            className={erasing.has(i) ? "erasing" : undefined}
          />
        ))}
        {live && livePath && <path d={livePath} fill={inkColor(live, dark)} fillOpacity={live.tool === "highlighter" ? 0.45 : 1} />}
      </svg>
      {editing && (
        <div className="ink-resize" onPointerDown={resizeDown} onPointerMove={resizeMove} onPointerUp={() => (resizing.current = null)} aria-hidden="true" />
      )}
    </div>
  );
}
