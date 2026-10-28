import { test, expect, type Page } from "@playwright/test";
import { expandSections, readingMode } from "./sections";

async function openFixture(page: Page) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Stories", exact: true }).waitFor();
  await page.evaluate(async () => {
    const docs = "/src/documents.ts",
      store = "/src/storage.ts";
    const { createBook, paragraphsFromText } = await import(docs);
    const { saveBook, saveSettings } = await import(store);
    const book = createBook(
      "Page navigation test",
      paragraphsFromText(
        Array.from(
          { length: 120 },
          (_, i) =>
            `Passage ${i + 1}. ` +
            "The river ran through the quiet valley, past the old bridge and the village. ".repeat(
              3,
            ),
        ).join("\n\n"),
      ),
    );
    book.meta.id = "page-navigation";
    await saveBook(book);
    await saveSettings({ motion: false, rightOpen: false, leftOpen: true });
  });
  await page.reload();
  await page
    .locator(".book-open")
    .filter({ hasText: "Page navigation test" })
    .click();
}

test("continuous pages, hover margin navigation, keyboard and expanding gutters", async ({
  page,
}) => {
  await openFixture(page);
  const pages = page.locator(".reading-page");
  await pages.first().waitFor();
  const total = await pages.count();
  expect(total).toBeGreaterThan(10);
  await expect(pages.first().locator(".page-footer")).toHaveText(
    `Page 1 of ${total}`,
  );
  const scroll = page.locator(".reading-scroll");
  await expect(scroll).toHaveClass(/mode-continuous/);
  const next = page.getByRole("button", {
    name: "Next reading page",
    exact: true,
  });
  const prev = page.getByRole("button", {
    name: "Previous reading page",
    exact: true,
  });
  await expect(prev).toBeDisabled();
  await expect(next).toHaveCSS("opacity", "0");
  const oldWidth = (await next.boundingBox())!.width;
  await next.hover();
  await expect(next).toHaveCSS("opacity", "0.85");
  await next.click();
  await expect(prev).toBeEnabled();
  await expect
    .poll(() =>
      pages
        .nth(1)
        .evaluate((el) =>
          Math.abs(
            el.getBoundingClientRect().top -
              el.closest(".reading-scroll")!.getBoundingClientRect().top,
          ),
        ),
    )
    .toBeLessThan(3);
  await scroll.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      pages
        .nth(2)
        .evaluate((el) =>
          Math.abs(
            el.getBoundingClientRect().top -
              el.closest(".reading-scroll")!.getBoundingClientRect().top,
          ),
        ),
    )
    .toBeLessThan(3);
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await expect
    .poll(async () => (await next.boundingBox())!.width)
    .toBeGreaterThan(oldWidth);
  await scroll.hover();
  const before = await scroll.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 1200);
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(before + 500);
  await next.hover();
  const marginBefore = await scroll.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(marginBefore + 300);
  await pages
    .nth(3)
    .locator(".page-footer")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(pages.nth(3).locator(".page-footer")).toBeInViewport();
  await next.hover();
  await page.screenshot({ path: "test-results/reader-page-boundary.png" });
  await pages.last().scrollIntoViewIfNeeded();
  await expect(pages.last().locator(".page-footer")).toHaveText(
    `Page ${total} of ${total}`,
  );
  await expect(next).toBeDisabled();
  await page.screenshot({ path: "test-results/reader-continuous-pages.png" });
});

test("reading mode, page gap and footer preferences persist; paged and snap navigation work", async ({
  page,
}) => {
  await openFixture(page);
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  const gap = page.getByLabel("Page spacing", { exact: true });
  const progress = page.getByLabel("Reading progress", { exact: true });
  await expect(page.locator(".reading-scroll")).toHaveClass(/mode-continuous/);
  await expect(progress).toHaveValue("pages");
  await gap.fill("160");
  await expect(page.locator(".reading-pages")).toHaveCSS("gap", "160px");
  await gap.fill("0");
  await expect(page.locator(".reading-pages")).toHaveCSS("gap", "0px");
  await readingMode(page, "Pages");
  await expect(page.locator(".reading-page")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Next reading page", exact: true })
    .click();
  await expect(page.locator(".page-footer")).toContainText("Page 2 of ");
  await progress.selectOption("paragraphs");
  await expect(page.locator(".page-footer")).toContainText("Paragraphs ");
  await page.waitForTimeout(450);
  await page.reload();
  await page
    .locator(".book-open")
    .filter({ hasText: "Page navigation test" })
    .click();
  await expect(page.locator(".reading-page")).toHaveCount(1);
  await expect(page.locator(".reading-scroll")).toHaveClass(/mode-paged/);
  await expect(page.locator(".page-footer")).toContainText("Paragraphs ");
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await expect(gap).toHaveValue("0");
  await readingMode(page, "Snap");
  await expect(page.locator(".reading-scroll")).toHaveCSS(
    "scroll-snap-type",
    "y",
  );
  await progress.selectOption("percentage");
  await expect(page.locator(".page-footer").first()).toContainText("%");
  await page.screenshot({ path: "test-results/reader-page-settings.png" });
});
