// A soft paper sound for page turns, made on the fly: filtered noise with a
// quick swell and a softer tail, slightly different every time. No audio file.
let context: AudioContext | null = null;

export function playPageTurn(volume = 0.12) {
  try {
    context ??= new AudioContext();
    const ctx = context;
    if (ctx.state === "suspended") void ctx.resume();
    const length = 0.42;
    const buffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * length),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    // Brown-ish noise with a few crackles, like paper fibres.
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      const crackle = Math.random() < 0.0016 ? (Math.random() - 0.5) * 0.9 : 0;
      data[i] = last * 3.2 + white * 0.08 + crackle;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1700 + Math.random() * 700;
    band.Q.value = 0.6;
    const air = ctx.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 4200;
    air.gain.value = 5;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(volume * 0.35, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    source.connect(band).connect(air).connect(gain).connect(ctx.destination);
    source.start(now);
    source.stop(now + length);
  } catch {
    /* Sound is a nicety; silence is fine. */
  }
}
