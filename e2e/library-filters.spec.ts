import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("author editing creates or reuses a collection and filters persist with accurate counts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open book/ }).click();
  await page
    .getByRole("button", { name: "Expand inspector", exact: true })
    .click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  await page.getByLabel("Author name", { exact: true }).fill("A. Test Writer");
  await page
    .getByLabel("Create collection with author's name", { exact: true })
    .check();
  await page.getByRole("button", { name: "Save author", exact: true }).click();
  await expect(page.locator(".inspector")).toContainText("A. Test Writer");
  await page.getByLabel("Finished reading", { exact: true }).check();
  await page.locator(".back-library").click();
  await expect(
    page.locator(".collection-title").filter({ hasText: "A. Test Writer" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByLabel("Filter collections by author")
    .selectOption("A. Test Writer");
  await page.getByLabel("Filter collections by type").selectOption("Books");
  await page
    .getByLabel("Filter collections by reading status")
    .selectOption("finished");
  await expect(page.locator(".book-card")).toHaveCount(1);
  await expect(page.locator(".continue-section")).toHaveCount(0);
  await expect(
    page
      .locator(".collection-row")
      .filter({ hasText: "All books" })
      .locator(".count"),
  ).toHaveText("1");
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByLabel("Filter collections by author")).toHaveValue(
    "A. Test Writer",
  );
  await page
    .getByLabel("Filter collections by reading status")
    .selectOption("unfinished");
  await expect(page.locator(".book-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reset library filters", exact: true })
    .click();
  await expect(page.locator(".book-card")).toHaveCount(6);
  await page.getByLabel("Collection reading order").selectOption("oldest-read");
  await expect(page.getByLabel("Sort library")).toHaveValue("oldest-read");
  expect(
    (await new AxeBuilder({ page }).include(".sidebar").analyze()).violations,
  ).toEqual([]);
});

test("global and per-book cover text switches retain metadata and selected artwork", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator(".book-card").first();
  await expect(card.locator(".cover-title")).toHaveCount(1);
  await card.locator(".cover-control").hover();
  await card.getByRole("button", { name: /Change cover/ }).click();
  await page.getByLabel("Cover text overlay").selectOption("hide");
  await expect(page.getByRole("dialog").locator(".cover-title")).toHaveCount(0);
  await page.getByRole("button", { name: "Close cover editor" }).click();
  await expect(card.locator(".cover-title")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const show = page.getByLabel("Show title and author on covers", {
    exact: true,
  });
  await show.uncheck();
  await page.reload();
  await expect(page.locator(".cover-title")).toHaveCount(0);
  await expect(page.locator(".book-card h3")).toHaveCount(6);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(show).not.toBeChecked();
  await show.check();
  await page
    .locator(".main-nav")
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await expect(page.locator(".book-card .cover-title")).toHaveCount(5);
});
