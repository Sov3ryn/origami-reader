import { expect, test } from "@playwright/test";
import { openSettings } from "./sections";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: {
        invoke: (
          command: string,
          args?: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      artProof: {
        calls: { command: string; args: Record<string, unknown> }[];
        active: number;
        maximum: number;
      };
    };
    target.isTauri = true;
    target.artProof = { calls: [], active: 0, maximum: 0 };
    const original = ["warm", "calm"].map((id, i) => ({
      id,
      name: i ? "Calm narrator" : "Warm narrator",
      description: "A fictional test voice",
      available: true,
      engine: "Test",
      gender: i ? "male" : "female",
      languages: ["English"],
      styles: [i ? "Calm" : "Warm"],
      accent: "",
    }));
    const load = () =>
      JSON.parse(
        localStorage.getItem("portrait-fixture") ||
          JSON.stringify({
            books: {},
            settings: { preloadAtStartup: false, autoGenerateCovers: false },
            voices: original,
            art: {},
          }),
      );
    const save = (data: unknown) =>
      localStorage.setItem("portrait-fixture", JSON.stringify(data));
    target.__TAURI_INTERNALS__ = {
      invoke: async (command, args = {}) => {
        target.artProof.calls.push({ command, args });
        const state = load();
        switch (command) {
          case "list_vaults":
            return [];
          case "parental_pin_status":
            return false;
          case "voice_studio_state":
            return { installed: false, busy: false, previews: [] };
          case "cancel_voice_design":
            return;
          case "purge_trash":
            return [];
          case "starter_library_installed":
            return state.startersInstalled || false;
          case "install_starter_library": {
            for (const book of args.books as {
              meta: { id: string };
              paragraphs: unknown[];
            }[])
              state.books[book.meta.id] ??= {
                ...book,
                paragraphs: book.paragraphs.slice(0, 20),
              };
            state.startersInstalled = true;
            save(state);
            return;
          }
          case "list_books":
            return Object.values(state.books).map(
              (b) => (b as { meta: unknown }).meta,
            );
          case "read_book":
            return state.books[String(args.id)];
          case "save_book": {
            const book = args.book as { meta: { id: string } };
            state.books[book.meta.id] = book;
            save(state);
            return;
          }
          case "save_meta": {
            const meta = args.meta as { id: string };
            state.books[meta.id].meta = meta;
            save(state);
            return;
          }
          case "read_settings":
            return state.settings;
          case "save_settings":
            state.settings = args.settings;
            save(state);
            return;
          case "list_annotations":
            return [];
          case "list_voices":
            return state.voices.map((v: { id: string }) => ({
              ...v,
              ...state.art[v.id],
            }));
          case "cover_engine_status":
            return { installed: true, name: "Test images" };
          case "cancel_cover":
          case "cancel_speech":
          case "prepare_voice":
            return;
          case "generate_cover":
          case "generate_voice_portrait": {
            target.artProof.active++;
            target.artProof.maximum = Math.max(
              target.artProof.maximum,
              target.artProof.active,
            );
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                Number(localStorage.getItem("image-delay") || 150),
              ),
            );
            target.artProof.active--;
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#766083";
            ctx.fillRect(0, 0, 256, 256);
            return canvas.toDataURL("image/png");
          }
          case "save_voice_portrait": {
            const current = load();
            current.art[String(args.voice)] = {
              portrait: args.portrait,
              portraitPrompt: args.prompt,
              portraitOrigin: args.origin,
            };
            save(current);
            return;
          }
          default:
            throw new Error("Unexpected command: " + command);
        }
      },
    };
  });
});

test("missing and newly imported profiles get small portraits, persist, and share one serial image queue", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  expect(
    await page.evaluate(
      () =>
        (window as any).artProof.calls.filter(
          (c: any) => c.command === "generate_voice_portrait",
        ).length,
    ),
  ).toBe(0);
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Voices", exact: true })
    .click();
  await expect(page.locator(".voice-card .voice-portrait img")).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).artProof.maximum)).toBe(1);
  expect(
    await page
      .locator(".voice-portrait img")
      .first()
      .evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]),
  ).toEqual([256, 256]);
  await page
    .getByRole("button", { name: "Select voice: Warm narrator", exact: true })
    .click();
  await expect(
    page.locator(".voice-card").filter({ hasText: "Warm narrator" }),
  ).toHaveClass(/chosen/);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("portrait-fixture")!);
    state.voices.push({
      ...state.voices[0],
      id: "new",
      name: "New imported voice",
    });
    localStorage.setItem("portrait-fixture", JSON.stringify(state));
  });
  await page
    .getByRole("button", { name: "Refresh voices", exact: true })
    .click();
  await expect(page.locator(".voice-card .voice-portrait img")).toHaveCount(3);
  await page.reload();
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Voices", exact: true })
    .click();
  await expect(page.locator(".voice-card .voice-portrait img")).toHaveCount(3);
  expect(
    await page.evaluate(
      () =>
        (window as any).artProof.calls.filter(
          (c: any) => c.command === "generate_voice_portrait",
        ).length,
    ),
  ).toBe(0);
  expect(
    (await new AxeBuilder({ page }).include(".voice-catalog").analyze())
      .violations,
  ).toEqual([]);
});

test("automatic portraits can be disabled, manually generated, edited and replaced without being overwritten", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page, "Cover art");
  const automatic = page.getByLabel(
    "Generate missing voice portraits automatically",
    { exact: true },
  );
  await expect(automatic).toBeChecked();
  await automatic.uncheck();
  await page.reload();
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Voices", exact: true })
    .click();
  await expect(page.locator(".voice-portrait img")).toHaveCount(0);
  const edit = page.getByRole("button", {
    name: "Change portrait for Warm narrator",
    exact: true,
  });
  await edit.click();
  await page
    .getByLabel("Portrait description")
    .fill("Adult woman in a purple wool jacket");
  await page
    .getByRole("button", { name: "Generate portrait", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Regenerate portrait", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Portrait description")).toHaveValue(
    "Adult woman in a purple wool jacket",
  );
  const calls = await page.evaluate(() =>
    (window as any).artProof.calls.filter(
      (c: any) => c.command === "generate_voice_portrait",
    ),
  );
  expect(calls[0].args).toMatchObject({
    voice: "warm",
    prompt: "Adult woman in a purple wool jacket",
  });
  expect(calls[0].args).not.toHaveProperty("allowMature");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 10;
    c.height = 10;
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Voice portrait image file").setInputFiles({
    name: "chosen.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("portrait-fixture")!).art.warm
            .portraitOrigin,
      ),
    )
    .toBe("custom");
  await page.getByRole("button", { name: "Close portrait editor" }).click();
  await expect(edit).toBeFocused();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await automatic.check();
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Voices", exact: true })
    .click();
  await expect(page.locator(".voice-portrait img")).toHaveCount(2);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("portrait-fixture")!).art.warm
          .portraitOrigin,
    ),
  ).toBe("custom");
  await edit.click();
  await page.getByRole("button", { name: "Close portrait editor" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Regenerate portrait", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close portrait editor" }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("cancelled portrait results are discarded and do not loop automatically", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("image-delay", "800"));
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Voices", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Generating portrait" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Change portrait for Warm narrator",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Cancel generation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate portrait", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("portrait-fixture") || "{}").art || {},
    ),
  ).toEqual({});
  expect(
    await page.evaluate(
      () =>
        (window as any).artProof.calls.filter(
          (c: any) => c.command === "generate_voice_portrait",
        ).length,
    ),
  ).toBe(1);
});
