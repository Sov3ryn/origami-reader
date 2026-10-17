import { expect, test } from "@playwright/test";
import { openSection } from "./sections";

test("library view options persist, bookmark chips open the book there, and the text menu changes the page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.evaluate(async () => {
    const storage = "/src/storage.ts";
    const { saveAnnotation } = await import(storage);
    await saveAnnotation({
      id: "chip-test",
      bookId: "starter-dracula",
      paragraphId: "p-40",
      start: 0,
      end: 12,
      quote: "Chip test passage",
      kind: "bookmark",
      color: "blue",
      text: "",
      group: "",
      created: Date.now(),
    });
  });
  await page.reload();
  const grid = page.locator(".book-grid");
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await page.getByLabel("Card size", { exact: true }).fill("4");
  await expect(grid).toHaveAttribute("data-card-size", "130");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByLabel("Compact list", { exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(grid).toHaveClass(/list-view/);
  await expect(grid).toHaveClass(/compact/);
  await page.reload();
  await expect(page.locator(".book-grid")).toHaveClass(/compact/);
  await expect(page.locator(".book-grid")).toHaveAttribute(
    "data-card-size",
    "130",
  );

  await page
    .getByRole("button", { name: "Open bookmark: Chip test passage" })
    .click();
  await expect(page.locator('[data-paragraph="p-40"]')).toBeVisible();
  await expect(page.locator(".side-bookmarks")).toContainText(
    "Chip test passage",
  );

  await page
    .getByRole("button", { name: "Reading comfort", exact: true })
    .click();
  // A preset sets every comfort option, so choose it before adjusting.
  await page.getByRole("button", { name: /Easier reading/ }).click();
  await page
    .getByRole("button", { name: "High contrast", exact: true })
    .click();
  await openSection(page, "Paper");
  await page.getByRole("button", { name: "Sepia", exact: true }).click();
  const reading = page.locator(".reading-page").first();
  await expect(reading).toHaveClass(/surface-parchment/);
  await expect(reading).toHaveClass(/tone-contrast/);
  await expect(page.locator(".app")).toHaveCSS("--reader-font", /OpenDyslexic/);
});
