import { describe, expect, it } from "vitest";
import { castUnits, type Attributed, type CastMember } from "../src/studio/cast";
import { findSpeech } from "../src/studio/dialogue";
import type { ProductionUnit } from "../src/studio/production";
import { defaultPreferences, type Book } from "../src/types";

describe("finding the characters again", () => {
  const book = {
    meta: { id: "b", title: "T", author: "A", language: "en" },
    paragraphs: [
      { id: "h", text: "Chapter One", kind: "heading", chapter: 0 },
      { id: "a", text: "“Is it true?” asked Jane. “I hope so.”", kind: "paragraph", chapter: 0 },
      { id: "b", text: "Elizabeth smiled at her sister.", kind: "paragraph", chapter: 0 },
    ],
  } as unknown as Book;
  const speech = findSpeech(book.paragraphs.map((p) => p.text), "en");
  const jane = new Map<string, Attributed>(speech.map((s) => [s.id, { speaker: "Jane", confidence: 0.95, source: "rules" }]));
  const cast: CastMember[] = [
    { id: "Jane", name: "Jane", aliases: [], gender: "f", voice: "bea", color: "#fff" },
    { id: "Lydia", name: "Lydia", aliases: [], gender: "f", voice: "cleo", color: "#000" },
  ];
  const first = castUnits(book, { ...defaultPreferences }, speech, jane, cast, []);
  const line = first.find((u) => u.speaker === "Jane")!;
  const narration = first.find((u) => u.paragraph === 2)!;
  const old: ProductionUnit[] = first.map((u) =>
    u === line ? { ...u, voice: "bea-whisper", take: "t1", status: "rendered" } : u === narration ? { ...u, voice: "narrator-soft", take: "t2", status: "rendered" } : u,
  );

  it("keeps a mood version and its take while the speaker stays", () => {
    const again = castUnits(book, { ...defaultPreferences }, speech, jane, cast, old);
    expect(again.find((u) => u.id === line.id)).toMatchObject({ voice: "bea-whisper", take: "t1", status: "rendered" });
    expect(again.find((u) => u.id === narration.id)).toMatchObject({ voice: "narrator-soft", take: "t2", status: "rendered" });
  });

  it("gives the new speaker's voice when the speaker changes", () => {
    const lydia = new Map<string, Attributed>(speech.map((s) => [s.id, { speaker: "Lydia", confidence: 0.95, source: "rules" }]));
    const again = castUnits(book, { ...defaultPreferences }, speech, lydia, cast, old);
    expect(again.find((u) => u.id === line.id)).toMatchObject({ speaker: "Lydia", voice: "cleo", status: "pending" });
  });
});
