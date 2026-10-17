import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

test("book mode opens from the cover, turns pages and remembers the spread", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.getByRole("button", { name: "Reading comfort" }).click();
  await page.locator(".reading-layouts button", { hasText: "Book" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Open new books from the cover" }),
  ).toBeChecked();
  await page.keyboard.press("Escape");

  await page
    .locator(".book-card")
    .filter({ hasText: "Pride and Prejudice" })
    .locator(".book-open")
    .click();
  // The closed book, then the title page.
  await expect(page.locator(".book-stage.phase-closed")).toBeVisible();
  await expect(
    page.locator(".book-title-page h1", { hasText: "Pride and Prejudice" }),
  ).toBeVisible();
  // Then the first text spread, with page numbers below the book.
  const pages = page.locator(".book-bar-pages");
  await expect(pages).toHaveText(/^Pages? .* of \d+$|^\d+ pages$/, {
    timeout: 15000,
  });
  await expect(page.locator(".book-stage.phase-ready")).toBeVisible();

  await page.locator(".reading-scroll").focus();
  await page.keyboard.press("ArrowRight");
  await expect(pages).toHaveText(/^Pages 2 to 3 of \d+$/);
  await page.keyboard.press("ArrowRight");
  await expect(pages).toHaveText(/^Pages 4 to 5 of \d+$/);
  await page.keyboard.press("ArrowLeft");
  await expect(pages).toHaveText(/^Pages 2 to 3 of \d+$/);

  // The reader's menu works on book text.
  await page
    .locator(".book > .book-page.right .book-text")
    .click({ button: "right", position: { x: 40, y: 12 } });
  await expect(page.getByRole("menu", { name: "Paragraph" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Reopening goes straight back to the same spread, without the opening.
  await page.waitForTimeout(300);
  await page.reload();
  await page
    .locator(".book-card")
    .filter({ hasText: "Pride and Prejudice" })
    .locator(".book-open")
    .click()
    .catch(() => {});
  await expect(page.locator(".book-stage.phase-ready")).toBeVisible();
  await expect(pages).toHaveText(/^Pages 2 to 3 of \d+$/, { timeout: 15000 });
});

test("narrow windows keep the usual layout in book mode", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.getByRole("button", { name: "Reading comfort" }).click();
  await page.locator(".reading-layouts button", { hasText: "Book" }).click();
  await page.keyboard.press("Escape");
  await page
    .locator(".book-card")
    .filter({ hasText: "Dracula" })
    .locator(".book-open")
    .click();
  await expect(page.locator("[data-reading-page]").first()).toBeVisible();
  await expect(page.locator(".book-stage")).toHaveCount(0);
});

test("the book closes to its cover and opens again where the reader was", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.getByRole("button", { name: "Reading comfort" }).click();
  await page.locator(".reading-layouts button", { hasText: "Book" }).click();
  await page.keyboard.press("Escape");
  await page
    .locator(".book-card")
    .filter({ hasText: "Dracula" })
    .locator(".book-open")
    .click();
  const pages = page.locator(".book-bar-pages");
  await expect(page.locator(".book-stage.phase-ready")).toBeVisible({
    timeout: 15000,
  });
  await page.locator(".reading-scroll").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(pages).toHaveText(/^Pages 4 to 5 of \d+$/);

  await page.getByRole("button", { name: "Close the book" }).click();
  await expect(page.locator(".book-stage.phase-closed.held")).toBeVisible({
    timeout: 8000,
  });
  // It stays closed until asked.
  await page.waitForTimeout(1500);
  await expect(page.locator(".book-stage.phase-closed.held")).toBeVisible();

  await page.getByRole("button", { name: "Open the book" }).first().click();
  await expect(page.locator(".book-title-page")).toBeVisible();
  await expect(pages).toHaveText(/^Pages 4 to 5 of \d+$/, { timeout: 10000 });
});

test("start over resets a book to 0% and keeps its bookmarks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  const card = page.locator(".book-card").filter({ hasText: "The Moonstone" });
  await card.locator(".book-open").click();
  await page.locator("[data-paragraph]").first().waitFor();
  await page.getByRole("button", { name: "Bookmark current position" }).click();
  await page.locator(".reading-scroll").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  await page.locator(".back-library").click();
  // The book has been opened, so it can start over.
  page.once("dialog", (d) => d.accept());
  await card
    .getByRole("button", { name: "More options for The Moonstone" })
    .click();
  const startOver = page.getByRole("menuitem", { name: "Start over" });
  await expect(startOver).toBeEnabled();
  await startOver.click();
  await expect(
    page.getByText("The Moonstone starts from the beginning again."),
  ).toBeVisible();
  await expect(card.locator(".book-progress span")).toHaveText("0%");
  // The bookmark is still there.
  await expect(card.locator(".bookmark-chip")).toHaveCount(1);
});
