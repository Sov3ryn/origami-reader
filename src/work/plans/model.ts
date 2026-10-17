// Plans: precise technical drawings (a small CAD). Geometry is stored in
// millimetres; units only change how lengths are shown and typed.
export type Unit = "mm" | "cm" | "m" | "in" | "ft";
export type Pt = [number, number];
export type Stroke = { color?: string; weight?: "thin" | "normal" | "bold"; dash?: "solid" | "dashed" | "center" };
export type Shape = Stroke &
  (
    | { id: string; type: "line"; a: Pt; b: Pt }
    | { id: string; type: "rect"; x: number; y: number; w: number; h: number }
    | { id: string; type: "circle"; c: Pt; r: number }
    | { id: string; type: "poly"; points: Pt[]; closed?: boolean }
    | { id: string; type: "dim"; a: Pt; b: Pt; offset: number }
    | { id: string; type: "text"; p: Pt; text: string; size: number }
    // Counter-clockwise from start to end, in degrees (0 = right, as on paper).
    | { id: string; type: "arc"; c: Pt; r: number; start: number; end: number }
    // The angle at c between the rays to a and b, marked at distance r.
    | { id: string; type: "angle"; c: Pt; a: Pt; b: Pt; r: number }
  );
export type PlanDoc = {
  id: string;
  kind: "plan";
  title: string;
  units: Unit;
  grid: number; // mm between grid lines
  snap: boolean;
  paper?: "blueprint" | "white" | "grid";
  shapes: Shape[];
  subjectId?: string;
  icon?: string;
  pinned?: boolean;
  created: number;
  updated: number;
  workspace?: string;
  vault?: string;
};

export const MM: Record<Unit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
export const metric = (u: Unit) => u === "mm" || u === "cm" || u === "m";
// Grid steps offered for each system, in mm.
export const gridSteps = (u: Unit): { mm: number; label: string }[] =>
  metric(u)
    ? [
        { mm: 1, label: "1 mm" },
        { mm: 5, label: "5 mm" },
        { mm: 10, label: "1 cm" },
        { mm: 50, label: "5 cm" },
        { mm: 100, label: "10 cm" },
        { mm: 500, label: "50 cm" },
        { mm: 1000, label: "1 m" },
      ]
    : [
        { mm: 25.4 / 16, label: '1/16"' },
        { mm: 25.4 / 8, label: '1/8"' },
        { mm: 25.4 / 4, label: '1/4"' },
        { mm: 25.4, label: '1"' },
        { mm: 25.4 * 6, label: '6"' },
        { mm: 304.8, label: "1'" },
      ];

export function newPlan(title: string, units: Unit = "mm"): Omit<PlanDoc, "id" | "created" | "updated"> {
  return { kind: "plan", title, units, grid: metric(units) ? 10 : 25.4, snap: true, paper: "blueprint", shapes: [] };
}

// --- Lengths -------------------------------------------------------------------
// Rounded the way people expect (1.2345 shows as 1.235, not 1.234).
const trim = (n: number, digits: number) => {
  const f = 10 ** digits;
  return String(Math.round(n * f + Math.sign(n) * 1e-7) / f);
};
function fraction(inches: number, denominator = 16) {
  const sign = inches < 0 ? "-" : "";
  const total = Math.round(Math.abs(inches) * denominator);
  const whole = Math.floor(total / denominator);
  let num = total % denominator;
  let den = denominator;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (!num) return `${sign}${whole}`;
  return whole ? `${sign}${whole} ${num}/${den}` : `${sign}${num}/${den}`;
}
// 1234.5 mm as "1234.5 mm", "123.45 cm", "1.235 m", '48 5/8"' or "4' 0 5/8"".
export function formatLength(mm: number, unit: Unit) {
  if (unit === "mm") return `${trim(mm, 1)} mm`;
  if (unit === "cm") return `${trim(mm / 10, 2)} cm`;
  if (unit === "m") return `${trim(mm / 1000, 3)} m`;
  const inches = mm / 25.4;
  if (unit === "in") return `${fraction(inches)}"`;
  const sign = inches < 0 ? "-" : "";
  const abs = Math.round(Math.abs(inches) * 16) / 16;
  const feet = Math.floor(abs / 12);
  return `${sign}${feet}' ${fraction(abs - feet * 12)}"`;
}
// Areas in the square of the plan's unit.
export function formatArea(mm2: number, unit: Unit) {
  const per = MM[unit] ** 2;
  const digits = unit === "mm" ? 0 : unit === "cm" || unit === "in" ? 2 : 3;
  return `${trim(mm2 / per, digits)} ${unit === "in" ? "in" : unit === "ft" ? "ft" : unit}²`;
}
export const formatAngle = (deg: number) => `${trim(((deg % 360) + 360) % 360, 1)}°`;

