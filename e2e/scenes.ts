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

// Picks an app theme by id in the Color themes tab of the window.
export async function chooseTheme(page: Page, id: string) {
  const name = await page.evaluate(async (id) => {
    const { themes } = await import("/src/themes.ts");
    return themes.find((th) => th.id === id)!.name;
  }, id);
  await openGallery(page);
  const gallery = page.locator(".theme-gallery");
  await gallery.getByRole("tab", { name: "Color themes", exact: true }).click();
  await gallery.getByRole("button", { name }).click();
  await closeGallery(page);
}
// The app theme as saved, for expect.poll.
export function savedTheme(page: Page) {
  return () =>
    page.evaluate(async () => {
      const store = await import("/src/storage.ts");
      return (await store.readSettings()).theme;
    });
}
