import { expect, test } from "@playwright/test";

// Two finished takes in the voice designer. Each one's play button should
// play that take, without selecting the row first.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as unknown as {
      isTauri: boolean;
      takeAudio: Record<string, string>;
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    // A short silent WAV, a different length for each take.
    const wav = (seconds: number) => {
      const rate = 8000;
      const count = rate * seconds;
      const view = new DataView(new ArrayBuffer(44 + count));
      const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
      text(0, "RIFF");
      view.setUint32(4, 36 + count, true);
      text(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate, true);
      view.setUint16(32, 1, true);
      view.setUint16(34, 8, true);
      text(36, "data");
      view.setUint32(40, count, true);
      for (let i = 0; i < count; i++) view.setUint8(44 + i, 128);
      let binary = "";
      new Uint8Array(view.buffer).forEach((b) => (binary += String.fromCharCode(b)));
      return "data:audio/wav;base64," + btoa(binary);
    };
    target.isTauri = true;
    target.takeAudio = { one: wav(3), two: wav(4) };
    const spec = {
      name: "Test voice",
      prompt: "A calm test voice",
      text: "A short test passage.",
      language: "English",
      gender: "unspecified",
      accent: "",
      style: "",
      portrait: "",
      temperature: 0.9,
      seed: 1,
      count: 2,
    };
    const previews = ["one", "two"].map((id, i) => ({
      id,
      createdAt: 0,
      spec,
      seed: i + 1,
      duration: 3 + i,
      rate: 8000,
      peaks: [0.4, 0.6, 0.5],
      take: i + 1,
      favorite: false,
      notes: "",
      savedVoice: null,
    }));
    target.__TAURI_INTERNALS__ = {
      invoke: async (command, args = {}) => {
        switch (command) {
          case "voice_studio_state":
            return { installed: true, busy: false, previews };
          case "voice_preview_audio":
            // Loading takes a moment, as reading the file does in the app.
            await new Promise((resolve) => setTimeout(resolve, 200));
            return target.takeAudio[String(args.id)];
          case "read_settings":
            return { preloadAtStartup: false, autoGenerateCovers: false };
          case "speech_models":
            return { models: [], default: "" };
          case "starter_library_installed":
            return true;
          case "purge_trash":
            return [];
          case "parental_pin_status":
            return false;
          default:
            return command.includes("list") ? [] : null;
        }
      },
    };
  });
});

test("each take's play button plays that take", async ({ page }) => {
  await page.goto("/");
  await page.locator(".main-nav").getByRole("button", { name: "Voices", exact: true }).click();
  await page.getByRole("tab", { name: "Create a voice" }).click();
  const audio = page.locator(".studio-review audio");
  const playing = () =>
    audio.evaluate((a: HTMLAudioElement) => ({ src: a.src, paused: a.paused }));
  const sources = await page.evaluate(() => (window as any).takeAudio);

  await page.getByRole("button", { name: "Play Test voice 1", exact: true }).click();
  await expect.poll(playing).toEqual({ src: sources.one, paused: false });

  await page.getByRole("button", { name: "Play Test voice 2", exact: true }).click();
  await expect.poll(playing).toEqual({ src: sources.two, paused: false });

  // Back to the first take, and pausing from its own button.
  await page.getByRole("button", { name: "Play Test voice 1", exact: true }).click();
  await expect.poll(playing).toEqual({ src: sources.one, paused: false });
  await page.getByRole("button", { name: "Play Test voice 1", exact: true }).click();
  await expect.poll(playing).toEqual({ src: sources.one, paused: true });
});
