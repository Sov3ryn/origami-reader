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
  await page.getByLabel("Subtle background motion", { exact: true }).check();
  await expect(page.locator(".ambient-layer")).toHaveCount(8);

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
  await page.getByLabel("Falling petals", { exact: true }).uncheck();
  await expect(page.locator(".ambient-effects")).toHaveCount(0);
  await page.getByLabel("Drifting mist", { exact: true }).check();
  await page.getByLabel("Falling petals", { exact: true }).check();

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(petal).toHaveCSS("animation-play-state", "paused");
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(petal).toHaveCSS("animation-play-state", "running");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".ambient-effects")).toBeHidden();
  await expect(petal).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".ambient-effects")).toBeVisible();
  await page.reload();
  await expect(opacity).toHaveValue("63");
  await expect(
    page.getByLabel("Subtle background motion", { exact: true }),
  ).toBeChecked();
  await expect(page.locator(".ambient-layer")).toHaveCount(8);
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
