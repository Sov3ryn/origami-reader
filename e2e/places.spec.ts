import { expect, test } from "@playwright/test";
import { closeGallery, openGallery, savedTheme } from "./scenes";
import { expandSections } from "./sections";

test("places stay dark until earned, explain how to unlock, then become scenes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Appearance settings", exact: true }).click();
  await expandSections(page);
  await openGallery(page);
  const gallery = page.locator(".theme-gallery");
  await expect(gallery.locator(".gallery-tile.locked")).toHaveCount(31);
  await expect(gallery.getByText("0 of 31 unlocked")).toBeVisible();
  const locked = gallery.locator(".gallery-tile.locked").first();
  await locked.hover();
  await expect(locked.locator(".gallery-hint")).toHaveCSS("opacity", "1");
  await expect(locked.locator(".gallery-hint")).toContainText("Read or listen for 20 minutes");
  await locked.click({ force: true });
  await expect(page.locator("origami-background")).toHaveCount(0);

  await gallery.getByRole("tab", { name: "Color themes", exact: true }).click();
  await gallery.getByRole("button", { name: "Forest Ink" }).click();
  await closeGallery(page);
  await expect.poll(savedTheme(page)).toBe("forest");

  // One hour of reading unlocks the Rainy Bookshop.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("origami-reader-v1");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const prefs = await new Promise<Record<string, unknown>>((resolve) => {
      const r = db.transaction("settings").objectStore("settings").get("preferences");
      r.onsuccess = () => resolve(r.result);
    });
    prefs.readingStats = { activeSeconds: 3600, readingDays: 1, lastReadingDay: "", holidaySeconds: {}, unlocked: [] };
    await new Promise((resolve) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put(prefs, "preferences");
      tx.oncomplete = resolve;
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByText("New place to read: The Rainy Bookshop")).toBeVisible();
  await page.getByRole("button", { name: "Appearance settings", exact: true }).click();
  await expandSections(page);
  await openGallery(page);
  await expect(gallery.getByText("1 of 31 unlocked")).toBeVisible();
  await gallery.getByRole("button", { name: "The Rainy Bookshop", exact: true }).click();
  await closeGallery(page);
  await expect(page.locator(".background-art")).toHaveClass(/background-place/);
  await expect
    .poll(() => page.locator("origami-background").evaluate((el) => (el as unknown as { status: { ready: boolean; scene: string } }).status))
    .toMatchObject({ ready: true, scene: "rainy-bookshop" });
  await expect(page.locator(".gallery-button")).toContainText("The Rainy Bookshop");
});
