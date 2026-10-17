// Performance defaults from a local look at this computer's graphics and
// memory. Reading aloud always has priority over generated artwork.
import type { HardwareCheck, Preferences } from "./types";

export type Gpu = {
  name: string;
  vendor: "nvidia" | "amd" | "intel" | "apple" | "other";
  vramMb: number;
  integrated: boolean;
};
export type SystemProfile = {
  os: string;
  arch: string;
  gpus: Gpu[];
  memoryMb: number;
  laptop: boolean;
  threads: number;
};

// The speech engine runs fastest on NVIDIA (CUDA) and Apple silicon (Metal).
export function speechGpu(profile: SystemProfile) {
  return (
    profile.gpus
      .filter((g) => g.vendor === "nvidia" || g.vendor === "apple")
      .sort((a, b) => b.vramMb - a.vramMb)[0] || null
  );
}

export function performanceTier(profile: SystemProfile): HardwareCheck["tier"] {
  const gpu = speechGpu(profile);
  if (!gpu) return "light";
  if (gpu.vendor === "apple")
    return profile.memoryMb >= 15000 ? "standard" : "light";
  // Speech and artwork share the graphics card. Both fit comfortably from
  // about 12 GB on desktops; laptops also need to stay cool and quiet.
  if (gpu.vramMb >= 15000 || (gpu.vramMb >= 11000 && !profile.laptop))
    return "high";
  if (gpu.vramMb >= 5500) return "standard";
  return "light";
}

function gigabytes(mb: number) {
  return Math.round(mb / 1024) + " GB";
}

// False when the system would not report its graphics or memory, for example
// when a security policy blocks the query. Origami then keeps safe settings.
export function hardwareDetected(profile: SystemProfile) {
  return profile.gpus.length > 0 || profile.memoryMb > 0;
}

export function hardwareSummary(profile: SystemProfile) {
  const gpu =
    speechGpu(profile) ||
    [...profile.gpus].sort((a, b) => b.vramMb - a.vramMb)[0];
  const parts = [
    gpu
      ? gpu.integrated || !gpu.vramMb
        ? gpu.name
        : `${gpu.name} (${gigabytes(gpu.vramMb)})`
      : "",
    profile.memoryMb ? gigabytes(profile.memoryMb) + " RAM" : "",
    profile.laptop ? "Laptop" : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

// Settings applied once, the first time Origami opens on this computer.
// They only ever turn background work off; the reader can turn it back on.
export function hardwareDefaults(
  profile: SystemProfile,
  now = Date.now(),
): Partial<Preferences> {
  const tier = performanceTier(profile);
  const check: HardwareCheck = {
    tier,
    summary: hardwareSummary(profile),
    checkedAt: now,
    detected: hardwareDetected(profile),
  };
  if (tier === "high")
    return { hardware: check, keepSpeechDuringArt: true };
  return {
    hardware: check,
    keepSpeechDuringArt: false,
    autoGenerateCovers: false,
    autoGenerateVoicePortraits: false,
  };
}

// "Use recommended settings" in Settings, which may also turn artwork back on.
export function recommendedSettings(
  tier: HardwareCheck["tier"],
): Partial<Preferences> {
  const fast = tier === "high";
  return {
    autoGenerateCovers: fast,
    autoGenerateVoicePortraits: fast,
    keepSpeechDuringArt: fast,
    preloadAtStartup: true,
  };
}
