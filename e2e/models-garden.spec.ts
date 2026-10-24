import { test, expect } from "@playwright/test";
import { openSettings, expandSections } from "./sections";
import { pickScene } from "./scenes";
test("garden profiles keep their location, settings and motion controls", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await pickScene(page, "Garden · Spring night");
  await expect(page.locator(".background-art")).toHaveClass(
    /background-garden-spring-night/,
  );
  await expect(page.locator(".garden-fountain")).toHaveCount(1);
  await page.getByRole("button", { name: "Day scene", exact: true }).click();
  await expect(page.locator(".background-art")).toHaveClass(
    /background-garden-spring-day/,
  );
  await page.getByLabel("Background opacity", { exact: true }).fill("72");
  await page.getByLabel("Bamboo fountain", { exact: true }).uncheck();
  await pickScene(page, "Garden · Summer day");
  await pickScene(page, "Garden · Spring day");
  await expect(
    page.getByLabel("Bamboo fountain", { exact: true }),
  ).not.toBeChecked();
  await expect(page.locator(".background-art")).toHaveCSS("opacity", "0.72");
  await page.screenshot({
    path: "../outputs/Origami-Model-Integration/garden-settings.png",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".garden-effects")).toBeHidden();
});
test("Models settings show tiers and honest download placeholders", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page, "Models");
  const manager = page.locator(".model-manager");
  await expect(manager.locator(".model-card")).toHaveCount(10);
  await expect(
    manager.getByRole("button", { name: "Download coming soon" }),
  ).toHaveCount(10);
  for (const button of await manager
    .getByRole("button", { name: "Download coming soon" })
    .all())
    await expect(button).toBeDisabled();
  await expect(manager).toContainText("Kitten and Kokoro use built-in voices");
  await expect(manager).toContainText("VoiceDesign");
  await page.screenshot({
    path: "../outputs/Origami-Model-Integration/model-settings.png",
    fullPage: true,
  });
});
