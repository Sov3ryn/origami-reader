import type { Book } from "./types";

export function coverPrompt(book: Book): string {
  const opening = book.paragraphs
    .slice(0, 6)
    .map((p) => p.text)
    .join(" ")
    .slice(0, 240);
  return `Painterly illustration, atmospheric book cover artwork, strong central composition, ${book.meta.title.slice(0, 90)}. ${opening}. Beautiful colors, no lettering, no text, no watermark.`;
}

// Only decoded raster pixels enter the library, never SVG or external URLs.
export async function coverImage(blob: Blob): Promise<string> {
  if (!blob.size || blob.size > 10 * 1024 * 1024)
    throw new Error("Choose a PNG, JPEG or WebP image up to 10 MB.");
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const png =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!png && !jpg && !webp)
    throw new Error("Choose a PNG, JPEG or WebP cover image.");
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error(
        "Cover image is too large. Resize it below 40 megapixels.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 544;
    const ctx = canvas.getContext("2d")!;
    const scale = Math.max(
      canvas.width / bitmap.width,
      canvas.height / bitmap.height,
    );
    ctx.drawImage(
      bitmap,
      (canvas.width - bitmap.width * scale) / 2,
      (canvas.height - bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    );
    return canvas.toDataURL("image/webp", 0.86);
  } finally {
    bitmap.close();
  }
}
