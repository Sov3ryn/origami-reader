import type { Book, BookMeta } from "./types";
import starterManifest from "../assets/starter-library/manifest.json";

const starterHashes = new Set(starterManifest.books.map((b) => b.sha256));
export const GENERATED_COVER_SIZE = { width: 320, height: 448 };
export function starterCover(book: BookMeta): boolean {
  return (
    book.format === "Sample" ||
    book.id.startsWith("starter-") ||
    starterHashes.has(book.sourceHash)
  );
}

export function coverPrompt(book: Book): string {
  const context = (
    book.meta.title +
    " " +
    book.paragraphs
      .slice(0, 12)
      .map((p) => p.text)
      .join(" ")
      .slice(0, 4000)
  ).toLocaleLowerCase();
  // Extract visual motifs, without sending prose or printed title/author wording.
  const motifs: [RegExp, string][] = [
    [/\b(castle|kingdom|tower)\b/, "distant stone castle"],
    [/\b(space|planet|starship|galaxy)\b/, "distant planets and stars"],
    [/\b(time|clock|machine)\b/, "antique clockwork"],
    [/\b(moor|hound|detective|mystery)\b/, "misty moorland and lantern"],
    [/\b(sea|ship|harbor|harbour|sail|ocean)\b/, "sailing ship on an open sea"],
    [/\b(lake|shore|water)\b/, "quiet reflective lake"],
    [/\b(mountain|mountains)\b/, "layered mountain peaks"],
    [/\b(forest|woods|trees|tree|pine)\b/, "pine woodland"],
    [/\b(garden|flower|flowers|rose|roses)\b/, "flowering garden"],
    [/\b(city|party|parties|jazz|gatsby)\b/, "golden city lights at dusk"],
    [/\b(paper|crane|folded)\b/, "folded paper crane"],
    [/\b(house|cabin|cottage|home)\b/, "warmly lit cottage"],
  ];
  const themes = motifs
    .filter(([pattern]) => pattern.test(context))
    .slice(0, 3)
    .map(([, description]) => description);
  return `${themes.length ? themes.join(", ") : "abstract botanical shapes and a luminous landscape"}. Painterly illustration, rich colors, atmospheric light.`;
}

// Only decoded raster pixels enter the library, never SVG or external URLs.
export async function coverImage(
  blob: Blob,
  size = { width: 384, height: 544 },
): Promise<string> {
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
    canvas.width = size.width;
    canvas.height = size.height;
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
