import { expect, test } from "@playwright/test";
import { expandSections } from "./sections";
import { chooseScene } from "./scenes";

test("scene defaults match the chosen palettes and surfaces, and opacity increases to the right", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  for (const [scene, theme, surface, opacity] of [
    ["Moonlit lake", "plum", "Night", "50"],
    ["Spring morning", "forest", "Sepia", "50"],
    ["Summer evening", "burgundy", "Sepia", "60"],
    ["Autumn dusk", "copper", "Sepia", "65"],
    ["Winter daylight", "white", "Paper", "85"],
  ]) {
    await chooseScene(page, scene);
    await expect(page.getByLabel("App theme", { exact: true })).toHaveValue(
      theme,
    );
    await expect(
      page.getByRole("button", { name: surface, exact: true }),
    ).toHaveClass("active");
    await expect(
      page.getByRole("slider", { name: "Background opacity", exact: true }),
    ).toHaveValue(opacity);
  }
  const opacity = page.getByRole("slider", {
    name: "Background opacity",
    exact: true,
  });
  await opacity.focus();
  await opacity.press("Home");
  await expect(opacity).toHaveValue("0");
  await expect(page.locator(".background-art")).toHaveCount(0);
  await opacity.press("ArrowRight");
  await expect(page.locator(".background-art")).toHaveCSS("opacity", "0.01");
  await opacity.press("End");
  await expect(page.locator(".background-art")).toHaveCSS("opacity", "1");
  await expect(opacity).toHaveCSS("direction", "ltr");
  await page
    .getByRole("button", { name: "Reset scene defaults", exact: true })
    .click();
  await expect(opacity).toHaveValue("85");
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await chooseScene(page, "Summer evening");
  await chooseScene(page, "Winter daylight");
  await expect(
    page.getByRole("button", { name: "Night", exact: true }),
  ).toHaveClass("active");
});

test("seasonal backgrounds change at local midnight and manual selection disables automation", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 7, 31, 12, 0) });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await page
    .getByLabel("Background selection", { exact: true })
    .selectOption("seasonal");
  await expect(page.locator(".background-summer")).toBeVisible();
  await page.clock.fastForward("12:00:01");
  await expect(page.locator(".background-autumn")).toBeVisible();
  await page.getByLabel("Seasons in", { exact: true }).selectOption("south");
  // Southern spring, still at night: the Moonlit lake.
  await expect(page.locator(".background-lake")).toBeVisible();
  await page.waitForTimeout(150);
  await page.reload();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await expect(
    page.getByLabel("Background selection", { exact: true }),
  ).toHaveValue("seasonal");
  await expect(page.getByLabel("Seasons in", { exact: true })).toHaveValue(
    "south",
  );
  await expect(page.locator(".background-lake")).toBeVisible();
  await chooseScene(page, "Moonlit lake");
  await expect(
    page.getByLabel("Background selection", { exact: true }),
  ).toHaveValue("manual");
  await page.clock.fastForward("24:00:01");
  await expect(page.locator(".background-lake")).toBeVisible();
});

test("random mode selects one different scene on each launch and keeps that scene while used", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await page
    .getByLabel("Background selection", { exact: true })
    .selectOption("random");
  await expect(page.locator(".background-lake")).toBeVisible();
  await page.waitForTimeout(150);
  let previous = "background-art background-lake time-night";
  for (let launch = 0; launch < 3; launch++) {
    await page.reload();
    await page
      .getByRole("button", { name: "Appearance settings", exact: true })
      .click();
    await expandSections(page);
    await expect(
      page.getByLabel("Background selection", { exact: true }),
    ).toHaveValue("random");
    const scene = await page.locator(".background-art").getAttribute("class");
    expect(scene).not.toBe(previous);
    expect(scene).toMatch(
      /background-(lake|spring|summer|autumn|winter)(-day|-night)? time-(day|night)$/,
    );
    await page
      .getByRole("slider", { name: "Text size", exact: true })
      .fill("24");
    await expect(page.locator(".background-art")).toHaveClass(scene!);
    await page.waitForTimeout(150);
    previous = scene!;
  }
});

test("fish rings occur at different open-water spots and stop when disabled, hidden or reduced", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await chooseScene(page, "Summer evening");
  await expect(page.locator(".fish-feeding")).toHaveCount(0);
  await page.clock.fastForward(23000);
  const rings = page.locator(".fish-ring");
  await expect(rings).toHaveCount(3);
  const first = await page.locator(".fish-feeding").getAttribute("style");
  const expansion = await rings.first().evaluate((el) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime = 2000;
    const start = el.getBoundingClientRect().width;
    animation.currentTime = 8000;
    const end = el.getBoundingClientRect().width;
    animation.currentTime = 10000;
    return { start, end, opacity: getComputedStyle(el).opacity };
  });
  expect(expansion.end).toBeGreaterThan(expansion.start);
  expect(expansion.opacity).toBe("0");
  await page.clock.fastForward(56000);
  await expect(page.locator(".fish-feeding")).not.toHaveAttribute(
    "style",
    first!,
  );
  const spot = await page.locator(".fish-feeding").evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    y: parseFloat((el as HTMLElement).style.top),
  }));
  expect(spot.x).toBeGreaterThanOrEqual(39);
  expect(spot.x).toBeLessThanOrEqual(87);
  expect(spot.y).toBeGreaterThanOrEqual(56);
  expect(spot.y).toBeLessThanOrEqual(77);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(rings).toHaveCount(0);
  await page.clock.fastForward(60000);
  await expect(rings).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Media-query change events arrive on the next browser rendering step.
  await page.waitForTimeout(100);
  await page.clock.fastForward(23000);
  await expect(rings).toHaveCount(3);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(60000);
  await expect(rings).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(23000);
  await expect(rings).toHaveCount(3);
  await page.getByLabel("Fish feeding ripples", { exact: true }).uncheck();
  await page.clock.fastForward(60000);
  await expect(rings).toHaveCount(0);
  await page.getByLabel("Fish feeding ripples", { exact: true }).check();
  await chooseScene(page, "Winter daylight");
  await page.clock.fastForward(60000);
  await expect(rings).toHaveCount(0);
});
