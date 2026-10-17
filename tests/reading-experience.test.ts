import { describe, expect, it } from "vitest";
import {
  applyTimeOfDay,
  counterpart,
  desiredTime,
  sceneFor,
  startupBackground,
  switchBackground,
  toggleTimeOfDay,
} from "../src/backgrounds";
import {
  isShortSpeech,
  numberWords,
  spellBareNumber,
  speechUnits,
} from "../src/documents";
import {
  applyPronunciations,
  pronunciationsFor,
  skipReferences,
  spokenText,
} from "../src/spokenText";
import {
  contentsEntries,
  currentEntry,
  formatDuration,
  listeningMinutes,
  searchSnippet,
  spokenSentenceRange,
  wordsLeftInChapter,
} from "../src/contents";
import { bookUnits, unitPause } from "../src/usePlayer";
import { defaultPreferences, type Book, type Paragraph } from "../src/types";

const para = (
  text: string,
  kind: Paragraph["kind"] = "paragraph",
  chapter = 1,
): Paragraph => ({ id: "p-" + text.slice(0, 8), text, kind, chapter });

describe("bare numbers are spelled out for speech", () => {
  it("writes English number words", () => {
    expect(numberWords(1)).toBe("one");
    expect(numberWords(21)).toBe("twenty-one");
    expect(numberWords(117)).toBe("one hundred and seventeen");
    expect(numberWords(1815)).toBe("one thousand eight hundred and fifteen");
    expect(numberWords(2005)).toBe("two thousand and five");
    expect(spellBareNumber("1")).toBe("One.");
    expect(spellBareNumber("16.")).toBe("Sixteen.");
    expect(spellBareNumber("Chapter 16")).toBe("Chapter 16");
  });
});

