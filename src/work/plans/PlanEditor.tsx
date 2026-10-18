import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleDashed, Hand, Radius, MousePointer2, Move, PenLine, RectangleHorizontal, Ruler, Spline, Type, Undo2, Redo2, Trash2, Maximize, Magnet, Copy } from "lucide-react";
import { t } from "../../i18n";
import {
  angleArc,
  angleBetween,
  angleOf,
  arcPath,
  arcSpan,
  bounds,
  constrain,
  dimLine,
  dist,
  distanceTo,
  formatAngle,
  formatArea,
  formatLength,
  keyPoints,
  moveShape,
  parseLength,
  planColors,
  polar,
  snapGrid,
  type PlanDoc,
  type Pt,
  type Shape,
} from "./model";

type Tool = "select" | "line" | "rect" | "circle" | "arc" | "poly" | "dim" | "angle" | "text" | "pan";
type View = { scale: number; ox: number; oy: number };
const uid = () => crypto.randomUUID().slice(0, 12);
const screenWeight = { thin: 1, normal: 1.6, bold: 2.8 } as const;
const screenDash = { solid: undefined, dashed: "8 5", center: "14 4 3 4" } as const;

const toolKeys: Record<string, Tool> = { v: "select", l: "line", r: "rect", c: "circle", a: "arc", p: "poly", d: "dim", n: "angle", t: "text", h: "pan" };

