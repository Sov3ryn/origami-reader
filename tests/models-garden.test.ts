import { it, expect } from "vitest";
import { recommendations, modelCatalog } from "../src/modelCatalog";
import {
  counterpart,
  startupBackground,
  switchBackground,
} from "../src/backgrounds";
import { defaultPreferences } from "../src/types";
it("recommendations preserve choice and use conservative unknown hardware defaults", () => {
  expect(recommendations(null)).toEqual({
    reader: "kitten-mini",
    image: "sd15-lcm",
  });
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
  ).toEqual({ reader: "qwen3-tts-1.7b", image: "z-image-turbo" });
  expect(modelCatalog).toHaveLength(10);
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
