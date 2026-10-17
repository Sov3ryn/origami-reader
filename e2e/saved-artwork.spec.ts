import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openSettings } from "./sections";

test("saved artwork lists covers by source and deletes them", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "harbor-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Harbor notes\n\nThe boats came in at dawn."),
  });
  const card = page.locator(".book-card").filter({ hasText: "harbor-notes" });
  await card.locator(".cover-control").hover();
  const chooser = page.waitForEvent("filechooser");
  await card.getByRole("button", { name: /^Import cover image for / }).click();
  await (
    await chooser
  ).setFiles({
    name: "cover.webp",
    mimeType: "image/webp",
    buffer: readFileSync("public/authors/bram-stoker.webp"),
  });
  await expect(card.locator(".cover.cover-image")).toBeVisible();

  await openSettings(page, "Saved artwork");
  await page.getByRole("combobox", { name: "Show" }).selectOption("custom");
  const tiles = page.locator(".saved-art-grid li");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toContainText("harbor-notes");
  await tiles
    .first()
    .getByRole("button", { name: "Delete cover for harbor-notes" })
    .click();
  await expect(page.getByText("Cover deleted for harbor-notes.")).toBeVisible();
  await expect(tiles).toHaveCount(0);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(card.locator(".cover.cover-image")).toHaveCount(0);
  // The toolbar for books without a cover is back.
  await card.locator(".cover-control").hover();
  await expect(
    card.getByRole("group", { name: "Cover for harbor-notes" }),
  ).toBeVisible();
});

test("the voice list opens the voice downloads window", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Voices", exact: true }).click();
  await page.getByRole("button", { name: "Download voices" }).click();
  const dialog = page.getByRole("dialog", { name: "Download voices" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Korean voices")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Download selected" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
