import type { Page } from "@playwright/test";

const dayScenes = [
  "Spring morning",
  "Summer day",
  "Autumn day",
  "Winter daylight",
];

// Opens the Scene and colors window from the visible appearance panel.
export async function openGallery(page: Page) {
  if (await page.locator(".theme-gallery").isVisible()) return;
  await page.locator(".gallery-button").filter({ visible: true }).first().click();
}
export async function closeGallery(page: Page) {
  await page
    .locator(".theme-gallery")
    .getByRole("button", { name: "Close", exact: true })
    .click();
}
// Picks a scene in the window and closes it again.
export async function pickScene(page: Page, name: string) {
  await openGallery(page);
  await page
    .locator(".theme-gallery")
    .getByRole("button", { name, exact: true })
    .click();
  await closeGallery(page);
}

// The Day or Night button is pressed first, as a reader switching scenes would.
export async function chooseScene(page: Page, name: string) {
  if (name !== "None" && name !== "Paper hills") {
    const time = page.getByRole("button", {
      name: dayScenes.includes(name) ? "Day scene" : "Night scene",
      exact: true,
    });
    if (await time.isEnabled()) await time.click();
  }
  await pickScene(page, name);
}
