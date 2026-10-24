/* Dependency-free, offline custom element. No network calls, tracking, or global CSS. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const fract = x => x - Math.floor(x);
  const hash = x => fract(Math.sin(x * 127.1 + 311.7) * 43758.5453);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mix = (a, b, u) => a + (b - a) * u;
  const smooth = u => u * u * (3 - 2 * u);
  // Smooth value noise in [-1, 1]. Gives organic wandering without keeping particle state.
  const noise = x => { const i = Math.floor(x); return mix(hash(i), hash(i + 1), smooth(x - i)) * 2 - 1; };
  const pick = (list, x) => list[Math.floor(x * list.length) % list.length];
  const finite = x => Number.isFinite(x) && x >= 0 ? x : 0;
  const full = [[0,0],[1,0],[1,1],[0,1]];
  function bounds(poly) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  }
  function clip(ctx, poly, w, h, holes=[]) {
    ctx.beginPath();for(const ring of [poly,...holes]){ring.forEach(([x,y],i) => i ? ctx.lineTo(x*w,y*h) : ctx.moveTo(x*w,y*h));ctx.closePath();}ctx.clip('evenodd');
  }

  /* Sprites are painted once per colour and reused, so most particles cost a single drawImage. */
  const cache = new Map();
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
  const shade = (hex, k) => '#' + rgb(hex).map(v => clamp(Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)), 0, 255).toString(16).padStart(2, '0')).join('');
  const put = (c, img, x, y, rx, ry = rx) => c.drawImage(img, x - rx, y - ry, rx * 2, ry * 2);
  const hex2 = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  // Multiplies a colour by a light factor [r, g, b]. Factors are rounded so tinted sprites stay cacheable.
  const lightHex = (hex, f, floor = 0) => '#' + rgb(hex).map((c, i) => hex2(c * Math.round(mix(f[i], 1, floor) * 20) / 20)).join('');

  /*
   * Scene lighting from the plate's ambient colour grid (32 x 18 cells). Painted effects are multiplied by
   * the local light, so a butterfly in shade or a boat at dusk takes on the artwork's brightness and tint.
   */
  function lighting(hex) {
    const GX = 32, GY = 18, L = new Float32Array(GX * GY), C = [];
    if (!hex || hex.length < GX * GY * 6) return () => [1, 1, 1];
    for (let i = 0; i < GX * GY; i++) C.push(rgb('#' + hex.slice(i * 6, i * 6 + 6)));
    const at = (x, y) => C[clamp(y, 0, GY - 1) * GX + clamp(x, 0, GX - 1)];
    const blur = [];
    for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
      const sum = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = at(x + dx, y + dy); sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; }
      blur.push(sum.map(v => v / 9));
    }
    return (u, v) => {
      const gx = clamp(u * GX - 0.5, 0, GX - 1), gy = clamp(v * GY - 0.5, 0, GY - 1), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const q = (x, y) => blur[Math.min(GY - 1, y) * GX + Math.min(GX - 1, x)];
      const c = [0, 1, 2].map(k => mix(mix(q(x0, y0)[k], q(x0 + 1, y0)[k], fx), mix(q(x0, y0 + 1)[k], q(x0 + 1, y0 + 1)[k], fx), fy));
      const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], top = Math.max(1, ...c), f = clamp(Math.pow(lum / 165, 0.75), 0.14, 1);
      return c.map(k => f * (0.6 + 0.4 * k / top));
    };
  }
  function sprite(key, w, h, paint) {
    let s = cache.get(key);
    if (!s) { s = document.createElement('canvas'); s.width = w; s.height = h; paint(s.getContext('2d'), w, h); cache.set(key, s); }
    return s;
  }
  // Soft round light; a small core value gives haze, a larger one keeps a defined centre.
  const glow = (hex, core = 0.15) => sprite(`glow${hex}${core}`, 64, 64, g => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, rgba(hex, 1)); r.addColorStop(core, rgba(hex, 0.75));
    r.addColorStop(Math.min(0.9, core + 0.3), rgba(hex, 0.2)); r.addColorStop(1, rgba(hex, 0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  // White-hot centre inside a coloured halo, for sparks and firework stars.
  const spark = hex => sprite(`spark${hex}`, 64, 64, g => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.07, rgba(shade(hex, 0.45), 1));
    r.addColorStop(0.22, rgba(hex, 0.7)); r.addColorStop(0.55, rgba(hex, 0.14)); r.addColorStop(1, rgba(hex, 0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  // Four-point glint for stars and magic sparkles.
  const twinkle = hex => sprite(`twinkle${hex}`, 64, 64, g => {
    g.drawImage(spark(hex), 18, 18, 28, 28);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const lg = g.createLinearGradient(32 - dx * 32, 32 - dy * 32, 32 + dx * 32, 32 + dy * 32);
      lg.addColorStop(0, rgba(hex, 0)); lg.addColorStop(0.5, rgba(shade(hex, 0.6), 0.9)); lg.addColorStop(1, rgba(hex, 0));
      g.fillStyle = lg; g.fillRect(dx ? 0 : 31, dy ? 0 : 31, dx ? 64 : 2, dy ? 64 : 2);
    }
  });
  const petalSprite = hex => sprite(`petal${hex}`, 48, 48, g => {
    const r = 22, p = new Path2D(); g.translate(24, 24);
    p.moveTo(0, -0.72 * r); p.quadraticCurveTo(0.3 * r, -1.05 * r, 0.62 * r, -0.55 * r); p.bezierCurveTo(0.85 * r, 0, 0.45 * r, 0.8 * r, 0, r);
    p.bezierCurveTo(-0.45 * r, 0.8 * r, -0.85 * r, 0, -0.62 * r, -0.55 * r); p.quadraticCurveTo(-0.3 * r, -1.05 * r, 0, -0.72 * r);
    const lg = g.createLinearGradient(0, r, 0, -r); lg.addColorStop(0, shade(hex, -0.3)); lg.addColorStop(0.45, hex); lg.addColorStop(1, shade(hex, 0.5));
    g.fillStyle = lg; g.fill(p);
    g.strokeStyle = rgba(shade(hex, -0.4), 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(0, r * 0.85); g.quadraticCurveTo(r * 0.06, 0, 0, -r * 0.55); g.stroke();
  });
  const leafSprite = hex => sprite(`leaf${hex}`, 48, 48, g => {
    const r = 21, p = new Path2D(); g.translate(24, 24);
    p.moveTo(0, -r); p.bezierCurveTo(r * 0.62, -r * 0.55, r * 0.55, r * 0.45, 0, r * 0.82); p.bezierCurveTo(-r * 0.55, r * 0.45, -r * 0.62, -r * 0.55, 0, -r);
    const lg = g.createLinearGradient(-r, 0, r, 0); lg.addColorStop(0, shade(hex, -0.25)); lg.addColorStop(0.5, shade(hex, 0.18)); lg.addColorStop(1, shade(hex, -0.35));
    g.fillStyle = lg; g.fill(p);
    g.strokeStyle = rgba(shade(hex, -0.5), 0.55); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, r); g.lineTo(0, -r * 0.85);
    for (const y of [-0.45, -0.1, 0.25]) { g.moveTo(0, r * (y + 0.18)); g.lineTo(r * 0.32, r * y); g.moveTo(0, r * (y + 0.18)); g.lineTo(-r * 0.32, r * y); }
    g.stroke();
  });
  // Wing colour, edge colour, spot colour.
  const BUTTERFLIES = [['#ee8a2a', '#2a1d14', '#fbf2e2'], ['#6db7f0', '#1c2d4c', '#eaf6ff'], ['#f4df6a', '#6c5a1e', '#fff8cc'], ['#f0a2c6', '#5a2944', '#fff1f7'], ['#f3efe5', '#7c7568', '#cfc6b6']];
  const butterflySprite = (k, f = [1, 1, 1]) => sprite(`butterfly${k}${f.map(x => Math.round(x * 20))}`, 64, 64, g => {
    const [wing, edge, spot] = BUTTERFLIES[k % BUTTERFLIES.length].map(c => lightHex(c, f)); g.translate(32, 32);
    for (const sx of [-1, 1]) {
      g.save(); g.scale(sx, 1); g.lineWidth = 1.6; g.strokeStyle = edge;
      const lg = g.createLinearGradient(0, 0, 28, -10); lg.addColorStop(0, shade(wing, -0.25)); lg.addColorStop(0.7, wing); lg.addColorStop(1, shade(wing, 0.2));
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(1, -2); g.bezierCurveTo(8, -22, 26, -24, 28, -14); g.bezierCurveTo(27, -6, 16, -1, 1, 0); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(1, 1); g.bezierCurveTo(16, 0, 22, 10, 17, 18); g.bezierCurveTo(12, 23, 4, 16, 1, 4); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = spot; for (const [x, y, r] of [[23, -15, 1.7], [18, -19, 1.2], [14, 13, 1.5]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      g.restore();
    }
    g.fillStyle = lightHex('#2a221c', f); g.beginPath(); g.ellipse(0, 1, 1.7, 10, 0, 0, TAU); g.fill();
    g.strokeStyle = lightHex('#2a221c', f); g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(-3, -14, -6, -17); g.moveTo(0, -8); g.quadraticCurveTo(3, -14, 6, -17); g.stroke();
  });
  // Candle or hearth tongue: blue root, white core, orange edges, transparent tip.
  const flameSprite = hearth => sprite(`flame${hearth}`, 32, 64, g => {
    const body = new Path2D(); body.moveTo(16, 64); body.bezierCurveTo(2, 56, 4, 30, 16, 0); body.bezierCurveTo(28, 30, 30, 56, 16, 64);
    const lg = g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, 'rgba(255,110,30,0)'); lg.addColorStop(0.22, hearth ? 'rgba(240,90,25,0.85)' : 'rgba(255,140,45,0.85)');
    lg.addColorStop(0.55, hearth ? '#ffa83f' : '#ffcf6a'); lg.addColorStop(0.82, '#fff1c8'); lg.addColorStop(0.94, '#fff4d6'); lg.addColorStop(1, hearth ? 'rgba(255,170,80,0.6)' : 'rgba(120,150,255,0.6)');
    g.fillStyle = lg; g.fill(body);
    const core = new Path2D(); core.moveTo(16, 62); core.bezierCurveTo(10, 56, 11, 42, 16, 30); core.bezierCurveTo(21, 42, 22, 56, 16, 62);
    g.fillStyle = hearth ? 'rgba(255,230,160,0.7)' : 'rgba(255,252,236,0.85)'; g.fill(core);
  });
  const auroraRay = (top, low) => sprite(`ray${top}${low}`, 16, 128, g => {
    const lg = g.createLinearGradient(0, 0, 0, 128);
    lg.addColorStop(0, rgba(top, 0)); lg.addColorStop(0.35, rgba(top, 0.35)); lg.addColorStop(0.78, rgba(low, 0.9)); lg.addColorStop(0.9, rgba(low, 0.45)); lg.addColorStop(1, rgba(low, 0));
    g.fillStyle = lg; g.fillRect(0, 0, 16, 128);
    // Soft sides so neighbouring rays blend into a curtain instead of stripes.
    const side = g.createLinearGradient(0, 0, 16, 0);
    side.addColorStop(0, 'rgba(0,0,0,0)'); side.addColorStop(0.5, 'rgba(0,0,0,1)'); side.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = side; g.fillRect(0, 0, 16, 128);
  });

  const FIREWORKS = ['#ff5a6e', '#ffd166', '#7bdff2', '#b892ff', '#8cff98', '#ffffff', '#ff9f43'];
  const PETALS = ['#f1c4d2', '#f7dde5', '#e9a9bd', '#fbeef2'];
  const LEAVES = ['#c2562b', '#df8f2f', '#e8b947', '#8f3a22', '#a2a04c'];
  const CONFETTI = ['#8e44c4', '#f2c23a', '#3fa65a', '#e85d9a', '#4fb3e8'];
  const KOI = [['#f4efe8', '#e2662b'], ['#f2b640', '#fbe8c0'], ['#e8752e', '#2b2522'], ['#f6f1ea', '#d63c2a']];

  /*
   * Each effect is a pure function of time, so a still frame, a reattached element and a
   * running animation all agree. `b` is the normal layer, `l` the light layer (screen blended,
   * additive inside). `v` carries alpha, quality, the clip bounds and a point helper.
   */
  const FX = {};

  FX.fireworks = ({l}, e, w, h, t, v) => {
    const pal = e.palette || FIREWORKS, period = e.every || 3.2, life = 7.5, [x0, y0, x1, y1] = v.box;
    for (let k = Math.max(0, Math.floor((t - life) / period)); k <= Math.floor(t / period); k++) {
      const r = n => hash(k * 17.13 + n * 3.71 + 0.5);
      if (r(1) > (e.density ?? 0.8)) continue;
      const rise = 1.05 + r(5) * 0.6, age = t - k * period - r(2) * period * 0.7;
      if (age < 0 || age > life) continue;
      const bx = mix(x0, x1, 0.1 + 0.8 * r(3)) * w, by = mix(y0, y1, 0.15 + 0.4 * r(4)) * h;
      const size = (e.size || 105) * v.s * (0.65 + 0.7 * r(9));
      if (age < rise) {
        // The shell climbs with a short flickering trail.
        const startY = y1 * h + 10 * v.s;
        for (let j = 0; j < 6; j++) {
          const u = Math.max(0, age - j * 0.04) / rise, p = 1 - (1 - u) * (1 - u);
          l.globalAlpha = v.a * 0.55 * (1 - j / 6) * (0.7 + 0.3 * hash(k + j + Math.floor(t * 20)));
          put(l, spark('#ffd59a'), bx + Math.sin(u * 3 + k) * 6 * v.s * (1 - u), mix(startY, by, p), (2.6 - j * 0.3) * v.s);
        }
        continue;
      }
      const tau = age - rise, kind = pick(['peony', 'chrysanthemum', 'willow', 'ring', 'peony', 'chrysanthemum'], r(6));
      const dur = kind === 'willow' ? 5.2 : 3.4; if (tau > dur) continue;
      const c1 = pick(pal, r(7)), c2 = pick(pal, r(8)), gravity = size * (kind === 'willow' ? 0.22 : 0.1);
      // A soft tint of the sky around the burst; never a full-frame flash.
      if (tau < 1.2) { l.globalAlpha = v.a * 0.32 * (1 - tau / 1.2) ** 2; put(l, glow(c1, 0.02), bx, by, size * 2.4); }
      if (tau < 0.15) { l.globalAlpha = v.a * (1 - tau / 0.15); put(l, spark('#ffffff'), bx, by, size * 0.2); }
      const n = Math.round((kind === 'ring' ? 44 : 72) * (v.low ? 0.5 : 1)), trail = v.low ? 3 : 6, step = kind === 'willow' ? 0.11 : 0.045;
      const tilt = r(10) * Math.PI, squash = 0.35 + 0.4 * r(11), split = r(12) > 0.5;
      const shellFade = Math.min(1, tau / 0.06) * Math.pow(Math.max(0, 1 - tau / dur), 1.3), paths = new Map();
      // Peonies and chrysanthemums get a smaller inner sphere in a second colour.
      const heads = [], inner = kind === 'peony' || kind === 'chrysanthemum' ? Math.round(n * 0.4) : 0;
      for (let i = 0; i < n + inner; i++) {
        const core = i >= n, q = i * 1.618 + k, ang = ((core ? i - n : i) / (core ? inner : n)) * TAU + hash(q) * 0.12;
        let dx, dy;
        if (core) {
          dx = Math.cos(ang) * 0.48; dy = Math.sin(ang) * 0.48;
        } else if (kind === 'ring') {
          const cx = Math.cos(ang), cy = Math.sin(ang) * squash;
          dx = cx * Math.cos(tilt) - cy * Math.sin(tilt); dy = cx * Math.sin(tilt) + cy * Math.cos(tilt);
        } else {
          // Points on a sphere seen from the front: dense rim, softer centre.
          const z = hash(q + 9) * 2 - 1, rf = Math.sqrt(1 - z * z) * (0.92 + 0.08 * hash(q + 4));
          dx = Math.cos(ang) * rf; dy = Math.sin(ang) * rf;
        }
        const col = core ? (c2 === c1 ? '#fff4dc' : c2) : kind === 'willow' ? (tau > dur * 0.5 ? '#ff9b45' : '#ffd27f') : kind === 'chrysanthemum' ? (tau > dur * 0.5 ? shade(c1, 0.4) : c1) : (split && i % 2 ? c2 : c1);
        // Each star leaves a streak; streaks of one colour are stroked together.
        const pos = tt => { const ext = 1 - Math.exp(-3.2 * tt); return [bx + dx * size * ext, by + dy * size * ext + gravity * tt * tt]; };
        if (!paths.has(col)) paths.set(col, [new Path2D(), new Path2D()]);
        const [long, short] = paths.get(col), head = pos(tau);
        long.moveTo(...head); short.moveTo(...head);
        for (let j = 1; j <= trail; j++) { const p = pos(Math.max(0, tau - j * step)); long.lineTo(...p); if (j <= 2) short.lineTo(...p); }
        let lit = 1;
        if (kind === 'chrysanthemum' && tau > dur * 0.55) lit = hash(q + Math.floor(t * 12)) > 0.45 ? 1.2 : 0.15;
        heads.push([head, col, lit]);
      }
      l.lineCap = 'round';
      for (const [col, [long, short]] of paths) {
        l.strokeStyle = col;
        l.globalAlpha = v.a * shellFade * 0.45; l.lineWidth = 1.8 * v.s; l.stroke(long);
        l.globalAlpha = v.a * shellFade; l.lineWidth = 2.6 * v.s; l.stroke(short);
      }
      for (const [[x, y], col, lit] of heads) {
        l.globalAlpha = v.a * Math.min(1, shellFade * lit); put(l, spark(col), x, y, (kind === 'willow' ? 4 : 5.5) * v.s);
      }
    }
  };

  FX.snow = ({b}, e, w, h, t, v) => {
    const [cx, cy] = v.at(0.5, 0.5), flake = glow(v.tint(e.color || '#f4f8fb', cx, cy, 0.55), 0.45), wind = e.wind ?? 0.6;
    for (let i = 0; i < v.n; i++) {
      const z = hash(i * 3.1 + 7), vv = fract(hash(i + 103) + t * (0.022 + z * 0.035));
      const uu = fract(hash(i + 9) + t * 0.004 * wind * (0.4 + z) + noise(t * 0.18 + i * 1.7) * 0.025);
      const [x, y] = v.at(uu, vv);
      b.globalAlpha = Math.min(1, v.a * (0.45 + 0.8 * z)) * Math.min(1, vv / 0.06, (1 - vv) / 0.06);
      put(b, flake, x + Math.sin(t * (0.7 + z) + i) * 5 * v.s * z, y, (1.6 + z * 3.4) * v.s);
    }
  };

  function glassDrops(b, t, v, count, f = [1, 1, 1]) {
    const lit = 0.3 + 0.7 * (f[0] + f[1] + f[2]) / 3;
    for (let i = 0; i < count; i++) {
      const period = 9 + hash(i + 40) * 10, tt = t + hash(i + 41) * period, cyc = Math.floor(tt / period), q = tt - cyc * period;
      const u = hash(i * 5.3 + cyc * 1.37), v0 = hash(i * 2.9 + cyc * 2.11) * 0.6;
      const slide = smooth(clamp((q - period * 0.55) / (period * 0.4), 0, 1)) * (0.2 + 0.3 * hash(i + cyc * 3));
      const [x, y] = v.at(u, v0 + slide), top = v.at(u, v0)[1], r = (1.5 + hash(i + 3) * 1.8) * v.s;
      b.globalAlpha = v.a * Math.min(1, q / 1.5, (period - q) / 1.2);
      if (slide > 0.002) { b.strokeStyle = 'rgba(215,230,240,0.16)'; b.lineWidth = r * 0.55; b.beginPath(); b.moveTo(x, top); b.lineTo(x, y); b.stroke(); }
      b.fillStyle = 'rgba(14,22,30,0.22)'; b.beginPath(); b.arc(x, y, r, 0, TAU); b.fill();
      b.fillStyle = `rgba(214,232,242,${0.32 * lit})`; b.beginPath(); b.arc(x, y - r * 0.1, r * 0.8, 0, TAU); b.fill();
      b.fillStyle = `rgba(255,255,255,${0.75 * lit})`; b.beginPath(); b.arc(x - r * 0.3, y - r * 0.35, r * 0.28, 0, TAU); b.fill();
    }
  }
  FX.rain = ({b}, e, w, h, t, v) => {
    const [x0, y0, x1, y1] = v.box, tall = (y1 - y0) * h, wide = (x1 - x0) * w, [cx, cy] = v.at(0.5, 0.5);
    const base = v.tint(e.color || '#dde9f0', cx, cy, 0.75), slant0 = e.slant ?? 0.1;
    b.lineCap = 'round'; b.globalAlpha = v.a;
    for (let layer = 0; layer < 3; layer++) {
      b.beginPath(); b.strokeStyle = rgba(base, Math.min(1, [0.24, 0.36, 0.5][layer] * (e.strength || 1))); b.lineWidth = (0.7 + layer * 0.5) * v.s;
      for (let i = layer; i < v.n; i += 3) {
        const z = (layer + hash(i)) / 3, len = (12 + z * 30) * v.s, fall = hash(i + 103) + t * (0.9 + z * 0.9), vv = fract(fall);
        // Spawn wide enough that slanted drops still cover the whole pane.
        const u0 = hash(i + 9 + Math.floor(fall) * 7.3), reach = Math.abs(slant0) * tall / wide + (e.spread || 0) * tall / wide * 0.5;
        const uu = u0 * (1 + 2 * reach) - reach, slant = slant0 + (e.spread || 0) * (uu - (e.vp ?? 0.5));
        const [x, y] = v.at(uu, vv), sx = x + vv * tall * slant;
        b.moveTo(sx, y); b.lineTo(sx - len * slant, y - len);
      }
      b.stroke();
    }
    if (e.glass) glassDrops(b, t, v, v.low ? 6 : e.glass === true ? 12 : e.glass, v.light(cx, cy));
  };

  function falling(kind) {
    const leaf = kind === 'leaf', confetti = kind === 'confetti';
    return ({b}, e, w, h, t, v) => {
      const pal = e.palette || (e.color ? [e.color] : leaf ? LEAVES : confetti ? CONFETTI : PETALS);
      for (let i = 0; i < v.n; i++) {
        const z = hash(i * 7.7 + 1), fall = hash(i + 103) + t * (leaf ? 0.016 : confetti ? 0.022 : 0.014) * (0.6 + z * 0.8);
        const vv = fract(fall), uu = fract(hash(i + 9 + Math.floor(fall) * 3.3) + t * 0.006 * (0.5 + z));
        const [x, y] = v.at(uu, vv);
        const size = (leaf ? 6.5 : confetti ? 3.4 : 4.4) * (e.size || 1) * v.s * (0.6 + z * 0.8);
        const spin = t * (0.4 + hash(i + 5) * 0.8) * (i % 2 ? 1 : -1) + i, flip = Math.cos(t * (1.2 + hash(i + 6) * 1.6) + i * 3);
        const col = v.tint(pick(pal, hash(i + 21)), x, y);
        b.save(); b.translate(x + Math.sin(t * (0.5 + z * 0.6) + i * 2) * (leaf ? 16 : 9) * v.s, y); b.rotate(spin);
        b.scale(Math.abs(flip) < 0.12 ? (flip < 0 ? -0.12 : 0.12) : flip, 1);
        b.globalAlpha = v.a * (0.7 + 0.3 * z) * Math.min(1, vv / 0.05, (1 - vv) / 0.05);
        if (confetti) { b.fillStyle = shade(col, flip > 0 ? 0.25 : -0.3); b.fillRect(-size * 0.5, -size, size, size * 2); }
        else put(b, (leaf ? leafSprite : petalSprite)(col), 0, 0, size);
        b.restore();
      }
    };
  }
  FX.petal = falling('petal'); FX.leaf = falling('leaf'); FX.confetti = falling('confetti');

  FX.firefly = ({l}, e, w, h, t, v) => {
    const col = e.color || '#d9f27a', halo = glow(col, 0.05), core = spark(col);
    for (let i = 0; i < v.n; i++) {
      const [x, y] = v.at(clamp(hash(i + 1) + noise(t * 0.08 + i * 13) * 0.14, 0, 1), clamp(hash(i + 2) + noise(t * 0.06 + i * 29 + 4) * 0.12, 0, 1));
      const ph = fract(t / (2.8 + hash(i + 3) * 3.5) + hash(i + 4)), lit = 0.08 + 0.92 * (ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) : 0);
      l.globalAlpha = v.a * 0.5 * lit; put(l, halo, x, y, 11 * v.s);
      l.globalAlpha = v.a * lit; put(l, core, x, y, 2.6 * v.s);
    }
  };

  FX.mote = ({l}, e, w, h, t, v) => {
    const soft = glow(e.color || '#ffe6bd', 0.1);
    for (let i = 0; i < v.n; i++) {
      const z = hash(i * 4.3 + 2), vv = fract(hash(i + 50) - t * (0.004 + z * 0.006));
      const [x, y] = v.at(fract(hash(i + 51) + noise(t * 0.05 + i * 7) * 0.06 + t * 0.002), vv);
      const glint = Math.pow(Math.max(0, Math.sin(t * (0.4 + z * 0.6) + i * 2.3)), 6), bokeh = z > 0.85;
      l.globalAlpha = v.a * (0.12 + 0.5 * glint) * (bokeh ? 0.35 : 1) * Math.min(1, vv / 0.08, (1 - vv) / 0.08);
      put(l, soft, x, y, (1.4 + z * (bokeh ? 7 : 2.2)) * v.s);
    }
  };

  /*
   * Thin curling strands for steam, incense and campfire smoke. Each strand is a column whose
   * sideways curl grows with height and travels upward, so it reads as rising air.
   */
  function wisps(b, x0, y0, t, v, {color = '#f2f5f6', height = 90, strands = 2, alpha = 0.22, width = 1.6, curl = 9, speed = 1, seed = 0, spread = 0} = {}) {
    const segs = v.low ? 12 : 22;
    b.lineCap = 'round'; b.strokeStyle = color;
    for (let k = 0; k < strands; k++) {
      const ph = hash(k + seed * 7.3) * TAU, life = 0.75 + 0.25 * noise(t * 0.25 * speed + k * 5 + seed), lean = noise(t * 0.08 + k * 3 + seed) * 0.35;
      const start = strands > 1 ? ((k + 0.5) / strands - 0.5) * spread * (0.8 + 0.4 * hash(k + seed)) : 0;
      const pt = s => {
        const rise = s * height * v.s * life;
        return [x0 + start * (1 - 0.6 * s) + (Math.sin(s * 7 - t * 1.6 * speed + ph) * curl * s ** 1.3 + noise(s * 3 - t * 0.5 * speed + k * 9 + seed) * curl * 0.8 * s + lean * rise) * v.s, y0 - rise];
      };
      let [px, py] = pt(0);
      for (let j = 1; j <= segs; j++) {
        // Visible right from the rim, thinning and fading as it climbs.
        const s = j / segs, [x, y] = pt(s), fade = smooth(Math.min(1, s / 0.12)) * Math.pow(1 - s, 1.2);
        b.globalAlpha = v.a * alpha * fade * 0.32; b.lineWidth = (width * 5 + s * width * 9) * v.s;
        b.beginPath(); b.moveTo(px, py); b.lineTo(x, y); b.stroke();
        b.globalAlpha = v.a * alpha * fade * 0.7; b.lineWidth = (width * 1.3 + s * width * 3) * v.s;
        b.beginPath(); b.moveTo(px, py); b.lineTo(x, y); b.stroke();
        px = x; py = y;
      }
    }
  }

  FX.steam = ({b, l}, e, w, h, t, v) => {
    const cauldron = e.type === 'cauldron', x0 = e.at[0] * w, y0 = e.at[1] * h, size = e.size || 1, rim = (e.width || (cauldron ? 0.04 : 0.03)) * w;
    const col = cauldron ? e.color || '#a6f0a8' : v.tint(e.color || '#f2f5f6', x0, y0 - 30 * v.s, 0.4), puff = glow(col, 0.01);
    const rise = (cauldron ? 120 : 75) * v.s * size, n = v.low ? 6 : 12, rate = cauldron ? 0.11 : 0.12;
    // A thin haze sits over the surface of the drink before it lifts.
    if (!cauldron) { b.globalAlpha = v.a * 0.14 * (0.8 + 0.2 * noise(t * 0.7 + x0)); put(b, puff, x0, y0 - 2 * v.s, rim * 0.55, Math.max(2 * v.s, rim * 0.1)); }
    for (let j = 0; j < n; j++) {
      const cycle = t * rate + j / n, p = fract(cycle), seed = j + Math.floor(cycle) * n, from = (hash(seed + 0.37) - 0.5) * rim * 0.85;
      const sway = (Math.sin(p * 4.5 + t * 0.5 + hash(seed) * 6) * 8 + noise(t * 0.3 + seed) * 6) * p * v.s * size;
      b.globalAlpha = v.a * (cauldron ? 0.45 : 0.17) * Math.min(1, p * 8) * Math.pow(1 - p, 1.3);
      put(b, puff, x0 + from * (1 - 0.45 * p) + sway, y0 - p * rise, rim * 0.2 + p * (cauldron ? 40 : 15) * v.s * size);
    }
    if (!cauldron) {
      const strands = v.low ? 2 : clamp(Math.round(rim / (11 * v.s)), 2, 5);
      wisps(b, x0, y0 - 1 * v.s, t, v, {color: col, height: 68 * size, strands, alpha: e.strength || 0.34, width: 1.1 * size, curl: 7 * size, seed: e.at[0] * 31, spread: rim * 0.8});
      return;
    }
    l.globalAlpha = v.a * (0.85 + 0.15 * Math.sin(t * 2.1)); put(l, glow('#59ff8a', 0.05), x0, y0 - 14 * v.s, 150 * v.s);
    l.globalAlpha = v.a * 0.6; put(l, glow('#b8ffc4', 0.1), x0, y0, 28 * v.s, 8 * v.s);
    b.strokeStyle = '#c8ffcf'; b.lineWidth = 0.8 * v.s;
    for (let i = 0; i < 6; i++) {
      const q = fract(t * 0.35 + hash(i));
      b.globalAlpha = v.a * 0.8 * Math.sin(q * Math.PI); b.beginPath(); b.arc(x0 + (hash(i + 7) - 0.5) * 40 * v.s, y0 + 4 * v.s - q * 6 * v.s, (1.5 + q * 2.5) * v.s, 0, TAU); b.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const q = fract(t * 0.18 + hash(i + 30));
      l.globalAlpha = v.a * Math.sin(q * Math.PI) * (0.5 + 0.5 * Math.sin(t * 9 + i));
      put(l, spark('#7dff9c'), x0 + ((hash(i + 31) - 0.5) * 50 + Math.sin(t + i) * 8) * v.s, y0 - q * 110 * v.s, 3.4 * v.s);
    }
  };
  FX.cauldron = FX.steam;

  FX.water = ({b, l}, e, w, h, t, v) => {
    b.lineWidth = 0.8 * v.s; b.strokeStyle = e.color || '#e4eeee';
    for (let i = 0; i < (e.ripples ?? 7); i++) {
      const per = 6 + hash(i + 70) * 5, tt = t + hash(i + 71) * per, cyc = Math.floor(tt / per), q = tt / per - cyc;
      const [x, y] = v.at(0.08 + 0.84 * hash(i * 3 + cyc * 7.1), 0.15 + 0.7 * hash(i * 5 + cyc * 3.7)), rx = (6 + q * 50) * v.s;
      b.globalAlpha = v.a * 0.28 * Math.pow(1 - q, 1.5) * Math.min(1, q * 8);
      b.beginPath(); b.ellipse(x, y, rx, rx * 0.2, 0, 0, TAU); b.stroke();
      if (q < 0.6) { b.globalAlpha *= 0.6; b.beginPath(); b.ellipse(x, y, rx * 0.55, rx * 0.11, 0, 0, TAU); b.stroke(); }
    }
    // Twinkling highlights where light catches the surface.
    const glint = glow(e.glint || '#ffe7c2', 0.2);
    for (let i = 0, n = Math.ceil((e.glints || 30) * (v.low ? 0.5 : 1)); i < n; i++) {
      const tw = Math.pow(Math.max(0, Math.sin(t * (0.7 + hash(i + 82) * 1.4) + i * 4.1)), 8);
      if (tw < 0.02) continue;
      const [x, y] = v.at(hash(i * 1.3 + 80), hash(i * 2.7 + 81)), len = (3 + hash(i + 83) * 7) * v.s;
      l.globalAlpha = v.a * 0.55 * tw; put(l, glint, x + Math.sin(t * 0.4 + i) * 3 * v.s, y, len, len * 0.22);
    }
  };

  FX.aurora = ({l}, e, w, h, t, v) => {
    const [x0, y0, x1, y1] = v.box, bands = (e.bands || [['#b07cff', '#4dffb0'], ['#ff7ac8', '#58e6c6'], ['#7aa8ff', '#7dffa0']]).slice(0, v.low ? 2 : 3);
    const rays = v.low ? 36 : 90, rw = ((x1 - x0) * w / rays) * 4;
    bands.forEach(([top, low], k) => {
      const ray = auroraRay(top, low), pulse = 0.7 + 0.3 * Math.sin(t * 0.1 + k * 2);
      for (let i = 0; i < rays; i++) {
        const u = i / (rays - 1), x = (x0 + u * (x1 - x0)) * w;
        const base = mix(y0, y1, 0.55 + 0.12 * Math.sin(u * 4.2 + t * 0.06 + k * 2.1) + 0.07 * noise(u * 7 + t * 0.12 + k * 9)) * h;
        const tall = (0.3 + 0.18 * noise(u * 5 - t * 0.09 + k * 4)) * (y1 - y0) * h, lit = Math.pow(0.5 + 0.5 * noise(u * 16 + t * 0.3 + k * 7), 2);
        l.globalAlpha = v.a * 0.17 * pulse * (0.25 + lit) * Math.min(1, u * 6, (1 - u) * 6);
        l.drawImage(ray, x - rw / 2, base - tall, rw, tall * 1.1);
      }
    });
  };

  FX.stars = ({l}, e, w, h, t, v) => {
    const star = twinkle(e.color || '#e8f0ff');
    for (let i = 0; i < v.n; i++) {
      const [x, y] = v.at(hash(i * 2.1 + 300), hash(i * 3.3 + 301)), z = hash(i + 302);
      l.globalAlpha = v.a * (0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * (0.6 + z * 1.8) + i * 7), 6)) * (0.4 + 0.6 * z);
      put(l, star, x, y, (e.size || 1) * (2 + z * 4) * v.s);
    }
    // An occasional shooting star.
    const every = e.every || 19, k = Math.floor(t / every), q = t - k * every;
    if (e.shooting === false || q > 1.3 || hash(k + 330) > 0.75) return;
    const [sx, sy] = v.at(0.15 + 0.7 * hash(k + 331), 0.05 + 0.4 * hash(k + 332)), dir = hash(k + 333) < 0.5 ? -1 : 1;
    const ang = 0.35 + 0.25 * hash(k + 334), len = (v.box[2] - v.box[0]) * w * 0.28, p = smooth(q / 1.3);
    const hx = sx + Math.cos(ang) * dir * len * p, hy = sy + Math.sin(ang) * len * p, tail = Math.min(p, 0.35) * len;
    const tx = hx - Math.cos(ang) * dir * tail, ty = hy - Math.sin(ang) * tail, lg = l.createLinearGradient(tx, ty, hx, hy);
    lg.addColorStop(0, 'rgba(220,235,255,0)'); lg.addColorStop(1, 'rgba(240,248,255,0.9)');
    l.globalAlpha = v.a * Math.sin(Math.PI * q / 1.3); l.strokeStyle = lg; l.lineWidth = 1.3 * v.s; l.lineCap = 'round';
    l.beginPath(); l.moveTo(tx, ty); l.lineTo(hx, hy); l.stroke(); put(l, spark('#dfeaff'), hx, hy, 3.5 * v.s);
  };
  // Twinkling points without shooting stars: fairy lights, glitter, sequins.
  FX.sparkle = (c, e, w, h, t, v) => FX.stars(c, {...e, shooting: false}, w, h, t, v);

  FX.lanterns = ({b, l}, e, w, h, t, v) => {
    for (const [i, a] of e.anchors.entries()) {
      const x = a[0] * w, y = a[1] * h, sc = v.s * (e.scale || 1), sway = Math.sin(t * 0.33 + i) * 0.03 + noise(t * 0.2 + i * 5) * 0.012;
      const flick = 0.85 + 0.1 * noise(t * 3 + i * 9) + 0.05 * Math.sin(t * 11 + i), gx = x - Math.sin(sway) * 57 * sc, gy = y + Math.cos(sway) * 57 * sc;
      l.globalAlpha = v.a * 0.5 * flick; put(l, glow('#ff6a2b', 0.02), gx, gy, 75 * sc);
      l.globalAlpha = v.a * 0.6 * flick; put(l, glow('#ffc070', 0.1), gx, gy, 24 * sc);
      b.save(); b.translate(x, y); b.rotate(sway); b.scale(sc, sc); b.globalAlpha = Math.min(1, 0.45 + v.a);
      b.strokeStyle = '#3b2a1c'; b.lineWidth = 1.2; b.beginPath(); b.moveTo(0, 0); b.lineTo(0, 28); b.stroke();
      const body = b.createRadialGradient(0, 57, 2, 0, 57, 30);
      body.addColorStop(0, '#ffd894'); body.addColorStop(0.35 * flick, '#f06a32'); body.addColorStop(0.75, '#b3261c'); body.addColorStop(1, '#5e1512');
      b.fillStyle = body; b.beginPath(); b.ellipse(0, 57, 23, 28, 0, 0, TAU); b.fill();
      b.strokeStyle = 'rgba(95,20,14,0.45)'; b.lineWidth = 1;
      for (const rx of [8, 16]) { b.beginPath(); b.ellipse(0, 57, rx, 28, 0, 0, TAU); b.stroke(); }
      const cap = b.createLinearGradient(-11, 0, 11, 0); cap.addColorStop(0, '#8a6424'); cap.addColorStop(0.5, '#f0cf7a'); cap.addColorStop(1, '#8a6424');
      b.fillStyle = cap; b.fillRect(-11, 26, 22, 5); b.fillRect(-11, 84, 22, 5);
      b.strokeStyle = '#c42a1f'; b.lineWidth = 1.1; b.beginPath();
      for (let s = -2; s <= 2; s++) { b.moveTo(s * 1.2, 89); b.quadraticCurveTo(s * 1.4 + Math.sin(t * 0.8 + i) * 2, 101, s * 1.7 + Math.sin(t * 0.7 + i - 0.6) * 4, 113); }
      b.stroke(); b.fillStyle = '#e2b453'; b.beginPath(); b.arc(0, 91, 2.2, 0, TAU); b.fill();
      b.restore();
    }
  };

  FX['sky-lanterns'] = ({b, l}, e, w, h, t, v) => {
    for (let i = 0; i < v.n; i++) {
      const z = hash(i + 400), per = 70 + hash(i + 401) * 50, run = t / per + hash(i + 402), q = fract(run);
      const [x, y] = v.at(clamp(hash(i * 3.7 + 403 + Math.floor(run) * 1.3) + Math.sin(t * 0.15 + i) * 0.02, 0, 1), 1 - q);
      const size = (2.5 + z * 4.5) * v.s, fade = Math.min(1, q / 0.1, (1 - q) / 0.25) * (0.5 + 0.5 * z), fl = 0.85 + 0.15 * noise(t * 2 + i * 3);
      l.globalAlpha = v.a * 0.55 * fade * fl; put(l, glow('#ff9a3c', 0.02), x, y, size * 5);
      const lg = b.createLinearGradient(0, y - size, 0, y + size); lg.addColorStop(0, '#ffe7b0'); lg.addColorStop(1, '#ef8336');
      b.globalAlpha = v.a * fade; b.fillStyle = lg; b.beginPath();
      b.moveTo(x - size * 0.55, y - size); b.lineTo(x + size * 0.55, y - size); b.lineTo(x + size * 0.42, y + size); b.lineTo(x - size * 0.42, y + size); b.closePath(); b.fill();
      l.globalAlpha = v.a * fade * fl; put(l, spark('#ffb35a'), x, y + size * 0.7, size * 0.9);
    }
  };

  FX.ribbons = ({b}, e, w, h, t, v) => {
    const pal = e.palette || ['#8e44c4', '#f2c23a', '#3fa65a'], segs = v.low ? 8 : 14;
    b.globalAlpha = Math.min(1, 0.35 + v.a);
    for (const [i, a] of e.anchors.entries()) pal.forEach((col, s) => {
      const len = (e.length || 60) * v.s * (0.85 + 0.3 * hash(i * 3 + s)), wid = 3.2 * v.s, x0 = a[0] * w + (s - (pal.length - 1) / 2) * 4 * v.s, y0 = a[1] * h;
      let px = x0, py = y0, ph = wid;
      for (let j = 1; j <= segs; j++) {
        const u = j / segs, x = x0 + (Math.sin(t * 1.1 - u * 3 + i * 2 + s * 1.3) * 9 + noise(t * 0.4 + i + s * 3) * 7) * v.s * u ** 1.3, y = y0 + u * len;
        const twist = Math.cos(t * 1.6 - u * 5 + s + i), half = wid * (0.25 + 0.75 * Math.abs(twist));
        b.fillStyle = v.tint(shade(col, twist > 0 ? 0.15 : -0.3), x0, y0);
        b.beginPath(); b.moveTo(px - ph, py); b.lineTo(px + ph, py); b.lineTo(x + half, y + 0.6); b.lineTo(x - half, y + 0.6); b.fill();
        px = x; py = y; ph = half;
      }
    });
  };

  FX.butterflies = ({b}, e, w, h, t, v) => {
    const kinds = e.kinds || [0, 1, 2, 3];
    for (let i = 0; i < (e.count || 3); i++) {
      const sp = 0.05 + hash(i + 500) * 0.03, at = tt => v.at(0.5 + 0.48 * noise(tt * sp + i * 11), 0.5 + 0.45 * noise(tt * sp * 1.3 + i * 23 + 5));
      const [x, y] = at(t), [nx] = at(t + 0.4), flap = 0.2 + 0.8 * Math.abs(Math.sin(t * 9 + i * 2));
      b.save(); b.translate(x, y + Math.sin(t * 2.6 + i) * 3 * v.s); b.rotate(clamp((nx - x) / v.s * 0.05, -0.5, 0.5));
      b.scale(flap, 0.9 + 0.1 * flap); b.globalAlpha = Math.min(1, 0.4 + v.a);
      put(b, butterflySprite(pick(kinds, hash(i + 501)), v.light(x, y)), 0, 0, (e.size || 15) * v.s);
      b.restore();
    }
  };

  FX.fish = ({b}, e, w, h, t, v) => {
    for (let i = 0; i < (e.count || 3); i++) {
      const om = 0.035 + hash(i + 600) * 0.025, p1 = hash(i + 601) * TAU, p2 = hash(i + 602) * TAU;
      const at = tt => v.at(0.5 + 0.38 * Math.sin(om * tt + p1), 0.5 + 0.32 * Math.sin(om * 2 * tt + p2));
      const [x, y] = at(t), [nx, ny] = at(t + 0.5), L = (e.size || 26) * v.s * (0.8 + 0.4 * hash(i + 603));
      const [c1, c2] = (e.color ? [e.color, shade(e.color, -0.2)] : KOI[i % KOI.length]).map(c => v.tint(c, x, y, 0.15));
      b.save(); b.translate(x, y); b.rotate(Math.atan2(ny - y, nx - x)); b.globalAlpha = v.a * (e.color ? 0.55 : 0.8);
      const spine = [];
      for (let j = 0; j <= 8; j++) {
        const u = j / 8;
        spine.push([L / 2 - u * L, Math.sin(t * 4.5 + i - u * 4) * u * u * L * 0.12, L * 0.15 * Math.pow(Math.sin(Math.PI * clamp(0.1 + u * 0.92, 0, 1)), 0.8) * (1 - u * 0.55)]);
      }
      const [tx, ty] = spine[8];
      b.fillStyle = rgba(shade(c1, 0.3), 0.6); b.beginPath(); b.moveTo(tx + L * 0.04, ty);
      b.quadraticCurveTo(tx - L * 0.12, ty - L * 0.2, tx - L * 0.22, ty - L * 0.12); b.quadraticCurveTo(tx - L * 0.14, ty, tx - L * 0.22, ty + L * 0.12);
      b.quadraticCurveTo(tx - L * 0.12, ty + L * 0.2, tx + L * 0.04, ty); b.fill();
      b.fillStyle = 'rgba(255,255,255,0.3)';
      for (const side of [-1, 1]) { b.beginPath(); b.ellipse(spine[2][0], spine[2][1] + side * spine[2][2] * 1.3, L * 0.09, L * 0.04, side * 0.6, 0, TAU); b.fill(); }
      const lg = b.createLinearGradient(L / 2, 0, -L / 2, 0);
      lg.addColorStop(0, c1); lg.addColorStop(0.3, c2); lg.addColorStop(0.55, c1); lg.addColorStop(0.8, c2); lg.addColorStop(1, c1);
      b.fillStyle = lg; b.beginPath();
      spine.forEach(([sx, so, sw], j) => j ? b.lineTo(sx, so - sw) : b.moveTo(sx, so - sw));
      for (let j = 8; j >= 0; j--) b.lineTo(spine[j][0], spine[j][1] + spine[j][2]);
      b.closePath(); b.fill();
      b.restore();
    }
  };

  FX.train = ({l}, e, w, h, t, v) => {
    // Distant lights drift past at different speeds, giving a sense of travel.
    for (let i = 0; i < 18; i++) {
      const [b0, b1] = e.band || [0.6, 0.9], z = hash(i + 700), [x, y] = v.at(fract(hash(i + 701) - t * (0.012 + z * 0.02)), mix(b0, b1, hash(i + 702)));
      l.globalAlpha = v.a * (0.35 + 0.4 * z) * (0.75 + 0.25 * Math.sin(t * 3 + i));
      put(l, glow(pick(['#ffd28a', '#ffe9c0', '#ffb36a', '#cfe3ff'], hash(i + 703)), 0.25), x, y, (1.5 + z * 2.5) * v.s);
    }
    // Now and then a trackside lamp sweeps by and warms the window.
    const per = e.every || 9, k = Math.floor(t / per), q = (t - k * per) / 1.1;
    if (q >= 1 || hash(k + 710) > 0.8) return;
    const [x, y] = v.at(1.1 - q * 1.2, 0.35 + hash(k + 711) * 0.2);
    l.globalAlpha = v.a * 0.5; put(l, glow('#ffcf8a', 0.05), x, y, 40 * v.s, 18 * v.s);
    l.globalAlpha = v.a * 0.07 * Math.sin(q * Math.PI); l.fillStyle = '#ffb867';
    l.fillRect(v.box[0] * w, v.box[1] * h, (v.box[2] - v.box[0]) * w, (v.box[3] - v.box[1]) * h);
  };

  const hover = (e, w, h, t, v) => [e.at[0] * w + Math.sin(t * 0.15) * 14 * v.s, e.at[1] * h + Math.sin(t * 0.25) * 9 * v.s];
  FX.crane = ({b, l}, e, w, h, t, v) => {
    const ph = e.phase || 0, [x, y] = hover(e, w, h, t + ph, v), sc = v.s * (e.scale || 1.7), flap = Math.sin(t * 1.1 + ph);
    const pal = (e.palette || ['#f6f1e7', '#e2dacb', '#c7bca9', '#a3988a']).map(c => v.tint(c, x, y, 0.15));
    for (let j = 1; j <= 5; j++) {
      const [tx, ty] = hover(e, w, h, t + ph - j * 0.5, v);
      l.globalAlpha = v.a * 0.35 * (1 - j / 6) * (0.5 + 0.5 * Math.sin(t * 5 + j * 2)); put(l, twinkle('#fff1d0'), tx - j * 9 * sc, ty + 4 * sc, 4 * sc);
    }
    b.save(); b.translate(x, y); b.rotate(Math.sin(t * 0.15) * 0.06); b.scale(sc, sc); b.globalAlpha = Math.min(1, 0.45 + v.a);
    const poly = (col, pts) => { b.fillStyle = col; b.beginPath(); pts.forEach(([px, py], i) => i ? b.lineTo(px, py) : b.moveTo(px, py)); b.closePath(); b.fill(); };
    // Side view of a folded crane: far wing, tail, body, neck and head, near wing.
    const lift = flap * 26, tip = [-2 + flap * 3, -14 - lift];
    poly(pal[3], [[-7, -2], [7, -2], [tip[0] + 6, tip[1] + 4]]);
    poly(pal[2], [[-9, 2], [-4, -1], [-34, -20]]);
    poly(pal[1], [[-16, 3], [0, -3], [16, 3], [0, 9]]);
    poly(pal[2], [[-16, 3], [0, 9], [16, 3], [0, 5]]);
    poly(pal[0], [[9, 2], [4, -1], [30, -24]]);
    poly(pal[2], [[30, -24], [37, -18], [31, -21]]);
    poly(flap > 0 ? pal[0] : pal[1], [[-8, -1], [8, -1], tip]);
    poly(rgba('#000000', 0.08), [[0, -1], [8, -1], tip]);
    b.restore();
  };

  FX.book = ({b, l}, e, w, h, t, v) => {
    const [x, y] = hover(e, w, h, t + (e.phase || 0), v), sc = v.s * (e.scale || 1.6);
    l.globalAlpha = v.a * 0.35 * (0.85 + 0.15 * Math.sin(t * 1.3)); put(l, glow('#ffd79a', 0.02), x, y, 60 * sc);
    for (let j = 0; j < 6; j++) {
      const ang = t * 0.4 + (j * TAU) / 6;
      l.globalAlpha = v.a * 0.5 * (0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 2 + j * 3), 3));
      put(l, twinkle('#ffe6b0'), x + Math.cos(ang) * 32 * sc, y + Math.sin(ang) * 11 * sc - 4 * sc, 4 * sc);
    }
    b.save(); b.translate(x, y); b.rotate(Math.sin(t * 0.15) * 0.07); b.scale(sc, sc); b.globalAlpha = Math.min(1, 0.45 + v.a);
    const poly = (col, pts) => { b.fillStyle = v.tint(col, x, y, 0.25); b.beginPath(); pts.forEach(([px, py], i) => i ? b.lineTo(px, py) : b.moveTo(px, py)); b.closePath(); b.fill(); };
    poly('#6b3f37', [[0, 5], [-25, -2], [-25, 11], [0, 15]]); poly('#5c342e', [[0, 5], [25, -2], [25, 11], [0, 15]]);
    poly('#eadfc6', [[0, 3], [-23, -4], [-23, 8], [0, 12]]); poly('#f6ecd6', [[0, 3], [23, -4], [23, 8], [0, 12]]);
    b.strokeStyle = 'rgba(120,96,70,0.35)'; b.lineWidth = 0.6; b.beginPath();
    for (const k of [0.3, 0.55, 0.8]) { b.moveTo(-20, -2 + k * 9); b.lineTo(-4, 2 + k * 9); b.moveTo(4, 2 + k * 9); b.lineTo(20, -2 + k * 9); }
    b.stroke();
    const q = ((t + (e.phase || 0)) % 5) / 1.6;
    if (q < 1) { const a = smooth(q) * Math.PI, px = Math.cos(a) * 23, lift = Math.sin(a) * 9; poly(q < 0.5 ? '#fbf3e0' : '#e6dabf', [[0, 3], [px, -4 - lift], [px, 8 - lift], [0, 12]]); }
    b.restore();
  };

  // Candle flames are emissive, so they live on the light layer and add to the photograph.
  FX.flames = ({l}, e, w, h, t, v) => {
    const base = (e.height || 0.045) * h;
    for (const [i, a] of e.anchors.entries()) {
      const x = a[0] * w, y = a[1] * h, f = 1 + 0.14 * noise(t * 5 + i * 3.7) + 0.06 * Math.sin(t * 13 + i * 2);
      const size = base * f, lean = noise(t * 1.3 + i * 7) * 0.15;
      l.globalAlpha = v.a * 0.5 * f; put(l, glow('#ffae55', 0.03), x, y - size * 0.45, size * 2.6);
      l.save(); l.translate(x, y); l.transform(1, 0, -lean, 1, 0, 0); l.globalAlpha = Math.min(1, 0.35 + v.a) * 0.9;
      l.drawImage(flameSprite(false), -size * 0.32, -size, size * 0.64, size * 1.04);
      l.restore();
    }
  };

  // Two-dimensional value noise in [-1, 1], used for flame fronts that flare up and die back in place.
  const noise2 = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j), n = (a, b) => hash(a * 57.13 + b * 113.7);
    return mix(mix(n(i, j), n(i + 1, j), fx), mix(n(i, j + 1), n(i + 1, j + 1), fx), fy) * 2 - 1;
  };
  /*
   * A sheet of fire: the top edge is a row of ragged peaks that flare and fall back, under a dome envelope,
   * filled from a transparent root through the given colours to a transparent tip.
   */
  function flameFront(c, x0, y0, W, H, t, seed, alpha, colors) {
    const n = 30, top = [];
    for (let j = 0; j <= n; j++) {
      const u = j / n - 0.5, env = Math.pow(Math.max(0, 1 - (u * 2) ** 2), 0.55);
      const f = 0.6 * (0.5 + 0.5 * noise2(u * 3.6 + seed, t * 1.7)) + 0.4 * (0.5 + 0.5 * noise2(u * 8.5 + seed * 2, t * 3.6));
      const tall = H * env * (0.12 + 1.5 * Math.pow(f, 2.6)), lean = noise(t * 1.2 + seed + u * 1.5) * W * 0.07 * (tall / H);
      top.push([x0 + u * W + lean, y0 - tall]);
    }
    const g = c.createLinearGradient(0, y0, 0, y0 - H);
    g.addColorStop(0, rgba(colors[0], 0)); g.addColorStop(0.07, rgba(colors[0], 0.95)); g.addColorStop(0.45, rgba(colors[1], 0.85)); g.addColorStop(1, rgba(colors[2], 0));
    c.globalAlpha = alpha; c.fillStyle = g; c.beginPath(); c.moveTo(x0 - W / 2, y0);
    for (const pt of top) c.lineTo(...pt);
    c.lineTo(x0 + W / 2, y0); c.closePath(); c.fill();
  }

  FX.fire = ({b, l}, e, w, h, t, v) => {
    const x0 = e.at[0] * w, y0 = e.at[1] * h, W = (e.width || 0.04) * w, H = (e.height || 0.06) * h, speed = e.speed || 1;
    const breath = 0.8 + 0.2 * noise(t * 2.2 + x0);
    // Warm light thrown on the hearth and the surroundings.
    l.globalAlpha = v.a * 0.42 * breath; put(l, glow('#ff7426', 0.02), x0, y0 - H * 0.35, W * 1.9, Math.max(W * 1.4, H * 1.2));
    l.globalAlpha = v.a * 0.75 * (0.85 + 0.15 * noise(t * 3 + 7)); put(l, glow('#ff4d12', 0.12), x0, y0 + H * 0.02, W * 0.62, Math.max(3 * v.s, H * 0.14));
    for (let i = 0; i < 10; i++) {
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * (1.5 + hash(i + 830) * 2.5) + i * 4), 3);
      l.globalAlpha = v.a * 0.7 * tw; put(l, spark('#ff6a1c'), x0 + (hash(i + 831) - 0.5) * W * 0.95, y0 - hash(i + 832) * H * 0.06, (1.2 + hash(i + 833) * 1.4) * v.s);
    }
    // Flame body: an outer red-orange sheet, a brighter middle and a short yellow-white core.
    // Two faint, slightly larger copies of the outer sheet soften its edge without a blur filter.
    for (const k of [1.16, 1.08]) flameFront(l, x0, y0, W * k, H * k, t * speed, x0 * 0.01, v.a * 0.22, ['#ff7a24', '#ff4a10', '#9a1c05']);
    flameFront(l, x0, y0, W, H, t * speed, x0 * 0.01, Math.min(1, v.a * 1.2), ['#ff8a2a', '#ff4a10', '#9a1c05']);
    flameFront(l, x0, y0, W * 0.85, H * 0.75, t * speed * 1.1, x0 * 0.01 + 17, Math.min(1, v.a * 1.1), ['#ffc24a', '#ff8420', '#d84a12']);
    flameFront(l, x0, y0 + H * 0.03, W * 0.55, H * 0.4, t * speed * 1.2, x0 * 0.01 + 41, v.a * 0.85, ['#fff0b0', '#ffc860', '#ff9030']);
    const n = v.low ? 20 : 40;
    for (let i = 0; i < n; i++) {
      const sp = (0.9 + 0.8 * hash(i + 840)) * speed, run = t * sp + hash(i + 841), life = fract(run), k = Math.floor(run);
      const u = hash(i * 1.7 + k * 3.1) - 0.5, centre = 1 - Math.abs(u) * 1.6, rise = 0.35 + 0.65 * life;
      const tall = H * (0.5 + 0.6 * centre) * (0.8 + 0.4 * hash(i + k * 5 + 842));
      const x = x0 + u * W * (1 - 0.5 * rise) + noise(t * 2.3 + i * 0.7) * W * 0.08 * rise, y = y0 - rise * tall;
      const r = W * 0.06 * Math.pow(1 - life, 0.6);
      l.globalAlpha = v.a * Math.min(1, life * 8) * Math.pow(1 - life, 1.4) * 0.45;
      put(l, glow(life < 0.4 ? '#ffb347' : '#ff6a1f', 0.3), x, y, r, r * 2.2);
    }
    for (let i = 0, m = v.low ? 5 : 10; i < m; i++) {
      const q = fract(t * 0.45 * speed + hash(i + 820)), k = Math.floor(t * 0.45 * speed + hash(i + 820));
      l.globalAlpha = v.a * (1 - q) * (0.5 + 0.5 * Math.sin(t * 12 + i));
      put(l, spark('#ff9a3c'), x0 + (hash(i + 821 + k) - 0.5) * W * 0.6 + Math.sin(t * 2 + i) * 6 * v.s * q, y0 - H * 0.3 - q * H * 1.6, 1.4 * v.s);
    }
    if (e.smoke) wisps(b, x0, y0 - H * 0.85, t, v, {color: v.tint('#c9c4c0', x0, y0 - H * 2, 0.25), height: e.smoke, strands: 2, alpha: 0.16, width: 1.6, curl: 12, speed: 0.6, seed: x0, spread: W * 0.4});
  };

  // Lamps already lit in the artwork breathe and flicker very slightly.
  FX.lamps = ({l}, e, w, h, t, v) => {
    for (const [i, [x, y, r = 40]] of e.anchors.entries()) {
      const f = 0.75 + 0.18 * noise(t * (e.rate || 1.6) + i * 9) + 0.07 * Math.sin(t * 7 + i * 3);
      l.globalAlpha = v.a * (e.strength || 0.4) * f; put(l, glow(e.color || '#ffb45a', 0.04), x * w, y * h, r * v.s * (0.95 + 0.05 * f));
    }
  };

  // Slow shafts of light, as through glass, leaves or water.
  const beamSprite = hex => sprite(`beam${hex}`, 64, 256, g => {
    const across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, rgba(hex, 0)); across.addColorStop(0.5, rgba(hex, 1)); across.addColorStop(1, rgba(hex, 0));
    g.fillStyle = across; g.fillRect(0, 0, 64, 256);
    const along = g.createLinearGradient(0, 0, 0, 256);
    along.addColorStop(0, 'rgba(0,0,0,0.2)'); along.addColorStop(0.25, 'rgba(0,0,0,1)'); along.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = along; g.fillRect(0, 0, 64, 256);
  });
  FX.beams = ({l}, e, w, h, t, v) => {
    const [x0, y0, x1, y1] = v.box, len = (y1 - y0) * h * 1.25, ray = beamSprite(e.color || '#fff1c8');
    for (let i = 0; i < (e.count || 5); i++) {
      const x = mix(x0, x1, (i + 0.5) / (e.count || 5) + (hash(i + 900) - 0.5) * 0.12 + noise(t * 0.03 + i * 5) * 0.04) * w;
      const wide = (e.width || 40) * v.s * (0.6 + 0.8 * hash(i + 901));
      l.globalAlpha = v.a * (e.strength || 0.13) * (0.4 + 0.6 * Math.pow(0.5 + 0.5 * noise(t * 0.12 + i * 11), 1.5));
      l.save(); l.translate(x, y0 * h); l.rotate(-(e.angle ?? 0.3)); l.drawImage(ray, -wide / 2, 0, wide, len); l.restore();
    }
  };

  // Soft fog or cloud that drifts sideways.
  FX.mist = ({b}, e, w, h, t, v) => {
    const [cx, cy] = v.at(0.5, 0.5), puff = glow(v.tint(e.color || '#e8eef2', cx, cy, 0.3), 0.01), n = v.low ? 8 : e.count || 14;
    for (let i = 0; i < n; i++) {
      const z = hash(i + 950), uu = fract(hash(i + 951) + t * (e.speed || 0.004) * (0.5 + z));
      const [x, y] = v.at(uu * 1.3 - 0.15, hash(i + 952) * 0.8 + 0.1 + noise(t * 0.05 + i) * 0.05);
      b.globalAlpha = v.a * (e.strength || 0.18) * Math.sin(Math.PI * clamp(uu, 0, 1));
      put(b, puff, x, y, (e.size || 70) * v.s * (0.6 + 0.8 * z), (e.size || 70) * v.s * (0.25 + 0.2 * z));
    }
  };

  // Birds, gulls or bats crossing now and then in small groups.
  FX.birds = ({b}, e, w, h, t, v) => {
    const every = e.every || 16, bat = e.kind === 'bat', k = Math.floor(t / every), q = (t - k * every) / (e.cross || 11);
    if (q > 1 || hash(k + 960) > (e.chance ?? 0.7)) return;
    const dir = hash(k + 961) < 0.5 ? 1 : -1, n = 1 + Math.floor(hash(k + 962) * (e.flock || 3));
    b.fillStyle = e.color || (bat ? '#14121a' : '#3a3a42');
    for (let i = 0; i < n; i++) {
      const lag = i * 0.035, u = dir > 0 ? q - lag : 1 - q + lag;
      const [b0, b1] = e.band || [0.25, 0.75], [x, y] = v.at(u * 1.2 - 0.1, mix(b0, b1, hash(k + 963)) + (i % 2 ? 1 : -1) * i * 0.04 + Math.sin(t * (bat ? 2.4 : 0.9) + i) * (bat ? 0.05 : 0.02));
      const s = (e.size || 7) * v.s * (1 - i * 0.1), flap = Math.sin(t * (bat ? 14 : 5) + i * 1.7);
      b.globalAlpha = Math.min(1, 0.4 + v.a) * Math.min(1, q * 8, (1 - q) * 8);
      b.save(); b.translate(x, y); b.scale(dir * s, s); b.beginPath();
      if (bat) {
        b.moveTo(0, 0); b.quadraticCurveTo(-0.6, -0.9 * flap - 0.2, -1.6, -0.5 * flap); b.quadraticCurveTo(-1.1, 0.1, -0.9, 0.35); b.quadraticCurveTo(-0.5, 0.15, 0, 0.35);
        b.quadraticCurveTo(0.5, 0.15, 0.9, 0.35); b.quadraticCurveTo(1.1, 0.1, 1.6, -0.5 * flap); b.quadraticCurveTo(0.6, -0.9 * flap - 0.2, 0, 0);
      } else {
        b.moveTo(-1.5, -0.6 * flap); b.quadraticCurveTo(-0.7, -0.75 * flap - 0.15, 0, 0.12); b.quadraticCurveTo(0.7, -0.75 * flap - 0.15, 1.5, -0.6 * flap);
        b.quadraticCurveTo(0.7, -0.6 * flap + 0.05, 0, 0.3); b.quadraticCurveTo(-0.7, -0.6 * flap + 0.05, -1.5, -0.6 * flap);
      }
      b.fill(); b.restore();
    }
  };

  FX.bubbles = ({b, l}, e, w, h, t, v) => {
    b.strokeStyle = e.color || '#cfefff';
    for (let i = 0; i < v.n; i++) {
      const z = hash(i + 980), rise = hash(i + 981) + t * (0.02 + z * 0.03), vv = 1 - fract(rise);
      const [x, y] = v.at(fract(hash(i + 982 + Math.floor(rise) * 3.1)) + Math.sin(t * 2 + i) * 0.004, vv), r = (1 + z * 2.2) * v.s;
      const fade = Math.min(1, (1 - vv) / 0.1, vv / 0.15);
      b.globalAlpha = v.a * 0.5 * fade; b.lineWidth = 0.7 * v.s; b.beginPath(); b.arc(x, y, r, 0, TAU); b.stroke();
      l.globalAlpha = v.a * 0.5 * fade; put(l, glow('#ffffff', 0.3), x - r * 0.35, y - r * 0.35, r * 0.5);
    }
  };

  // Incense, embers and dying campfires: a few slow grey strands.
  FX.smoke = ({b}, e, w, h, t, v) => wisps(b, e.at[0] * w, e.at[1] * h, t, v, {
    color: v.tint(e.color || '#d9dcdf', e.at[0] * w, e.at[1] * h - 40 * v.s, 0.3), height: e.height || 130, strands: e.strands || 2, alpha: e.strength || 0.3,
    width: e.width || 1.3, curl: e.curl || 12, speed: e.speed || 0.7, seed: e.at[0] * 17
  });

  // Sunlight through moving leaves: soft warm patches that sway and breathe.
  FX.dapple = ({l}, e, w, h, t, v) => {
    const spot = glow(e.color || '#fff0c8', 0.25);
    for (let i = 0; i < v.n; i++) {
      const [x, y] = v.at(hash(i + 1200) + noise(t * 0.22 + i * 5) * 0.012, hash(i + 1201) + noise(t * 0.19 + i * 7 + 3) * 0.01);
      const r = (e.size || 14) * v.s * (0.6 + 0.8 * hash(i + 1202));
      l.globalAlpha = v.a * (e.strength || 0.16) * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * noise(t * 0.35 + i * 11), 1.5));
      put(l, spot, x, y, r, r * (e.flat || 0.45));
    }
  };

  // A few moths circling a lamp.
  FX.moths = ({b, l}, e, w, h, t, v) => {
    for (const [j, a] of e.anchors.entries()) for (let i = 0; i < (e.count || 2); i++) {
      const k = j * 7 + i, ang = t * (0.9 + hash(k + 1300)) * (k % 2 ? 1 : -1) + hash(k + 1301) * TAU, r = (e.radius || 26) * v.s * (0.6 + 0.5 * noise(t * 0.4 + k * 3));
      const x = a[0] * w + Math.cos(ang) * r, y = a[1] * h + Math.sin(ang) * r * 0.6 + noise(t * 0.7 + k) * 6 * v.s, flap = Math.abs(Math.sin(t * 22 + k * 2));
      l.globalAlpha = v.a * 0.25; put(l, glow('#ffd9a0', 0.1), x, y, 5 * v.s);
      b.globalAlpha = Math.min(1, 0.4 + v.a) * 0.85; b.fillStyle = e.color || '#efe2c6';
      for (const sx of [-1, 1]) { b.beginPath(); b.ellipse(x + sx * 1.6 * v.s * flap, y, 1.8 * v.s * (0.3 + 0.7 * flap), 1.2 * v.s, sx * 0.5, 0, TAU); b.fill(); }
    }
  };

  // A small sailboat crossing the horizon very slowly.
  FX.boat = ({b, l}, e, w, h, t, v) => {
    const [x0, , x1] = v.box, per = e.period || 260, q = fract(t / per + (e.phase || 0)), dir = e.dir || 1;
    const x = mix(x0, x1, dir > 0 ? q : 1 - q) * w, y = e.at[1] * h + Math.sin(t * 0.8) * 0.4 * v.s, s = (e.size || 9) * v.s;
    b.globalAlpha = Math.min(1, 0.45 + v.a) * Math.min(1, q * 20, (1 - q) * 20);
    b.fillStyle = v.tint(e.hull || '#3c4552', x, y); b.beginPath(); b.moveTo(x - s * 0.9, y); b.lineTo(x + s * 0.9, y); b.lineTo(x + s * 0.6, y + s * 0.28); b.lineTo(x - s * 0.6, y + s * 0.28); b.fill();
    b.fillStyle = v.tint(e.color || '#fbfaf5', x, y); b.beginPath(); b.moveTo(x + dir * s * 0.05, y - s * 1.8); b.lineTo(x + dir * s * 0.75, y - s * 0.1); b.lineTo(x + dir * s * 0.05, y - s * 0.1); b.fill();
    b.globalAlpha *= 0.8; b.beginPath(); b.moveTo(x - dir * s * 0.05, y - s * 1.4); b.lineTo(x - dir * s * 0.5, y - s * 0.1); b.lineTo(x - dir * s * 0.05, y - s * 0.1); b.fill();
    l.globalAlpha = v.a * 0.25; put(l, glow(v.tint('#ffffff', x, y), 0.3), x, y + s * 0.6, s * 1.2, s * 0.25);
  };

  // A satellite gliding across the dark, with a slow blink.
  FX.satellite = ({l}, e, w, h, t, v) => {
    const per = e.every || 45, k = Math.floor(t / per), q = (t - k * per) / (e.cross || 30);
    if (q > 1) return;
    const [x, y] = v.at(q, 0.2 + 0.6 * hash(k + 1400) + (q - 0.5) * (hash(k + 1401) - 0.5) * 0.6);
    l.globalAlpha = v.a * Math.min(1, q * 10, (1 - q) * 10) * (0.55 + 0.45 * (fract(t / 1.6) < 0.12 ? 1 : 0));
    put(l, spark('#e8f0ff'), x, y, 3.2 * v.s);
  };

  // Water spilling from a fountain bowl: thin smooth streams with droplets running down them.
  FX.fountain = ({b, l}, e, w, h, t, v) => {
    const [cx, cy] = e.at, half = e.width || 0.025, fall = (e.fall || 0.06) * h, n = v.low ? 4 : 7, drop = glow('#ffffff', 0.35);
    b.lineCap = 'round'; b.strokeStyle = e.color || '#eef7fa';
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n * 2 - 1, x = (cx + k * half) * w, y = cy * h, out = k * 6 * v.s;
      const at = u => [x + out * (0.6 * u + 0.7 * u * u), y + fall * u * u];
      b.globalAlpha = v.a * 0.32 * (0.75 + 0.25 * noise(t * 1.5 + i * 3)); b.lineWidth = 1.2 * v.s;
      b.beginPath(); b.moveTo(x, y); for (let j = 1; j <= 8; j++) b.lineTo(...at(j / 8)); b.stroke();
      for (let d = 0; d < 3; d++) {
        const u = fract(t * 0.9 + d / 3 + hash(i + 1500)), [px, py] = at(u);
        l.globalAlpha = v.a * 0.55 * Math.sin(Math.PI * u); put(l, drop, px, py, 1.8 * v.s);
      }
      const q = fract(t * 1.3 + hash(i + 1501)), [ex, ey] = at(1);
      l.globalAlpha = v.a * 0.5 * (1 - q); put(l, drop, ex + (hash(i + 1502 + Math.floor(t * 1.3)) - 0.5) * 5 * v.s, ey - q * 4 * v.s, 1.8 * v.s);
    }
  };

  FX.sprite = ({b}, e, w, h, t, v) => {
    const img = v.img; if (!img?.complete || !img.naturalWidth) return;
    let x = e.at[0] * w, y = e.at[1] * h;
    if (e.path) {
      const visit = e.visit || 25, q = t % (e.period || 95); if (q > visit) return; const u = q / visit;
      x = mix(e.path[0][0], e.path[1][0], u) * w; y = mix(e.path[0][1], e.path[1][1], u) * h; b.globalAlpha *= Math.min(1, q / 2, (visit - q) / 2);
    }
    const width = e.width * w, height = width * img.naturalHeight / img.naturalWidth;
    b.translate(x, y); b.scale(1, 1 + (e.path ? 0 : Math.sin(t * 1.1) * 0.004)); b.drawImage(img, -width / 2, -height, width, height);
  };

  FX.robot = ({b}, e, w, h, t, v) => {
    // A rare small maintenance visit; the path is outside the reading surface.
    const q = t % 95; if (q > 24) return; const [a, z] = e.path, u = q / 24;
    b.translate(mix(a[0], z[0], u) * w, mix(a[1], z[1], u) * h); b.scale(v.s, v.s); b.globalAlpha = v.a * Math.min(1, q / 2, (24 - q) / 2) * 0.8;
    b.fillStyle = '#3a403b'; b.beginPath(); b.ellipse(0, 3, 16, 5, 0, 0, TAU); b.fill(); b.fillStyle = '#949b8e'; b.fillRect(-12, -7, 24, 9); b.fillStyle = '#a4c6b7'; b.fillRect(5, -5, 4, 2);
  };

  // Effects seen beyond walls and window frames. A catalog entry can override this with `layer`.
  const LAYER = {stars:'sky', fireworks:'sky', birds:'sky', 'sky-lanterns':'sky', aurora:'sky', satellite:'sky'};

  class OrigamiBackground extends HTMLElement {
    static observedAttributes = ['scene','motion','quality','intensity','fireworks'];
    constructor() {
      super();
      const shadow = this.attachShadow({mode:'open'});
      /*
       * Stacking follows document order: the plate, the drifting sky, then one block per masked layer (its effects,
       * its light, and the plate again with that layer's opening cut out, so walls and frames cover the effects),
       * then room effects and room light. Masks are applied by CSS, so they cost nothing per frame.
       */
      const fit = 'mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;mask-position:center;-webkit-mask-position:center';
      shadow.innerHTML = `<style>:host{display:block;position:relative;overflow:hidden;background:#151319;isolation:isolate;min-height:1px}img,canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}img{object-fit:cover;object-position:center}.light{mix-blend-mode:screen}.drift{${fit};mask-size:cover;-webkit-mask-size:cover}.cut{${fit};mask-size:auto,cover;-webkit-mask-size:auto,cover;mask-composite:exclude;-webkit-mask-composite:xor}:host([hidden]){display:none}</style><img alt="" draggable="false"><canvas class="drift" aria-hidden="true"></canvas><canvas class="paint" aria-hidden="true"></canvas><canvas class="light" aria-hidden="true"></canvas>`;
      this.img = shadow.querySelector('img');[this.skyCanvas,this.canvas,this.lightCanvas] = shadow.querySelectorAll('canvas');
      this.sctx = this.skyCanvas.getContext('2d',{alpha:true});this.ctx = this.canvas.getContext('2d',{alpha:true});this.lctx = this.lightCanvas.getContext('2d',{alpha:true});
      this._layers={};this._groups={};this._light=()=>[1,1,1];
      this._time=0;this._raf=0;this._visible=true;this._last=0;this._ready=false;this._sprites=new Map();
      this._tick=this._tick.bind(this);this._visibility=()=>this._sync();
      this._media=()=>this._sync();this._resize=()=>{this._measure();this._sync();};
      this.img.onload=()=>{this._ready=true;this._measure();this._sync();this.dispatchEvent(new CustomEvent('scene-ready',{detail:{id:this._scene.id}}));};
      this.img.onerror=()=>{this._ready=false;this._sync();this.dispatchEvent(new CustomEvent('scene-error',{detail:{id:this._scene?.id}}));};
    }
    connectedCallback() {
      this._mq=matchMedia('(prefers-reduced-motion: reduce)');this._mq.addEventListener('change',this._media);
      document.addEventListener('visibilitychange',this._visibility);
      this._ro=new ResizeObserver(this._resize);this._ro.observe(this);
      this._io=new IntersectionObserver(entries=>{this._visible=entries[0].isIntersecting;this._sync();});this._io.observe(this);
      // A scene supplied with useScene() is kept; otherwise the scene attribute picks one from window.OrigamiScenes.
      if(!this._scene||(this.hasAttribute('scene')&&this.getAttribute('scene')!==this._scene.id))this._select();
      this._measure();this._sync();
    }
    disconnectedCallback() {
      this._stop();clearTimeout(this._recheck);this._recheck=0;this._ro?.disconnect();this._io?.disconnect();
      this._mq?.removeEventListener('change',this._media);document.removeEventListener('visibilitychange',this._visibility);
    }
    attributeChangedCallback(name) {
      if(!this.isConnected)return;
      if(name==='scene')this._select();
      if(name==='quality')this._measure();
      this._sync();
    }
    set scene(value) {this.setAttribute('scene',value);}
    get scene() {return this._scene?.id || this.getAttribute('scene');}
    set motion(value) {this.setAttribute('motion',value?'on':'off');}
    get motion() {return this.getAttribute('motion')!=='off';}
    get status() {return {scene:this.scene,ready:this._ready,running:!!this._raf,reducedMotion:!!this._mq?.matches,quality:this._quality(),frames:this._frames||0};}
    /** Supply a catalog entry, including custom image/masks, without changing global data. */
    useScene(entry) {
      if(!entry || !Array.isArray(entry.effects) || typeof entry.image!=='string')throw new TypeError('Invalid scene');
      this._scene=entry;this._time=0;this._ready=false;this._clear();this._stop();this.img.src=entry.image;
      const redraw=()=>{if(this._ready&&!this._raf)this._draw(true);};
      for(const e of entry.effects){if(e.sprite&&!this._sprites.has(e.sprite)){const img=new Image();this._sprites.set(e.sprite,img);img.onload=redraw;img.src=e.sprite;}}
      // Occlusion masks and the filled sky are optional; without them effects draw unmasked and clouds stay still.
      // Masks are also fetched here so they are cached by the time CSS needs them.
      const load=src=>{if(!src)return null;const img=new Image();img.onload=redraw;img.src=src;return img;};
      this._layers={sky:load(entry.masks?.sky),outside:load(entry.masks?.outside),drift:load(entry.drift?.mask),skyfill:load(entry.drift?.skyfill)};
      const drift=entry.drift?.mask?`url("${entry.drift.mask}")`:'none';this.skyCanvas.style.maskImage=drift;this.skyCanvas.style.webkitMaskImage=drift;
      this._light=lighting(entry.ambient);this._skyAt=null;this._buildGroups(entry);
      this._measure();this._sync();
    }
    /** One block of canvases per masked layer, covered by the plate with that layer's opening cut out. */
    _buildGroups(entry){
      for(const g of Object.values(this._groups))for(const el of g.els)el.remove();
      this._groups={};if(!entry)return;
      const used=new Set(entry.effects.map(e=>e.layer||LAYER[e.type])),m=entry.masks||{};
      for(const name of ['sky','outside']){
        const src=name==='sky'?m.sky||m.outside:m.outside||m.sky;
        if(!used.has(name)||!src)continue;
        const paint=document.createElement('canvas'),light=document.createElement('canvas'),cut=document.createElement('img');
        light.className='light';cut.className='cut';cut.alt='';cut.draggable=false;cut.src=entry.image;
        for(const el of [paint,light,cut])el.setAttribute('aria-hidden','true');
        const mask=`linear-gradient(#000,#000),url("${src}")`;cut.style.maskImage=mask;cut.style.webkitMaskImage=mask;
        this.canvas.before(paint,light,cut);
        this._groups[name]={b:paint.getContext('2d',{alpha:true}),l:light.getContext('2d',{alpha:true}),els:[paint,light,cut],r:null};
      }
    }
    _select() {
      const id=this.getAttribute('scene') || 'new-year';
      const scene=(window.OrigamiScenes||[]).find(s=>s.id===id);
      if(scene)this.useScene(scene);
      else{this._stop();this._ready=false;this._scene=null;this.img.removeAttribute('src');this._clear();this._buildGroups(null);this.dispatchEvent(new CustomEvent('scene-error',{detail:{id}}));}
    }
    _quality() {
      const q=this.getAttribute('quality');
      if(q==='low'||q==='high')return q;
      return navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4 ? 'low':'high';
    }
    _measure() {
      const r=this.getBoundingClientRect();this._w=r.width;this._h=r.height;
      this._dpr=Math.min(devicePixelRatio||1,this._quality()==='low'?1:1.5);
      for(const c of [this.skyCanvas,this.canvas,this.lightCanvas]){c.width=Math.max(1,Math.round(r.width*this._dpr));c.height=Math.max(1,Math.round(r.height*this._dpr));}
      const iw=this.img.naturalWidth||this._scene?.sourceWidth||1672, ih=this.img.naturalHeight||this._scene?.sourceHeight||941;
      this._scale=Math.max(r.width/iw,r.height/ih);this._sw=iw*this._scale;this._sh=ih*this._scale;
      this._ox=(r.width-this._sw)/2;this._oy=(r.height-this._sh)/2;this._skyAt=null;
      // Masked layers only need canvases as large as the area their effects can reach.
      for(const [name,g] of Object.entries(this._groups)){
        const bb=this._scene.effects.filter(e=>(e.layer||LAYER[e.type])===name).map(e=>bounds(e.clip||full));
        g.r=bb.length?this._rect([Math.min(...bb.map(x=>x[0])),Math.min(...bb.map(x=>x[1])),Math.max(...bb.map(x=>x[2])),Math.max(...bb.map(x=>x[3]))]):null;
        const [x,y,w,h]=g.r||[0,0,1,1];
        for(const c of [g.b.canvas,g.l.canvas]){c.width=w;c.height=h;Object.assign(c.style,{left:x/this._dpr+'px',top:y/this._dpr+'px',width:w/this._dpr+'px',height:h/this._dpr+'px'});}
      }
    }
    _clear(keepSky=false){
      const all=[this.ctx,this.lctx,...Object.values(this._groups||{}).flatMap(g=>[g.b,g.l])];
      if(!keepSky){all.push(this.sctx);this._skyAt=null;}
      for(const c of all){c?.setTransform(1,0,0,1,0,0);c?.clearRect(0,0,c.canvas.width,c.canvas.height);}
    }
    /** Device-pixel rectangle covering source-fraction bounds, clamped to the canvas. */
    _rect([x0,y0,x1,y1]){
      const d=this._dpr,W=this.canvas.width,H=this.canvas.height;
      const a=Math.max(0,Math.floor((this._ox+x0*this._sw)*d)-2),b=Math.max(0,Math.floor((this._oy+y0*this._sh)*d)-2);
      const c=Math.min(W,Math.ceil((this._ox+x1*this._sw)*d)+2),e=Math.min(H,Math.ceil((this._oy+y1*this._sh)*d)+2);
      return c>a&&e>b?[a,b,c-a,e-b]:null;
    }
    /** The painted sky slides slowly; two offset copies cross-fade so the motion loops without a jump. */
    _drawSky(t){
      const d=this._scene.drift,fill=this._layers.skyfill,c=this.sctx;
      if(!d||!fill?.naturalWidth)return;
      // The sky moves well under a pixel per second, so a few updates a second look continuous.
      if(this._skyAt!==null&&Math.abs(t-this._skyAt)<0.35)return;
      this._skyAt=t;const r=this._rect(d.box);if(!r)return;
      c.setTransform(1,0,0,1,0,0);c.clearRect(...r);
      const w=this._sw,h=this._sh,[x0,y0,x1,y1]=d.box,dist=(d.distance||40)*this._scale*(d.dir||1),q=fract(t/(d.period||120));
      c.setTransform(this._dpr,0,0,this._dpr,0,0);c.translate(this._ox,this._oy);
      const copy=(phase,alpha)=>{c.globalAlpha=alpha;c.drawImage(fill,x0*w+(fract(phase)-0.5)*dist,y0*h,(x1-x0)*w,(y1-y0)*h);};
      const edge=smooth(clamp(Math.min(q,1-q)/0.2,0,1));
      copy(q+0.5,1);copy(q,edge);c.globalAlpha=1;
    }
    _stop(){if(this._raf)cancelAnimationFrame(this._raf);this._raf=0;this._last=0;}
    _sync(){
      const allowed=this.isConnected&&this._ready&&this._scene&&this.ctx&&this.motion&&!this._mq?.matches&&!document.hidden&&this._visible&&this._w>0&&this._h>0&&Number(this.getAttribute('intensity')??0.65)>0;
      if(allowed){if(!this._raf)this._raf=requestAnimationFrame(this._tick);}
      else{this._stop();if(this._ready&&this._scene&&this._w>0&&this._h>0)this._draw(true);else this._clear();}
      // A media query change event is not always delivered (seen in headless Chromium), so while paused for
      // reduced motion the preference is also checked once a second.
      if(!allowed&&this.isConnected&&this._mq?.matches&&!this._recheck)this._recheck=setTimeout(()=>{this._recheck=0;this._sync();},1000);
    }
    _tick(now){
      if(!this.isConnected||!this.motion||this._mq?.matches||document.hidden||!this._visible){this._raf=0;this._sync();return;}
      const interval=this._quality()==='low'?1000/20:1000/30;
      if(!this._last)this._last=now;
      const dt=now-this._last;
      if(dt>=interval-0.5){this._time+=Math.min(dt,100)/1000;this._last=now;this._draw();this._frames=(this._frames||0)+1;}
      this._raf=requestAnimationFrame(this._tick);
    }
    _draw(still=false){
      const b=this.ctx,l=this.lctx;if(!b||!l)return;
      const intensity=clamp(Number(this.getAttribute('intensity')??0.65)||0,0,1),low=this._quality()==='low',w=this._sw,h=this._sh,d=this._dpr,t=still?0:this._time;
      this._clear(!still&&intensity>0);
      if(!still&&intensity>0)this._drawSky(t);
      for(const e of this._scene.effects){
        if(still&&!e.still)continue;
        if(e.type==='fireworks'&&this.getAttribute('fireworks')==='off')continue;
        if(!FX[e.type])continue;
        // Effects of a masked layer draw on that layer's canvases; without a mask they join the room.
        const g=this._groups[e.layer||LAYER[e.type]];if(g&&!g.r)continue;
        const tb=g?g.b:b,tl=g?g.l:l,[rx,ry]=g?g.r:[0,0],box=bounds(e.clip||full),a=e.type==='sprite'?1:intensity;
        for(const c of [tb,tl]){c.setTransform(d,0,0,d,-rx,-ry);c.translate(this._ox,this._oy);c.save();clip(c,e.clip||full,w,h,e.holes);c.globalAlpha=a;}
        tl.globalCompositeOperation='lighter';
        FX[e.type]({b:tb,l:tl},e,w,h,t,{a,low,box,s:w/1672,img:this._sprites.get(e.sprite),n:Math.ceil((e.count||20)*(low?0.55:1)),
          at:(u,v)=>[(box[0]+u*(box[2]-box[0]))*w,(box[1]+v*(box[3]-box[1]))*h],
          light:(x,y)=>this._light(x/w,y/h),
          tint:(hex,x,y,floor=0)=>lightHex(hex,this._light(x/w,y/h),floor)});
        tb.restore();tl.restore();
      }
    }
  }
  if(!customElements.get('origami-background'))customElements.define('origami-background',OrigamiBackground);
  function evaluateUnlocks(catalog,progress={},previous=[]){
    progress=progress||{};
    const known=new Set(catalog.map(s=>s.id));const unlocked=new Set(previous.filter(id=>known.has(id)));
    for(const scene of catalog){const u=scene.unlock;let earned=false;
      if(u.metric==='holidaySeconds')earned=finite(progress.holidaySeconds?.[u.holidayId])>=u.value||finite(progress.activeSeconds)>=u.fallbackSeconds;
      else earned=finite(progress[u.metric])>=u.value;
      if(earned)unlocked.add(scene.id);
    }return [...unlocked];
  }
  class UnlockStore{
    constructor({key='origami.backgroundUnlocks.v1',storage,catalog=window.OrigamiScenes||[]}={}){this.key=key;this.storage=storage;this.catalog=catalog;this.ids=[];this.error=null;
      try{this.storage=storage===undefined?window.localStorage:storage;const data=JSON.parse(this.storage.getItem(key)||'[]');if(Array.isArray(data))this.ids=data.filter(x=>catalog.some(s=>s.id===x));}catch(err){this.error=err;}
    }
    update(progress){const before=new Set(this.ids);this.ids=evaluateUnlocks(this.catalog,progress,this.ids);try{this.storage.setItem(this.key,JSON.stringify(this.ids));this.error=null;}catch(err){this.error=err;}return this.ids.filter(id=>!before.has(id));}
    has(id){return this.ids.includes(id);}
  }
  window.OrigamiBackgrounds={OrigamiBackground,evaluateUnlocks,UnlockStore,effects:Object.keys(FX)};
})();