// Reads what someone types: "120", "12.5 cm", "1.2m", '3/4"', '5\' 6 1/2"', "2ft", "15 in".
// A number alone is in the plan's unit. Returns mm, or null.
export function parseLength(text: string, unit: Unit): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, ".").replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  if (!s) return null;
  const num = (v: string) => {
    const parts = v.trim().split(/\s+/);
    let total = 0;
    for (const p of parts) {
      const f = /^(\d+)\/(\d+)$/.exec(p);
      if (f) total += +f[1] / +f[2];
      else if (/^-?\d*\.?\d+$/.test(p)) total += parseFloat(p);
      else return NaN;
    }
    return total;
  };
  const feetInches = /^(-?[\d.\s/]+)\s*(?:'|ft|feet|foot)\s*(?:([\d.\s/]+)\s*(?:"|in|inch|inches)?)?$/.exec(s);
  if (feetInches) {
    const ft = num(feetInches[1]);
    const inch = feetInches[2] ? num(feetInches[2]) : 0;
    return Number.isFinite(ft) && Number.isFinite(inch) ? ft * 304.8 + inch * 25.4 * (ft < 0 ? -1 : 1) : null;
  }
  const m = /^(-?[\d.\s/]+?)\s*(mm|cm|m|in|inch|inches|"|ft)?$/.exec(s);
  if (!m) return null;
  const v = num(m[1]);
  if (!Number.isFinite(v)) return null;
  const u = m[2] === '"' || m[2] === "inch" || m[2] === "inches" ? "in" : ((m[2] as Unit | undefined) ?? unit);
  return v * MM[u];
}

// --- Geometry --------------------------------------------------------------------
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// Angles as on paper: 0° to the right, counter-clockwise (y grows downwards here).
export const angleOf = (a: Pt, b: Pt) => (Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI || 0;
export const polar = (a: Pt, length: number, deg: number): Pt => [a[0] + length * Math.cos((deg * Math.PI) / 180), a[1] - length * Math.sin((deg * Math.PI) / 180)];
export const snapGrid = (p: Pt, grid: number): Pt => [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid];
// Holding Shift keeps lines at multiples of 15°.
export function constrain(a: Pt, b: Pt): Pt {
  const len = dist(a, b);
  const deg = Math.round(angleOf(a, b) / 15) * 15;
  return polar(a, len, deg);
}

// Points worth snapping to: ends, middles, centres and corners.
export function keyPoints(s: Shape): Pt[] {
  switch (s.type) {
    case "line":
    case "dim":
      return [s.a, s.b, [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]];
    case "rect":
      return [
        [s.x, s.y],
        [s.x + s.w, s.y],
        [s.x, s.y + s.h],
        [s.x + s.w, s.y + s.h],
        [s.x + s.w / 2, s.y + s.h / 2],
        [s.x + s.w / 2, s.y],
        [s.x + s.w / 2, s.y + s.h],
        [s.x, s.y + s.h / 2],
        [s.x + s.w, s.y + s.h / 2],
      ];
    case "circle":
      return [s.c, [s.c[0] + s.r, s.c[1]], [s.c[0] - s.r, s.c[1]], [s.c[0], s.c[1] + s.r], [s.c[0], s.c[1] - s.r]];
    case "poly":
      return s.points;
    case "text":
      return [s.p];
    case "arc":
      return [s.c, polar(s.c, s.r, s.start), polar(s.c, s.r, s.end), polar(s.c, s.r, s.start + arcSpan(s) / 2)];
    case "angle":
      return [s.c, s.a, s.b];
  }
}

// How far an arc turns, 0 to 360.
export const arcSpan = (s: { start: number; end: number }) => {
  const d = (((s.end - s.start) % 360) + 360) % 360;
  return d === 0 ? 360 : d;
};
// Is a direction (degrees) inside an arc's sweep?
const within = (deg: number, s: { start: number; end: number }) => (((deg - s.start) % 360) + 360) % 360 <= arcSpan(s);
// The angle between two rays from c, 0 to 180.
export function angleBetween(c: Pt, a: Pt, b: Pt) {
  let d = Math.abs(angleOf(c, a) - angleOf(c, b)) % 360;
  if (d > 180) d = 360 - d;
  return d;
}
// The smaller turn from ray a to ray b, as an arc around c (for marking).
export function angleArc(s: { c: Pt; a: Pt; b: Pt; r: number }) {
  const α = angleOf(s.c, s.a);
  const β = angleOf(s.c, s.b);
  const ccw = (((β - α) % 360) + 360) % 360;
  return ccw <= 180 ? { c: s.c, r: s.r, start: α, end: β } : { c: s.c, r: s.r, start: β, end: α };
}
// SVG path of an arc (y grows downwards on screen and in SVG).
export function arcPath(s: { c: Pt; r: number; start: number; end: number }) {
  const span = arcSpan(s);
  if (span >= 359.999) {
    const [x, y] = s.c;
    return `M ${x + s.r} ${y} A ${s.r} ${s.r} 0 1 0 ${x - s.r} ${y} A ${s.r} ${s.r} 0 1 0 ${x + s.r} ${y}`;
  }
  const a = polar(s.c, s.r, s.start);
  const b = polar(s.c, s.r, s.end);
  return `M ${a[0]} ${a[1]} A ${s.r} ${s.r} 0 ${span > 180 ? 1 : 0} 0 ${b[0]} ${b[1]}`;
}

function segDist(p: Pt, a: Pt, b: Pt) {
  const len = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len));
  return dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}
