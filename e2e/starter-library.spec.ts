import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(
  readFileSync(
    join(process.cwd(), "assets", "starter-library", "manifest.json"),
    "utf8",
  ),
) as { books: { title: string; filename: string }[] };

test("the complete six-book pack imports, persists and reaches the end of Monte Cristo", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles(
      manifest.books.map((book) =>
        join(
          process.cwd(),
          "assets",
          "starter-library",
          "books",
          book.filename,
        ),
      ),
    );
  for (const book of manifest.books) {
    await expect(
      page.getByRole("heading", { name: book.title, exact: true }),
    ).toBeVisible();
  }
  await page.reload();
  await page
    .locator(".book-open")
    .filter({ hasText: "The Count of Monte Cristo" })
    .click();
  await page.getByLabel("Search book", { exact: true }).fill("Wait and hope");
  const ending = page
    .locator(".chapters button")
    .filter({ hasText: "Wait and hope" })
    .last();
  await expect(ending).toBeVisible();
  await ending.click();
  await expect(page.locator(".reading-page")).toContainText("Wait and hope");
  await page.reload();
  await page
    .locator(".book-open")
    .filter({ hasText: "The Count of Monte Cristo" })
    .click();
  await expect(page.locator(".reading-page")).toContainText("Wait and hope");
});
