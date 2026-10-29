// Small CPU sphere renderer shared by the app and exported bookmark previews.
// Maps remain local. Projection and lighting are cached; only longitude advances.
export type GlobeKind = "earth" | "moon" | "mars";
export type GlobeRenderer = { render: (seconds: number) => void; setRunning: (value: boolean) => void; destroy: () => void };
export const globeDetails: Record<string, { kind: GlobeKind; cx: number; cy: number; radius: number; period: number }> = {
  "library-earth-globe": { kind: "earth", cx: 512, cy: 271, radius: 207, period: 48 },
  "selenograph-moon-globe": { kind: "moon", cx: 512, cy: 270, radius: 201, period: 54 },
  "observatory-mars-globe": { kind: "mars", cx: 512, cy: 271, radius: 204, period: 50 },
};
export const globeTexture = (kind: GlobeKind) => `/bookmarks/globe-textures/${kind}.${kind === "earth" ? "png" : "jpg"}`;

const textures = new Map<string, Promise<ImageData>>();
function loadTexture(src: string, kind: GlobeKind, woodSrc: string) {
  const key = `${kind}:${src}:${kind === "earth" ? woodSrc : ""}`;
  if (!textures.has(key)) textures.set(key, (async () => {
    const image = new Image(); image.src = src; await image.decode();
    const sheet = document.createElement("canvas"); sheet.width = image.naturalWidth; sheet.height = image.naturalHeight;
    const ctx = sheet.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(image, 0, 0, sheet.width, sheet.height);
    const data = ctx.getImageData(0, 0, sheet.width, sheet.height);
    if (kind === "earth") {
      const wood = new Image(); wood.src = woodSrc; await wood.decode();
      ctx.drawImage(wood, 0, 0, sheet.width, sheet.height);
      const grain = ctx.getImageData(0, 0, sheet.width, sheet.height).data;
      const land = new Float32Array(sheet.width * sheet.height);
      // Keep the coastlines, replacing the old flat colours with figured walnut
      // and lighter maple. Original map detail is never used as artificial grain.
      for (let p = 0; p < data.data.length; p += 4) {
        const r = data.data[p], g = data.data[p + 1], b = data.data[p + 2];
        land[p / 4] = b > r * 1.18 && b > g * 1.04 ? 0 : 1;
      }
      for (let p = 0; p < data.data.length; p += 4) {
        const index = p / 4, x = index % sheet.width, y = Math.floor(index / sheet.width);
        // Blend only the narrow wrapping seam; the rest retains original grain.
        const edge = Math.min(x, sheet.width - 1 - x), blend = Math.max(0, 1 - edge / 32);
        const opposite = (y * sheet.width + sheet.width - 1 - x) * 4;
        const wr = grain[p] * (1 - blend / 2) + grain[opposite] * blend / 2;
        const wg = grain[p + 1] * (1 - blend / 2) + grain[opposite + 1] * blend / 2;
        const wb = grain[p + 2] * (1 - blend / 2) + grain[opposite + 2] * blend / 2;
        if (land[index]) {
          const lum = wr * .3 + wg * .59 + wb * .11;
          // A tiny directional bevel makes the marquetry coastline feel inset.
          const adjacent = land[y * sheet.width + (x + 1) % sheet.width];
          const bevel = (1 - adjacent) * 15;
          data.data[p] = 157 + lum * .73 + bevel;
          data.data[p + 1] = 102 + lum * .67 + bevel;
          data.data[p + 2] = 47 + lum * .48 + bevel;
        } else {
          data.data[p] = wr * .9 + 13;
          data.data[p + 1] = wg * .92 + 7;
          data.data[p + 2] = wb * .92 + 5;
        }
      }
    } else {
      // Bounded local contrast on the native 2K maps keeps crater rims and
      // canyon edges crisp without inventing terrain or whitening the surface.
      const original = new Uint8ClampedArray(data.data);
      const w = sheet.width, h = sheet.height;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const neighbours = [(y * w + (x + w - 2) % w) * 4, (y * w + (x + 2) % w) * 4,
          (Math.max(0, y - 2) * w + x) * 4, (Math.min(h - 1, y + 2) * w + x) * 4];
        for (let c = 0; c < 3; c++) {
          const average = neighbours.reduce((sum, n) => sum + original[n + c], 0) / 4;
          const detail = Math.max(-20, Math.min(20, (original[p + c] - average) * .8));
          data.data[p + c] = (original[p + c] - 128) * 1.08 + 128 + detail;
        }
      }
    }
    return data;
  })().catch(error => { textures.delete(key); throw error; }));
  return textures.get(key)!;
}

