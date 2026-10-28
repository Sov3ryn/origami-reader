import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1700, height: 1000 } });

async function seed(page: Page, mode = "book", design = "sleeping-cat-stars") {
  await page.goto("/");
  await page.getByRole("heading", { name: "Stories", exact: true }).waitFor();
  await page.evaluate(async ({ mode, design }) => {
    const store = await import("/src/storage.ts");
    const { defaultPreferences } = await import("/src/types.ts");
    const before = "The traveler followed the quiet road through the forest and listened to the rain. ".repeat(60);
    const target = "The silver key was hidden beneath the sleeping cat.";
    const text = before + target + " She put the key in her pocket and continued home. ".repeat(30);
    const book = { meta: { id: "bookmark-test", title: "Bookmark Journey", author: "Test Author", format: "TXT", added: Date.now(), opened: 0, position: 0, paragraphCount: 2, wordCount: 1400, collection: "", favorite: false, deleted: false, cover: "plum", voice: "", sourceHash: "bookmark-test", shelf: "stories" }, paragraphs: [{ id: "intro", text: "Chapter One", kind: "heading", chapter: 1 }, { id: "long", text, kind: "paragraph", chapter: 1 }] };
    await store.saveBook(book);
    await store.saveAnnotation({ id: "saved-cat", bookId: book.meta.id, paragraphId: "long", start: before.length, end: before.length + target.length, quote: target, kind: "bookmark", color: "plum", text: "", group: "", created: Date.now(), design });
    await store.saveSettings({ ...defaultPreferences, ...await store.readSettings(), uiLanguage: "en", readingMode: mode, bookOpening: true, leftOpen: false, rightOpen: false, motion: false, autoGenerateCovers: false });
  }, { mode, design });
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
  await expect(sprite.locator(".sleeping-cat-art")).toHaveAttribute("data-animated", "false");
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
  await expect(sprite.locator(".sleeping-cat-art")).toHaveAttribute("data-animated", "false");
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

test("the sleeping cat moves independently of the ribbon and respects reduced motion", async ({ page }) => {
  await seed(page, "paged");
  const art = page.locator(".sleeping-cat-art");
  await expect(art).toHaveAttribute("data-animated", "true");
  await expect(art).toHaveAttribute("data-paused", "false");
  const pose = async (ms: number) => {
    await art.evaluate((el, time) => {
      for (const animation of el.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = time;
      }
    }, ms);
    return art.locator(".sleeping-cat-tail").evaluate((el) => getComputedStyle(el).transform);
  };
  const left = await pose(2300);
  await page.locator(".physical-bookmark").screenshot({ path: "../work/cat-left.png" });
  const right = await pose(6900);
  expect(left).not.toBe(right);
  await page.locator(".physical-bookmark").screenshot({ path: "../work/cat-right.png" });
  await pose(13110);
  await page.locator(".physical-bookmark").screenshot({ path: "../work/cat-ear.png" });
  expect(await art.locator(".sleeping-cat-animation > image").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  await page.locator(".physical-bookmark").evaluate((el) => { (el as HTMLElement).style.display = "none"; });
  await expect(art).toHaveAttribute("data-paused", "true");
  await page.locator(".physical-bookmark").evaluate((el) => { (el as HTMLElement).style.display = ""; });
  await expect(art).toHaveAttribute("data-paused", "false");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(art).toHaveAttribute("data-paused", "true");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(art).toHaveAttribute("data-paused", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(art).toHaveAttribute("data-animated", "false");
  await expect(art.locator(".sleeping-cat-still")).toBeVisible();
  await expect(art.locator(".sleeping-cat-animation")).toBeHidden();
});

test("a decode failure leaves the corrected still cat visible", async ({ page }) => {
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      return this.src.endsWith("sleeping-cat-stars-v2.png") ? Promise.reject(new Error("Test decode failure")) : decode.call(this);
    };
  });
  await seed(page, "paged");
  const art = page.locator(".sleeping-cat-art");
  await expect(art).toHaveAttribute("data-animated", "false");
  await expect(art.locator(".sleeping-cat-still")).toBeVisible();
  await expect(art.locator("svg")).toHaveCount(0);
});

