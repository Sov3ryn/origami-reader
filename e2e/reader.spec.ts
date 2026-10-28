import { test, expect } from "@playwright/test";
import { chooseTheme, savedTheme } from "./scenes";
import { expandSections } from "./sections";
import AxeBuilder from "@axe-core/playwright";
import { zipSync, strToU8 } from "fflate";
async function selectPassage(page: import("@playwright/test").Page) {
  await page.locator('[data-paragraph="p-1"]').evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
}
test("library, inspector, night paper and palette persist", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Stories", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/library.png", fullPage: true });
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await chooseTheme(page, "forest");
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await page.waitForTimeout(350);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand navigation", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Open book/ }).click();
  await expect(page.locator(".reading-page").first()).toHaveClass(
    /surface-dark/,
  );
  await page
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await expect.poll(savedTheme(page)).toBe("forest");
  await page.getByLabel("Paper texture", { exact: true }).uncheck();
  await expect(page.locator(".reading-page").first()).toHaveClass(
    /texture-off/,
  );
  await page.getByLabel("Paper texture", { exact: true }).check();
  await chooseTheme(page, "plum");
  await page.screenshot({
    path: "test-results/reader-night.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await page.screenshot({
    path: "test-results/reader-paper.png",
    fullPage: true,
  });
});
test("notes keep stable anchors and drafts survive selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open book/ }).click();
  await selectPassage(page);
  await page
    .getByRole("button", { name: "Add note to selection", exact: true })
    .click();
  await page
    .getByLabel("Note text", { exact: true })
    .fill("Keep this passage.");
  await page.getByLabel("Note group", { exact: true }).fill("Research");
  await selectPassage(page);
  await expect(
    page.getByRole("tab", { name: "Notes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page
      .locator(".annotation-card")
      .getByText("Keep this passage.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Open book/ }).click();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(
    page
      .locator(".annotation-card")
      .getByText("Keep this passage.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reading comfort", exact: true }).click();
  for (let i = 0; i < 7; i++)
    await page.getByRole("button", { name: "Larger text", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".margin-tools button").first()).toBeVisible();
});
test("quick read and trash restore are durable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quick Read", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("A private note");
  await page
    .getByLabel("Text to read", { exact: true })
    .fill("# Start\n\nThis is a saved document.");
  await page.getByRole("button", { name: "Add and open", exact: true }).click();
  await expect(
    page.getByText("This is a saved document.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.getByLabel("Select A private note", { exact: true }).check();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(
    page.getByLabel("Select A private note", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByLabel("Select A private note", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Select A private note", { exact: true }),
  ).toBeVisible();
});
test("imports EPUB in spine order without running embedded content", async ({
  page,
}) => {
  const epub = zipSync({
    "META-INF/container.xml": strToU8(
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    ),
    "OPS/book.opf": strToU8(
      '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Test EPUB</dc:title><dc:creator>Author</dc:creator></metadata><manifest><item id="one" href="one.xhtml"/><item id="two" href="two.xhtml"/></manifest><spine><itemref idref="two"/><itemref idref="one"/></spine></package>',
    ),
    "OPS/one.xhtml": strToU8(
      "<html><body><h1>Later</h1><p>The last passage.</p></body></html>",
    ),
    "OPS/two.xhtml": strToU8(
      "<html><body><h1>First</h1><p>The first passage.</p><script>window.untrustedExecuted=true</script></body></html>",
    ),
  });
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "test.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from(epub),
  });
  await expect(
    page.getByRole("heading", { name: "Test EPUB", exact: true }),
  ).toBeVisible();
  await page.locator(".book-open").filter({ hasText: "Test EPUB" }).click();
  const blocks = await page.locator("[data-paragraph]").allTextContents();
  expect(blocks).toEqual([
    "First",
    "The first passage.",
    "Later",
    "The last passage.",
  ]);
  expect(
    await page.evaluate(() =>
      Boolean(
        (window as unknown as { untrustedExecuted?: boolean })
          .untrustedExecuted,
      ),
    ),
  ).toBe(false);
});
test("keyboard and accessibility checks on library and reader", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Stories", exact: true }),
  ).toBeVisible();
  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("button", { name: /Open book/ }).click();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await page.getByRole("tab", { name: "Appearance", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "Voice", exact: true }),
  ).toBeFocused();
  results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/reader-inspector.png",
    fullPage: true,
  });
});