// How far a point is from a shape's outline (for picking).
export function distanceTo(s: Shape, p: Pt): number {
  switch (s.type) {
    case "line":
      return segDist(p, s.a, s.b);
    case "dim": {
      const [a, b] = dimLine(s);
      return Math.min(segDist(p, a, b), segDist(p, s.a, a), segDist(p, s.b, b));
    }
    case "rect": {
      const c: Pt[] = [
        [s.x, s.y],
        [s.x + s.w, s.y],
        [s.x + s.w, s.y + s.h],
        [s.x, s.y + s.h],
      ];
      return Math.min(...c.map((q, i) => segDist(p, q, c[(i + 1) % 4])));
    }
    case "circle":
      return Math.abs(dist(p, s.c) - s.r);
    case "poly": {
      let best = Infinity;
      for (let i = 0; i < s.points.length - 1; i++) best = Math.min(best, segDist(p, s.points[i], s.points[i + 1]));
      if (s.closed && s.points.length > 2) best = Math.min(best, segDist(p, s.points[s.points.length - 1], s.points[0]));
      return best;
    }
    case "text":
      return dist(p, s.p) < s.size * Math.max(1, s.text.length) * 0.6 ? 0 : dist(p, s.p);
    case "arc": {
      if (within(angleOf(s.c, p), s)) return Math.abs(dist(p, s.c) - s.r);
      return Math.min(dist(p, polar(s.c, s.r, s.start)), dist(p, polar(s.c, s.r, s.end)));
    }
    case "angle": {
      const m = angleArc(s);
      const onArc = within(angleOf(s.c, p), m) ? Math.abs(dist(p, s.c) - s.r) : Infinity;
      return Math.min(onArc, segDist(p, s.c, s.a), segDist(p, s.c, s.b));
    }
  }
}

// A dimension's measuring line, moved off the measured points by `offset`.
export function dimLine(d: { a: Pt; b: Pt; offset: number }): [Pt, Pt] {
  const len = dist(d.a, d.b) || 1;
  const nx = -(d.b[1] - d.a[1]) / len;
  const ny = (d.b[0] - d.a[0]) / len;
  return [
    [d.a[0] + nx * d.offset, d.a[1] + ny * d.offset],
    [d.b[0] + nx * d.offset, d.b[1] + ny * d.offset],
  ];
}

export function moveShape(s: Shape, dx: number, dy: number): Shape {
  const m = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  switch (s.type) {
    case "line":
    case "dim":
      return { ...s, a: m(s.a), b: m(s.b) };
    case "rect":
      return { ...s, x: s.x + dx, y: s.y + dy };
    case "circle":
      return { ...s, c: m(s.c) };
    case "poly":
      return { ...s, points: s.points.map(m) };
    case "text":
      return { ...s, p: m(s.p) };
    case "arc":
      return { ...s, c: m(s.c) };
    case "angle":
      return { ...s, c: m(s.c), a: m(s.a), b: m(s.b) };
  }
}

