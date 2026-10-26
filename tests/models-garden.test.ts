import { it, expect } from "vitest";
import { recommendations, modelCatalog } from "../src/modelCatalog";
import {
  counterpart,
  startupBackground,
  switchBackground,
} from "../src/backgrounds";
import { defaultPreferences } from "../src/types";
it("recommendations point to downloadable models and use conservative unknown hardware defaults", () => {
  expect(recommendations(null)).toEqual({
    reader: "kitten-mini",
    image: "dreamshaper-8-lcm",
  });
  // The light readers speak English only.
  expect(recommendations(null, "fr").reader).toBe("qwen3-tts-0.6b");
  expect(
    recommendations({
      os: "windows",
      arch: "x64",
      gpus: [],
      memoryMb: 16000,
      threads: 8,
      laptop: true,
    }).reader,
  ).toBe("kokoro");
  expect(
    recommendations({
      os: "windows",
      arch: "x64",
      gpus: [
        { name: "GPU", vendor: "nvidia", vramMb: 16000, integrated: false },
      ],
      memoryMb: 64000,
      threads: 24,
      laptop: false,
    }),
  ).toEqual({ reader: "qwen3-tts-1.7b", image: "dreamshaper-8-lcm" });
  expect(modelCatalog).toHaveLength(11);
  const recommendable = ["kitten-mini", "kokoro", "qwen3-tts-0.6b", "qwen3-tts-1.7b", "qwen-voice-design", "dreamshaper-8-lcm"];
  expect(recommendable.every((id) => modelCatalog.find((m) => m.id === id)?.download)).toBe(true);
  expect(modelCatalog.every((m) => m.downloadUrl === null)).toBe(true);
});
it("garden scenes keep their own settings and open on the lake at startup", () => {
  expect(counterpart("garden-winter-day")).toBe("garden-winter-night");
  const p = {
    ...switchBackground(defaultPreferences, "garden-spring-day"),
    backgroundMode: "seasonal" as const,
  };
  // Gardens are retired: a saved garden opens on the lake for the current season.
  expect(startupBackground(p, new Date(2026, 9, 15)).scene).toBe("autumn-day");
  const saved = { ...p, fountain: false, backgroundOpacity: 0.73 };
  const roundtrip = switchBackground(
    switchBackground(saved, "garden-summer-day"),
    "garden-spring-day",
  );
  expect(roundtrip.fountain).toBe(false);
  expect(roundtrip.backgroundOpacity).toBe(0.73);
});
it("suggests a lighter reader that keeps the reading language", async () => {
  const { lighterReader } = await import("../src/modelCatalog");
  expect(lighterReader("qwen3-tts-1.7b", ["qwen3-tts-1.7b", "qwen3-tts-0.6b"], false)).toEqual({ id: "qwen3-tts-0.6b", installed: true });
  // Kokoro and Kitten speak English only: a French reader is not sent there.
  expect(lighterReader("qwen3-tts-0.6b", ["qwen3-tts-0.6b", "kokoro"], false)).toBeNull();
  expect(lighterReader("qwen3-tts-0.6b", ["qwen3-tts-0.6b", "kitten-mini"], true)).toEqual({ id: "kitten-mini", installed: true });
  expect(lighterReader("qwen3-tts-0.6b", ["qwen3-tts-0.6b"], true)).toEqual({ id: "kokoro", installed: false });
  expect(lighterReader("kitten-micro", ["kitten-micro"], true)).toBeNull();
});

it("opens a saved garden scene as the lake of the same season and time", () => {
  const saved = switchBackground(defaultPreferences, "garden-autumn-day");
  const opened = startupBackground({ ...saved, timeMode: "manual" }, new Date(2026, 9, 26, 12));
  expect(opened.scene).toBe("autumn-day");
});
