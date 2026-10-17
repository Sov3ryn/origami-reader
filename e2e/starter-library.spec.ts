import { expect, test } from "@playwright/test";
import { openSection, openSettings } from "./sections";
import { join } from "node:path";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(
  readFileSync(
    join(process.cwd(), "assets", "starter-library", "manifest.json"),
    "utf8",
  ),
) as { books: { title: string; filename: string }[] };

test("the complete six-book pack imports, persists and reaches the end of Monte Cristo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".book-card")).toHaveCount(6);
  await page
    .locator("input[type=file]")
    .setInputFiles(
      manifest.books.map((book) =>
        join(
          process.cwd(),
          "assets",
          "starter-library",
          "books",
          book.filename,
        ),
      ),
    );
  for (const book of manifest.books) {
    await expect(
      page.getByRole("heading", { name: book.title, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".book-card")).toHaveCount(6);
  await page.reload();
  await page
    .locator(".book-open")
    .filter({ hasText: "The Count of Monte Cristo" })
    .click();
  await page.getByLabel("Search book", { exact: true }).fill("Wait and hope");
  const ending = page
    .locator(".chapters button")
    .filter({ hasText: "Wait and hope" })
    .last();
  await expect(ending).toBeVisible();
  await ending.click();
  await expect(page.locator(".reading-pages")).toContainText("Wait and hope");
  await page.reload();
  await page
    .locator(".book-open")
    .filter({ hasText: "The Count of Monte Cristo" })
    .click();
  await expect(page.locator(".reading-pages")).toContainText("Wait and hope");
});

test("first launch preloads complete editions with offline covers and license notices", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".book-card")).toHaveCount(6);
  await expect(page.locator(".book-card .cover-image")).toHaveCount(6);
  await expect(
    page
      .locator(".book-card")
      .filter({ hasText: "Dracula" })
      .locator(".genre-tags"),
  ).toContainText("Gothic horror");
  await expect(
    page
      .locator(".book-card")
      .filter({ hasText: "Pride and Prejudice" })
      .locator(".genre-tags"),
  ).toContainText("Romance");
  for (const book of manifest.books)
    await expect(
      page.getByRole("heading", { name: book.title, exact: true }),
    ).toBeVisible();
  const sizes = await page
    .locator(".book-card .cover-image")
    .evaluateAll(async (covers) =>
      Promise.all(
        covers.map(async (el) => {
          const image = new Image();
          image.src = (el as HTMLElement).style.backgroundImage.match(
            /url\("([^"]+)"\)/,
          )![1];
          await image.decode();
          return [image.naturalWidth, image.naturalHeight];
        }),
      ),
    );
  expect(sizes).toEqual(Array.from({ length: 6 }, () => [320, 448]));
  await openSettings(page, "About and support");
  await openSection(page, "Copyright and licenses");
  await page
    .getByText("Starter library credits and licenses", { exact: true })
    .click();
  await expect(
    page.getByText("CC-BY-SA-4.0.txt", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/preloaded-notices.png",
    fullPage: true,
  });
});

test("upgrade backs up demos and preserves imported books, annotations, settings and deleted starters", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".book-card")).toHaveCount(6);
  await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("origami-reader-v1", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const t = d.transaction(
      ["metadata", "bodies", "settings", "annotations"],
      "readwrite",
    );
    const m = t.objectStore("metadata");
    const bodies = t.objectStore("bodies");
    const request = m.get("starter-dracula");
    request.onsuccess = () => {
      const meta = request.result;
      m.delete(meta.id);
      const body = bodies.get(meta.id);
      body.onsuccess = () => {
        bodies.delete(meta.id);
        bodies.put(body.result, "already-imported");
      };
      m.put({
        ...meta,
        id: "already-imported",
        position: 9,
        voice: "my-voice",
        coverImage: "data:image/webp;base64,custom",
        collection: "My shelf",
      });
      m.put({
        ...meta,
        id: "sample-0",
        sourceHash: "sample-0",
        format: "Sample",
        title: "The Atlas of Quiet Places",
      });
      bodies.put(
        [{ id: "p-0", text: "Demo text", kind: "paragraph", chapter: 0 }],
        "sample-0",
      );
      m.put({
        ...meta,
        id: "personal-document",
        sourceHash: "personal-hash",
        format: "TXT",
        title: "Keep me",
      });
      bodies.put(
        [{ id: "p-0", text: "Personal text", kind: "paragraph", chapter: 0 }],
        "personal-document",
      );
      t.objectStore("annotations").put({
        id: "demo-note",
        bookId: "sample-0",
        text: "Preserve in backup",
      });
      t.objectStore("annotations").put({
        id: "personal-note",
        bookId: "personal-document",
        text: "Keep my note",
      });
    };
    const removed = m.get("starter-moonstone");
    removed.onsuccess = () => m.put({ ...removed.result, deleted: true });
    t.objectStore("settings").delete("starter-library-v3-installed");
    t.objectStore("settings").put(
      { theme: "forest", autoGenerateCovers: false },
      "preferences",
    );
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error);
    });
    d.close();
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Keep me", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "The Atlas of Quiet Places",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "The Moonstone", exact: true }),
  ).toHaveCount(0);
  const data = await page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("origami-reader-v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const t = d.transaction(["metadata", "settings", "annotations"]);
    const get = (store: string, key: string) =>
      new Promise<any>((resolve) => {
        const r = t.objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result);
      });
    const result = await Promise.all([
      get("metadata", "already-imported"),
      get("settings", "starter-demo-backup-v3"),
      get("annotations", "personal-note"),
      get("settings", "preferences"),
    ]);
    d.close();
    return result;
  });
  expect(data[0]).toMatchObject({
    position: 9,
    voice: "my-voice",
    collection: "My shelf",
    coverImage: "data:image/webp;base64,custom",
  });
  expect(data[1][0].annotations[0].text).toBe("Preserve in backup");
  expect(data[2].text).toBe("Keep my note");
  expect(data[3].theme).toBe("forest");
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(6);
});
