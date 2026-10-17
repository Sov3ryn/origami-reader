import { expect, test } from "@playwright/test";

// A plain text file with no metadata: only the opening lines of the book.
const text = [
  "FRANKENSTEIN;",
  "or, the Modern Prometheus",
  "by Mary Wollstonecraft (Godwin) Shelley",
  "Letter 1",
  "You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings. I arrived here yesterday, and my first task is to assure my dear sister of my welfare and increasing confidence in the success of my undertaking.",
  "I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.",
].join("\n\n");

test("a bare text file gets its title, author and an author note offline", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "pg84.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });
  const card = page
    .locator(".book-card")
    .filter({ hasText: "Frankenstein; or, the Modern Prometheus" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Mary Wollstonecraft Shelley");
  await expect(card.locator(".book-flag[title=English]")).toBeVisible();

  await card.locator(".book-open").click();
  await page.locator("[data-paragraph]").first().waitFor();
  const expand = page.getByRole("button", {
    name: "Expand inspector",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  const about = page
    .locator(".author-note")
    .filter({ hasText: "Mary Shelley" });
  await expect(about).toBeVisible({ timeout: 20_000 });
  await expect(about).toContainText("1797-1851");
  await expect(about).toContainText("Frankenstein");
  await expect(about).toContainText("From Wikidata");
});