export async function createGlobeRenderer(canvas: HTMLCanvasElement, kind: GlobeKind, src: string, period: number, woodSrc = "/bookmarks/globe-textures/walnut.png"): Promise<GlobeRenderer> {
  const texture = await loadTexture(src, kind, woodSrc);
  // Render enough samples for close previews and high-density screens, while
  // keeping the normal bookmark size inexpensive. Resolve percentages against
  // the parent because the canvas remains hidden until its first frame is ready.
  const width = getComputedStyle(canvas).width;
  const cssSize = (width.endsWith("%")
    ? (canvas.parentElement?.clientWidth || 180) * Number.parseFloat(width) / 100
    : Number.parseFloat(width)) || 160;
  const size = Math.max(256, Math.min(512, Math.ceil(cssSize * Math.max(2, window.devicePixelRatio) / 32) * 32));
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const output = ctx.createImageData(size, size);
  const positions: { p: number; u: number; v: number; shade: number; polish: number }[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1;
    const rr = nx * nx + ny * ny;
    if (rr >= 1) continue;
    const z = Math.sqrt(1 - rr), p = (y * size + x) * 4;
    const shade = .42 + .58 * Math.max(0, -.35 * nx - .45 * ny + .82 * z);
    const polish = kind === "earth" ? Math.pow(Math.max(0, -.24 * nx - .3 * ny + .923 * z), 24) * 22 : 0;
    positions.push({ p, u: Math.atan2(nx, z) / (2 * Math.PI) + .5, v: Math.asin(ny) / Math.PI + .5, shade, polish });
    output.data[p + 3] = Math.min(255, Math.max(0, (1 - Math.sqrt(rr)) * size * 255));
  }
  let seconds = 0, running = false, disposed = false, handle = 0, previous = 0, painted = 0;
  const render = (time: number) => {
    if (disposed) return;
    seconds = time;
    const turn = ((time / period) % 1 + 1) % 1;
    const offset = kind === "earth" ? -.08 : 0;
    const tw = texture.width, th = texture.height, pixels = texture.data;
    for (const { p, u, v, shade, polish } of positions) {
      const tx = ((u + turn + offset) % 1 + 1) % 1 * tw;
      const ty = Math.min(th - 1, v * (th - 1));
      const ix = Math.floor(tx), iy = Math.floor(ty), fx = tx - ix, fy = ty - iy;
      const a = (iy * tw + ix) * 4, b = (iy * tw + (ix + 1) % tw) * 4;
      const c = (Math.min(th - 1, iy + 1) * tw + ix) * 4, d = (Math.min(th - 1, iy + 1) * tw + (ix + 1) % tw) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const top = pixels[a + channel] * (1 - fx) + pixels[b + channel] * fx;
        const bottom = pixels[c + channel] * (1 - fx) + pixels[d + channel] * fx;
        const value = top * (1 - fy) + bottom * fy;
        output.data[p + channel] = value * shade * (kind === "moon" ? 1.22 : 1.1) + polish;
      }
    }
    ctx.putImageData(output, 0, 0);
    canvas.dataset.turn = turn.toFixed(6);
  };
  const tick = (now: number) => {
    if (!running || disposed) return;
    if (previous) seconds += Math.min((now - previous) / 1000, .1);
    previous = now;
    if (now - painted >= 1000 / 20) { render(seconds); painted = now; }
    handle = requestAnimationFrame(tick);
  };
  const setRunning = (value: boolean) => {
    if (disposed || running === value) return;
    running = value; canvas.dataset.running = String(value);
    cancelAnimationFrame(handle); previous = 0;
    if (value) handle = requestAnimationFrame(tick);
  };
  render(0); canvas.dataset.ready = "true"; canvas.dataset.running = "false";
  return { render, setRunning, destroy: () => { setRunning(false); disposed = true; } };
}