export function bounds(shapes: Shape[]): { x: number; y: number; w: number; h: number } | null {
  const pts: Pt[] = [];
  for (const s of shapes) {
    if (s.type === "circle") pts.push([s.c[0] - s.r, s.c[1] - s.r], [s.c[0] + s.r, s.c[1] + s.r]);
    else if (s.type === "arc") {
      pts.push(polar(s.c, s.r, s.start), polar(s.c, s.r, s.end));
      for (const d of [0, 90, 180, 270]) if (within(d, s)) pts.push(polar(s.c, s.r, d));
    } else if (s.type === "angle") pts.push(s.c, s.a, s.b);
    else if (s.type === "dim") pts.push(s.a, s.b, ...dimLine(s));
    else pts.push(...keyPoints(s));
  }
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// --- Drawing -----------------------------------------------------------------------
export const weights = { thin: 0.25, normal: 0.5, bold: 1 } as const;
export const dashes = { solid: "", dashed: "6 4", center: "12 3 2 3" } as const;
export const planColors = ["#ffffff", "#1d2a44", "#d64545", "#2f7de1", "#2e9d61", "#e08a1e", "#8a5cd6"];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
// The plan as an SVG in real size (1 user unit = 1 mm).
export function planToSvg(plan: PlanDoc, ink = "#1d2a44", background = "#ffffff") {
  const b = bounds(plan.shapes) || { x: 0, y: 0, w: 100, h: 100 };
  const pad = Math.max(10, Math.max(b.w, b.h) * 0.05);
  const vb = [b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2];
  const body = plan.shapes.map((s) => shapeSvg(s, plan.units, ink, Math.max(b.w, b.h) / 300)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map((n) => n.toFixed(2)).join(" ")}" width="${vb[2].toFixed(1)}mm" height="${vb[3].toFixed(1)}mm"><title>${esc(plan.title || "Plan")}</title><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${background}"/>${body}</svg>`;
}
export function shapeSvg(s: Shape, unit: Unit, ink: string, scale = 1) {
  const color = s.color && s.color !== "#ffffff" ? s.color : ink;
  const w = weights[s.weight || "normal"] * Math.max(1, scale);
  const dash = dashes[s.dash || "solid"];
  const st = `fill="none" stroke="${color}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash.split(" ").map((n) => (+n * Math.max(1, scale)).toFixed(1)).join(" ")}"` : ""}`;
  switch (s.type) {
    case "line":
      return `<line x1="${s.a[0]}" y1="${s.a[1]}" x2="${s.b[0]}" y2="${s.b[1]}" ${st}/>`;
    case "rect":
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" ${st}/>`;
    case "circle":
      return `<circle cx="${s.c[0]}" cy="${s.c[1]}" r="${s.r}" ${st}/>`;
    case "poly":
      return `<${s.closed ? "polygon" : "polyline"} points="${s.points.map((p) => p.join(",")).join(" ")}" ${st}/>`;
    case "text":
      return `<text x="${s.p[0]}" y="${s.p[1]}" font-size="${s.size}" font-family="Inter, Segoe UI, sans-serif" fill="${color}">${esc(s.text)}</text>`;
    case "arc":
      return `<path d="${arcPath(s)}" ${st}/>`;
    case "angle": {
      const m = angleArc(s);
      const mid = polar(s.c, s.r + Math.max(3, 4 * scale), m.start + arcSpan(m) / 2);
      const size = Math.max(2.5, 3.5 * scale);
      const thin = `fill="none" stroke="${color}" stroke-width="${(0.25 * Math.max(1, scale)).toFixed(2)}"`;
      return `<g class="dim"><line x1="${s.c[0]}" y1="${s.c[1]}" x2="${s.a[0]}" y2="${s.a[1]}" ${thin}/><line x1="${s.c[0]}" y1="${s.c[1]}" x2="${s.b[0]}" y2="${s.b[1]}" ${thin}/><path d="${arcPath(m)}" ${thin}/><text x="${mid[0]}" y="${mid[1]}" font-size="${size}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Segoe UI, sans-serif" fill="${color}">${formatAngle(angleBetween(s.c, s.a, s.b))}</text></g>`;
    }
    case "dim": {
      const [a, b] = dimLine(s);
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let deg = -angleOf(a, b);
      if (deg > 90 || deg < -90) deg += 180;
      const size = Math.max(2.5, 3.5 * scale);
      const thin = `fill="none" stroke="${color}" stroke-width="${(0.25 * Math.max(1, scale)).toFixed(2)}"`;
      const tick = (p: Pt) => {
        const len = size * 0.6;
        const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 4);
        return `<line x1="${p[0] - Math.cos(ang) * len}" y1="${p[1] - Math.sin(ang) * len}" x2="${p[0] + Math.cos(ang) * len}" y2="${p[1] + Math.sin(ang) * len}" ${thin}/>`;
      };
      return (
        `<g class="dim"><line x1="${s.a[0]}" y1="${s.a[1]}" x2="${a[0]}" y2="${a[1]}" ${thin}/><line x1="${s.b[0]}" y1="${s.b[1]}" x2="${b[0]}" y2="${b[1]}" ${thin}/>` +
        `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${thin}/>${tick(a)}${tick(b)}` +
        `<text x="${mid[0]}" y="${mid[1]}" dy="-${(size * 0.45).toFixed(2)}" font-size="${size}" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" fill="${color}" transform="rotate(${deg.toFixed(2)} ${mid[0]} ${mid[1]})">${esc(formatLength(dist(s.a, s.b), unit))}</text></g>`
      );
    }
  }
}

