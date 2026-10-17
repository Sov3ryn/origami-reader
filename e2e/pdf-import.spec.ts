import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

const fixtures = "e2e/fixtures/";

test("PDF import rebuilds chapters and paragraphs without headers or page numbers", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles(fixtures + "quiet-lake.pdf");
  const card = page.locator(".book-card").filter({ hasText: "The Quiet Lake" });
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card).toContainText("Mara Field");
  await expect(card).toContainText("PDF");
  await card.locator(".book-open").click();
  const pages = page.locator(".reading-pages");
  await expect(pages).toContainText("Chapter 1");
  await expect(pages).toContainText("The mist rose slowly over the water");
  // One paragraph per printed paragraph, with no running header inside.
  const texts = await page.locator("[data-paragraph]").allTextContents();
  expect(texts.some((t) => t.includes("THE QUIET LAKE"))).toBe(false);
  expect(texts.some((t) => /^\s*\d+\s*$/.test(t))).toBe(false);
  expect(texts.filter((t) => t.startsWith("The mist rose"))).toHaveLength(12);
  await expect(page.locator(".toc-row")).toHaveCount(3);
});

test("Korean PDF text is extracted in reading order", async ({ page }) => {
  test.skip(
    !existsSync(fixtures + "korean-lake.pdf"),
    "Generated locally by scripts/make-pdf-fixtures.py on Windows",
  );
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles(fixtures + "korean-lake.pdf");
  const card = page.locator(".book-card").filter({ hasText: "호수 이야기" });
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.locator(".book-open").click();
  const pages = page.locator(".reading-pages");
  await expect(pages).toContainText("제1장 호숫가");
  await expect(pages).toContainText(
    "그날 저녁 우리는 오래된 서재에 앉아 창밖으로 내리는 비를 바라보며",
  );
  await expect(pages).toContainText("다음 날 아침, 호수는 고요했다.");
});
