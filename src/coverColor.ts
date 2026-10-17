// The dominant color of a cover image, used to tint the spine in book mode.
// Colors are grouped into coarse buckets; the largest group wins, with a
// preference for colored pixels over near-black, near-white and grey ones,
// which most covers have plenty of around their art.
export function dominantColor(pixels: Uint8ClampedArray): string | null {
  const groups = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const group = groups.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    group.n++;
    group.r += r;
    group.g += g;
    group.b += b;
    groups.set(key, group);
  }
  let best: { score: number; r: number; g: number; b: number } | null = null;
  for (const { n, r, g, b } of groups.values()) {
    const [R, G, B] = [r / n, g / n, b / n];
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const light = (max + min) / 510;
    // Chroma, not HSL saturation, which overrates nearly black pixels.
    const chroma = (max - min) / 255;
    const tone = light < 0.12 || light > 0.9 ? 0.12 : light < 0.2 ? 0.5 : 1;
    const score = n * (0.08 + chroma * 2) * tone;
    if (!best || score > best.score) best = { score, r: R, g: G, b: B };
  }
  if (!best) return null;
  // Keep the hue but bring the lightness into a range that reads as a colored
  // spine: very dark covers would otherwise give a black one.
  const { r, g, b } = best;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 510;
  const target = Math.min(0.6, Math.max(0.26, light));
  const chroma = max - min;
  const scale = (target * 510) / Math.max(1, max + min);
  // Scaling all channels keeps the hue; grey covers stay grey.
  const lift = (v: number) =>
    Math.max(0, Math.min(255, chroma < 6 ? target * 255 : v * scale));
  const hex = (v: number) => Math.round(lift(v)).toString(16).padStart(2, "0");
  return "#" + hex(r) + hex(g) + hex(b);
}

const cache = new Map<string, Promise<string | null>>();

// Reads a cover image (a data URL or same-origin path) at a small size.
export function coverColor(src: string): Promise<string | null> {
  const known = cache.get(src);
  if (known) return known;
  const result = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 34;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 24, 34);
        resolve(dominantColor(ctx.getImageData(0, 0, 24, 34).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, result);
  return result;
}
