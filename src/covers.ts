import type { Book, BookMeta } from "./types";
import { bookGenres } from "./bookGenres";
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

// Visual scenes a cover can show, with the words that suggest them. Book
// text, names and titles never enter the prompt, so no lettering appears.
const coverMotifs: [RegExp, string][] = [
  [
    /\b(castle|castles|tower|towers|battlements?)\b/g,
    "a towering stone castle on a crag",
  ],
  [
    /\b(vampires?|bats?|coffins?|undead|crypts?)\b/g,
    "bats against a pale moon",
  ],
  [/\b(wolf|wolves|hounds?)\b/g, "wolves in a dark forest"],
  [/\b(ghosts?|haunted|phantom|apparition)\b/g, "a pale ghostly figure in mist"],
  [
    /\b(graves?|graveyard|churchyard|tombs?|cemetery)\b/g,
    "an old churchyard with leaning stones",
  ],
  [
    /\b(ships?|sail|sails|sailors?|vessel|brig|schooner|deck)\b/g,
    "a sailing ship on rolling waves",
  ],
  [/\b(island|islands|isle)\b/g, "a rocky island rising from the sea"],
  [/\b(sea|ocean|waves|harbour|harbor|port|coast)\b/g, "a wide open sea"],
  [
    /\b(prison|prisoner|dungeon|cell|fortress|chains)\b/g,
    "a lonely fortress prison on a rock",
  ],
  [
    /\b(treasure|jewels?|diamonds?|gems?|moonstone)\b/g,
    "a glowing gem in shadow",
  ],
  [
    /\b(caves?|cavern|caverns|underground|tunnels?|abyss|centre of the earth|center of the earth)\b/g,
    "vast glowing underground caverns",
  ],
  [/\b(volcano|volcanoes|crater|lava|eruption)\b/g, "a smoking volcano crater"],
  [/\b(mountains?|peaks?|summit|glacier)\b/g, "layered mountain peaks"],
  [/\b(snow|ice|frozen|winter|arctic)\b/g, "a snowy frozen landscape"],
  [/\b(desert|sand|dunes|oasis|caravan)\b/g, "golden desert dunes"],
  [/\b(jungle|tropical|palms?)\b/g, "a lush tropical jungle"],
  [/\b(forest|woods|trees|pines?|oaks?)\b/g, "a deep old forest"],
  [/\b(river|rivers|stream|boat|canal)\b/g, "a winding river"],
  [/\b(lake|loch|pond)\b/g, "a quiet reflective lake"],
  [/\b(storm|thunder|lightning|tempest|gale)\b/g, "a dramatic storm sky"],
  [/\b(moon|moonlight|moonlit)\b/g, "a large luminous moon"],
  [/\b(stars|starlight|comet|telescope|astronomer)\b/g, "a starry night sky"],
  [
    /\b(ballroom|ball|dance|dancing|assembly)\b/g,
    "an elegant candlelit ballroom",
  ],
  [/\b(letters?|correspondence|diary|journal)\b/g, "a sealed letter and quill"],
  [
    /\b(carriages?|coach|horses?|gig)\b/g,
    "a horse-drawn carriage on a country lane",
  ],
  [
    /\b(manor|estate|park|hall|parsonage|drawing-room)\b/g,
    "an English country manor",
  ],
  [/\b(garden|gardens|flowers?|roses?|blossoms?)\b/g, "a flowering garden"],
  [/\b(village|cottages?|farm|inn)\b/g, "a small village at dusk"],
  [/\b(city|streets?|london|paris|alley|lamps?)\b/g, "gaslit city streets"],
  [/\b(train|railway|station|locomotive)\b/g, "a steam train"],
  [
    /\b(war|battle|soldiers?|army|regiment)\b/g,
    "a distant battlefield under smoke",
  ],
  [/\b(swords?|duel|knights?|armou?r)\b/g, "crossed swords"],
  [/\b(crowns?|king|queen|throne|prince|princess)\b/g, "a golden crown"],
  [/\b(church|cathedral|abbey|monastery|chapel)\b/g, "a gothic cathedral"],
  [/\b(ruins?|ancient|temple)\b/g, "ancient ruins"],
  [
    /\b(maps?|expedition|journey|voyage|explorers?)\b/g,
    "an old map and compass",
  ],
  [
    /\b(laboratory|experiment|scientist|professor|machine)\b/g,
    "brass scientific instruments",
  ],
  [/\b(clocks?|time machine)\b/g, "antique clockwork"],
  [
    /\b(planets?|spaceship|starship|galaxy|space)\b/g,
    "distant planets and stars",
  ],
  [/\b(robots?|android|cyborg)\b/g, "a gentle robot silhouette"],
  [
    /\b(dragons?|wizard|magic|spell|sorcerer|witch)\b/g,
    "a magical glow and drifting sparks",
  ],
  [/\b(candles?|lantern|firelight|hearth)\b/g, "warm candlelight"],
  [/\b(fog|mist|misty|foggy)\b/g, "drifting fog"],
  [/\b(lighthouse)\b/g, "a lighthouse beam"],
  [/\b(paper cranes?|origami|folded paper)\b/g, "a folded paper crane"],
  [/\b(birds?|raven|crows?|gulls?)\b/g, "birds in flight"],
];
// Striking scenes count more than everyday objects, so an epistolary novel
// set in a castle still gets the castle rather than a letter.
const sceneWeights: Record<string, number> = {
  "a sealed letter and quill": 0.35,
  "antique clockwork": 0.4,
  "a distant battlefield under smoke": 0.5,
  "a horse-drawn carriage on a country lane": 0.5,
  "gaslit city streets": 0.6,
  "a small village at dusk": 0.7,
  "warm candlelight": 0.6,
  "drifting fog": 0.8,
  "an old map and compass": 0.7,
  "a towering stone castle on a crag": 1.6,
  "bats against a pale moon": 1.6,
  "wolves in a dark forest": 1.3,
  "a pale ghostly figure in mist": 1.3,
  "a glowing gem in shadow": 1.4,
  "vast glowing underground caverns": 1.5,
  "a sailing ship on rolling waves": 1.2,
  "a lonely fortress prison on a rock": 1.3,
};
// The mood and palette that suit a genre tag.
const genreMoods: [RegExp, string][] = [
  [
    /horror|gothic/i,
    "eerie atmosphere, deep shadows, moonlit blues and blood reds",
  ],
  [/romance|love/i, "soft romantic light, warm pastel tones"],
  [
    /mystery|detective|crime|suspense|thriller/i,
    "moody and mysterious, lantern light in fog",
  ],
  [
    /science|sci-fi|speculative/i,
    "luminous and otherworldly, a sense of wonder",
  ],
  [/fantasy/i, "enchanted and magical, glowing light"],
  [/adventure/i, "sweeping dramatic vista, bold light"],
  [/histor|classic/i, "rich period atmosphere, oil-painting tones"],
  [/children|humou?r|comedy/i, "whimsical and bright, cheerful colors"],
];

