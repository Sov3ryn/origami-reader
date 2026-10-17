import { expect, test } from "@playwright/test";
import { openSection } from "./sections";
import { expandSections } from "./sections";
import { zipSync, strToU8 } from "fflate";
import AxeBuilder from "@axe-core/playwright";
let png: Buffer;
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 15;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#a989c7";
    ctx.fillRect(0, 0, 10, 15);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  png = Buffer.from(encoded, "base64");
});

test("cover controls appear on hover, copy raster art and persist it in Reader details", async ({
  page,
}) => {
  await page.goto("/");
  const control = page.locator(".book-card").first().locator(".cover-control");
  const edit = control.getByRole("button", { name: /Change cover/ });
  await expect(edit).toHaveCSS("opacity", "0");
  await control.hover();
  await expect(edit).toHaveCSS("opacity", "1");
  const area = (await control.boundingBox())!,
    button = (await edit.boundingBox())!;
  expect(button.x - area.x).toBeLessThan(10);
  expect(area.y + area.height - button.y - button.height).toBeLessThan(10);
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Change cover" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Cover image file")
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
  await expect(dialog.locator(".cover")).toHaveClass(/cover-image/);
  await page.getByRole("button", { name: "Close cover editor" }).click();
  await expect(edit).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: /Open book/ }).click();
  await page
    .getByRole("button", { name: "Expand inspector", exact: true })
    .click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  await expect(page.locator(".inspector .cover")).toHaveClass(/cover-image/);
  await openSection(page, "Cover");
  await page.getByRole("button", { name: "Change cover", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Cover image file").setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ),
  });
  await expect(page.getByRole("alert")).toContainText("PNG, JPEG or WebP");
  await page.getByRole("button", { name: "Close cover editor" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByLabel("Cover description")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close cover editor" }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("EPUB embedded cover art is retained", async ({ page }) => {
  const epub = zipSync({
    "META-INF/container.xml": strToU8(
      '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
    ),
    "book.opf": strToU8(
      '<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Embedded cover</dc:title></metadata><manifest><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    ),
    "chapter.xhtml": strToU8(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>The artwork belongs with this book.</p></body></html>',
    ),
    "cover.png": png,
  });
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "cover.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from(epub),
  });
  await expect(
    page
      .locator(".book-card")
      .filter({ hasText: "Embedded cover" })
      .locator(".cover"),
  ).toHaveClass(/cover-image/);
});

test("focus mode restores saved panel visibility and widths, including a previously closed panel", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open book/ }).click();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  const left = page.getByRole("separator", { name: "Resize navigation" });
  const right = page.getByRole("separator", { name: "Resize inspector" });
  await left.press("ArrowRight");
  await right.press("ArrowLeft");
  const leftWidth = await left.getAttribute("aria-valuenow"),
    rightWidth = await right.getAttribute("aria-valuenow");
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".inspector")).toBeHidden();
  await page
    .getByRole("button", { name: "Exit focus mode", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".inspector")).toBeVisible();
  await expect(left).toHaveAttribute("aria-valuenow", leftWidth!);
  await expect(right).toHaveAttribute("aria-valuenow", rightWidth!);
  await page
    .getByRole("button", { name: "Collapse navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await page
    .getByRole("button", { name: "Exit focus mode", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".inspector")).toBeVisible();
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Focus mode", exact: true }),
  ).toBeVisible();
});
