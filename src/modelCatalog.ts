import type { SystemProfile } from "./hardware";
export type ModelEntry = {
  id: string;
  name: string;
  kind: "reader" | "image" | "creator";
  description: string;
  hardware: string;
  license: string;
  voices?: "built-in" | "custom";
  downloadUrl: null;
};
export const modelCatalog: ModelEntry[] = [
  {
    id: "qwen-voice-design",
    name: "Qwen VoiceDesign 1.7B",
    kind: "creator",
    description:
      "Create custom voices from a description in ten languages. Save them for Qwen narration.",
    hardware:
      "A capable NVIDIA GPU is recommended. CPU generation can be slow; the model unloads after each batch.",
    license: "Apache 2.0",
    downloadUrl: null,
  },
  {
    id: "kitten-mini",
    name: "Kitten Mini",
    kind: "reader",
    description: "Lightweight English narration with built-in voices.",
    hardware: "CPU; start here on modest computers.",
    license: "Apache 2.0",
    voices: "built-in",
    downloadUrl: null,
  },
  {
    id: "kitten-micro",
    name: "Kitten Micro",
    kind: "reader",
    description:
      "Smaller English reader for limited memory and slower processors.",
    hardware: "CPU; smallest reader option.",
    license: "Apache 2.0",
    voices: "built-in",
    downloadUrl: null,
  },
  {
    id: "kokoro",
    name: "Kokoro",
    kind: "reader",
    description: "Natural CPU narration with its own voice collection.",
    hardware: "CPU; suitable for everyday laptops and desktops.",
    license: "Apache 2.0",
    voices: "built-in",
    downloadUrl: null,
  },
  {
    id: "qwen3-tts-0.6b",
    name: "Qwen3-TTS 0.6B",
    kind: "reader",
    description:
      "Custom voices and multilingual narration in a smaller Qwen model.",
    hardware:
      "NVIDIA GPU preferred; strong CPU or Apple silicon may be slower.",
    license: "Apache 2.0",
    voices: "custom",
    downloadUrl: null,
  },
  {
    id: "qwen3-tts-1.7b",
    name: "Qwen3-TTS 1.7B",
    kind: "reader",
    description:
      "Higher-capacity narration using your custom voice references.",
    hardware: "A capable GPU with ample free memory is recommended.",
    license: "Apache 2.0",
    voices: "custom",
    downloadUrl: null,
  },
  {
    id: "sd15-lcm",
    name: "SD 1.5 + LCM",
    kind: "image",
    description: "Fast, compact cover illustrations and portraits.",
    hardware: "Entry-level GPU, or CPU with longer waits.",
    license: "CreativeML OpenRAIL-M; LCM adapter terms",
    downloadUrl: null,
  },
  {
    id: "dreamshaper-8-lcm",
    name: "DreamShaper 8 LCM",
    kind: "image",
    description: "A painterly alternative for covers and character portraits.",
    hardware: "Compatible Vulkan GPU; CPU fallback.",
    license: "CreativeML OpenRAIL-M and author permissions",
    downloadUrl: null,
  },
  {
    id: "sdxl-lightning",
    name: "SDXL-Lightning",
    kind: "image",
    description: "Detailed artwork in a small number of generation steps.",
    hardware: "NVIDIA GPU recommended; more RAM than SD 1.5.",
    license: "CreativeML Open RAIL++-M",
    downloadUrl: null,
  },
  {
    id: "z-image-turbo",
    name: "Z-Image-Turbo",
    kind: "image",
    description: "Detailed portraits and stronger description following.",
    hardware: "High-memory computer and capable NVIDIA GPU recommended.",
    license: "Apache 2.0",
    downloadUrl: null,
  },
];
export type ModelInstallation = {
  id: string;
  installed: boolean;
  availableLocally: boolean;
  managed: boolean;
};
export function recommendations(p: SystemProfile | null): {
  reader: string;
  image: string;
} {
  if (!p || !p.memoryMb) return { reader: "kitten-mini", image: "sd15-lcm" };
  const nvidia = Math.max(
    0,
    ...p.gpus.filter((g) => g.vendor === "nvidia").map((g) => g.vramMb),
  );
  return {
    reader:
      nvidia >= 10000
        ? "qwen3-tts-1.7b"
        : nvidia >= 5500
          ? "qwen3-tts-0.6b"
          : p.memoryMb >= 8000 && p.threads >= 4
            ? "kokoro"
            : p.memoryMb < 4000
              ? "kitten-micro"
              : "kitten-mini",
    image:
      nvidia >= 15000 && p.memoryMb >= 30000
        ? "z-image-turbo"
        : nvidia >= 7000
          ? "sdxl-lightning"
          : "sd15-lcm",
  };
}
