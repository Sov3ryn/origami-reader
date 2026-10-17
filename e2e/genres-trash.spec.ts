import { test, expect } from "@playwright/test";
import { openSection } from "./sections";
test("Trash retention is explicit, persists, grants legacy grace and purges expired entries", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".book-card")).toHaveCount(6);
  await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("origami-reader-v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const t = d.transaction(["metadata", "annotations"], "readwrite");
    for (const [id, stamp] of [
      ["starter-dracula", Date.now() - 8 * 86_400_000],
      ["starter-moonstone", null],
    ] as const) {
      const r = t.objectStore("metadata").get(id);
      r.onsuccess = () =>
        t.objectStore("metadata").put({
          ...r.result,
          deleted: true,
          ...(stamp === null ? {} : { deletedAt: stamp }),
        });
    }
    t.objectStore("annotations").put({
      id: "expired-note",
      bookId: "starter-dracula",
      text: "Expired",
    });
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error);
    });
    d.close();
  });
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Trash retention", { exact: true })).toHaveValue(
    "forever",
  );
  await page
    .getByLabel("Trash retention", { exact: true })
    .selectOption("days");
  await page.getByLabel("Days in Trash", { exact: true }).fill("7");
  await page
    .getByRole("button", { name: "Save Trash settings", exact: true })
    .click();
  await page
    .locator(".collection-row")
    .getByRole("button", { name: /Trash/ })
    .first()
    .click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  await expect(page.locator(".trash-policy")).toContainText("7 days");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Days in Trash", { exact: true })).toHaveValue(
    "7",
  );
  await page
    .getByLabel("Trash retention", { exact: true })
    .selectOption("forever");
  await page
    .getByRole("button", { name: "Save Trash settings", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Trash retention", { exact: true })).toHaveValue(
    "forever",
  );
});

test("imported genre tags persist, filter the library and can be cleared", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".book-card")).toHaveCount(6);
  await page.locator("input[type=file]").setInputFiles({
    name: "Tagged book.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("First paragraph.\n\nSecond paragraph."),
  });
  await page.locator(".book-open").filter({ hasText: "Tagged book" }).click();
  await page
    .getByRole("button", { name: "Expand inspector", exact: true })
    .click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  await page
    .getByLabel("Genre tags", { exact: true })
    .fill("Romance, Suspense, romance");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page.locator(".back-library").click();
  await openSection(page, "Filter and sort");
  await page.getByLabel("Filter library by genre").selectOption("Romance");
  await expect(page.locator(".book-card")).toHaveCount(2);
  await expect(
    page
      .locator(".book-card")
      .filter({ hasText: "Tagged book" })
      .locator(".genre-tags"),
  ).toHaveText("RomanceSuspense");
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page.locator(".book-open").filter({ hasText: "Tagged book" }).click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  await page.getByLabel("Genre tags", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page.locator(".back-library").click();
  await expect(page.locator(".book-card")).toHaveCount(1);
});

test("cover trash control, partial selection, permanent deletion and retention policy", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".book-card")).toHaveCount(6);
  for (const title of ["Dracula", "The Moonstone"]) {
    const card = page.locator(".book-card").filter({ hasText: title });
    await card.locator(".cover-control").hover();
    await card
      .getByRole("button", { name: "Move " + title + " to Trash", exact: true })
      .click();
  }
  await page
    .locator(".collection-row")
    .getByRole("button", { name: /Trash/ })
    .first()
    .click();
  await expect(page.locator(".trash-policy")).toContainText(
    "no automatic purge",
  );
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page.getByLabel("Select Dracula", { exact: true }).check();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(page.locator(".bulk-bar")).toContainText("2 selected");
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".book-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.locator(".book-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(4);
  await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("origami-reader-v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const t = d.transaction(["metadata", "bodies"]);
    for (const store of ["metadata", "bodies"]) {
      const value = await new Promise((resolve) => {
        const r = t.objectStore(store).get("starter-dracula");
        r.onsuccess = () => resolve(r.result);
      });
      if (value) throw Error("Deleted document remains in " + store);
    }
    d.close();
  });
});
