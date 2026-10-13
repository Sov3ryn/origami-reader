import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayer } from "../src/usePlayer";
import * as storage from "../src/storage";
import { defaultPreferences, type Book } from "../src/types";

vi.mock("../src/storage", () => ({
  desktop: true,
  synthesize: vi.fn(),
  cancelSpeech: vi.fn(),
}));
let root: Root;
let player: ReturnType<typeof usePlayer>;
const report = vi.fn();
const used = vi.fn();
const book = {
  meta: { voice: "book-voice" },
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
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("preloaded voice lifetime", () => {
  it("unloads an idle voice immediately when its selection changes", async () => {
    await act(async () => {
      await player.changeVoice();
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
      meta: { id: "story", voice: "old" },
      paragraphs: [
        {
          text: "First sentence. Second sentence. Third sentence.",
          kind: "paragraph",
        },
      ],
    } as Book;
    let first!: Promise<void>;
    await act(async () => {
      first = player.start(original, 0, defaultPreferences, vi.fn());
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
    expect(storage.cancelSpeech).toHaveBeenCalledTimes(1);
    let second!: Promise<void>;
    await act(async () => {
      second = player.start(
        { ...original, meta: { ...original.meta, voice: "new" } },
        0,
        defaultPreferences,
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
      await player.start(book, 0, defaultPreferences, vi.fn());
    });
    expect(storage.cancelSpeech).not.toHaveBeenCalled();
    expect(storage.synthesize).toHaveBeenCalledWith(
      "A short passage.",
      "book-voice",
    );
    expect(used).toHaveBeenCalledWith("book-voice");
  });
  it("still cancels an in-flight generation and ignores its late result", async () => {
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
      playback = player.start(book, 0, defaultPreferences, vi.fn());
      await flush();
    });
    await act(async () => {
      await player.stop();
      complete({ audio: "AA==", rate: 24000, duration: 1 });
      await playback;
    });
    expect(storage.cancelSpeech).toHaveBeenCalledTimes(1);
    expect(used).not.toHaveBeenCalled();
    expect(player.status).toBe("idle");
  });
});
