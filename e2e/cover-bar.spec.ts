import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("a book without a cover offers a toolbar that imports an image", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "plain.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Plain notes\n\nA short text with no cover."),
  });
  const card = page.locator(".book-card").filter({ hasText: "plain" });
  await expect(card).toBeVisible();
  const bar = card.getByRole("group", { name: /^Cover for / });
  await card.locator(".cover-control").hover();
  await expect(bar).toBeVisible();
  // Covers cannot be generated in the browser preview, only imported.
  await expect(
    bar.getByRole("button", { name: /^Generate cover/ }),
  ).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await bar.getByRole("button", { name: /^Import cover image for / }).click();
  await (
    await chooser
  ).setFiles({
    name: "cover.webp",
    mimeType: "image/webp",
    buffer: readFileSync("public/authors/bram-stoker.webp"),
  });
  await expect(page.getByText("Cover added.")).toBeVisible();
  await expect(card.locator(".cover.cover-image")).toBeVisible();
  // With artwork in place the toolbar gives way to the usual edit button.
  await expect(bar).toHaveCount(0);
  await expect(card.locator(".cover-edit")).toHaveCount(1);
});
