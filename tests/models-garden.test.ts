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
it("garden season changes stay in the garden and restore custom effects", () => {
  expect(counterpart("garden-winter-day")).toBe("garden-winter-night");
  const p = {
    ...switchBackground(defaultPreferences, "garden-spring-day"),
    backgroundMode: "seasonal" as const,
  };
  expect(startupBackground(p, new Date(2026, 9, 15)).scene).toBe(
    "garden-autumn-day",
  );
  const saved = { ...p, fountain: false, backgroundOpacity: 0.73 };
  const roundtrip = switchBackground(
    switchBackground(saved, "garden-summer-day"),
    "garden-spring-day",
  );
  expect(roundtrip.fountain).toBe(false);
  expect(roundtrip.backgroundOpacity).toBe(0.73);
});
