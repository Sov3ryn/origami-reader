import { describe, expect, it } from "vitest";
import { castUnits, cleanRoster, conversations, lineCounts, mergeRoster, suggestVoices, type Attributed, type CastMember } from "../src/studio/cast";
import { findSpeech } from "../src/studio/dialogue";
import type { ProductionUnit } from "../src/studio/production";
import { defaultPreferences, type Book, type Voice } from "../src/types";

type Found = Parameters<typeof mergeRoster>[0][number];
const found = (name: string, aliases: string[] = [], gender: Found["gender"] = "unknown", speaks = true): Found => ({ name, aliases, gender, speaks });

describe("cast list", () => {
  it("merges on a full name only, never through a shared surname", () => {
    const roster: Found[] = [];
    mergeRoster(roster, [found("Mr. Bennet", ["Bennet"], "male"), found("Elizabeth Bennet", ["Lizzy", "Elizabeth"], "female")]);
    mergeRoster(roster, [found("Mrs. Bennet", ["Bennet"], "female"), found("Lizzy", [], "female")]);
    expect(roster.map((r) => r.name)).toEqual(["Mr. Bennet", "Elizabeth Bennet", "Mrs. Bennet"]);
    expect(roster[1].aliases).toContain("Lizzy");
  });
  it("keeps a lasting description as an alias", () => {
    expect(cleanRoster([found("Mr. Collins", ["the clergyman", "his cousin"], "male")])[0].aliases).toEqual(["the clergyman"]);
  });
  it("cleans pronouns, generic descriptions and shared aliases", () => {
    const out = cleanRoster([found("Mr. Bennet", ["Bennet", "he", "the man"], "male"), found("Mrs. Bennet", ["Bennet", "his wife"], "female"), found("the Lucases", [], "group")]);
    expect(out).toHaveLength(2);
    expect(out[0].aliases).toEqual([]);
    // Relational descriptions depend on the sentence and are dropped.
    expect(out[1].aliases).toEqual([]);
  });
});

const voice = (id: string, gender: Voice["gender"], languages = ["english"]): Voice => ({ id, name: id, description: "", available: true, engine: "qwen", languages, gender, styles: [], accent: "" });

describe("voices", () => {
  const voices = [voice("ann", "female"), voice("bea", "female"), voice("carl", "male"), voice("dan", "male"), voice("eve", "female", ["french"])];
  it("matches gender and language and keeps the main characters apart", () => {
    const cast = [
      { id: "Elizabeth", gender: "f" as const, lines: 90 },
      { id: "Jane", gender: "f" as const, lines: 40 },
      { id: "Darcy", gender: "m" as const, lines: 60 },
      { id: "Bingley", gender: "m" as const, lines: 30 },
    ];
    const talks = new Map([
      ["Elizabeth", new Set(["Jane", "Darcy"])],
      ["Jane", new Set(["Elizabeth", "Bingley"])],
    ]);
    const chosen = suggestVoices(cast, voices, "ann", "en", talks);
    expect(new Set(chosen.values()).size).toBe(4);
    expect(["ann", "bea"]).toContain(chosen.get("Elizabeth"));
    expect(["carl", "dan"]).toContain(chosen.get("Darcy"));
    expect(chosen.get("Jane")).not.toBe(chosen.get("Elizabeth"));
    expect([...chosen.values()]).not.toContain("eve");
  });
  it("finds who talks with whom", () => {
    const speech = [0, 1, 2, 9].map((p, i) => ({ id: `s${i}`, paragraph: p, spans: [], continued: false, mark: "quote" as const, before: null }));
    const speakers = new Map<string, Attributed>([
      ["s0", { speaker: "A", confidence: 1, source: "rules" }],
      ["s1", { speaker: "B", confidence: 1, source: "rules" }],
      ["s2", { speaker: "A", confidence: 1, source: "rules" }],
      ["s3", { speaker: "C", confidence: 1, source: "rules" }],
    ]);
    const talks = conversations(speech, speakers);
    expect([...(talks.get("A") || [])]).toEqual(["B"]);
    expect(talks.has("C")).toBe(false);
  });
});

describe("script cut into narration and speech", () => {
  const book = {
    meta: { id: "b", title: "T", author: "A", language: "en" },
    paragraphs: [
      { id: "h", text: "Chapter One", kind: "heading", chapter: 0 },
      { id: "a", text: "“Is it true?” asked Jane. “I hope so.”", kind: "paragraph", chapter: 0 },
      { id: "b", text: "Elizabeth smiled at her sister.", kind: "paragraph", chapter: 0 },
    ],
  } as unknown as Book;
  const paragraphs = book.paragraphs.map((p) => p.text);
  const speech = findSpeech(paragraphs, "en");
  const speakers = new Map<string, Attributed>(speech.map((s) => [s.id, { speaker: "Jane", confidence: 0.95, source: "rules" }]));
  const cast: CastMember[] = [{ id: "Jane", name: "Jane", aliases: [], gender: "f", voice: "bea", color: "#fff" }];
  const old: ProductionUnit[] = [
    { id: "p2-u0", chapter: 0, paragraph: 2, paragraphId: "b", heading: false, text: "Elizabeth smiled at her sister.", status: "approved", take: "t1" },
  ];
  const units = castUnits(book, { ...defaultPreferences }, speech, speakers, cast, old);
  it("gives speech to its speaker and narration to the narrator", () => {
    const p1 = units.filter((u) => u.paragraph === 1);
    expect(p1.map((u) => [u.speaker || "narrator", u.voice || ""])).toEqual([
      ["Jane", "bea"],
      ["narrator", ""],
      ["Jane", "bea"],
    ]);
    expect(p1[1].text).toContain("asked Jane");
    expect(lineCounts(units).get("Jane")).toBe(2);
  });
  it("keeps takes and approval where the text did not change", () => {
    const kept = units.find((u) => u.paragraph === 2)!;
    expect(kept).toMatchObject({ id: "p2-u0", status: "approved", take: "t1" });
    expect(units[0].heading).toBe(true);
  });
});
