import { describe, expect, it } from "vitest";
import {
  hardwareDefaults,
  hardwareSummary,
  performanceTier,
  recommendedSettings,
  type SystemProfile,
} from "../src/hardware";
import { bookVoice } from "../src/voiceCatalog";

const base: SystemProfile = {
  os: "windows",
  arch: "x86_64",
  gpus: [],
  memoryMb: 32768,
  laptop: false,
  threads: 16,
};
const nvidia = (vramMb: number) => ({
  name: "NVIDIA GeForce RTX",
  vendor: "nvidia" as const,
  vramMb,
  integrated: false,
});

describe("performance defaults", () => {
  it("keeps artwork automatic only where speech and artwork both fit", () => {
    expect(performanceTier({ ...base, gpus: [nvidia(16376)] })).toBe("high");
    expect(performanceTier({ ...base, gpus: [nvidia(12282)] })).toBe("high");
    expect(
      performanceTier({ ...base, laptop: true, gpus: [nvidia(12282)] }),
    ).toBe("standard");
    expect(performanceTier({ ...base, gpus: [nvidia(8192)] })).toBe(
      "standard",
    );
    expect(performanceTier({ ...base, gpus: [nvidia(4096)] })).toBe("light");
  });

  it("treats integrated and non-CUDA graphics as light for speech", () => {
    const apu = {
      name: "AMD Radeon(TM) Graphics",
      vendor: "amd" as const,
      vramMb: 512,
      integrated: true,
    };
    expect(performanceTier({ ...base, gpus: [apu] })).toBe("light");
    expect(performanceTier({ ...base, gpus: [apu, nvidia(16376)] })).toBe(
      "high",
    );
    const mac = {
      ...base,
      os: "macos",
      gpus: [
        {
          name: "Apple silicon",
          vendor: "apple" as const,
          vramMb: 16384,
          integrated: true,
        },
      ],
      memoryMb: 16384,
    };
    expect(performanceTier(mac)).toBe("standard");
  });

  it("only turns background artwork off on first launch", () => {
    const light = hardwareDefaults({ ...base, laptop: true }, 5);
    expect(light).toMatchObject({
      autoGenerateCovers: false,
      autoGenerateVoicePortraits: false,
      keepSpeechDuringArt: false,
      hardware: { tier: "light", checkedAt: 5 },
    });
    const high = hardwareDefaults({ ...base, gpus: [nvidia(16376)] });
    expect(high).not.toHaveProperty("autoGenerateCovers");
    expect(high.keepSpeechDuringArt).toBe(true);
    expect(recommendedSettings("high").autoGenerateCovers).toBe(true);
    expect(recommendedSettings("standard").autoGenerateCovers).toBe(false);
  });

  it("keeps safe settings when the computer reports nothing", () => {
    const unknown = hardwareDefaults({ ...base, gpus: [], memoryMb: 0 });
    expect(unknown.hardware).toMatchObject({ tier: "light", detected: false });
    expect(unknown.autoGenerateCovers).toBe(false);
    expect(hardwareDefaults(base).hardware?.detected).toBe(true);
  });

  it("summarizes the computer in one line", () => {
    expect(
      hardwareSummary({
        ...base,
        laptop: true,
        gpus: [nvidia(8192)],
        memoryMb: 16384,
      }),
    ).toBe("NVIDIA GeForce RTX (8 GB) · 16 GB RAM · Laptop");
  });
});

describe("book voices", () => {
  it("uses the shared voice unless a book opted in to its own", () => {
    const prefs = { voice: "shared" };
    expect(bookVoice({ voice: "old-choice" }, prefs)).toBe("shared");
    expect(bookVoice({ voice: "own", uniqueVoice: true }, prefs)).toBe("own");
    expect(bookVoice({ voice: "", uniqueVoice: true }, prefs)).toBe("shared");
    expect(bookVoice(undefined, prefs)).toBe("shared");
  });
});
