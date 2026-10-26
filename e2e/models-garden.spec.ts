import { test, expect } from "@playwright/test";
import { openSettings, expandSections } from "./sections";
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
