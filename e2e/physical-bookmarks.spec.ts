import { expect, test, type Page } from "@playwright/test";

for (const design of ["sands-of-time", "measure-of-time", "wandering-blue-box"]) {
  test(`${design} animates within its ornament and pauses with reduced motion`, async ({ page }) => {
    await seed(page, "paged", design);
    const art = page.locator(".time-bookmark-art");
    const svg = art.locator("svg");
    await expect(art).toHaveAttribute("data-animated", "true");
    await expect(art).toHaveAttribute("data-paused", "false");
    if (design === "measure-of-time") {
      const angles = await svg.evaluate((el) => {
        const root = el as SVGSVGElement;
        root.pauseAnimations();
        return [.25, .75, 1.25].map(time => {
          root.setCurrentTime(time);
          const matrix = (root.querySelector('.time-second-hand') as SVGGElement).transform.animVal.getItem(0).matrix;
          return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
        });
      });
      expect(angles[1]).toBeCloseTo(angles[0], 2);
      expect(angles[2] - angles[0]).toBeCloseTo(-6, 2);
      await expect(svg.locator("text")).toHaveCount(12);
    } else if (design === "sands-of-time") {
      const heights = await svg.evaluate((el) => {
        const root = el as SVGSVGElement;
        root.pauseAnimations();
        return [.72, .8, .89].map(fraction => {
          root.setCurrentTime(5.5 * fraction);
          return (root.querySelector('.time-star') as SVGGElement).transform.animVal.getItem(0).matrix.f;
        });
      });
      expect(heights[1]).toBeLessThan(heights[0] - 10);
      expect(heights[2]).toBeCloseTo(heights[0], 1);
    } else {
      const poses = await svg.evaluate(el => {
        const root = el as SVGSVGElement;
        root.pauseAnimations();
        return [0, 7.2, 11, 18.72, 24].map(time => {
          root.setCurrentTime(time);
          const left = (root.querySelector('.time-blue-box-left') as SVGGElement).transform.animVal.getItem(0).matrix.a;
          const right = (root.querySelector('.time-blue-box-right') as SVGGElement).transform.animVal.getItem(0).matrix.a;
          const opacity = Number(getComputedStyle(root.querySelector('.time-blue-box-presence')!).opacity);
          return { left, right, opacity };
        });
      });
      expect(poses[0].left).toBe(1);
      expect(poses[1].left).toBeCloseTo(.76, 2);
      expect(poses[1].right).toBeCloseTo(poses[1].left, 3);
      expect(poses[2].left).toBe(1);
      expect(poses[3].opacity).toBeCloseTo(.2, 2);
      expect(poses[4]).toEqual(poses[0]);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(art).toHaveAttribute("data-animated", "false");
    await expect(svg).toBeHidden();
    await expect(art.locator(":scope > img")).toBeVisible();
    expect(await svg.evaluate(el => (el as SVGSVGElement).animationsPaused())).toBe(true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(svg).toBeVisible();
    await expect.poll(() => svg.evaluate(el => (el as SVGSVGElement).animationsPaused())).toBe(false);
    await art.evaluate(el => (el.closest('.physical-bookmark') as HTMLElement).style.visibility = 'hidden');
    // Hiding via display also removes the ornament from intersection tracking.
    await art.evaluate(el => (el.closest('.physical-bookmark') as HTMLElement).style.display = 'none');
    await expect(art).toHaveAttribute("data-paused", "true");
    expect(await svg.evaluate(el => (el as SVGSVGElement).animationsPaused())).toBe(true);
  });
}

test.use({ viewport: { width: 1700, height: 1000 } });

async function seed(page: Page, mode = "book", design = "sleeping-cat-stars", still = false) {
  await page.goto("/");
  await page.getByRole("heading", { name: "Stories", exact: true }).waitFor();
  await page.evaluate(async ({ mode, design, still }) => {
    const store = await import("/src/storage.ts");
    const { defaultPreferences } = await import("/src/types.ts");
    const before = "The traveler followed the quiet road through the forest and listened to the rain. ".repeat(60);
    const target = "The silver key was hidden beneath the sleeping cat.";
    const text = before + target + " She put the key in her pocket and continued home. ".repeat(30);
    const book = { meta: { id: "bookmark-test", title: "Bookmark Journey", author: "Test Author", format: "TXT", added: Date.now(), opened: 0, position: 0, paragraphCount: 2, wordCount: 1400, collection: "", favorite: false, deleted: false, cover: "plum", voice: "", sourceHash: "bookmark-test", shelf: "stories" }, paragraphs: [{ id: "intro", text: "Chapter One", kind: "heading", chapter: 1 }, { id: "long", text, kind: "paragraph", chapter: 1 }] };
    await store.saveBook(book);
    await store.saveAnnotation({ id: "saved-cat", bookId: book.meta.id, paragraphId: "long", start: before.length, end: before.length + target.length, quote: target, kind: "bookmark", color: "plum", text: "", group: "", created: Date.now(), design, still });
    await store.saveSettings({ ...defaultPreferences, ...await store.readSettings(), uiLanguage: "en", readingMode: mode, bookOpening: true, leftOpen: false, rightOpen: false, motion: false, autoGenerateCovers: false });
  }, { mode, design, still });
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

for (const design of ["moonlit-wolf", "woodland-owl"]) {
  test(`${design} moves independently, preserves the paper and respects motion preferences`, async ({ page }) => {
    await seed(page, "paged", design);
    const mark = page.locator(".physical-bookmark");
    const art = mark.locator(".animal-bookmark-art");
    await expect(art).toHaveAttribute("data-animated", "true");
    await expect(art).toHaveAttribute("data-paused", "false");
    if (design === "moonlit-wolf") {
      // Every visible pixel outside the paper belongs to the moving tail,
      // including the fine gold edge that previously stayed behind.
      const strandedPixels = await art.evaluate(el => {
        const img = el.querySelector("img")!;
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const path = new Path2D(el.querySelector("clipPath[id$='-tail'] path")!.getAttribute("d")!);
        let missed = 0;
        for (let y = 350; y < 780; y++) for (let x = 694; x < 920; x++)
          if (pixels[(y * canvas.width + x) * 4 + 3] > 8 && !ctx.isPointInPath(path, x, y)) missed++;
        return missed;
      });
      expect(strandedPixels).toBe(0);
    }
    const pose = async (time: number) => {
      await art.evaluate((el, ms) => { for (const a of el.getAnimations({ subtree: true })) { a.pause(); a.currentTime = ms; } }, time);
      return art.locator(design === "moonlit-wolf" ? ".animal-wolf-tail" : ".animal-owl-lid").first().evaluate(el => getComputedStyle(el).transform);
    };
    const first = await pose(design === "moonlit-wolf" ? 2500 : 0);
    const paper = await art.locator(".animal-bookmark-paper").boundingBox();
    const second = await pose(design === "moonlit-wolf" ? 7500 : 5080);
    expect(second).not.toBe(first);
    expect(await art.locator(".animal-bookmark-paper").boundingBox()).toEqual(paper);
    expect(await art.locator(".animal-bookmark-paper").evaluate(el => getComputedStyle(el).transform)).toBe("none");
    await expect.poll(async () => {
      const b = await page.locator(".reading-page").last().boundingBox(), m = await mark.boundingBox();
      return !!b && !!m && m.x >= b.x + b.width;
    }).toBe(true);
    await mark.screenshot({ path: `../work/reader-${design}.png` });
    await mark.evaluate(el => { (el as HTMLElement).style.display = "none"; });
    await expect(art).toHaveAttribute("data-paused", "true");
    await mark.evaluate(el => { (el as HTMLElement).style.display = ""; });
    await expect(art).toHaveAttribute("data-paused", "false");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(art).toHaveAttribute("data-animated", "false");
    await expect(art.locator("svg")).toBeHidden();
    await expect(art.locator("img")).toBeVisible();
    await mark.click();
    await expect(page.locator(".sentence-mark").filter({ hasText: "The silver key" })).toBeVisible();
  });
  test(`${design} keeps the explicitly selected still version`, async ({ page }) => {
    await seed(page, "paged", design, true);
    const mark = page.locator(".physical-bookmark");
    await expect(mark.locator("img")).toBeVisible();
    await expect(mark.locator("svg")).toHaveCount(0);
  });
}

for (const design of ["library-earth-globe", "selenograph-moon-globe", "observatory-mars-globe"]) {
  test(`${design} rotates, pauses offscreen, and restores its bookmarked sentence`, async ({ page }) => {
    await seed(page, "paged", design);
    const mark = page.locator(".physical-bookmark");
    const art = mark.locator(".globe-bookmark-art");
    const sphere = art.locator("canvas");
    await expect(sphere).toHaveAttribute("data-ready", "true");
    await expect(sphere).toHaveAttribute("data-running", "true");
    const first = await sphere.getAttribute("data-turn");
    await expect.poll(() => sphere.getAttribute("data-turn")).not.toBe(first);
    await mark.evaluate(el => { (el as HTMLElement).style.display = "none"; });
    await expect(sphere).toHaveAttribute("data-running", "false");
    const stopped = await sphere.getAttribute("data-turn");
    await page.waitForTimeout(150);
    expect(await sphere.getAttribute("data-turn")).toBe(stopped);
    await mark.evaluate(el => { (el as HTMLElement).style.display = ""; });
    await expect(sphere).toHaveAttribute("data-running", "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(sphere).toBeHidden();
    await expect(art.locator("img")).toBeVisible();
    await expect(sphere).toHaveAttribute("data-running", "false");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(sphere).toHaveAttribute("data-running", "true");
    await expect(sphere).toBeVisible();
    await mark.click();
    await expect(page.locator(".sentence-mark").filter({ hasText: "The silver key" })).toBeVisible();
  });
}

test("globe bookmark keeps its complete still artwork when its surface map fails", async ({ page }) => {
  await page.route("**/bookmarks/globe-textures/earth.png", route => route.abort());
  await seed(page, "paged", "library-earth-globe");
  const art = page.locator(".globe-bookmark-art");
  await expect(art).toHaveAttribute("data-animated", "true");
  await expect(art.locator("img")).toBeVisible();
  await expect(art.locator("canvas")).toBeHidden();
});

for (const design of [
  "midnight-moth-ribbon", "silver-fox-ribbon",
  "gilded-thorn-dagger", "moonveil-spear",
  "pressed-wildflowers-paper", "autumn-herbarium-paper",
  "gilded-stag-leather", "ember-dragon-leather",
  "twilight-wisteria-pennant", "sunlit-orchard-pennant",
  "origami-fox-maple", "origami-koi-lotus",
  "moonlit-abbey-window", "ember-citadel-window",
  "copper-ginkgo-leaf", "midnight-lotus-leaf", "moonlit-raven-feather", "peacock-plume-feather",
  "plum-crane-ribbon", "lavender-botanical-paper", "forest-gold-pennant",
  "origami-crane-blossoms", "gothic-castle-window", "sage-lily-leaf",
  "brass-feather", "crane-charm-hook", "silver-celestial-sword", "gold-ivy-moon-filigree",
    "moonwatch-owl-hook", "fox-key-hook", "silver-wisteria-moon-filigree", "copper-oak-sun-filigree",
]) {
  test(`${design} animates beside the text and falls back to its still artwork`, async ({ page }) => {
    await seed(page, "paged", design);
    const mark = page.locator(".physical-bookmark");
    const art = mark.locator(".decorative-bookmark-art");
    await expect(art).toHaveAttribute("data-animated", "true");
    await expect(art).toHaveAttribute("data-paused", "false");
    await expect(art.locator("svg")).toBeVisible();
    if (["midnight-moth-ribbon", "silver-fox-ribbon"].includes(design)) {
      const deformation = await art.locator("svg").evaluate(node => {
        const svg = node as SVGSVGElement;
        svg.pauseAnimations(); svg.setCurrentTime(0);
        const map = svg.querySelector("feDisplacementMap")!;
        const rest = map.scale.animVal;
        svg.setCurrentTime(4.5);
        const moved = map.scale.animVal;
        svg.unpauseAnimations();
        return { rest, moved };
      });
      expect(deformation.rest).toBe(0);
      expect(deformation.moved).toBeGreaterThan(4);
    }
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
    if (["origami-fox-maple", "origami-koi-lotus"].includes(design)) {
      await expect(art.locator("feDisplacementMap")).toHaveCount(0);
      await pose(0);
      const rest = await art.locator(".bookmark-detail-fold").first().evaluate(el => getComputedStyle(el).transform);
      await pose(5000);
      expect(await art.locator(".bookmark-detail-fold").first().evaluate(el => getComputedStyle(el).transform)).not.toBe(rest);
    }
    if (["pressed-wildflowers-paper", "autumn-herbarium-paper", "twilight-wisteria-pennant", "sunlit-orchard-pennant"].includes(design)) {
      await expect(art.locator("feDisplacementMap")).toHaveCount(0);
      await pose(3000);
      const right = await art.locator(".bookmark-detail-swing").evaluate(el => getComputedStyle(el).transform);
      await pose(9000);
      const left = await art.locator(".bookmark-detail-swing").evaluate(el => getComputedStyle(el).transform);
      expect(left).not.toBe(right);
      const b = (transform: string) => Number(transform.split(",")[1]);
      expect(b(left) * b(right)).toBeLessThan(0);
    }
    expect(first.length).toBeGreaterThan(0);
    expect(await pose(9500)).not.toEqual(first);
    await mark.screenshot({ path: `../work/reader-${design}.png` });
    // Stop invisible animations even when the element remains mounted.
    await mark.evaluate(el => { (el as HTMLElement).style.display = "none"; });
    await expect(art).toHaveAttribute("data-paused", "true");
    expect(await art.evaluate(el => [...el.querySelectorAll("[class^='bookmark-detail-']")].every(node => getComputedStyle(node).animationPlayState === "paused"))).toBe(true);
    if (["midnight-moth-ribbon", "silver-fox-ribbon"].includes(design)) {
      expect(await art.locator("svg").evaluate(node => (node as SVGSVGElement).animationsPaused())).toBe(true);
    }
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