// --- DXF (AutoCAD R12, ASCII): opens in AutoCAD, LibreCAD, FreeCAD, Inkscape.
// Y is flipped (DXF grows upwards). Units are millimetres ($INSUNITS 4).
export function planToDxf(plan: PlanDoc) {
  const out: (string | number)[] = [];
  const g = (code: number, value: string | number) => out.push(code, typeof value === "number" ? Number(value.toFixed(6)) : value);
  const layer = (s: Shape) => (s.type === "dim" || s.type === "angle" ? "DIMENSIONS" : s.type === "text" ? "TEXT" : "LINES");
  const y = (v: number) => -v;
  g(0, "SECTION");
  g(2, "HEADER");
  g(9, "$INSUNITS");
  g(70, 4);
  g(0, "ENDSEC");
  g(0, "SECTION");
  g(2, "ENTITIES");
  const line = (a: Pt, b: Pt, l: string) => {
    g(0, "LINE");
    g(8, l);
    g(10, a[0]);
    g(20, y(a[1]));
    g(30, 0);
    g(11, b[0]);
    g(21, y(b[1]));
    g(31, 0);
  };
  const text = (p: Pt, h: number, value: string, l: string, rot = 0) => {
    g(0, "TEXT");
    g(8, l);
    g(10, p[0]);
    g(20, y(p[1]));
    g(30, 0);
    g(40, h);
    // CAD programs write the degree sign as %%d.
    g(1, value.replace(/[\r\n]+/g, " ").replace(/°/g, "%%d"));
    if (rot) g(50, rot);
  };
  for (const s of plan.shapes) {
    const l = layer(s);
    if (s.type === "line") line(s.a, s.b, l);
    else if (s.type === "rect") {
      const c: Pt[] = [
        [s.x, s.y],
        [s.x + s.w, s.y],
        [s.x + s.w, s.y + s.h],
        [s.x, s.y + s.h],
      ];
      c.forEach((p, i) => line(p, c[(i + 1) % 4], l));
    } else if (s.type === "circle") {
      g(0, "CIRCLE");
      g(8, l);
      g(10, s.c[0]);
      g(20, y(s.c[1]));
      g(30, 0);
      g(40, s.r);
    } else if (s.type === "poly") {
      for (let i = 0; i < s.points.length - 1; i++) line(s.points[i], s.points[i + 1], l);
      if (s.closed && s.points.length > 2) line(s.points[s.points.length - 1], s.points[0], l);
    } else if (s.type === "text") text(s.p, s.size, s.text, l);
    else if (s.type === "arc") {
      // DXF arcs also run counter-clockwise with y upwards: the same angles.
      g(0, "ARC");
      g(8, l);
      g(10, s.c[0]);
      g(20, y(s.c[1]));
      g(30, 0);
      g(40, s.r);
      g(50, ((s.start % 360) + 360) % 360);
      g(51, ((s.end % 360) + 360) % 360);
    } else if (s.type === "angle") {
      const m = angleArc(s);
      line(s.c, s.a, "DIMENSIONS");
      line(s.c, s.b, "DIMENSIONS");
      g(0, "ARC");
      g(8, "DIMENSIONS");
      g(10, s.c[0]);
      g(20, y(s.c[1]));
      g(30, 0);
      g(40, s.r);
      g(50, ((m.start % 360) + 360) % 360);
      g(51, ((m.end % 360) + 360) % 360);
      text(polar(s.c, s.r + 4, m.start + arcSpan(m) / 2), 3.5, formatAngle(angleBetween(s.c, s.a, s.b)), "DIMENSIONS");
    }
    else if (s.type === "dim") {
      const [a, b] = dimLine(s);
      line(s.a, a, l);
      line(s.b, b, l);
      line(a, b, l);
      let deg = angleOf(a, b);
      if (deg > 90 || deg < -90) deg += 180;
      text([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 3.5, formatLength(dist(s.a, s.b), plan.units), l, deg);
    }
  }
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\n") + "\n";
}

export const planText = (plan: PlanDoc) => plan.shapes.filter((s): s is Extract<Shape, { type: "text" }> => s.type === "text").map((s) => s.text).join("\n");
