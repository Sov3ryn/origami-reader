import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1700, height: 1000 } });

async function seed(page: Page, mode = "book") {
  await page.goto("/");
  await page.getByRole("heading", { name: "Stories", exact: true }).waitFor();
  await page.evaluate(async (mode) => {
    const store = await import("/src/storage.ts");
    const { defaultPreferences } = await import("/src/types.ts");
    const before = "The traveler followed the quiet road through the forest and listened to the rain. ".repeat(60);
    const target = "The silver key was hidden beneath the sleeping cat.";
    const text = before + target + " She put the key in her pocket and continued home. ".repeat(30);
    const book = { meta: { id: "bookmark-test", title: "Bookmark Journey", author: "Test Author", format: "TXT", added: Date.now(), opened: 0, position: 0, paragraphCount: 2, wordCount: 1400, collection: "", favorite: false, deleted: false, cover: "plum", voice: "", sourceHash: "bookmark-test", shelf: "stories" }, paragraphs: [{ id: "intro", text: "Chapter One", kind: "heading", chapter: 1 }, { id: "long", text, kind: "paragraph", chapter: 1 }] };
    await store.saveBook(book);
    await store.saveAnnotation({ id: "saved-cat", bookId: book.meta.id, paragraphId: "long", start: before.length, end: before.length + target.length, quote: target, kind: "bookmark", color: "plum", text: "", group: "", created: Date.now(), design: "sleeping-cat-stars" });
    await store.saveSettings({ ...defaultPreferences, ...await store.readSettings(), uiLanguage: "en", readingMode: mode, bookOpening: true, leftOpen: false, rightOpen: false, motion: false, autoGenerateCovers: false });
  }, mode);
  await page.reload();
  await page.getByRole("heading", { name: "Stories", exact: true }).waitFor();
  await page.locator('.book-card').filter({ hasText: "Bookmark Journey" }).getByRole("button", { name: /Open bookmark/ }).click();
}

test("opens a bookmark at its exact sentence, withdraws it, and restores it on closing", async ({ page }) => {
  await seed(page);
  const stage = page.locator(".book-stage");
  const sprite = page.locator(".physical-bookmark");
  await expect(stage).toHaveClass(/phase-closed/);
  await expect(sprite).toHaveClass(/inside/);
  await expect(stage).toHaveClass(/phase-ready/, { timeout: 18000 });
  await expect(sprite).toHaveClass(/beside/);
  const selected = page.locator(".book > .book-page .sentence-mark").filter({ hasText: "The silver key" });
  await expect(selected.first()).toBeVisible();
  // A long paragraph spans many pages; the sentence itself must be on the shown spread.
  await expect.poll(async () => selected.evaluateAll((nodes) => nodes.some((n) => {
    const r = n.getBoundingClientRect(), p = n.closest('.book-text')!.getBoundingClientRect();
    return r.left >= p.left - 2 && r.right <= p.right + 2;
  }))).toBe(true);
  await expect.poll(async () => {
    const b = await page.locator(".book").boundingBox(), m = await sprite.boundingBox();
    return !!b && !!m && m.x >= b.x + b.width;
  }).toBe(true);
  const scale = await sprite.evaluate((el) => (el as HTMLElement).offsetHeight / (el.closest('.book') as HTMLElement).offsetHeight);
  expect(scale).toBeCloseTo(2 / 3, 2);
  await page.screenshot({ path: "../work/bookmark-open.png" });
  await page.getByRole("button", { name: "Close the book", exact: true }).last().click();
  await expect(sprite).toHaveClass(/returning/);
  await expect(stage).toHaveClass(/phase-closed/, { timeout: 8000 });
  await page.screenshot({ path: "../work/bookmark-closed.png" });
  await page.getByRole("button", { name: "Open the book", exact: true }).first().click();
  await expect(stage).toHaveClass(/phase-ready/, { timeout: 10000 });
  await expect(selected.first()).toBeVisible();
});

test("reduced motion and ordinary pages keep the bookmark outside the text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, "paged");
  const mark = page.locator(".physical-bookmark");
  await expect(mark).toBeVisible();
  await expect(page.locator(".sentence-mark").filter({ hasText: "The silver key" })).toBeVisible();
  expect(await mark.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  await expect.poll(async () => {
    const b = await page.locator(".reading-page").last().boundingBox(), m = await mark.boundingBox();
    return !!b && !!m && m.x >= b.x + b.width;
  }).toBe(true);
  await mark.click();
  await expect(page.locator(".sentence-mark").filter({ hasText: "The silver key" })).toBeVisible();
  await page.screenshot({ path: "../work/bookmark-pages.png" });
});
