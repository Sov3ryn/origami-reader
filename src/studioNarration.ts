// Read mode with a Studio production: the book is read by its cast, line by
// line, with the takes made in Studio (lines without a take are spoken live in
// their character's voice). Each line is found in the book text so the
// sentence and word highlights follow it.
import type { Book } from "./types";
import type { Production } from "./studio/production";
import type { Unit } from "./usePlayer";

/** The production's lines from paragraph `from` on, as player units. */
export function studioUnits(book: Book, production: Production, from: number): Unit[] {
  const takes = new Map(production.takes.map((t) => [t.id, t]));
  const out: Unit[] = [];
  let paragraph = -1;
  let cursor = 0;
  for (const u of production.units) {
    if (u.paragraph < from) continue;
    const p = book.paragraphs[u.paragraph];
    if (!p) continue;
    if (u.paragraph !== paragraph) {
      paragraph = u.paragraph;
      cursor = 0;
    }
    // The line's place in the book text, searched forward from the previous line.
    const shown = (u.original || u.text).trim();
    const at = shown ? p.text.indexOf(shown, cursor) : -1;
    const range = at >= 0 ? { start: at, end: at + shown.length } : undefined;
    if (range) cursor = range.end;
    const take = u.take ? takes.get(u.take) : undefined;
    out.push({
      text: u.text,
      paragraph: u.paragraph,
      first: -1,
      last: -1,
      heading: u.heading,
      range,
      voice: u.voice || production.info.voice,
      take: take && take.ended !== false ? { production: production.info.id, file: take.file, duration: take.duration } : undefined,
    });
  }
  return out;
}
