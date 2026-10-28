import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayer } from "../src/usePlayer";
import * as storage from "../src/storage";
import { defaultPreferences, type Book } from "../src/types";
// Natural pauses are covered separately; these lifecycle tests advance immediately.
const instant = {
  ...defaultPreferences,
  sentencePause: 0,
  paragraphPause: 0,
  headingPause: 0,
};

vi.mock("../src/storage", () => ({
  desktop: true,
  synthesize: vi.fn(),
  cancelSpeech: vi.fn(),
  interruptSpeech: vi.fn(),
}));
let root: Root;
let player: ReturnType<typeof usePlayer>;
const report = vi.fn();
const used = vi.fn();
const book = {
  meta: { voice: "book-voice", uniqueVoice: true },
  paragraphs: [{ text: "A short passage.", kind: "paragraph" }],
} as Book;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function Harness() {
  player = usePlayer(report, used);
  return null;
}
class AudioStub {
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  duration = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  play() {
    queueMicrotask(() => this.onended?.());
    return Promise.resolve();
  }
  pause() {}
}
beforeEach(async () => {
  vi.clearAllMocks();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("Audio", AudioStub);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.mocked(storage.cancelSpeech).mockResolvedValue(undefined);
  vi.mocked(storage.interruptSpeech).mockResolvedValue(undefined);
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("preloaded voice lifetime", () => {
  it("starts synthesis at a bookmarked sentence and continues to the next paragraph", async () => {
    vi.mocked(storage.synthesize).mockResolvedValue({ audio: "AA==", rate: 24000, duration: 1 });
    const text = "This sentence has already been read. The sleeping cat opened one eye. Then she heard a knock at the door.";
    const marked = {
      meta: { id: "marked", voice: "voice", uniqueVoice: true },
      paragraphs: [
        { id: "p", text, kind: "paragraph", chapter: 1 },
        { id: "q", text: "She stood up and walked across the room.", kind: "paragraph", chapter: 1 },
      ],
    } as Book;
    await act(async () => {
      await player.start(marked, 0, instant, vi.fn(), undefined, false, 0, text.indexOf("The sleeping"));
    });
    const spoken = vi.mocked(storage.synthesize).mock.calls.map(([text]) => text).join(" ");
    expect(spoken).toMatch(/^The sleeping cat/);
    expect(spoken).not.toContain("already been read");
    expect(spoken).toContain("walked across the room");
  });
  it("uses saved edits and heading numbers for normal and selected playback, and skips deleted speech", async () => {
    vi.mocked(storage.synthesize).mockResolvedValue({
      audio: "AA==",
      rate: 24000,
      duration: 1,
    });
    const edited = {
      meta: { id: "edited", voice: "voice", uniqueVoice: true },
      paragraphs: [
        { id: "p-0", text: "Chapter XVI", kind: "heading", chapter: 1 },
        {
          id: "p-1",
          text: "Original wording.",
          kind: "paragraph",
          chapter: 1,
          spokenEdits: [{ start: 0, end: 17, text: "Accepted wording." }],
        },
        {
          id: "p-2",
          text: "Skip this.",
          kind: "paragraph",
          chapter: 1,
          spokenEdits: [{ start: 0, end: 10, text: "" }],
        },
      ],
    } as Book;
    await act(async () => {
      await player.start(edited, 0, instant, vi.fn());
    });
    expect(
      vi.mocked(storage.synthesize).mock.calls.map(([text]) => text),
    ).toEqual(["Chapter 16", "Accepted wording."]);
    vi.mocked(storage.synthesize).mockClear();
    await act(async () => {
      await player.start(edited, 1, instant, vi.fn(), {
        paragraphId: "p-1",
        start: 0,
        end: 17,
        text: "Original wording.",
      });
    });
    expect(player.currentText).toBe("Accepted wording.");
    expect(storage.synthesize).not.toHaveBeenCalled();
    vi.mocked(storage.synthesize).mockClear();
    await act(async () => {
      await player.start(edited, 2, instant, vi.fn(), {
        paragraphId: "p-2",
        start: 0,
        end: 10,
        text: "Skip this.",
      });
    });
    expect(storage.synthesize).not.toHaveBeenCalled();
  });
  it("does not replay obsolete wording after a spoken edit or rule change", async () => {
    vi.mocked(storage.synthesize).mockResolvedValue({
      audio: "AA==",
      rate: 24000,
      duration: 1,
    });
    const original = {
      meta: { id: "changed", voice: "voice", uniqueVoice: true },
      paragraphs: [
        { id: "p", text: "Chapter XVI", kind: "heading", chapter: 1 },
      ],
    } as Book;
    await act(async () => {
      await player.start(original, 0, instant, vi.fn());
    });
    vi.mocked(storage.synthesize).mockClear();
    await act(async () => {
      await player.start(
        original,
        0,
        { ...instant, romanNumeralHeadings: false },
        vi.fn(),
        undefined,
        true,
      );
    });
    expect(storage.synthesize).toHaveBeenCalledWith(
      "Chapter XVI",
      "voice",
      0.9,
      "",
    );
    vi.mocked(storage.synthesize).mockClear();
    const edited = {
      ...original,
      paragraphs: [
        {
          ...original.paragraphs[0],
          spokenEdits: [{ start: 0, end: 11, text: "Changed heading." }],
        },
      ],
    };
    await act(async () => {
      await player.start(edited, 0, instant, vi.fn(), undefined, true);
    });
    expect(storage.synthesize).toHaveBeenCalledWith(
      "Changed heading.",
      "voice",
      0.9,
      "",
    );
  });
  it("keeps the loaded model when the voice changes and unloads it for a new model", async () => {
    await act(async () => {
      await player.changeVoice();
    });
    expect(storage.cancelSpeech).not.toHaveBeenCalled();
    await act(async () => {
      await player.unload();
    });
    expect(storage.cancelSpeech).toHaveBeenCalledTimes(1);
    expect(storage.synthesize).not.toHaveBeenCalled();
  });
  it("restarts the current sentence with a new voice and discards old read-ahead audio", async () => {
    const audio: { onended: (() => void) | null; pause: () => void }[] = [];
    class PlayingAudio extends AudioStub {
      constructor() {
        super();
        audio.push(this);
      }
      play() {
        return Promise.resolve();
      }
      pause = vi.fn();
    }
    vi.stubGlobal("Audio", PlayingAudio);
    vi.mocked(storage.synthesize).mockResolvedValue({
      audio: "AA==",
      rate: 24000,
      duration: 1,
    });
    const original = {
      meta: { id: "story", voice: "old", uniqueVoice: true },
      paragraphs: [
        {
          text: "First sentence. Second sentence. Third sentence.",
          kind: "paragraph",
        },
      ],
    } as Book;
    let first!: Promise<void>;
    await act(async () => {
      first = player.start(original, 0, instant, vi.fn());
      await flush();
    });
    await act(async () => {
      audio[0].onended!();
      await flush();
    });
    expect(player.currentText).toBe("Second sentence.");
    await act(async () => {
      await player.changeVoice();
      await first;
    });
    expect(audio[1].pause).toHaveBeenCalled();
    expect(storage.cancelSpeech).not.toHaveBeenCalled();
    let second!: Promise<void>;
    await act(async () => {
      second = player.start(
        { ...original, meta: { ...original.meta, voice: "new" } },
        0,
        instant,
        vi.fn(),
        undefined,
        true,
      );
      await flush();
    });
    expect(player.currentText).toBe("Second sentence.");
    expect(
      vi
        .mocked(storage.synthesize)
        .mock.calls.filter(([, voice]) => voice === "new")
        .map(([text]) => text),
    ).toEqual(["Second sentence.", "Third sentence."]);
    await act(async () => {
      audio[2].onended!();
      await flush();
    });
    expect(player.currentText).toBe("Third sentence.");
    await act(async () => {
      audio[3].onended!();
      await second;
    });
    expect(player.status).toBe("idle");
  });
  it("retains an idle worker when stopping or opening another book", async () => {
    await act(async () => {
      await player.stop();
      await player.stop();
    });
    expect(storage.cancelSpeech).not.toHaveBeenCalled();
  });
  it("first playback reuses the worker and remembers the book's voice", async () => {
    vi.mocked(storage.synthesize).mockResolvedValue({
      audio: "AA==",
      rate: 24000,
      duration: 1,
    });
    await act(async () => {
      await player.start(book, 0, instant, vi.fn());
    });
    expect(storage.cancelSpeech).not.toHaveBeenCalled();
    expect(storage.synthesize).toHaveBeenCalledWith(
      "A short passage.",
      "book-voice",
      0.9,
      "",
    );
    expect(used).toHaveBeenCalledWith("book-voice");
  });
  it("interrupts in-flight generation without unloading and ignores its late result", async () => {
    let complete!: (value: {
      audio: string;
      rate: number;
      duration: number;
    }) => void;
    vi.mocked(storage.synthesize).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    let playback!: Promise<void>;
    await act(async () => {
      playback = player.start(book, 0, instant, vi.fn());
      await flush();
    });
    await act(async () => {
      await player.stop();
      complete({ audio: "AA==", rate: 24000, duration: 1 });
      await playback;
    });
    expect(storage.interruptSpeech).toHaveBeenCalledTimes(1);
    expect(storage.cancelSpeech).not.toHaveBeenCalled();
    expect(used).not.toHaveBeenCalled();
    expect(player.status).toBe("idle");
  });
  it("replays cached speech, drops it on deletion, and honors the literal-text option", async () => {
    vi.mocked(storage.synthesize).mockResolvedValue({
      audio: "AA==",
      rate: 24000,
      duration: 1,
    });
    const original = { ...book, meta: { ...book.meta, id: "cache-book" } };
    await act(async () => {
      await player.start(original, 0, instant, vi.fn());
      await player.start(original, 0, instant, vi.fn());
    });
    expect(storage.synthesize).toHaveBeenCalledTimes(1);
    await act(async () => {
      player.forgetBooks(new Set(["cache-book"]));
      await player.start(original, 0, instant, vi.fn());
    });
    expect(storage.synthesize).toHaveBeenCalledTimes(2);
    await act(async () => {
      await player.start(
        original,
        0,
        { ...instant, skipSpeechMarkup: false },
        vi.fn(),
        "https://example.test",
      );
    });
    expect(storage.synthesize).toHaveBeenLastCalledWith(
      "https://example.test",
      "book-voice",
      0.9,
      "",
    );
  });
  it("switches reading position during generation while retaining the same model", async () => {
    let finishOld!: (value: {
      audio: string;
      rate: number;
      duration: number;
    }) => void;
    vi.mocked(storage.synthesize)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValue({ audio: "AA==", rate: 24000, duration: 1 });
    let old!: Promise<void>;
    await act(async () => {
      old = player.start(book, 0, instant, vi.fn(), "Old passage.");
      await flush();
      await player.start(book, 0, instant, vi.fn(), "New passage.");
      finishOld({ audio: "AA==", rate: 24000, duration: 1 });
      await old;
    });
    expect(storage.interruptSpeech).toHaveBeenCalledTimes(1);
    expect(storage.cancelSpeech).not.toHaveBeenCalled();
    expect(player.currentText).toBe("New passage.");
    expect(used).toHaveBeenCalledTimes(1);
  });
});