// A cover description drawn from the book itself: the scenes that recur most
// in its text (title words count extra) and the mood of its genres.
export function coverPrompt(book: Book): string {
  const paragraphs = book.paragraphs;
  // The opening plus evenly spaced passages from the whole book.
  const step = Math.max(1, Math.floor(paragraphs.length / 160));
  const sample = [
    ...paragraphs.slice(0, 40),
    ...paragraphs.filter((_, i) => i >= 40 && i % step === 0),
  ]
    .map((p) => p.text)
    .join(" ")
    .slice(0, 120_000)
    .toLocaleLowerCase();
  const title = book.meta.title.toLocaleLowerCase();
  const scored = coverMotifs
    .map(([pattern, scene]) => {
      const inText = sample.match(pattern)?.length || 0;
      const inTitle = title.match(pattern)?.length || 0;
      return {
        scene,
        score: (inText + inTitle * 25) * (sceneWeights[scene] ?? 1),
      };
    })
    // In a long book a single mention is noise; in a short text it counts.
    .filter((m) => m.score >= (sample.length > 20_000 ? 3 : 1))
    .sort((a, b) => b.score - a.score);
  // Different motifs can describe the same picture; keep three distinct ones.
  const scenes = [...new Set(scored.map((m) => m.scene))].slice(0, 3);
  const genres = bookGenres(book.meta).join(" ");
  const moods = genreMoods
    .filter(([pattern]) => pattern.test(genres))
    .map(([, mood]) => mood)
    .slice(0, 2);
  const subject = scenes.length
    ? scenes.join(", ")
    : "abstract botanical shapes and a luminous landscape";
  return `${subject}. ${moods.length ? moods.join("; ") + ". " : ""}Painterly illustration, rich colors, atmospheric light.`;
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