describe("speech units never send a lone word or number", () => {
  it("recognizes risky inputs", () => {
    for (const text of ["1", "I.", "Oh!", "Prologue", "Dr.", "No."])
      expect(isShortSpeech(text)).toBe(true);
    for (const text of ["Chapter 16", "She did.", "Take your time."])
      expect(isShortSpeech(text)).toBe(false);
  });
  it("joins short sentences to a neighbour and keeps sentence indexes", () => {
    const units = speechUnits(
      "Oh! She stopped at the shore. No. Then she left.",
    );
    expect(units.map((u) => u.text)).toEqual([
      "Oh! She stopped at the shore.",
      "No. Then she left.",
    ]);
    expect(units.map((u) => [u.first, u.last])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(speechUnits("The end. Yes.").map((u) => u.text)).toEqual([
      "The end. Yes.",
    ]);
  });
  it("joins a bare heading number to the following sentence", () => {
    const book = {
      meta: { id: "b", voice: "v" },
      paragraphs: [
        para("Extracted from a Family Paper.", "heading"),
        para("I", "heading"),
        para("I address these lines to my relatives in England."),
      ],
    } as Book;
    const units = bookUnits(book, 0, defaultPreferences);
    expect(units.map((u) => u.text)).toEqual([
      "Extracted from a Family Paper.",
      "One. I address these lines to my relatives in England.",
    ]);
    expect(units[1].paragraph).toBe(1);
  });
  it("pauses longer between paragraphs and after headings, scaled by speed", () => {
    const prefs = {
      sentencePause: 100,
      paragraphPause: 400,
      headingPause: 800,
    };
    const a = { text: "A b c.", paragraph: 0, first: 0, last: 0 };
    expect(unitPause(prefs, a, { ...a, first: 1 }, 1)).toBe(100);
    expect(unitPause(prefs, a, { ...a, paragraph: 1 }, 2)).toBe(200);
    expect(
      unitPause(prefs, { ...a, heading: true }, { ...a, paragraph: 1 }, 1),
    ).toBe(800);
    expect(unitPause(prefs, a, undefined, 1)).toBe(0);
  });
});

describe("skip rules and pronunciations", () => {
  it("skips citation markers without touching prose", () => {
    expect(
      skipReferences("Water boils [12] at sea level.¹ It costs [3-5] less.†"),
    ).toBe("Water boils at sea level. It costs less.");
    expect(skipReferences("Prices rose 5% in 2020.")).toBe(
      "Prices rose 5% in 2020.",
    );
    expect(skipReferences("As shown (Smith 2020).", true, true)).toBe(
      "As shown.",
    );
    expect(skipReferences("As shown (Smith 2020).", true, false)).toBe(
      "As shown (Smith 2020).",
    );
  });
  it("applies whole-word pronunciations scoped to a book", () => {
    const rules = [
      { id: "1", from: "Dantès", to: "Dahn-TESS", bookId: "monte" },
      { id: "2", from: "Seringapatam", to: "Sir-ring-gah-pah-TAM" },
    ];
    expect(pronunciationsFor(rules, "other").map((r) => r.id)).toEqual(["2"]);
    expect(
      applyPronunciations(
        "dantès met Dantèsville.",
        pronunciationsFor(rules, "monte"),
      ),
    ).toBe("Dahn-TESS met Dantèsville.");
    const p = para("The storming of Seringapatam [1].");
    expect(
      spokenText(
        p,
        { ...defaultPreferences, pronunciations: rules },
        undefined,
        "x",
      ),
    ).toBe("The storming of Sir-ring-gah-pah-TAM.");
  });
  it("keeps saved spoken edits exactly as written", () => {
    const p = {
      ...para("Seringapatam fell."),
      spokenEdits: [{ start: 0, end: 12, text: "Seringapatam" }],
    };
    const rules = [{ id: "1", from: "Seringapatam", to: "X" }];
    expect(
      spokenText(p, { ...defaultPreferences, pronunciations: rules }),
    ).toBe("Seringapatam fell.");
  });
});

describe("contents, time and search", () => {
  const paragraphs = [
    para("The Count of Monte Cristo", "heading", 1),
    para("I", "heading", 2),
    para("Marseilles, The Arrival", "paragraph", 2),
    para(
      "On the 24th of February, 1815, the lookout signalled.",
      "paragraph",
      2,
    ),
    para("II", "heading", 3),
    para("Father and Son", "heading", 3),
    para("We will leave Danglars.", "paragraph", 3),
  ];
  it("joins numbered headings with their titles", () => {
    expect(contentsEntries(paragraphs).map((e) => [e.index, e.label])).toEqual([
      [0, "The Count of Monte Cristo"],
      [1, "I · Marseilles, The Arrival"],
      [4, "II · Father and Son"],
    ]);
    expect(currentEntry(contentsEntries(paragraphs), 3)?.index).toBe(1);
  });
  it("does not treat a body sentence as a chapter title", () => {
    const entries = contentsEntries([
      para("I", "heading"),
      para("I address these lines to my relatives in England."),
    ]);
    expect(entries[0].label).toBe("I");
  });
  it("estimates listening time", () => {
    expect(listeningMinutes(155, 1)).toBe(1);
    expect(formatDuration(listeningMinutes(155 * 75, 1))).toBe("1 h 15 min");
    expect(formatDuration(0.2)).toBe("under a minute");
    expect(wordsLeftInChapter(paragraphs, 2)).toBe(12);
  });
  it("shows search matches in context", () => {
    const s = searchSnippet(
      "A long time ago the lookout at Notre-Dame signalled.",
      "lookout",
      8,
    );
    expect(s.match).toBe("lookout");
    expect(s.before.endsWith("go the ")).toBe(true);
  });
  it("maps spoken sentences to the book text only when counts agree", () => {
    const text = "First one. Second one. Third.";
    expect(spokenSentenceRange(text, 3, 1, 1)).toEqual({ start: 11, end: 22 });
    expect(spokenSentenceRange(text, 2, 0, 0)).toBeNull();
  });
});

describe("day and night scenes", () => {
  it("pairs every season", () => {
    expect(counterpart("lake")).toBe("spring");
    expect(counterpart("spring")).toBe("lake");
    expect(counterpart("summer")).toBe("summer-day");
    expect(counterpart("winter")).toBe("winter-night");
    expect(counterpart("paper")).toBeNull();
    expect(sceneFor("autumn", "day")).toBe("autumn-day");
  });
  it("toggles the time of day while keeping each half's own settings", () => {
    let prefs = switchBackground(defaultPreferences, "autumn");
    prefs = { ...prefs, backgroundOpacity: 0.4 };
    prefs = toggleTimeOfDay(prefs);
    expect(prefs.scene).toBe("autumn-day");
    expect(prefs.theme).toBe("parchment");
    prefs = toggleTimeOfDay(prefs);
    expect(prefs).toMatchObject({ scene: "autumn", backgroundOpacity: 0.4 });
  });
  it("follows the local clock and the system appearance", () => {
    const clock = { ...defaultPreferences, timeMode: "clock" as const };
    expect(desiredTime(clock, new Date(2026, 9, 13, 8, 0))).toBe("day");
    expect(desiredTime(clock, new Date(2026, 9, 13, 21, 0))).toBe("night");
    const overnight = { ...clock, dayStarts: "20:00", nightStarts: "06:00" };
    expect(desiredTime(overnight, new Date(2026, 9, 13, 23, 0))).toBe("day");
    expect(applyTimeOfDay(clock, new Date(2026, 9, 13, 9, 0)).scene).toBe(
      "spring",
    );
    const system = { ...defaultPreferences, timeMode: "system" as const };
    expect(applyTimeOfDay(system, new Date(), false).scene).toBe("spring");
    expect(applyTimeOfDay(system, new Date(), true).scene).toBe("lake");
  });
  it("combines the current season with the time of day at startup", () => {
    const prefs = {
      ...defaultPreferences,
      backgroundMode: "seasonal" as const,
      timeMode: "clock" as const,
    };
    expect(startupBackground(prefs, new Date(2026, 0, 10, 22, 0)).scene).toBe(
      "winter-night",
    );
    expect(startupBackground(prefs, new Date(2026, 6, 10, 12, 0)).scene).toBe(
      "summer-day",
    );
  });
});
