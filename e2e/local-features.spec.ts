import { expect, test } from "@playwright/test";

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
      proof: { calls: { command: string; args: Record<string, unknown> }[] };
    };
    target.isTauri = true;
    target.proof = { calls: [] };
    const load = () =>
      JSON.parse(
        localStorage.getItem("local-feature-fixture") ||
          '{"books":{},"settings":{"autoGenerateVoicePortraits":false}}',
      );
    const save = (value: unknown) =>
      localStorage.setItem("local-feature-fixture", JSON.stringify(value));
    const voices = [
      {
        id: "en1",
        name: "English voice",
        languages: ["English"],
        available: true,
      },
      {
        id: "fr1",
        name: "French voice one",
        languages: ["French"],
        available: true,
      },
      {
        id: "fr2",
        name: "French voice two",
        languages: ["French"],
        available: true,
      },
      {
        id: "fr-off",
        name: "Unavailable French",
        languages: ["French"],
        available: false,
      },
    ].map((v) => ({
      ...v,
      description: "Test voice",
      engine: "Test",
      gender: "unspecified",
      styles: ["Narration"],
      accent: "",
    }));
    target.__TAURI_INTERNALS__ = {
      invoke: async (command, args = {}) => {
        target.proof.calls.push({ command, args });
        const state = load();
        switch (command) {
          case "list_books":
            return Object.values(state.books).map(
              (b) => (b as { meta: unknown }).meta,
            );
          case "read_book":
            return state.books[String(args.id)];
          case "save_book": {
            const b = args.book as { meta: { id: string } };
            state.books[b.meta.id] = b;
            save(state);
            return;
          }
          case "save_meta": {
            const m = args.meta as { id: string };
            state.books[m.id].meta = m;
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
            return voices;
          case "cover_engine_status":
            return { installed: true, name: "Test cover engine" };
          case "prepare_voice":
          case "cancel_speech":
          case "cancel_cover":
            return;
          case "generate_cover": {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const c = document.createElement("canvas");
            c.width = 16;
            c.height = 24;
            const ctx = c.getContext("2d")!;
            ctx.fillStyle = "#735b95";
            ctx.fillRect(0, 0, 16, 24);
            return c.toDataURL("image/png");
          }
          default:
            throw new Error("Unexpected test command: " + command);
        }
      },
    };
  });
});

