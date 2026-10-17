import { expect, test, type Page } from "@playwright/test";
import { expandSections } from "./sections";
import { chooseScene } from "./scenes";

async function paperPixel(page: Page) {
  const box = (await page.locator(".reading-page").first().boundingBox())!;
  const png = await page.screenshot({
    clip: {
      x: Math.round(box.x + 12),
      y: Math.round(box.y + 12),
      width: 1,
      height: 1,
    },
  });
  return page.evaluate(async (base64) => {
    const image = await createImageBitmap(
      new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
        type: "image/png",
      }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    image.close();
    return ctx.getImageData(0, 0, 1, 1).data[0];
  }, png.toString("base64"));
}

test("page brightness changes paper pixels, preserves ink and controls, and remembers each scene", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open book/ }).click();
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click();
  await expandSections(page);
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  const brightness = page.getByRole("slider", {
    name: "Page brightness",
    exact: true,
  });
  await expect(brightness).toHaveValue("100");
  const paper = page.locator(".reading-page").first();
  const ink = await paper.evaluate((el) => getComputedStyle(el).color);
  const sidebar = await page
    .locator(".sidebar")
    .evaluate((el) => getComputedStyle(el).color);
  const normal = await paperPixel(page);
  await brightness.fill("60");
  expect(await paperPixel(page)).toBeLessThan(normal - 50);
  await expect(paper).toHaveCSS("color", ink);
  await expect(page.locator(".sidebar")).toHaveCSS("color", sidebar);
  await expect(paper).toHaveCSS("filter", "none");
  await brightness.fill("130");
  expect(await paperPixel(page)).toBeGreaterThanOrEqual(normal);
  await brightness.fill("75");
  await chooseScene(page, "Spring morning");
  await expect(brightness).toHaveValue("100");
  await chooseScene(page, "Moonlit lake");
  await expect(brightness).toHaveValue("75");
  await page.waitForTimeout(150);
  await page.reload();
  await page.getByRole("button", { name: /Open book/ }).click();
  await expect(brightness).toHaveValue("75");
  await page.screenshot({ path: "test-results/page-brightness.png" });
});

test("collections remain when empty, reject duplicate names, and deletion preserves books with undo", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add collection", exact: true })
    .click();
  await page.getByLabel("Collection name", { exact: true }).fill("Research");
  await page.getByLabel("Collection name", { exact: true }).press("Enter");
  const research = page.locator(".collection-row").filter({
    has: page.locator(".collection-title", { hasText: /^Research$/ }),
  });
  await expect(research).toBeVisible();
  await expect(research.locator(".count")).toHaveText("0");
  await page.waitForTimeout(150);
  await page.reload();
  await expect(research).toBeVisible();
  await page
    .getByRole("button", { name: "Add collection", exact: true })
    .click();
  await page.getByLabel("Collection name", { exact: true }).fill(" research ");
  await page
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "That collection name is already in use.",
  );
  await page.getByLabel("Collection name", { exact: true }).fill("Trash");
  await page
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "That collection name is already in use.",
  );
  await page
    .getByRole("button", { name: "Cancel adding collection", exact: true })
    .click();
  await research.locator("button").first().click();
  await page.locator("input[type=file]").setInputFiles({
    name: "Collection note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "The complete document stays in the library after its collection is deleted.",
    ),
  });
  await expect(research.locator(".count")).toHaveText("1");
  await page.locator("input[type=file]").setInputFiles({
    name: "Trashed collection note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "This document stays in Trash when its collection is removed.",
    ),
  });
  await page
    .getByLabel("Select Trashed collection note", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(research.locator(".count")).toHaveText("1");
  await expect(
    page.locator(".book-card").filter({ hasText: "Collection note" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete collection Research", exact: true })
    .click();
  await expect(research).toHaveCount(0);
  await expect(
    page.locator(".book-card").filter({ hasText: "Collection note" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Undo collection deletion", exact: true })
    .click();
  await expect(research.locator(".count")).toHaveText("1");
  await research.hover();
  await page
    .getByRole("button", { name: "Delete collection Research", exact: true })
    .click();
  await page.waitForTimeout(150);
  await page.reload();
  await expect(research).toHaveCount(0);
  const unsorted = page.locator(".collection-row").filter({
    has: page.locator(".collection-title", { hasText: /^Unsorted$/ }),
  });
  await unsorted.locator("button").first().click();
  await page
    .getByRole("button", { name: "Open Collection note", exact: true })
    .click();
  await expect(
    page.getByText(
      "The complete document stays in the library after its collection is deleted.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.locator(".voice-link").click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  await expect(page.getByLabel("Collection", { exact: true })).toHaveValue(
    "Unsorted",
  );
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  const trash = page
    .locator(".collection-row")
    .filter({ has: page.locator(".collection-title", { hasText: /^Trash$/ }) });
  await expect(trash.locator(".count")).toHaveText("1");
  await trash.locator("button").first().click();
  await expect(
    page.locator(".book-card").filter({ hasText: "Trashed collection note" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/collections-sidebar.png" });
});
