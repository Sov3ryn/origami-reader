import { test, expect } from "@playwright/test";
import { openSettings } from "./sections";
import { expandSections } from "./sections";
import { chooseScene, chooseTheme, closeGallery, openGallery, savedTheme } from "./scenes";

for (const scene of [
  {
    name: "Spring morning",
    id: "spring",
    layers: 33,
    particle: ".ambient-petal",
    count: 24,
  },
  {
    name: "Summer evening",
    id: "summer",
    layers: 23,
    particle: ".ambient-firefly",
    count: 16,
  },
  {
    name: "Autumn dusk",
    id: "autumn",
    layers: 32,
    particle: ".ambient-leaf",
    count: 24,
  },
  {
    name: "Winter daylight",
    id: "winter",
    layers: 50,
    particle: ".ambient-snow",
    count: 42,
  },
]) {
  test(`${scene.name} has optional effects and durable settings`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Appearance settings", exact: true })
      .click();
    await expandSections(page);
    await chooseScene(page, scene.name);
    await expect(page.locator(".background-art")).toHaveClass(
      "background-art background-" +
        scene.id +
        (scene.id === "spring" || scene.id === "winter"
          ? " time-day"
          : " time-night"),
    );
    await expect(page.locator(".ambient-options input")).toHaveCount(
      scene.id === "summer" ? 6 : 5,
    );
    await expect(page.locator(".ambient-layer:not(.fish-ring)")).toHaveCount(
      scene.layers,
    );
    await expect(page.locator(scene.particle)).toHaveCount(scene.count);
    const image = await page
      .locator(".background-still")
      .evaluate(async (el) => {
        const img = new Image();
        img.src = getComputedStyle(el).backgroundImage.slice(5, -2);
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
      });
    expect(image.width / image.height).toBeCloseTo(1672 / 941, 2);
    await page.getByLabel("Background opacity", { exact: true }).fill("58");
    await page.waitForTimeout(150);
    await page.reload();
    await page
      .getByRole("button", { name: "Appearance settings", exact: true })
      .click();
    await expandSections(page);
    await openGallery(page);
    await expect(
      page
        .locator(".theme-gallery")
        .getByRole("button", { name: scene.name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await closeGallery(page);
    await expect(page.locator(".background-art")).toHaveCSS("opacity", "0.58");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(
      await page
        .locator(".background-art")
        .evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .every((a) => a.playState === "paused"),
        ),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const effect of await page.locator(".ambient-effects").all())
      await expect(effect).toBeHidden();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const controls = await page.locator(".ambient-options input").all();
    for (const control of controls) await control.uncheck();
    await expect(page.locator(".ambient-layer")).toHaveCount(0);
    await expect(page.locator(".background-still")).toBeVisible();
    for (const control of controls) await control.check();
    await expect(page.locator(".ambient-layer:not(.fish-ring)")).toHaveCount(
      scene.layers,
    );
    await page
      .getByLabel("Subtle background motion", { exact: true })
      .uncheck();
    await expect(page.locator(".ambient-layer")).toHaveCount(0);
  });
}

test("startup voice preload can be disabled and remains off after reopening", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page, "Performance");
  const preload = page.getByLabel("Load the voice when Origami opens", {
    exact: true,
  });
  await expect(preload).toBeChecked();
  await preload.uncheck();
  await page.waitForTimeout(150);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(preload).not.toBeChecked();
});

test("each background restores its palette, opacity and effect switches across restarts", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await chooseScene(page, "Spring morning");
  await chooseTheme(page, "forest");
  await page.getByLabel("Background opacity", { exact: true }).fill("73");
  await page.getByLabel("Windblown petals", { exact: true }).uncheck();
  await chooseScene(page, "Winter daylight");
  await chooseTheme(page, "plum");
  await page.getByLabel("Background opacity", { exact: true }).fill("36");
  await page.getByLabel("Subtle background motion", { exact: true }).uncheck();
  await chooseScene(page, "Spring morning");
  await expect.poll(savedTheme(page)).toBe("forest");
  await expect(
    page.getByLabel("Background opacity", { exact: true }),
  ).toHaveValue("73");
  await expect(
    page.getByLabel("Subtle background motion", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Windblown petals", { exact: true }),
  ).not.toBeChecked();
  await expect(page.locator(".ambient-petal")).toHaveCount(0);
  await page.waitForTimeout(150);
  await page.reload();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await expect.poll(savedTheme(page)).toBe("forest");
  await chooseScene(page, "Winter daylight");
  await expect.poll(savedTheme(page)).toBe("plum");
  await expect(
    page.getByLabel("Background opacity", { exact: true }),
  ).toHaveValue("36");
  await expect(
    page.getByLabel("Subtle background motion", { exact: true }),
  ).not.toBeChecked();
  await expect(page.locator(".ambient-layer")).toHaveCount(0);
});
