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
  // Downloadable from Settings (workers/add_components.py), with its size.
  // "together": the three light readers come as one download.
  download?: { bytes: number; together?: boolean };
  // The license text to accept before downloading (image models).
  terms?: "openrail" | "stability";
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
    download: { bytes: 4_520_162_313 },
  },
  {
    id: "kitten-mini",
    name: "Kitten Mini",
    kind: "reader",
    description: "Lightweight English narration with built-in voices.",
    hardware: "CPU; start here on modest computers.",
    license: "Apache 2.0",
    voices: "built-in",
    download: { bytes: 455_527_848, together: true },
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
    download: { bytes: 455_527_848, together: true },
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
    download: { bytes: 455_527_848, together: true },
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
    download: { bytes: 2_516_104_532 },
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
    download: { bytes: 4_544_228_181 },
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
    download: { bytes: 2_163_944_109 },
    terms: "openrail",
  },
  {
    id: "sd-turbo",
    name: "SD-Turbo",
    kind: "image",
    description: "Fast covers and portraits in a single step. Powered by Stability AI.",
    hardware: "Compatible Vulkan GPU; CPU fallback.",
    license: "Stability AI Community License",
    downloadUrl: null,
    download: { bytes: 5_244_700_445 },
    terms: "stability",
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
// Starting points among the models Origami can download. The light readers
// speak English only, so another reading language starts with Qwen.
export function recommendations(
  p: SystemProfile | null,
  language = "en",
): {
  reader: string;
  image: string;
} {
  const english = language.slice(0, 2) === "en";
  if (!p || !p.memoryMb)
    return {
      reader: english ? "kitten-mini" : "qwen3-tts-0.6b",
      image: "dreamshaper-8-lcm",
    };
  const nvidia = Math.max(
    0,
    ...p.gpus.filter((g) => g.vendor === "nvidia").map((g) => g.vramMb),
  );
  return {
    reader:
      nvidia >= 10000
        ? "qwen3-tts-1.7b"
        : nvidia >= 5500 || !english
          ? "qwen3-tts-0.6b"
        : p.memoryMb >= 8000 && p.threads >= 4
          ? "kokoro"
          : p.memoryMb < 4000
            ? "kitten-micro"
            : "kitten-mini",
    image: "dreamshaper-8-lcm",
  };
}
