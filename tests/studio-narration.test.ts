import { describe, expect, it } from "vitest";
import { studioUnits } from "../src/studioNarration";
import type { Production } from "../src/studio/production";
import type { Book } from "../src/types";

describe("Read mode with a Studio production", () => {
  it("plays each line's take and finds the line in the book text", () => {
    const text = "\u201cBut it is,\u201d returned she; \u201cfor Mrs. Long has just been here.\u201d";
    const book = { meta: { id: "b" }, paragraphs: [{ id: "p0", text: "Title", chapter: 0, kind: "heading" }, { id: "p1", text, chapter: 1, kind: "paragraph" }] } as unknown as Book;
    const production = {
      info: { id: "prod", voice: "narrator" },
      units: [
        { id: "u0", paragraph: 0, text: "Title", heading: true, take: "t0" },
        { id: "u1", paragraph: 1, text: "\u201cBut it is,\u201d", voice: "mrs", take: "t1" },
        { id: "u2", paragraph: 1, text: "returned she;", take: "t2" },
        { id: "u3", paragraph: 1, text: "for Missus Long has just been here.", original: "\u201cfor Mrs. Long has just been here.\u201d", voice: "mrs" },
      ],
      takes: [
        { id: "t1", unit: "u1", file: "t1.flac", duration: 1.2 },
        { id: "t2", unit: "u2", file: "t2.flac", duration: 0.9, ended: false },
      ],
    } as unknown as Production;
    const units = studioUnits(book, production, 1);
    expect(units).toHaveLength(3);
    expect(units[0].take?.file).toBe("t1.flac");
    expect(units[0].voice).toBe("mrs");
    expect(text.slice(units[0].range!.start, units[0].range!.end)).toBe("\u201cBut it is,\u201d");
    // A cut take is spoken live instead, in the narrator's voice.
    expect(units[1].take).toBeUndefined();
    expect(units[1].voice).toBe("narrator");
    expect(text.slice(units[2].range!.start, units[2].range!.end)).toBe("\u201cfor Mrs. Long has just been here.\u201d");
  });
});
