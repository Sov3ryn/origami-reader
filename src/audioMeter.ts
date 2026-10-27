// The sound of reading aloud, measured for the player's visualizer. Each
// sentence's audio element is routed through one analyser, but only once the
// audio context runs (it starts from a click on Play), so the voice is never
// silenced by a context the browser has not allowed to start. The element's
// volume and fades still apply: they act before the analyser.
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let current: HTMLMediaElement | null = null;
let enabled = false;

export function setMeterEnabled(on: boolean) {
  enabled = on;
}

/** Starts the audio context; call it from a click. */
export function primeMeter() {
  if (!enabled) return;
  try {
    if (!context) {
      context = new AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      // Room above a loud voice, so the bars do not all sit at the top.
      analyser.minDecibels = -90;
      analyser.maxDecibels = -12;
      analyser.connect(context.destination);
    }
    if (context.state === "suspended") void context.resume();
  } catch {
    context = null;
    analyser = null;
  }
}

/** Routes an audio element through the analyser, when it can be heard that way. */
export function meterAudio(element: HTMLMediaElement) {
  if (!enabled || !context || !analyser || context.state !== "running") return;
  try {
    context.createMediaElementSource(element).connect(analyser);
    current = element;
  } catch {
    // Already routed, or refused: it plays as before, without the visualizer.
  }
}

/** The analyser while it is in use, with the volume of the element it hears. */
export function meterReading() {
  if (!analyser || !context || context.state !== "running" || !current) return null;
  return { analyser, volume: current.volume };
}
