import { expect, test } from "@playwright/test";
import { openSettings } from "./sections";

test("supporter controls fit Settings and reject unsuccessful activation visibly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).waitFor();
  await openSettings(page, "About and support");
  const panel = page.getByRole("region", { name: "Supporter key", exact: true });
  await panel.scrollIntoViewIfNeeded();
  const activate = panel.getByRole("button", { name: "Activate supporter key", exact: true });
  await expect(activate).toBeDisabled();
  await panel.getByRole("textbox", { name: "Supporter key", exact: true }).fill("invalid-key");
  await activate.click();
  await expect(panel.getByRole("alert")).toContainText("Could not activate");
  await expect(activate).toBeEnabled();
  await expect(panel.getByRole("button", { name: "Import supporter key", exact: true })).toBeVisible();
  await page.screenshot({ path: "../work/supporter-unlocks/settings-preview.png" });
});
