import type { Page } from "@playwright/test";

// Opens every collapsed group on screen (inspector tabs and Settings pages
// fold less-used controls away).
export async function expandSections(page: Page) {
  const closed = page
    .locator(".panel-section-heading button[aria-expanded='false']")
    .filter({ visible: true });
  for (let guard = 0; guard < 30 && (await closed.count()); guard++)
    await closed.first().click();
}

// Opens one group by its title.
export async function openSection(page: Page, title: string) {
  const heading = page
    .locator(".panel-section-heading button")
    .filter({ hasText: title, visible: true })
    .first();
  if ((await heading.getAttribute("aria-expanded")) === "false")
    await heading.click();
}

// Opens Settings on one category.
export async function openSettings(page: Page, category: string) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: category, exact: true })
    .click();
}

// Picks a reading mode in the Reading comfort (Aa) menu and closes it.
export async function readingMode(page: Page, name: string) {
  await page.getByRole("button", { name: "Reading comfort", exact: true }).click();
  await page
    .locator(".reading-layouts")
    .getByRole("button", { name, exact: true })
    .click();
  await page.keyboard.press("Escape");
}
