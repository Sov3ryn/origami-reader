/*
 * Builds per-scene data from the plates: occlusion masks (sky, outside), the filled sky texture used for
 * drifting clouds, and an ambient colour grid used to match effect brightness to the artwork.
 * Optional developer tool: needs Playwright and Chromium, like tests/browser.cjs.
 *   node tools/build-scene-data.cjs [--preview <dir>] [scene ...]
 * Writes assets/masks/*.png|jpg and scene-data.js. Configuration lives in tools/scene-masks.cjs.
 */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..'), config = require('./scene-masks.cjs');
const args = process.argv.slice(2), at = args.indexOf('--preview');
const preview = at >= 0 ? path.resolve(args.splice(at, 2)[1]) : null, only = args;

// Runs in the page. Everything is in source pixels (1672 x 941).
async function build(id, cfg) {
  const img = new Image(); img.src = `/assets/${id}.png`; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, N = W * H;
  const cv = Object.assign(document.createElement('canvas'), {width: W, height: H}), c = cv.getContext('2d', {willReadFrequently: true});
  c.drawImage(img, 0, 0); const px = c.getImageData(0, 0, W, H).data;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), L = new Float32Array(N), grad = new Float32Array(N);
  for (let i = 0; i < N; i++) { R[i] = px[i * 4]; G[i] = px[i * 4 + 1]; B[i] = px[i * 4 + 2]; L[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i]; }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; let m = 0;
    for (const A of [R, G, B]) {
      const gx = A[i - W + 1] + 2 * A[i + 1] + A[i + W + 1] - A[i - W - 1] - 2 * A[i - 1] - A[i + W - 1];
      const gy = A[i + W - 1] + 2 * A[i + W] + A[i + W + 1] - A[i - W - 1] - 2 * A[i - W] - A[i - W + 1];
      m = Math.max(m, (Math.abs(gx) + Math.abs(gy)) / 8);
    }
    grad[i] = m;
  }
  const raster = (polys, value = 255) => {
    const k = Object.assign(document.createElement('canvas'), {width: W, height: H}), g = k.getContext('2d', {willReadFrequently: true});
    g.fillStyle = '#fff';
    for (const poly of polys || []) {
      g.beginPath();
      if (poly.circle) g.arc(poly.circle[0] * W, poly.circle[1] * H, poly.circle[2] * W, 0, Math.PI * 2);
      else poly.forEach(([x, y], j) => j ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H));
      g.fill();
    }
    const d = g.getImageData(0, 0, W, H).data, out = new Uint8Array(N);
    for (let i = 0; i < N; i++) out[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    return out;
  };
  const dist = (i, r, g, b) => Math.max(Math.abs(R[i] - r), Math.abs(G[i] - g), Math.abs(B[i] - b));
  const morph = (m, grow) => {
    const o = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = grow ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy)), s = m[yy * W + xx];
        if (grow ? s : !s) { v = grow ? 1 : 0; dy = dx = 2; }
      }
      o[y * W + x] = v;
    }
    return o;
  };
  const clean = m => morph(morph(morph(morph(m, true), false), false), true);
  const feather = (m, cut) => {
    const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = m[i] && !(cut && cut[i]) ? 1 : 0;
    const b = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += a[yy * W + xx]; n++; } }
      b[y * W + x] = s / n;
    }
    return b;
  };
  const png = alpha => {
    const k = Object.assign(document.createElement('canvas'), {width: W, height: H}), g = k.getContext('2d'), d = g.createImageData(W, H);
    for (let i = 0; i < N; i++) { d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = 255; d.data[i * 4 + 3] = Math.round(alpha[i] * 255); }
    g.putImageData(d, 0, 0); return k.toDataURL('image/png');
  };
  function sky(o) {
    const region = raster(o.region), gmax = o.gmax ?? 7, step = o.step ?? 7, tol = o.tol ?? 16, rad = Math.round((o.rad ?? 0.03) * W);
    const m = new Uint8Array(N), q = [];
    for (const [sx, sy] of o.seeds) {
      const i = Math.round(sy * H) * W + Math.round(sx * W);
      if (region[i] && !m[i]) { m[i] = 1; q.push(i); }
    }
    while (q.length) {
      const i = q.pop(), x = i % W;
      for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (n < 0 || n >= N || m[n] || !region[n] || grad[n] > gmax || dist(n, R[i], G[i], B[i]) > step) continue;
        m[n] = 1; q.push(n);
      }
    }
    // Sky seen through gaps (leaves, mullions) is matched against the nearby flooded sky colour.
    const S = [0, 0, 0, 0].map(() => new Float64Array((W + 1) * (H + 1)));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, j = (y + 1) * (W + 1) + x + 1, v = [m[i] * R[i], m[i] * G[i], m[i] * B[i], m[i]];
      for (let k = 0; k < 4; k++) S[k][j] = v[k] + S[k][j - 1] + S[k][j - W - 1] - S[k][j - W - 2];
    }
    const box = (k, x0, y0, x1, y1) => S[k][y1 * (W + 1) + x1] - S[k][y0 * (W + 1) + x1] - S[k][y1 * (W + 1) + x0] + S[k][y0 * (W + 1) + x0];
    const out = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (m[i]) { out[i] = 1; continue; }
      if (!region[i] || grad[i] > (o.gmax2 ?? gmax * 1.6)) continue;
      const x0 = Math.max(0, x - rad), x1 = Math.min(W, x + rad + 1), y0 = Math.max(0, y - rad), y1 = Math.min(H, y + rad + 1), n = box(3, x0, y0, x1, y1);
      if (n < 8) continue;
      if (dist(i, box(0, x0, y0, x1, y1) / n, box(1, x0, y0, x1, y1) / n, box(2, x0, y0, x1, y1) / n) < tol) out[i] = 1;
    }
    // Painted clouds are islands inside the sky: anything not reachable from textured land, trees or frames joins the sky.
    if (o.fillHoles !== false) {
      const reach = new Uint8Array(N), solid = o.solid ?? 22, st = [];
      for (let i = 0; i < N; i++) if (region[i] && !out[i] && grad[i] > solid) { reach[i] = 1; st.push(i); }
      while (st.length) {
        const i = st.pop(), x = i % W;
        for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (n >= 0 && n < N && region[n] && !out[n] && !reach[n]) { reach[n] = 1; st.push(n); }
      }
      for (let i = 0; i < N; i++) if (region[i] && !out[i] && !reach[i]) out[i] = 1;
    }
    let flooded = 0, total = 0; for (let i = 0; i < N; i++) { flooded += m[i]; total += out[i]; }
    debug.sky = {seeds: o.seeds.map(([sx, sy]) => { const i = Math.round(sy * H) * W + Math.round(sx * W); return [region[i], Math.round(grad[i] * 10) / 10, R[i], G[i], B[i]]; }), flooded, total};
    return clean(out);
  }
  function outside(o) {
    const region = raster(o.region), pred = new Function('r', 'g', 'b', 'l', 'return ' + (o.pred || 'true'));
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (region[i] && pred(R[i], G[i], B[i], L[i])) out[i] = 1;
    const cut = raster(o.cut); for (let i = 0; i < N; i++) if (cut[i]) out[i] = 0;
    return clean(out);
  }
  const debug = {}, res = {id, files: {}, data: {}, debug};
  const masks = {};
  if (cfg.sky) masks.sky = sky(cfg.sky);
  if (cfg.outside) masks.outside = outside(cfg.outside);
  if (cfg.outside?.addSky && masks.sky) for (let i = 0; i < N; i++) masks.outside[i] |= masks.sky[i];
  for (const [k, m] of Object.entries(masks)) { res.files[`${id}-${k}.png`] = png(feather(m)); res.data[k] = `assets/masks/${id}-${k}.png`; }
  if (cfg.sky?.drift) {
    const cut = raster(cfg.sky.cut), drift = feather(masks.sky, cut);
    res.files[`${id}-drift.png`] = png(drift);
    res.data.drift = {mask: `assets/masks/${id}-drift.png`, distance: cfg.sky.drift.distance ?? 40, period: cfg.sky.drift.period ?? 120, dir: cfg.sky.drift.dir ?? 1};
    // Fill everything that is not sky with the nearest sky colours, so shifted copies never smear walls or trees into the sky.
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let i = 0; i < N; i++) if (drift[i] > 0) { const x = i % W, y = (i - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const margin = Math.ceil((cfg.sky.drift.distance ?? 40) + 6);
    x0 = Math.max(0, x0 - margin); x1 = Math.min(W - 1, x1 + margin); y0 = Math.max(0, y0 - 2); y1 = Math.min(H - 1, y1 + 2);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, F = new Float32Array(w * h * 3), known = new Uint8Array(w * h), sk = masks.sky;
    for (let y = 0; y < h; y++) {
      const ks = [];
      for (let x = 0; x < w; x++) { const i = (y + y0) * W + x + x0; if (sk[i] && !(grad[i] > 12)) ks.push(x); }
      if (!ks.length) continue;
      for (let x = 0, k = 0; x < w; x++) {
        while (k < ks.length - 1 && ks[k + 1] <= x) k++;
        // Between two known sky pixels interpolate; beyond the ends copy the nearest one.
        const a = x < ks[0] ? ks[0] : ks[k], b = x < ks[0] || k === ks.length - 1 ? a : ks[k + 1];
        const u = b === a ? 0 : (x - a) / (b - a), ia = (y + y0) * W + a + x0, ib = (y + y0) * W + b + x0, o = (y * w + x) * 3;
        F[o] = R[ia] + (R[ib] - R[ia]) * u; F[o + 1] = G[ia] + (G[ib] - G[ia]) * u; F[o + 2] = B[ia] + (B[ib] - B[ia]) * u;
        known[y * w + x] = 1;
      }
    }
    for (const dir of [1, -1]) for (let y = dir > 0 ? 1 : h - 2; y >= 0 && y < h; y += dir) for (let x = 0; x < w; x++) {
      const j = y * w + x, p = (y - dir) * w + x;
      if (!known[j] && known[p]) { F[j * 3] = F[p * 3]; F[j * 3 + 1] = F[p * 3 + 1]; F[j * 3 + 2] = F[p * 3 + 2]; known[j] = 1; }
    }
    const k = Object.assign(document.createElement('canvas'), {width: w, height: h}), g = k.getContext('2d'), d = g.createImageData(w, h);
    for (let j = 0; j < w * h; j++) { d.data[j * 4] = F[j * 3]; d.data[j * 4 + 1] = F[j * 3 + 1]; d.data[j * 4 + 2] = F[j * 3 + 2]; d.data[j * 4 + 3] = 255; }
    g.putImageData(d, 0, 0);
    res.files[`${id}-skyfill.jpg`] = k.toDataURL('image/jpeg', 0.92);
    res.data.skyfill = {src: `assets/masks/${id}-skyfill.jpg`, box: [x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H]};
  }
  // Ambient colour grid, 32 x 18 cells, as one hex string.
  const GX = 32, GY = 18; let hex = '';
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(gy * H / GY); y < Math.floor((gy + 1) * H / GY); y += 2) for (let x = Math.floor(gx * W / GX); x < Math.floor((gx + 1) * W / GX); x += 2) { const i = y * W + x; r += R[i]; g += G[i]; b += B[i]; n++; }
    hex += [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  }
  res.data.ambient = hex;
  if (cfg.preview !== false) {
    const k = Object.assign(document.createElement('canvas'), {width: W, height: H}), g = k.getContext('2d'), d = c.getImageData(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      const s = masks.sky?.[i], o = masks.outside?.[i] && !s;
      if (s) { d.data[i * 4] = d.data[i * 4] * 0.4; d.data[i * 4 + 1] = d.data[i * 4 + 1] * 0.5 + 120; d.data[i * 4 + 2] = d.data[i * 4 + 2] * 0.5 + 127; }
      else if (o) { d.data[i * 4] = d.data[i * 4] * 0.5 + 127; d.data[i * 4 + 1] *= 0.3; d.data[i * 4 + 2] = d.data[i * 4 + 2] * 0.5 + 110; }
    }
    g.putImageData(d, 0, 0); res.preview = k.toDataURL('image/jpeg', 0.85);
  }
  return res;
}

