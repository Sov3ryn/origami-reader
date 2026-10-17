import type { Page } from "@playwright/test";

const dayScenes = [
  "Spring morning",
  "Summer day",
  "Autumn day",
  "Winter daylight",
];

// Season tiles show the current time of day, so pick day or night first.
export async function chooseScene(page: Page, name: string) {
  if (name !== "None" && name !== "Paper hills") {
    const time = page.getByRole("button", {
      name: dayScenes.includes(name) ? "Day scene" : "Night scene",
      exact: true,
    });
    if (await time.isEnabled()) await time.click();
  }
  await page.getByRole("button", { name, exact: true }).click();
}
