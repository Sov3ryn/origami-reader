import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../../storage";

// Voice notes: recordings kept with their note (sealed with its vault) and
// transcribed on this computer by Whisper (src-tauri/src/whisper.rs).

// A recording, stored as its own Work item and loaded only when shown.
export type VoiceRecording = {
  id: string;
  kind: "audio";
  note: string;
  mime: string;
  // base64 of the recording (WebM with Opus from the recorder).
  data: string;
  duration: number;
  created: number;
  vault?: string;
  workspace?: string;
};

export type VoiceModel = { id: string; name: string; installed: boolean; bundled?: boolean; bytes: number; downloading: boolean };
export type VoiceStatus = { models: VoiceModel[]; runtime: boolean };

// Recordings are not loaded with the rest of Work mode; these fetch them.
export const loadRecording = (id: string): Promise<VoiceRecording | null> => (desktop ? invoke("work_item", { id }) : Promise.resolve(null));
export const listRecordings = (): Promise<VoiceRecording[]> => (desktop ? invoke("list_work", { kind: "audio" }) : Promise.resolve([]));

export const voiceAvailable = () => desktop && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
export const voiceStatus = (): Promise<VoiceStatus> => (desktop ? invoke("voice_model_status") : Promise.resolve({ models: [], runtime: false }));
export const downloadVoiceModel = (id: string) => invoke<void>("download_voice_model", { id });
export const cancelVoiceDownload = () => invoke<void>("cancel_voice_download");
export const removeVoiceModel = (id: string) => invoke<void>("remove_voice_model", { id });
export const onVoiceDownload = (fn: (p: { id: string; received?: number; total?: number; done?: boolean; ok?: boolean }) => void) =>
  listen<{ id: string; received?: number; total?: number; done?: boolean; ok?: boolean }>("whisper-download", (e) => fn(e.payload));
export const onTranscribeProgress = (fn: (p: { done: number; total: number }) => void) =>
  listen<{ done: number; total: number }>("transcribe-progress", (e) => fn(e.payload));

// The chosen model and language, remembered on this computer.
const MODEL_KEY = "origami.voiceModel";
const LANGUAGE_KEY = "origami.voiceLanguage";
const AUTO_KEY = "origami.voiceAutoTranscribe";
const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window */
  }
};
export const savedVoiceModel = () => read(MODEL_KEY, "");
export const saveVoiceModel = (id: string) => write(MODEL_KEY, id);
export const savedVoiceLanguage = () => read(LANGUAGE_KEY, "");
export const saveVoiceLanguage = (code: string) => write(LANGUAGE_KEY, code);
export const autoTranscribe = () => read(AUTO_KEY, "1") === "1";
export const saveAutoTranscribe = (on: boolean) => write(AUTO_KEY, on ? "1" : "0");

// Languages offered in Settings ("" detects the spoken language).
export const voiceLanguages: [string, string][] = [
  ["", "Detect automatically"],
  ["en", "English"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["pl", "Polish"],
  ["ru", "Russian"],
  ["uk", "Ukrainian"],
  ["tr", "Turkish"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["bn", "Bengali"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["vi", "Vietnamese"],
  ["th", "Thai"],
  ["id", "Indonesian"],
];

/** The model to use: the chosen one if installed, else the best installed. */
export function pickModel(status: VoiceStatus | null) {
  const installed = status?.models.filter((m) => m.installed) || [];
  return installed.find((m) => m.id === savedVoiceModel())?.id || installed.find((m) => m.id === "small")?.id || installed[0]?.id || "";
}

// --- Recording ------------------------------------------------------------------------
export type Recorder = {
  stop: () => Promise<{ blob: Blob; duration: number }>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  level: () => number;
  elapsed: () => number;
};

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  // A level meter for the recording indicator.
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  let started = performance.now();
  let pausedFor = 0;
  let pausedAt = 0;
  recorder.start(1000);
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    void context.close().catch(() => undefined);
  };
  const elapsed = () => ((pausedAt || performance.now()) - started - pausedFor) / 1000;
  return {
    stop: () =>
      new Promise((resolve) => {
        const duration = elapsed();
        recorder.onstop = () => {
          release();
          resolve({ blob: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), duration });
        };
        recorder.stop();
      }),
    pause: () => {
      if (recorder.state !== "recording") return;
      recorder.pause();
      pausedAt = performance.now();
    },
    resume: () => {
      if (recorder.state !== "paused") return;
      recorder.resume();
      pausedFor += performance.now() - pausedAt;
      pausedAt = 0;
    },
    cancel: () => {
      recorder.onstop = () => release();
      recorder.stop();
      started = 0;
    },
    level: () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const v of samples) peak = Math.max(peak, Math.abs(v - 128));
      return Math.min(1, peak / 64);
    },
    elapsed,
  };
}

// --- Conversions ------------------------------------------------------------------------
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
export function base64ToBlob(data: string, mime: string) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}
function bytesToBase64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** 16 kHz mono 16-bit samples (base64), as Whisper expects. */
export async function pcm16k(blob: Blob) {
  const context = new AudioContext();
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  await context.close();
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const f = rendered.getChannelData(0);
  const pcm = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
  return bytesToBase64(new Uint8Array(pcm.buffer));
}

export async function transcribe(blob: Blob, model: string, language: string): Promise<{ text: string; language: string }> {
  const samples = await pcm16k(blob);
  return invoke("transcribe_audio", { model, language, samples });
}

export const formatDuration = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