(async () => {
  const types = {'.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png'};
  const server = http.createServer((req, res) => {
    const target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(target, (err, data) => { res.writeHead(err ? 404 : 200, {'content-type': types[path.extname(target)] || 'text/html'}); res.end(err ? '' : data); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/README.md`);
    const outDir = path.join(root, 'assets', 'masks'); fs.mkdirSync(outDir, {recursive: true});
    const dataFile = path.join(root, 'scene-data.js');
    const existing = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8').replace(/^[^{]*/, '').replace(/;\s*$/, '')) : {};
    const ids = fs.readdirSync(path.join(root, 'assets')).filter(f => f.endsWith('.png') && !f.startsWith('sprite-')).map(f => f.slice(0, -4));
    for (const id of ids) {
      if (only.length && !only.includes(id)) continue;
      for (const f of fs.readdirSync(outDir)) if (f.startsWith(id + '-')) fs.rmSync(path.join(outDir, f));
      const out = await page.evaluate(`(${build.toString()})(${JSON.stringify(id)}, ${JSON.stringify(config[id] || {})})`);
      for (const [name, url] of Object.entries(out.files)) fs.writeFileSync(path.join(outDir, name), Buffer.from(url.split(',')[1], 'base64'));
      if (preview && out.preview) { fs.mkdirSync(preview, {recursive: true}); fs.writeFileSync(path.join(preview, id + '.jpg'), Buffer.from(out.preview.split(',')[1], 'base64')); }
      existing[id] = out.data; console.log(id, Object.keys(out.data).join(' '), JSON.stringify(out.debug));
    }
    const sorted = Object.fromEntries(Object.keys(existing).sort().map(k => [k, existing[k]]));
    fs.writeFileSync(dataFile, '/* Generated by tools/build-scene-data.cjs. Masks, filled sky and ambient colours per scene. */\nwindow.OrigamiSceneData = ' + JSON.stringify(sorted) + ';\n');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
