import { useEffect, useRef } from "react";
import { t } from "../i18n";
import { meterReading } from "../audioMeter";
import type { VisualizerStyle } from "../types";

export const visualizerStyles: { id: VisualizerStyle; name: string }[] = [
  { id: "bars", name: "Bars" },
  { id: "wave", name: "Wave" },
  { id: "mirror", name: "Mirror" },
  { id: "pulse", name: "Pulse" },
];

const WIDTH = 112;
const HEIGHT = 36;

// The voice reading aloud, drawn beside the play button. A click moves to the
// next style. It draws only while a sentence plays; otherwise it rests flat.
export function AudioVisualizer({ playing, style, onStyle }: { playing: boolean; style: VisualizerStyle; onStyle: (s: VisualizerStyle) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const index = Math.max(0, visualizerStyles.findIndex((s) => s.id === style));
  const next = visualizerStyles[(index + 1) % visualizerStyles.length];

  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext("2d");
    if (!el || !g) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = WIDTH * ratio;
    el.height = HEIGHT * ratio;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const freq = new Uint8Array(128);
    const wave = new Uint8Array(256);
    let frame = 0;
    // Bars fall back gently between frames, so speech reads as a voice, not flicker.
    const held = new Float32Array(24);
    const draw = () => {
      const color = getComputedStyle(el).color;
      g.clearRect(0, 0, WIDTH, HEIGHT);
      g.fillStyle = color;
      g.strokeStyle = color;
      const reading = playing ? meterReading() : null;
      // The element's volume scales what the analyser hears; undo it so the
      // drawing keeps its size at a low volume: a factor for the waveform, and
      // for the spectrum (in decibels) the same change as an offset.
      const volume = reading ? Math.max(0.05, reading.volume) : 1;
      const boost = 1 / volume;
      const lift = reading ? (-20 * Math.log10(volume)) / (reading.analyser.maxDecibels - reading.analyser.minDecibels) : 0;
      if (reading) {
        reading.analyser.getByteFrequencyData(freq);
        reading.analyser.getByteTimeDomainData(wave);
      } else {
        freq.fill(0);
        wave.fill(128);
      }
      // Speech sits between about 200 Hz and 6 kHz: spread those bins over the
      // bars, a little wider toward the treble, where the voice is quieter.
      const top = Math.min(freq.length, Math.round((6000 / ((reading?.analyser.context.sampleRate || 48000) / 2)) * freq.length));
      const band = (i: number, count: number) => {
        const from = 1 + Math.floor((i / count) ** 1.25 * (top - 1));
        const to = Math.max(from + 1, 1 + Math.floor(((i + 1) / count) ** 1.25 * (top - 1)));
        let sum = 0;
        for (let k = from; k < to; k++) sum += freq[k];
        // A voice gets quieter toward the treble: lift the higher bands a little
        // so every bar moves, while silence stays flat.
        const level = sum ? sum / (to - from) / 255 + lift + 0.2 * (i / count) : 0;
        return Math.min(1, Math.max(0, (level - 0.14) / 0.62)) ** 1.15;
      };
      if (style === "bars" || style === "mirror") {
        const count = style === "bars" ? 16 : 24;
        const gap = 2;
        const w = (WIDTH - gap * (count - 1)) / count;
        for (let i = 0; i < count; i++) {
          // Mirror: the lowest band in the middle, higher ones toward both ends.
          const target = style === "mirror" ? band(Math.min(count / 2 - 1, Math.floor(Math.abs(i - (count - 1) / 2))), count / 2) : band(i, count);
          held[i] = Math.max(target, held[i] * 0.86);
          const h = Math.max(2, held[i] * (HEIGHT - 2));
          const x = i * (w + gap);
          const y = style === "mirror" ? (HEIGHT - h) / 2 : HEIGHT - h;
          g.globalAlpha = 0.45 + 0.55 * held[i];
          g.beginPath();
          g.roundRect(x, y, w, h, Math.min(2, w / 2));
          g.fill();
        }
      } else if (style === "wave") {
        g.globalAlpha = 1;
        g.lineWidth = 1.6;
        g.lineJoin = "round";
        g.beginPath();
        for (let i = 0; i < wave.length; i++) {
          const x = (i / (wave.length - 1)) * WIDTH;
          const y = HEIGHT / 2 + Math.max(-1, Math.min(1, ((wave[i] - 128) / 128) * boost * 2.6)) * (HEIGHT / 2 - 2);
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      } else {
        // Pulse: three rings that swell with the voice.
        let level = 0;
        for (let i = 0; i < 8; i++) level += band(i, 8);
        level = Math.min(1, (level / 8) * 1.5);
        held[0] = Math.max(level, held[0] * 0.9);
        const r = 4 + held[0] * (HEIGHT / 2 - 5);
        for (let k = 2; k >= 0; k--) {
          g.globalAlpha = k === 0 ? 0.95 : 0.25 / k;
          g.beginPath();
          g.arc(WIDTH / 2, HEIGHT / 2, r + k * 5 * held[0], 0, Math.PI * 2);
          if (k === 0) g.fill();
          else {
            g.lineWidth = 1.4;
            g.stroke();
          }
        }
      }
      g.globalAlpha = 1;
      if (playing) frame = requestAnimationFrame(draw);
    };
    held.fill(0);
    draw();
    return () => cancelAnimationFrame(frame);
  }, [playing, style]);

  const label = t("Sound visualizer: {style}. Click for another style.", { style: t(visualizerStyles[index].name) });
  return (
    <button className="audio-visualizer" aria-label={label} data-tip={label} onClick={() => onStyle(next.id)}>
      <canvas ref={canvas} style={{ width: WIDTH, height: HEIGHT }} aria-hidden="true" />
    </button>
  );
}
