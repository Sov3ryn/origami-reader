import { expect, test } from "@playwright/test";

test("ambient controls preserve opacity, pause motion and keep reading opaque", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  const opacity = page.getByRole("slider", {
    name: "Background opacity",
    exact: true,
  });
  await opacity.fill("63");
  await expect(page.locator(".background-art")).toHaveCSS("opacity", "0.63");
  await expect(page.locator(".sidebar")).toHaveCSS("opacity", "1");
  await expect(
    page.getByLabel("Subtle background motion", { exact: true }),
  ).toBeChecked();
  await expect(page.locator(".ambient-layer")).toHaveCount(21);
  await expect(page.locator(".ambient-petal")).toHaveCount(12);

  const petal = page.locator(".ambient-petal").first();
  const firstTransform = await petal.evaluate(
    (node) => getComputedStyle(node).transform,
  );
  await expect
    .poll(() => petal.evaluate((node) => getComputedStyle(node).transform))
    .not.toBe(firstTransform);
  await expect(page.locator(".background-still")).toHaveCSS(
    "transform",
    "none",
  );
  await expect(page.locator(".background-still")).toHaveCSS(
    "animation-name",
    "none",
  );

  await page.getByLabel("Drifting mist", { exact: true }).uncheck();
  await expect(page.locator(".ambient-mist")).toHaveCount(0);
  const effects = [
    "Windblown petals",
    "Mountain fog",
    "Lake ripples",
    "Cabin lights",
    "Cloud across the moon",
  ];
  for (const name of effects)
    await page.getByLabel(name, { exact: true }).uncheck();
  await expect(page.locator(".ambient-effects")).toHaveCount(0);
  await page.getByLabel("Drifting mist", { exact: true }).check();
  for (const name of effects)
    await page.getByLabel(name, { exact: true }).check();

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(petal).toHaveCSS("animation-play-state", "paused");
  expect(
    await page
      .locator(".background-art")
      .evaluate((el) =>
        el
          .getAnimations({ subtree: true })
          .every((a) => a.playState === "paused"),
      ),
  ).toBe(true);
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(petal).toHaveCSS("animation-play-state", "running");

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const effect of await page.locator(".ambient-effects").all())
    await expect(effect).toBeHidden();
  await expect(petal).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const effect of await page.locator(".ambient-effects").all())
    await expect(effect).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expect(opacity).toHaveValue("63");
  await expect(
    page.getByLabel("Subtle background motion", { exact: true }),
  ).toBeChecked();
  await expect(page.locator(".ambient-layer")).toHaveCount(21);
  await page.screenshot({
    path: "test-results/ambient-background.png",
    fullPage: true,
  });

  await opacity.fill("0");
  await expect(page.locator(".background-art")).toHaveCount(0);
  await opacity.fill("63");
  await page.getByRole("button", { name: "Paper hills", exact: true }).click();
  await expect(page.locator(".ambient-layer")).toHaveCount(0);
  await expect(
    page.getByLabel("Subtle background motion", { exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".background-art")).toHaveCSS("opacity", "0.63");
  await page.getByRole("button", { name: "None", exact: true }).click();
  await expect(page.locator(".background-art")).toHaveCount(0);
  await expect(opacity).toBeDisabled();
});

test("library uses the full workspace and thumbnail previews survive hover", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".inspector")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Expand inspector", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Open book/ }).click();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expect(page.locator(".inspector")).toBeVisible();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await expect(page.locator(".inspector")).toHaveCount(0);
  await expect(
    page.getByRole("separator", { name: "Resize inspector", exact: true }),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".app")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--right-width")),
  ).toBe("0px");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".inspector")).toHaveCount(0);
  const thumbnail = page.locator(".preview-lake");
  const before = await thumbnail.evaluate(
    (el) => getComputedStyle(el).backgroundImage,
  );
  expect(before).toContain("moonlit-lake.png");
  await page.getByRole("button", { name: "Paper hills", exact: true }).click();
  const lake = page.getByRole("button", { name: "Moonlit lake", exact: true });
  await lake.hover();
  await expect(thumbnail).toHaveCSS("background-image", before);
  await expect(lake).toHaveCSS("outline-style", "solid");
  await lake.click();
  await expect(lake).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Open book/ }).click();
  await expect(page.locator(".inspector")).toBeVisible();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.locator(".voice-link").click();
  await expect(page.locator(".reading-page")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Voice", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("reader page width persists and fits narrow and wide windows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/");
  await page.getByRole("button", { name: /Open book/ }).click();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  const paper = page.locator(".reading-page");
  const width = page.getByRole("slider", { name: "Page width", exact: true });
  await expect(paper).toHaveCSS("width", "850px");
  await width.fill("1500");
  await expect(paper).toHaveCSS("width", "1500px");
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole("button", { name: /Open book/ }).click();
  await expect(width).toHaveValue("1500");
  await expect(paper).toHaveCSS("width", "1500px");
  await page.getByLabel("Use full reading width", { exact: true }).check();
  expect((await paper.boundingBox())!.width).toBeGreaterThan(1900);
  await expect(width).toBeDisabled();
  await page.screenshot({
    path: "test-results/reader-wide.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1100, height: 800 });
  expect(
    await page
      .locator(".reading-scroll")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByLabel("Use full reading width", { exact: true }).uncheck();
  expect(
    await page
      .locator(".reading-scroll")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("lake overlays stay registered to the artwork and petals drift left", async ({
  page,
}) => {
  await page.goto("/");
  for (const viewport of [
    { width: 1480, height: 950 },
    { width: 2560, height: 1080 },
    { width: 1000, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const stage = (await page.locator(".lake-stage").boundingBox())!;
    const glow = (await page.locator(".cabin-light").boundingBox())!;
    expect(stage.width / stage.height).toBeCloseTo(1672 / 941, 4);
    expect(stage.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(stage.height).toBeGreaterThanOrEqual(viewport.height - 1);
    expect((glow.x + glow.width / 2 - stage.x) / stage.width).toBeCloseTo(
      0.7995,
      3,
    );
    expect((glow.y + glow.height / 2 - stage.y) / stage.height).toBeCloseTo(
      0.4505,
      3,
    );
  }
  const movement = await page.locator(".ambient-petal").evaluateAll((els) =>
    els.map((el) => {
      const animation = el.getAnimations()[0];
      animation.pause();
      animation.effect!.updateTiming({ delay: 0 });
      const duration = Number(animation.effect!.getTiming().duration);
      animation.currentTime = duration * 0.3;
      const first = new DOMMatrix(getComputedStyle(el).transform).m41;
      animation.currentTime = duration * 0.6;
      const second = new DOMMatrix(getComputedStyle(el).transform).m41;
      return second < first;
    }),
  );
  expect(movement.every(Boolean)).toBe(true);
});