test("missing covers generate automatically, can be disabled, and can be regenerated manually", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "Automatic cover.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("A paper crane rested beside the blue lake."),
  });
  const card = page
    .locator(".book-card")
    .filter({ hasText: "Automatic cover" });
  await expect(card.locator(".cover")).toHaveClass(/cover-image/);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const auto = page.getByLabel("Generate missing covers automatically", {
    exact: true,
  });
  await expect(auto).toBeChecked();
  await auto.uncheck();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "Manual cover.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("An old tree stood beside the warm cottage."),
  });
  const manual = page.locator(".book-card").filter({ hasText: "Manual cover" });
  await expect(manual).toBeVisible();
  await expect(manual.locator(".cover")).not.toHaveClass(/cover-image/);
  await manual.locator(".cover-control").hover();
  await manual.getByRole("button", { name: /Change cover/ }).click();
  await page
    .getByRole("button", { name: "Generate cover", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Regenerate cover", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Regenerate cover", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Regenerate cover", exact: true }),
  ).toBeEnabled();
  const calls = await page.evaluate(() =>
    (
      window as unknown as {
        proof: { calls: { command: string; args: { seed: number } }[] };
      }
    ).proof.calls.filter((c) => c.command === "generate_cover"),
  );
  expect(calls).toHaveLength(3);
  expect(new Set(calls.map((c) => c.args.seed)).size).toBe(3);
  await page.getByRole("button", { name: "Close cover editor" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(auto).not.toBeChecked();
});

test("mature covers require an opt-in, persist the choice, and remain disabled for starter books", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const setting = page.getByLabel("Allow mature cover artwork (NSFW)", {
    exact: true,
  });
  await expect(setting).not.toBeChecked();
  await page
    .getByLabel("Generate missing covers automatically", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "User cover mode.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "A paper crane on a lake shore, with a cottage in the distance.",
    ),
  });
  const card = page
    .locator(".book-card")
    .filter({ hasText: "User cover mode" });
  await card.locator(".cover-control").hover();
  await card.getByRole("button", { name: /Change cover/ }).click();
  await expect(setting).not.toBeChecked();
  await page
    .getByLabel("Cover description")
    .fill("A pine forest with a stone tower.");
  await page
    .getByRole("button", { name: "Generate cover", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Regenerate cover", exact: true }),
  ).toBeEnabled();
  await setting.check();
  await page
    .getByRole("button", { name: "Regenerate cover", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Regenerate cover", exact: true }),
  ).toBeEnabled();
  const calls = await page.evaluate(() =>
    (
      window as unknown as {
        proof: {
          calls: {
            command: string;
            args: { allowMature: boolean; bookId: string };
          }[];
        };
      }
    ).proof.calls.filter((call) => call.command === "generate_cover"),
  );
  expect(calls.map((call) => call.args.allowMature)).toEqual([false, true]);
  expect(calls.every((call) => call.args.bookId)).toBe(true);
  const size = await page
    .locator(".cover-dialog .cover")
    .evaluate(async (el) => {
      const src = (el as HTMLElement).style.backgroundImage.match(
        /url\("([^"]+)"\)/,
      )![1];
      const image = new Image();
      image.src = src;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    });
  expect(size).toEqual([320, 448]);
  await page
    .getByRole("button", { name: "Close cover editor", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(setting).toBeChecked();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  const starter = page
    .locator(".book-card")
    .filter({ hasText: "The Atlas of Quiet Places" });
  await starter.locator(".cover-control").hover();
  await starter.getByRole("button", { name: /Change cover/ }).click();
  await expect(setting).not.toBeChecked();
  await expect(setting).toBeDisabled();
  await expect(
    page.getByText("Starter-library covers always use standard mode.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate cover", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Regenerate cover", exact: true }),
  ).toBeEnabled();
  const latest = await page.evaluate(
    () =>
      (
        window as unknown as {
          proof: {
            calls: { command: string; args: { allowMature: boolean } }[];
          };
        }
      ).proof.calls
        .filter((call) => call.command === "generate_cover")
        .at(-1)!.args.allowMature,
  );
  expect(latest).toBe(false);
});

test("a default voice choice also updates an open document with its own saved voice", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open book/ }).click();
  await page.locator(".voice-link").click();
  await page
    .getByLabel("Voice language", { exact: true })
    .selectOption("French");
  await page
    .getByRole("button", { name: "Use French voice one", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Voices", exact: true }).click();
  await page
    .getByRole("main")
    .getByLabel("Voice language", { exact: true })
    .selectOption("English");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Use English voice", exact: true })
    .click();
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("local-feature-fixture")!).books[
        "sample-0"
      ].meta.voice,
  );
  expect(stored).toBe("en1");
});

test("startup randomization uses the selected language and selection unloads without preloading", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Startup voice language", { exact: true })
    .selectOption("French");
  await page.getByLabel("Randomize voice at startup", { exact: true }).check();
  await page.waitForTimeout(150);
  await page.reload();
  await page.getByRole("button", { name: "Voices", exact: true }).click();
  await expect(page.locator(".voice-card.chosen")).toContainText(
    /French voice/,
  );
  const before = await page.evaluate(
    () =>
      (
        window as unknown as { proof: { calls: { command: string }[] } }
      ).proof.calls.filter((c) => c.command === "prepare_voice").length,
  );
  const current = await page.locator(".voice-card.chosen strong").textContent();
  const other =
    current === "French voice one" ? "French voice two" : "French voice one";
  await page.getByRole("button", { name: "Use " + other, exact: true }).click();
  await expect(page.locator(".voice-card.chosen")).toContainText(other);
  const after = await page.evaluate(
    () =>
      (window as unknown as { proof: { calls: { command: string }[] } }).proof
        .calls,
  );
  expect(after.filter((c) => c.command === "cancel_speech")).toHaveLength(1);
  expect(after.filter((c) => c.command === "prepare_voice")).toHaveLength(
    before,
  );
  expect(after.filter((c) => c.command === "synthesize")).toHaveLength(0);
});