test("midnight moon illuminates the gold without moving the bookmark", async ({ page }) => {
  await seed(page, "paged", "midnight-moon-leather");
  const art = page.locator(".midnight-moon-art");
  await expect(art).toHaveAttribute("data-animated", "true");
  await expect(art).toHaveAttribute("data-paused", "false");
  const lightAt = async (ms: number) => {
    await art.evaluate((el, time) => {
      for (const animation of el.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = time;
      }
    }, ms);
    return art.locator(".midnight-moon-glow").evaluate((el) => Number(getComputedStyle(el).opacity));
  };
  const low = await lightAt(0);
  const position = await art.locator("img").boundingBox();
  await page.locator(".physical-bookmark").screenshot({ path: "../work/moon-dim.png" });
  const high = await lightAt(4300);
  expect(high).toBeGreaterThan(low + .3);
  expect(await art.locator("img").boundingBox()).toEqual(position);
  await page.locator(".physical-bookmark").screenshot({ path: "../work/moon-bright.png" });
  await page.locator(".physical-bookmark").evaluate((el) => { (el as HTMLElement).style.display = "none"; });
  await expect(art).toHaveAttribute("data-paused", "true");
  await page.locator(".physical-bookmark").evaluate((el) => { (el as HTMLElement).style.display = ""; });
  await expect(art).toHaveAttribute("data-paused", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(art).toHaveAttribute("data-animated", "false");
  await expect(art.locator("svg")).toBeHidden();
  await expect(art.locator("img")).toBeVisible();
});

for (const design of [
  "plum-crane-ribbon", "lavender-botanical-paper", "forest-gold-pennant",
  "origami-crane-blossoms", "gothic-castle-window", "sage-lily-leaf",
  "brass-feather", "crane-charm-hook", "silver-celestial-sword", "gold-ivy-moon-filigree",
]) {
  test(`${design} animates beside the text and falls back to its still artwork`, async ({ page }) => {
    await seed(page, "paged", design);
    const mark = page.locator(".physical-bookmark");
    const art = mark.locator(".decorative-bookmark-art");
    await expect(art).toHaveAttribute("data-animated", "true");
    await expect(art).toHaveAttribute("data-paused", "false");
    await expect(art.locator("svg")).toBeVisible();
    await expect.poll(async () => {
      const b = await page.locator(".reading-page").last().boundingBox(), m = await mark.boundingBox();
      return !!b && !!m && m.x >= b.x + b.width;
    }).toBe(true);
    const pose = (time: number) => art.evaluate((el, ms) => el.getAnimations({ subtree: true }).map(animation => {
      animation.pause();
      animation.currentTime = ms;
      const style = getComputedStyle((animation.effect as KeyframeEffect).target!);
      return [style.transform, style.opacity];
    }), time);
    const first = await pose(1500);
    expect(first.length).toBeGreaterThan(0);
    expect(await pose(9500)).not.toEqual(first);
    await mark.screenshot({ path: `../work/reader-${design}.png` });
    // Stop invisible animations even when the element remains mounted.
    await mark.evaluate(el => { (el as HTMLElement).style.display = "none"; });
    await expect(art).toHaveAttribute("data-paused", "true");
    expect(await art.evaluate(el => [...el.querySelectorAll("[class^='bookmark-detail-']")].every(node => getComputedStyle(node).animationPlayState === "paused"))).toBe(true);
    await mark.evaluate(el => { (el as HTMLElement).style.display = ""; });
    await expect(art).toHaveAttribute("data-paused", "false");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(art).toHaveAttribute("data-animated", "false");
    await expect(art.locator("svg")).toBeHidden();
    await expect(art.locator("img")).toBeVisible();
    await mark.click();
    await expect(page.locator(".sentence-mark").filter({ hasText: "The silver key" })).toBeVisible();
  });
}
