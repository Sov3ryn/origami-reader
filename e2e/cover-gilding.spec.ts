import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1700, height: 1080 } });
async function seed(page: Page, motion = true) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Stories", exact: true }).waitFor();
  await page.evaluate(async motion => {
    const store = await import("/src/storage.ts");
    const { defaultPreferences } = await import("/src/types.ts");
    const { titleStyles } = await import("/src/coverTitles.ts");
    for (const [style] of titleStyles) await store.saveBook({
      meta: { id: `gilt-${style}`, title: `The Silver Forest`, author: "Eleanor Winter", format: "TXT", added: Date.now(), opened: 0, position: 0, paragraphCount: 2, wordCount: 3000, collection: "", favorite: false, deleted: false, cover: "lake", voice: "", sourceHash: `gilt-${style}`, shelf: "stories", titleStyle: style, titleInk: "silver", coverText: "show", ...(style === "classic" ? { binding: { coverPattern: "normal" } } : {}) },
      paragraphs: [{ id: "chapter", text: "Chapter One", kind: "heading", chapter: 1 }, { id: "story", text: "The path wound through the silver forest. She followed it home. ".repeat(200), kind: "paragraph", chapter: 1 }],
    });
    await store.saveSettings({ ...defaultPreferences, ...await store.readSettings(), uiLanguage: "en", readingMode: "book", bookOpening: true, leftOpen: false, rightOpen: false, motion, autoGenerateCovers: false, binding: { cover: "gold", coverPattern: "botanical", spine: "silver", edges: "copper" } });
  }, motion);
  await page.reload();
  await page.getByRole("heading", { name: "Stories", exact: true }).waitFor();
}

test("frames keep all nine title styles and saved Normal overrides", async ({ page }) => {
  await seed(page);
  const cards = page.locator('.book-card').filter({ hasText: 'The Silver Forest' });
  await expect(cards).toHaveCount(9);
  await page.evaluate(() => document.fonts.ready);
  await expect(cards.locator('.cover-pattern-foil')).toHaveCount(8);
  await expect(cards.locator('.title-classic')).not.toHaveClass(/cover-patterned/);
  for (const style of ['gilded','storybook','gothic','script','deco','thriller','scifi','leather']) {
    const cover = cards.locator(`.title-${style}`);
    await expect(cover).toHaveClass(/ink-silver/);
    await expect(cover.locator('.cover-title')).toHaveText('The Silver Forest');
    const fits = await cover.evaluate(el => {
      const cover = el.getBoundingClientRect(), title = el.querySelector('.cover-title')!.getBoundingClientRect(), author = el.querySelector('.cover-author')!.getBoundingClientRect();
      return title.left >= cover.left && title.right <= cover.right + 1 && title.bottom < author.top && author.bottom <= cover.bottom;
    });
    expect(fits, style).toBe(true);
  }
  await cards.filter({ has: page.locator('.title-gilded') }).locator('.cover-open').click();
  await page.getByRole('button', { name: 'Binding and bookmarks', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Binding and bookmarks' });
  await dialog.getByRole('tab', { name: 'All books', exact: true }).click();
  await dialog.getByRole('button', { name: 'Celestial', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  if (await page.locator('.back-library').isVisible()) await page.locator('.back-library').click();
  await expect(cards.locator('.title-gilded')).toHaveAttribute('style', /celestial.svg/);
  await expect(cards.locator('.title-classic')).not.toHaveClass(/cover-patterned/);
  await cards.filter({ has: page.locator('.title-gilded') }).locator('.cover-open').click();
  await page.getByRole('button', { name: 'Binding and bookmarks', exact: true }).click();
  await dialog.getByRole('tab', { name: 'All books', exact: true }).click();
  await dialog.getByRole('button', { name: 'Normal', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('banner').getByRole('button', { name: 'Stories', exact: true }).click();
  await expect(cards.locator('.cover-pattern-foil')).toHaveCount(0);
});

test("nearby covers tilt, reset at distance and obey reduced motion", async ({ page }) => {
  await seed(page);
  const cover = page.locator('.book-card .cover-tilt .cover').first();
  await cover.scrollIntoViewIfNeeded();
  const r = (await cover.boundingBox())!;
  await page.mouse.move(r.x + r.width + 24, r.y + r.height / 3);
  await expect(cover).toHaveAttribute('data-pointer-near','true');
  await expect.poll(() => cover.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--pointer-x')))).toBeGreaterThan(0);
  await page.mouse.move(5, 5);
  await expect(cover).not.toHaveAttribute('data-pointer-near','true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await cover.hover();
  await expect(cover).toHaveCSS('transform','none');
  await expect(cover).not.toHaveAttribute('data-pointer-near','true');
});

test("closed 3D volume tilts as one and opens with the title and binding preserved", async ({ page }) => {
  await seed(page);
  const card = page.locator('.book-card').filter({ has: page.locator('.title-gothic') }).filter({ hasText: 'The Silver Forest' });
  await card.locator('.cover-open').click();
  const stage = page.locator('.book-stage');
  await expect(stage).toHaveAttribute('data-cover-idle','true');
  await expect(stage).toHaveAttribute('data-edges','copper');
  await expect(stage).toHaveAttribute('data-spine','silver');
  await expect(stage.locator('.cover.title-gothic.ink-silver.cover-patterned')).toBeVisible();
  await expect(stage.locator('.book-cover-gilt')).toHaveCount(0);
  const hit = stage.locator('.book-cover-hit');
  const r = (await hit.boundingBox())!;
  await page.mouse.move(r.x + r.width * .85, r.y + r.height * .3);
  await expect(stage.locator('.book')).toHaveAttribute('data-pointer-near','true');
  await expect.poll(() => stage.locator('.book').evaluate(el => getComputedStyle(el).rotate)).not.toBe('none');
  await page.screenshot({ path: '../outputs/Origami-Cover-Gilding/App closed book.png' });
  await hit.click();
  await expect(stage).toHaveClass(/phase-ready/, { timeout: 18000 });
  await expect(stage.locator('.book')).not.toHaveAttribute('data-pointer-near','true');
  await expect(stage.locator('.book')).toHaveCSS('rotate','none');
});

test("motion disabled leaves library covers still", async ({ page }) => {
  await seed(page, false);
  const cover = page.locator('.book-card .cover-tilt .cover').first();
  await cover.hover();
  await expect(cover).not.toHaveAttribute('data-pointer-near','true');
});