// The drawing surface of a plan: draw with the mouse or a pen, snap to the
// grid and to points of other shapes, type exact lengths, and edit any value
// in the panel. Y grows upwards in everything shown (as on paper).
export function PlanEditor({ plan, onChange }: { plan: PlanDoc; onChange: (shapes: Shape[]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View | null>(null);
  const [tool, setTool] = useState<Tool>("line");
  const [shapes, setShapes] = useState<Shape[]>(plan.shapes);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<{ p: Pt; snap: "point" | "grid" | null } | null>(null);
  const [typed, setTyped] = useState("");
  const [textAt, setTextAt] = useState<{ p: Pt; value: string } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [style, setStyle] = useState<{ color: string; weight: "thin" | "normal" | "bold"; dash: "solid" | "dashed" | "center" }>({ color: planColors[0], weight: "normal", dash: "solid" });
  const past = useRef<Shape[][]>([]);
  const future = useRef<Shape[][]>([]);
  const drag = useRef<
    | { mode: "move"; start: Pt; original: Shape[] }
    | { mode: "handle"; id: string; index: number; original: Shape }
    | { mode: "pan"; sx: number; sy: number; view: View }
    | { mode: "marquee"; start: Pt; add: boolean }
    | null
  >(null);
  const space = useRef(false);
  const shift = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ onChange });
  latest.current = { onChange };

  // --- Size and view ----------------------------------------------------------------
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const fit = useCallback(
    (list = shapes) => {
      const b = bounds(list);
      const w = size.w || 800;
      const h = size.h || 600;
      if (!b || (b.w < 1 && b.h < 1)) {
        const scale = plan.units === "m" ? 0.2 : plan.units === "ft" ? 0.5 : 2;
        setView({ scale, ox: w / 2, oy: h / 2 });
        return;
      }
      const scale = Math.min((w - 120) / Math.max(b.w, 1), (h - 120) / Math.max(b.h, 1), 40);
      setView({ scale, ox: w / 2 - (b.x + b.w / 2) * scale, oy: h / 2 - (b.y + b.h / 2) * scale });
    },
    [shapes, size, plan.units],
  );
  useEffect(() => {
    if (!view && size.w > 10) fit(plan.shapes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);
  const v = view || { scale: 2, ox: size.w / 2, oy: size.h / 2 };
  const toWorld = (sx: number, sy: number): Pt => [(sx - v.ox) / v.scale, (sy - v.oy) / v.scale];
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // --- Changes and history -------------------------------------------------------------
  const commit = (next: Shape[], record = true) => {
    if (record) {
      past.current = [...past.current.slice(-99), shapes];
      future.current = [];
    }
    setShapes(next);
    window.clearTimeout(saveTimer.current);
    pending.current = next;
    saveTimer.current = window.setTimeout(() => {
      pending.current = null;
      latest.current.onChange(next);
    }, 400);
  };
  // What is drawn is saved when the editor closes.
  const pending = useRef<Shape[] | null>(null);
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      if (pending.current) latest.current.onChange(pending.current);
      pending.current = null;
    },
    [],
  );
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(shapes);
    commit(prev, false);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(shapes);
    commit(next, false);
  };

  // --- Snapping ------------------------------------------------------------------------
  const points = useMemo(() => shapes.flatMap((s) => keyPoints(s)), [shapes]);
  const snap = (raw: Pt, from?: Pt): { p: Pt; snap: "point" | "grid" | null } => {
    const reach = 10 / v.scale;
    let best: Pt | null = null;
    let bestD = reach;
    for (const q of [...points, ...draft]) {
      const d = dist(raw, q);
      if (d < bestD) {
        best = q;
        bestD = d;
      }
    }
    if (best) return { p: [best[0], best[1]], snap: "point" };
    let p = raw;
    if (from && shift.current) p = constrain(from, raw);
    if (plan.snap) {
      if (from && shift.current) {
        // Keep the angle, snap the length to the grid.
        const len = Math.round(dist(from, p) / plan.grid) * plan.grid;
        p = polar(from, len, angleOf(from, p));
      } else p = snapGrid(p, plan.grid);
      return { p, snap: "grid" };
    }
    return { p, snap: null };
  };

  // --- Drawing ---------------------------------------------------------------------------
  const add = (s: Shape) => commit([...shapes, { ...s, ...style }]);
  const finishPoly = (closed = false) => {
    if (draft.length >= 2) add({ id: uid(), type: "poly", points: draft, closed });
    setDraft([]);
    setTyped("");
  };
  const place = (p: Pt) => {
    const a = draft[0];
    switch (tool) {
      case "line":
        if (!a) setDraft([p]);
        else if (dist(a, p) > 1e-6) {
          add({ id: uid(), type: "line", a, b: p });
          setDraft([p]); // lines chain until Esc
        }
        break;
      case "poly":
        if (draft.length > 2 && dist(p, draft[0]) < 1e-6) finishPoly(true);
        else setDraft([...draft, p]);
        break;
      case "rect":
        if (!a) setDraft([p]);
        else {
          const x = Math.min(a[0], p[0]);
          const y = Math.min(a[1], p[1]);
          const w = Math.abs(p[0] - a[0]);
          const h = Math.abs(p[1] - a[1]);
          if (w > 0 && h > 0) add({ id: uid(), type: "rect", x, y, w, h });
          setDraft([]);
        }
        break;
      case "circle":
        if (!a) setDraft([p]);
        else {
          if (dist(a, p) > 0) add({ id: uid(), type: "circle", c: a, r: dist(a, p) });
          setDraft([]);
        }
        break;
      case "dim":
        if (!a) setDraft([p]);
        else if (draft.length === 1) setDraft([a, p]);
        else {
          add({ id: uid(), type: "dim", a, b: draft[1], offset: dimOffset(a, draft[1], p) });
          setDraft([]);
        }
        break;
      case "arc":
        // Centre, then where it starts (the radius), then where it ends.
        if (!a) setDraft([p]);
        else if (draft.length === 1) {
          if (dist(a, p) > 0) setDraft([a, p]);
        } else {
          const r = dist(a, draft[1]);
          const start = angleOf(a, draft[1]);
          const end = angleOf(a, p);
          if (r > 0 && Math.abs(end - start) > 1e-6) add({ id: uid(), type: "arc", c: a, r, start, end });
          setDraft([]);
        }
        break;
      case "angle":
        // The corner, a point on each side, then where the arc goes.
        if (!a) setDraft([p]);
        else if (draft.length < 3) {
          if (dist(draft[0], p) > 0) setDraft([...draft, p]);
        } else {
          add({ id: uid(), type: "angle", c: draft[0], a: draft[1], b: draft[2], r: Math.max(dist(draft[0], p), 1e-3) });
          setDraft([]);
        }
        break;
      case "text":
        setTextAt({ p, value: "" });
        break;
    }
    setTyped("");
  };
  const dimOffset = (a: Pt, b: Pt, p: Pt) => {
    const len = dist(a, b) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    return (p[0] - a[0]) * nx + (p[1] - a[1]) * ny;
  };
  // Typed values: "120" (a length along the cursor's direction), "120<30"
  // (length and angle), "80x40" for a rectangle, "25" or "d50" for a circle.
  const applyTyped = () => {
    const text = typed.trim();
    if (!text) return;
    const a = draft[draft.length - 1];
    const here = cursor?.p;
    if ((tool === "line" || tool === "poly" || (tool === "dim" && draft.length === 1)) && a) {
      const [lenText, angText] = text.split("<");
      const len = parseLength(lenText, plan.units);
      const ang = angText !== undefined ? parseFloat(angText) : here ? angleOf(a, here) : 0;
      if (len !== null && Number.isFinite(ang)) place(polar(a, len, ang));
    } else if (tool === "rect" && draft[0]) {
      const [wt, ht] = text.split(/[x×*,]/);
      const w = parseLength(wt || "", plan.units);
      const h = parseLength(ht ?? wt ?? "", plan.units);
      if (w && h) {
        const sx = here && here[0] < draft[0][0] ? -1 : 1;
        const sy = here && here[1] < draft[0][1] ? -1 : 1;
        place([draft[0][0] + sx * w, draft[0][1] + sy * h]);
      }
    } else if (tool === "arc" && draft.length === 1) {
      // A radius, starting towards the cursor.
      const r = parseLength(text, plan.units);
      if (r) place(polar(draft[0], r, here ? angleOf(draft[0], here) : 0));
    } else if (tool === "arc" && draft.length === 2) {
      // How far it turns, in degrees (negative turns clockwise).
      const span = parseFloat(text);
      if (Number.isFinite(span) && span) place(polar(draft[0], 10, angleOf(draft[0], draft[1]) + span));
    } else if (tool === "circle" && draft[0]) {
      const diameter = /^[dø⌀]/i.test(text);
      const r = parseLength(text.replace(/^[dø⌀]\s*/i, ""), plan.units);
      if (r) place([draft[0][0] + (diameter ? r / 2 : r), draft[0][1]]);
    }
    setTyped("");
  };

  // --- Pointer -----------------------------------------------------------------------------
  const pick = (p: Pt) => {
    const reach = 7 / v.scale;
    let best: Shape | null = null;
    let bestD = reach;
    for (const s of shapes) {
      const d = distanceTo(s, p);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  };
  const handles = (s: Shape): Pt[] => {
    switch (s.type) {
      case "line":
        return [s.a, s.b];
      case "rect":
        return [
          [s.x, s.y],
          [s.x + s.w, s.y],
          [s.x + s.w, s.y + s.h],
          [s.x, s.y + s.h],
        ];
      case "circle":
        return [s.c, [s.c[0] + s.r, s.c[1]]];
      case "poly":
        return s.points;
      case "dim": {
        const [a, b] = dimLine(s);
        return [s.a, s.b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]];
      }
      case "text":
        return [s.p];
      case "arc":
        return [s.c, polar(s.c, s.r, s.start), polar(s.c, s.r, s.end)];
      case "angle": {
        const m = angleArc(s);
        return [s.c, s.a, s.b, polar(s.c, s.r, m.start + arcSpan(m) / 2)];
      }
    }
  };
  const single = selected.size === 1 ? shapes.find((s) => selected.has(s.id)) : undefined;
  const onHandle = (s: Shape, index: number, p: Pt): Shape => {
    switch (s.type) {
      case "line":
        return index === 0 ? { ...s, a: p } : { ...s, b: p };
      case "rect": {
        const c = handles(s);
        const opposite = c[(index + 2) % 4];
        return { ...s, x: Math.min(p[0], opposite[0]), y: Math.min(p[1], opposite[1]), w: Math.abs(p[0] - opposite[0]), h: Math.abs(p[1] - opposite[1]) };
      }
      case "circle":
        return index === 0 ? { ...s, c: p } : { ...s, r: Math.max(0.01, dist(s.c, p)) };
      case "poly":
        return { ...s, points: s.points.map((q, i) => (i === index ? p : q)) };
      case "dim":
        return index === 0 ? { ...s, a: p } : index === 1 ? { ...s, b: p } : { ...s, offset: dimOffset(s.a, s.b, p) };
      case "text":
        return { ...s, p };
      case "arc":
        if (index === 0) return { ...s, c: p };
        if (index === 1) return { ...s, r: Math.max(0.01, dist(s.c, p)), start: angleOf(s.c, p) };
        return { ...s, end: angleOf(s.c, p) };
      case "angle":
        return index === 0 ? { ...s, c: p } : index === 1 ? { ...s, a: p } : index === 2 ? { ...s, b: p } : { ...s, r: Math.max(0.01, dist(s.c, p)) };
    }
  };

  function down(e: React.PointerEvent) {
    box.current?.focus();
    const [sx, sy] = local(e);
    const world = toWorld(sx, sy);
    if (e.button === 1 || tool === "pan" || space.current) {
      drag.current = { mode: "pan", sx, sy, view: v };
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (tool === "select") {
      (e.target as Element).setPointerCapture(e.pointerId);
      if (single) {
        const hs = handles(single);
        const i = hs.findIndex((h) => dist(h, world) < 8 / v.scale);
        if (i >= 0) {
          drag.current = { mode: "handle", id: single.id, index: i, original: single };
          past.current = [...past.current.slice(-99), shapes];
          future.current = [];
          return;
        }
      }
      const hit = pick(world);
      if (hit) {
        const next = new Set(e.shiftKey ? selected : selected.has(hit.id) ? selected : []);
        if (e.shiftKey && next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        setSelected(next);
        drag.current = { mode: "move", start: world, original: shapes };
        past.current = [...past.current.slice(-99), shapes];
        future.current = [];
      } else {
        if (!e.shiftKey) setSelected(new Set());
        drag.current = { mode: "marquee", start: world, add: e.shiftKey };
        setMarquee({ a: world, b: world });
      }
      return;
    }
    const s = snap(world, draft[draft.length - 1]);
    place(s.p);
  }
  function move(e: React.PointerEvent) {
    shift.current = e.shiftKey;
    const [sx, sy] = local(e);
    const world = toWorld(sx, sy);
    const d = drag.current;
    if (d?.mode === "pan") {
      setView({ ...d.view, ox: d.view.ox + sx - d.sx, oy: d.view.oy + sy - d.sy });
      return;
    }
    if (d?.mode === "marquee") {
      setMarquee({ a: d.start, b: world });
      return;
    }
    if (d?.mode === "move") {
      let dx = world[0] - d.start[0];
      let dy = world[1] - d.start[1];
      if (plan.snap) {
        dx = Math.round(dx / plan.grid) * plan.grid;
        dy = Math.round(dy / plan.grid) * plan.grid;
      }
      if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      setShapes(d.original.map((s) => (selected.has(s.id) ? moveShape(s, dx, dy) : s)));
      return;
    }
    if (d?.mode === "handle") {
      const others = d.original;
      const p = snap(world, others.type === "line" ? (d.index === 0 ? others.b : others.a) : undefined).p;
      setShapes(shapes.map((s) => (s.id === d.id ? onHandle(d.original, d.index, p) : s)));
      return;
    }
    setCursor(tool === "select" || tool === "pan" ? { p: world, snap: null } : snap(world, draft[draft.length - 1]));
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "move" || d.mode === "handle") {
      if (JSON.stringify(shapes) !== JSON.stringify(past.current[past.current.length - 1])) commit(shapes, false);
      else past.current.pop();
    }
    if (d.mode === "marquee" && marquee) {
      const x0 = Math.min(marquee.a[0], marquee.b[0]);
      const x1 = Math.max(marquee.a[0], marquee.b[0]);
      const y0 = Math.min(marquee.a[1], marquee.b[1]);
      const y1 = Math.max(marquee.a[1], marquee.b[1]);
      const inside = shapes.filter((s) => keyPoints(s).every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)).map((s) => s.id);
      setSelected(new Set([...(d.add ? selected : []), ...inside]));
      setMarquee(null);
    }
  }
  function wheel(e: React.WheelEvent) {
    const [sx, sy] = local(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(400, Math.max(0.002, v.scale * factor));
    setView({ scale, ox: sx - ((sx - v.ox) * scale) / v.scale, oy: sy - ((sy - v.oy) * scale) / v.scale });
  }

  // --- Keyboard ----------------------------------------------------------------------------
  function key(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let handled = true;
    if (ctrl && k === "z" && !e.shiftKey) undo();
    else if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) redo();
    else if (ctrl && k === "a") {
      setTool("select");
      setSelected(new Set(shapes.map((s) => s.id)));
    } else if (ctrl && k === "d" && selected.size) {
      const copies = shapes.filter((s) => selected.has(s.id)).map((s) => ({ ...moveShape(s, plan.grid, plan.grid), id: uid() }));
      commit([...shapes, ...copies]);
      setSelected(new Set(copies.map((c) => c.id)));
    } else if (e.key === "Escape") {
      if (tool === "poly" && draft.length >= 2) finishPoly(false);
      else {
        setDraft([]);
        setTyped("");
        setSelected(new Set());
      }
    } else if (e.key === "Enter") {
      if (typed) applyTyped();
      else if (tool === "poly") finishPoly(false);
    } else if (e.key === "Backspace" && typed) setTyped(typed.slice(0, -1));
    else if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
      commit(shapes.filter((s) => !selected.has(s.id)));
      setSelected(new Set());
    } else if (e.key.startsWith("Arrow") && selected.size) {
      const step = plan.grid * (e.shiftKey ? 10 : 1);
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      commit(shapes.map((s) => (selected.has(s.id) ? moveShape(s, dx, dy) : s)));
    } else if (e.key === " ") space.current = true;
    else if (!ctrl && draft.length && /^[\d.,'"/ <xX×*dD-]$/.test(e.key)) setTyped(typed + e.key);
    else if (!ctrl && !e.altKey && toolKeys[k] && !draft.length) {
      setTool(toolKeys[k]);
      setSelected(new Set());
    } else if (!ctrl && k === "f") fit();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // --- Panel edits ----------------------------------------------------------------------------
  const update = (id: string, patch: Partial<Shape>) => commit(shapes.map((s) => (s.id === id ? ({ ...s, ...patch } as Shape) : s)));
  const fmt = (mm: number) => formatLength(mm, plan.units);
  const len = (text: string) => parseLength(text, plan.units);

  // --- Rendering --------------------------------------------------------------------------------
  const blueprint = plan.paper !== "white" && plan.paper !== "grid";
  const ink = blueprint ? "#eef5ff" : "#1d2a44";
  const colorOf = (s: Shape) => (!s.color || s.color === "#ffffff" ? ink : s.color);
  let step = plan.grid * v.scale;
  while (step < 8) {
    step *= 5;
  }
  const major = step * 5;
  const label = () => 11 / v.scale;
  const draw = (s: Shape, extra?: { selected?: boolean; preview?: boolean }) => {
    const common = {
      stroke: extra?.selected ? "#ffb02e" : colorOf(s),
      strokeWidth: screenWeight[s.weight || "normal"] + (extra?.selected ? 0.6 : 0),
      strokeDasharray: screenDash[s.dash || "solid"],
      vectorEffect: "non-scaling-stroke" as const,
      fill: "none",
      opacity: extra?.preview ? 0.75 : 1,
    };
    switch (s.type) {
      case "line":
        return <line key={s.id} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} {...common} />;
      case "rect":
        return <rect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} {...common} />;
      case "circle":
        return <circle key={s.id} cx={s.c[0]} cy={s.c[1]} r={s.r} {...common} />;
      case "poly":
        return s.closed ? <polygon key={s.id} points={s.points.map((p) => p.join(",")).join(" ")} {...common} /> : <polyline key={s.id} points={s.points.map((p) => p.join(",")).join(" ")} {...common} />;
      case "text":
        return (
          <text key={s.id} x={s.p[0]} y={s.p[1]} fontSize={s.size} fill={common.stroke} className="plan-text">
            {s.text}
          </text>
        );
      case "arc":
        return <path key={s.id} d={arcPath(s)} {...common} />;
      case "angle": {
        const m = angleArc(s);
        const mid = polar(s.c, s.r + 14 / v.scale, m.start + arcSpan(m) / 2);
        const thin = { ...common, strokeWidth: 1, strokeDasharray: undefined };
        return (
          <g key={s.id}>
            <line x1={s.c[0]} y1={s.c[1]} x2={s.a[0]} y2={s.a[1]} {...thin} opacity={0.6} />
            <line x1={s.c[0]} y1={s.c[1]} x2={s.b[0]} y2={s.b[1]} {...thin} opacity={0.6} />
            <path d={arcPath(m)} {...thin} />
            <text x={mid[0]} y={mid[1]} fontSize={label()} fill={common.stroke} textAnchor="middle" dominantBaseline="middle" className="plan-text">
              {formatAngle(angleBetween(s.c, s.a, s.b))}
            </text>
          </g>
        );
      }
      case "dim": {
        const [a, b] = dimLine(s);
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let deg = -angleOf(a, b);
        if (deg > 90 || deg < -90) deg += 180;
        const thin = { ...common, strokeWidth: 1, strokeDasharray: undefined };
        const arrow = (p: Pt, q: Pt) => {
          const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
          const l = 9 / v.scale;
          return `M${p[0] + Math.cos(ang + 0.35) * l},${p[1] + Math.sin(ang + 0.35) * l}L${p[0]},${p[1]}L${p[0] + Math.cos(ang - 0.35) * l},${p[1] + Math.sin(ang - 0.35) * l}`;
        };
        return (
          <g key={s.id}>
            <line x1={s.a[0]} y1={s.a[1]} x2={a[0]} y2={a[1]} {...thin} opacity={0.6} />
            <line x1={s.b[0]} y1={s.b[1]} x2={b[0]} y2={b[1]} {...thin} opacity={0.6} />
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...thin} />
            <path d={arrow(a, b) + arrow(b, a)} {...thin} />
            <text x={mid[0]} y={mid[1]} dy={-5 / v.scale} fontSize={label()} fill={common.stroke} textAnchor="middle" transform={`rotate(${deg} ${mid[0]} ${mid[1]})`} className="plan-text">
              {fmt(dist(s.a, s.b))}
            </text>
          </g>
        );
      }
    }
  };
  // What is being drawn, following the cursor.
  const preview = (): React.ReactNode => {
    const c = cursor?.p;
    if (!c || !draft.length) return null;
    const a = draft[draft.length - 1];
    const ghost = (s: Shape) => draw({ ...s, ...style }, { preview: true });
    let shape: Shape | null = null;
    let info = "";
    if (tool === "line" || tool === "poly") {
      shape = tool === "line" ? { id: "_", type: "line", a, b: c } : { id: "_", type: "poly", points: [...draft, c] };
      info = `${fmt(dist(a, c))}  ${formatAngle(angleOf(a, c))}`;
    } else if (tool === "rect") {
      shape = { id: "_", type: "rect", x: Math.min(a[0], c[0]), y: Math.min(a[1], c[1]), w: Math.abs(c[0] - a[0]), h: Math.abs(c[1] - a[1]) };
      info = `${fmt(Math.abs(c[0] - a[0]))} × ${fmt(Math.abs(c[1] - a[1]))}`;
    } else if (tool === "circle") {
      shape = { id: "_", type: "circle", c: a, r: dist(a, c) };
      info = `R ${fmt(dist(a, c))}  ⌀ ${fmt(2 * dist(a, c))}`;
    } else if (tool === "arc") {
      if (draft.length === 1) {
        shape = { id: "_", type: "line", a, b: c };
        info = `R ${fmt(dist(a, c))}`;
      } else {
        const r = dist(draft[0], draft[1]);
        const start = angleOf(draft[0], draft[1]);
        const end = angleOf(draft[0], c);
        shape = { id: "_", type: "arc", c: draft[0], r, start, end };
        info = `R ${fmt(r)}  ${formatAngle(arcSpan({ start, end }))}`;
      }
    } else if (tool === "angle") {
      if (draft.length < 3) {
        shape = { id: "_", type: "poly", points: [...draft, c] };
        info = "";
      } else {
        shape = { id: "_", type: "angle", c: draft[0], a: draft[1], b: draft[2], r: dist(draft[0], c) };
        info = formatAngle(angleBetween(draft[0], draft[1], draft[2]));
      }
    } else if (tool === "dim") {
      shape = draft.length === 1 ? { id: "_", type: "line", a, b: c } : { id: "_", type: "dim", a: draft[0], b: draft[1], offset: dimOffset(draft[0], draft[1], c) };
      info = fmt(draft.length === 1 ? dist(a, c) : dist(draft[0], draft[1]));
    }
    return (
      <>
        {shape && ghost(shape)}
        <text x={c[0]} y={c[1]} dx={14 / v.scale} dy={-12 / v.scale} fontSize={label()} className="plan-measure">
          {typed ? `${typed} ⏎` : info}
        </text>
      </>
    );
  };

  const hints: Record<Tool, string> = {
    select: t("Click to select, drag to move, Shift to add. Drag handles to reshape. Arrows nudge, Ctrl+D duplicates."),
    line: t("Click two points. Type a length (or length<angle) and press Enter. Shift keeps 15° steps. Esc ends."),
    rect: t("Click two corners, or click one and type width x height."),
    circle: t("Click the centre, then the edge, or type a radius (d50 for a diameter)."),
    arc: t("Click the centre, then where the arc starts, then where it ends. Type a radius, then the degrees it turns."),
    angle: t("Click the corner, a point on each side, then where the angle is marked."),
    poly: t("Click points; Enter or Esc finishes, clicking the first point closes the shape."),
    dim: t("Click two points, then where the dimension line goes."),
    text: t("Click where the text goes."),
    pan: t("Drag to move around. The wheel zooms everywhere; the middle button or Space also pans."),
  };
  const tools: [Tool, string, React.ReactNode, string][] = [
    ["select", t("Select"), <MousePointer2 size={16} />, "V"],
    ["line", t("Line"), <PenLine size={16} />, "L"],
    ["rect", t("Rectangle"), <RectangleHorizontal size={16} />, "R"],
    ["circle", t("Circle"), <Circle size={16} />, "C"],
    ["arc", t("Arc"), <CircleDashed size={16} />, "A"],
    ["poly", t("Polyline"), <Spline size={16} />, "P"],
    ["dim", t("Dimension"), <Ruler size={16} />, "D"],
    ["angle", t("Angle"), <Radius size={16} />, "N"],
    ["text", t("Text"), <Type size={16} />, "T"],
    ["pan", t("Pan"), <Hand size={16} />, "H"],
  ];
  const showY = (y: number) => fmt(-y);
  const c = cursor?.p;
  return (
    <div className={"plan-editor" + (blueprint ? " blueprint" : plan.paper === "grid" ? " grid" : " white")}>
      <div className="plan-tools" role="toolbar" aria-label={t("Drawing tools")}>
        {tools.map(([id, name, icon, keyName]) => (
          <button
            key={id}
            className={"ink-tool" + (tool === id ? " active" : "")}
            aria-pressed={tool === id}
            data-tip={name}
            data-keys={keyName}
            onClick={() => {
              setTool(id);
              setDraft([]);
              setTyped("");
              box.current?.focus();
            }}
          >
            {icon}
          </button>
        ))}
        <span className="ink-sep" />
        <button className="ink-tool" data-tip={t("Undo")} data-keys="Ctrl+Z" disabled={!past.current.length} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="ink-tool" data-tip={t("Redo")} data-keys="Ctrl+Y" disabled={!future.current.length} onClick={redo}>
          <Redo2 size={16} />
        </button>
        <button className="ink-tool" data-tip={t("Fit the drawing")} data-keys="F" onClick={() => fit()}>
          <Maximize size={16} />
        </button>
      </div>
      <div
        ref={box}
        className="plan-canvas"
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => setCursor(null)}
        onWheel={wheel}
        onDoubleClick={() => tool === "poly" && finishPoly(false)}
        onKeyDown={key}
        onKeyUp={(e) => {
          if (e.key === " ") space.current = false;
          shift.current = e.shiftKey;
        }}
        style={{ cursor: tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair" }}
        aria-label={t("Plan drawing")}
      >
        <svg width={size.w} height={size.h}>
          <defs>
            <pattern id={`minor-${plan.id}`} width={step} height={step} patternUnits="userSpaceOnUse" x={v.ox % step} y={v.oy % step}>
              <path d={`M ${step} 0 L 0 0 0 ${step}`} className="plan-grid-minor" />
            </pattern>
            <pattern id={`major-${plan.id}`} width={major} height={major} patternUnits="userSpaceOnUse" x={v.ox % major} y={v.oy % major}>
              <rect width={major} height={major} fill={`url(#minor-${plan.id})`} />
              <path d={`M ${major} 0 L 0 0 0 ${major}`} className="plan-grid-major" />
            </pattern>
          </defs>
          {plan.paper !== "white" && <rect width={size.w} height={size.h} fill={`url(#major-${plan.id})`} />}
          <g transform={`translate(${v.ox} ${v.oy}) scale(${v.scale})`}>
            <path d={`M ${-12 / v.scale} 0 H ${12 / v.scale} M 0 ${-12 / v.scale} V ${12 / v.scale}`} className="plan-origin" vectorEffect="non-scaling-stroke" />
            {shapes.map((s) => draw(s, { selected: selected.has(s.id) }))}
            {preview()}
            {single &&
              tool === "select" &&
              handles(single).map((h, i) => <rect key={i} x={h[0] - 4 / v.scale} y={h[1] - 4 / v.scale} width={8 / v.scale} height={8 / v.scale} className="plan-handle" vectorEffect="non-scaling-stroke" />)}
            {marquee && (
              <rect
                x={Math.min(marquee.a[0], marquee.b[0])}
                y={Math.min(marquee.a[1], marquee.b[1])}
                width={Math.abs(marquee.b[0] - marquee.a[0])}
                height={Math.abs(marquee.b[1] - marquee.a[1])}
                className="plan-marquee"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {cursor && tool !== "select" && tool !== "pan" && (
              <g className={"plan-cursor" + (cursor.snap === "point" ? " on-point" : "")}>
                <circle cx={cursor.p[0]} cy={cursor.p[1]} r={(cursor.snap === "point" ? 6 : 3) / v.scale} vectorEffect="non-scaling-stroke" />
              </g>
            )}
          </g>
        </svg>
        {textAt && (
          <input
            className="plan-text-input"
            autoFocus
            style={{ left: textAt.p[0] * v.scale + v.ox, top: textAt.p[1] * v.scale + v.oy - 24 }}
            value={textAt.value}
            placeholder={t("Text, then Enter")}
            onChange={(e) => setTextAt({ ...textAt, value: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                if (textAt.value.trim()) add({ id: uid(), type: "text", p: textAt.p, text: textAt.value.trim(), size: Math.max(2, 14 / v.scale) });
                setTextAt(null);
                box.current?.focus();
              } else if (e.key === "Escape") setTextAt(null);
            }}
            onBlur={() => setTextAt(null)}
          />
        )}
      </div>
      <footer className="plan-status">
        <span>{c ? `X ${fmt(c[0])}   Y ${showY(c[1])}` : ""}</span>
        <span>{cursor?.snap === "point" ? t("Snapped to a point") : plan.snap ? t("Grid {size}", { size: fmt(plan.grid) }) : t("Snap off")}</span>
        <span className="plan-hint">{hints[tool]}</span>
      </footer>
      <aside className="plan-panel" aria-label={t("Properties")}>
        {single ? (
          <ShapePanel shape={single} units={plan.units} fmt={fmt} len={len} onChange={(p) => update(single.id, p)} />
        ) : selected.size > 1 ? (
          <p className="hint">{t("{count} shapes selected", { count: selected.size })}</p>
        ) : (
          <div className="plan-summary">
            <strong>{t("{count} shapes", { count: shapes.length })}</strong>
            <p className="hint">{t("Type exact values while drawing, or select a shape to edit its numbers here.")}</p>
            <p className="hint">
              <Magnet size={13} /> {t("Snaps to the grid and to ends, middles, corners and centres of shapes.")}
            </p>
          </div>
        )}
        <div className="plan-style">
          <span className="plan-label">{selected.size ? t("Style of the selection") : t("Style for new shapes")}</span>
          <div className="plan-colors">
            {planColors.map((col) => (
              <button
                key={col}
                className={"ink-swatch" + ((single?.color || style.color) === col ? " active" : "")}
                style={{ "--swatch": col === "#ffffff" ? ink : col } as React.CSSProperties}
                aria-label={col === "#ffffff" ? t("Paper ink") : col}
                onClick={() => (selected.size ? commit(shapes.map((s) => (selected.has(s.id) ? { ...s, color: col } : s))) : setStyle({ ...style, color: col }))}
              />
            ))}
          </div>
          <div className="plan-row">
            <select
              aria-label={t("Line weight")}
              value={single?.weight || style.weight}
              onChange={(e) => {
                const weight = e.target.value as "thin" | "normal" | "bold";
                if (selected.size) commit(shapes.map((s) => (selected.has(s.id) ? { ...s, weight } : s)));
                else setStyle({ ...style, weight });
              }}
            >
              <option value="thin">{t("Thin")}</option>
              <option value="normal">{t("Normal")}</option>
              <option value="bold">{t("Bold")}</option>
            </select>
            <select
              aria-label={t("Line type")}
              value={single?.dash || style.dash}
              onChange={(e) => {
                const dash = e.target.value as "solid" | "dashed" | "center";
                if (selected.size) commit(shapes.map((s) => (selected.has(s.id) ? { ...s, dash } : s)));
                else setStyle({ ...style, dash });
              }}
            >
              <option value="solid">{t("Solid")}</option>
              <option value="dashed">{t("Hidden (dashed)")}</option>
              <option value="center">{t("Centre line")}</option>
            </select>
          </div>
          {selected.size > 0 && (
            <div className="plan-row">
              <button
                className="mini"
                onClick={() => {
                  const copies = shapes.filter((s) => selected.has(s.id)).map((s) => ({ ...moveShape(s, plan.grid, plan.grid), id: uid() }));
                  commit([...shapes, ...copies]);
                  setSelected(new Set(copies.map((x) => x.id)));
                }}
              >
                <Copy size={13} />
                {t("Duplicate")}
              </button>
              <button className="mini" onClick={() => (commit(shapes.filter((s) => !selected.has(s.id))), setSelected(new Set()))}>
                <Trash2 size={13} />
                {t("Delete")}
              </button>
            </div>
          )}
        </div>
        <p className="hint plan-keys">
          <Move size={12} /> {t("Wheel: zoom. Middle button or Space: pan. F: fit.")}
        </p>
      </aside>
    </div>
  );
}

// One exact value: shown in the plan's unit, typed in any unit.
type FieldProps = { label: string; value: number; set: (v: number) => void; angle?: boolean; fmt: (mm: number) => string; len: (t: string) => number | null };
function NumberField({ label, value, set, angle, fmt, len }: FieldProps) {
  const shown = angle ? formatAngle(value) : fmt(value);
  const [draftValue, setDraftValue] = useState(shown);
  useEffect(() => setDraftValue(shown), [shown]);
  const apply = () => {
    const v = angle ? parseFloat(draftValue) : len(draftValue);
    if (v !== null && Number.isFinite(v)) set(v);
    else setDraftValue(shown);
  };
  return (
    <label className="plan-field">
      <span>{label}</span>
      <input value={draftValue} onChange={(e) => setDraftValue(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
    </label>
  );
}

// Exact numbers for one shape. Y is shown upwards, as on paper.
function ShapePanel({
  shape: s,
  units,
  fmt,
  len,
  onChange,
}: {
  shape: Shape;
  units: PlanDoc["units"];
  fmt: (mm: number) => string;
  len: (t: string) => number | null;
  onChange: (p: Partial<Shape>) => void;
}) {
  const typeName = { line: t("Line"), rect: t("Rectangle"), circle: t("Circle"), arc: t("Arc"), poly: t("Polyline"), dim: t("Dimension"), angle: t("Angle"), text: t("Text") }[s.type];
  return (
    <div className="plan-props">
      <strong>{typeName}</strong>
      {s.type === "line" && (
        <>
          <NumberField fmt={fmt} len={len} label="X1" value={s.a[0]} set={(v) => onChange({ a: [v, s.a[1]] })} />
          <NumberField fmt={fmt} len={len} label="Y1" value={-s.a[1]} set={(v) => onChange({ a: [s.a[0], -v] })} />
          <NumberField fmt={fmt} len={len} label="X2" value={s.b[0]} set={(v) => onChange({ b: [v, s.b[1]] })} />
          <NumberField fmt={fmt} len={len} label="Y2" value={-s.b[1]} set={(v) => onChange({ b: [s.b[0], -v] })} />
          <NumberField fmt={fmt} len={len} label={t("Length")} value={dist(s.a, s.b)} set={(v) => onChange({ b: polar(s.a, v, angleOf(s.a, s.b)) })} />
          <NumberField fmt={fmt} len={len} label={t("Angle")} value={angleOf(s.a, s.b)} angle set={(v) => onChange({ b: polar(s.a, dist(s.a, s.b), v) })} />
        </>
      )}
      {s.type === "rect" && (
        <>
          <NumberField fmt={fmt} len={len} label="X" value={s.x} set={(v) => onChange({ x: v })} />
          <NumberField fmt={fmt} len={len} label="Y" value={-(s.y + s.h)} set={(v) => onChange({ y: -v - s.h })} />
          <NumberField fmt={fmt} len={len} label={t("Width")} value={s.w} set={(v) => onChange({ w: Math.max(0.01, v) })} />
          <NumberField fmt={fmt} len={len} label={t("Height")} value={s.h} set={(v) => onChange({ h: Math.max(0.01, v), y: s.y + s.h - Math.max(0.01, v) })} />
          <p className="hint">
            {t("Area")}: {formatArea(s.w * s.h, units)}
          </p>
        </>
      )}
      {s.type === "circle" && (
        <>
          <NumberField fmt={fmt} len={len} label={t("Centre X")} value={s.c[0]} set={(v) => onChange({ c: [v, s.c[1]] })} />
          <NumberField fmt={fmt} len={len} label={t("Centre Y")} value={-s.c[1]} set={(v) => onChange({ c: [s.c[0], -v] })} />
          <NumberField fmt={fmt} len={len} label={t("Radius")} value={s.r} set={(v) => onChange({ r: Math.max(0.01, v) })} />
          <NumberField fmt={fmt} len={len} label={t("Diameter")} value={s.r * 2} set={(v) => onChange({ r: Math.max(0.01, v / 2) })} />
        </>
      )}
      {s.type === "poly" && (
        <>
          <p className="hint">{t("{count} points", { count: s.points.length })}</p>
          <label className="check-label">
            <input type="checkbox" checked={Boolean(s.closed)} onChange={(e) => onChange({ closed: e.target.checked })} />
            {t("Closed shape")}
          </label>
          <p className="hint">
            {t("Perimeter")}: {fmt(s.points.reduce((n, p, i) => n + (i ? dist(s.points[i - 1], p) : 0), 0) + (s.closed && s.points.length > 2 ? dist(s.points[s.points.length - 1], s.points[0]) : 0))}
          </p>
        </>
      )}
      {s.type === "dim" && (
        <>
          <p className="hint">
            {t("Measures")} {fmt(dist(s.a, s.b))}
          </p>
          <NumberField fmt={fmt} len={len} label={t("Offset")} value={s.offset} set={(v) => onChange({ offset: v })} />
        </>
      )}
      {s.type === "arc" && (
        <>
          <NumberField fmt={fmt} len={len} label={t("Centre X")} value={s.c[0]} set={(v) => onChange({ c: [v, s.c[1]] })} />
          <NumberField fmt={fmt} len={len} label={t("Centre Y")} value={-s.c[1]} set={(v) => onChange({ c: [s.c[0], -v] })} />
          <NumberField fmt={fmt} len={len} label={t("Radius")} value={s.r} set={(v) => onChange({ r: Math.max(0.01, v) })} />
          <NumberField fmt={fmt} len={len} label={t("Start")} value={s.start} angle set={(v) => onChange({ start: v })} />
          <NumberField fmt={fmt} len={len} label={t("End")} value={s.end} angle set={(v) => onChange({ end: v })} />
          <p className="hint">
            {t("Turns")} {formatAngle(arcSpan(s))} · {t("Arc length")} {fmt((arcSpan(s) * Math.PI * s.r) / 180)}
          </p>
        </>
      )}
      {s.type === "angle" && (
        <>
          <p className="hint">
            {t("Measures")} {formatAngle(angleBetween(s.c, s.a, s.b))}
          </p>
          <NumberField fmt={fmt} len={len} label={t("Radius")} value={s.r} set={(v) => onChange({ r: Math.max(0.01, v) })} />
        </>
      )}
      {s.type === "text" && (
        <>
          <label className="plan-field">
            <span>{t("Text")}</span>
            <input defaultValue={s.text} onBlur={(e) => e.target.value.trim() && onChange({ text: e.target.value.trim() })} />
          </label>
          <NumberField fmt={fmt} len={len} label={t("Height")} value={s.size} set={(v) => onChange({ size: Math.max(0.5, v) })} />
        </>
      )}
    </div>
  );
}
