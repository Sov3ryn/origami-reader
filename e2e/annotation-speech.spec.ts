import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function select(page: Page, id: string, start = 0, end?: number) {
  await page.locator(`[data-paragraph="${id}"]`).evaluate(
    (el, range) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const r = document.createRange();
      const end = range.end ?? el.textContent!.length;
      let position = 0,
        startSet = false;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent!.length;
        if (!startSet && range.start <= position + length) {
          r.setStart(node, range.start - position);
          startSet = true;
        }
        if (end <= position + length) {
          r.setEnd(node, end - position);
          break;
        }
        position += length;
      }
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(r);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    },
    { start, end },
  );
}
async function quickBook(page: Page, title: string, text: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Quick Read", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Text to read", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Add and open", exact: true }).click();
}
async function reopen(page: Page, title: string) {
  await page.reload();
  await page.locator(".book-open").filter({ hasText: title }).click();
}
async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}

test("partial spoken edits persist, allow silence and reset while source and drafts stay intact", async ({
  page,
}) => {
  const title = "Spoken editing test";
  const source = "Original first sentence. The second sentence stays.";
  const end = source.indexOf(" The");
  await quickBook(
    page,
    title,
    "# Chapter XVI\n\n" + source + "\n\nAnother paragraph.",
  );
  await select(page, "p-1", 0, end);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const editor = page.getByLabel("Spoken version", { exact: true });
  await editor.fill("Maeve reads the edited sentence.");
  await page
    .getByRole("button", { name: "Save spoken version", exact: true })
    .click();
  await expect(
    page.getByText("Saved replacement", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-paragraph="p-1"]')).toHaveText(source);
  await reopen(page, title);
  await select(page, "p-1", 2, 5);
  await expect(editor).toHaveValue("Maeve reads the edited sentence.");
  await expect(page.locator(".selected-quote")).toHaveText(
    "Original first sentence.",
  );
  await editor.fill("");
  await page
    .getByRole("button", { name: "Save spoken version", exact: true })
    .click();
  await expect(
    page.getByText("Saved: skip this passage", { exact: true }),
  ).toBeVisible();
  await reopen(page, title);
  await select(page, "p-1", 0, end);
  await expect(editor).toHaveValue("");
  await select(page, "p-1", end + 1);
  await expect(editor).toHaveValue("The second sentence stays.");
  await select(page, "p-1", 0, end);
  await editor.fill("Unfinished revision.");
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByRole("tab", { name: "Selection", exact: true }).click();
  await expect(editor).toHaveValue("Unfinished revision.");
  await page
    .getByRole("button", { name: "Discard edits", exact: true })
    .click();
  await expect(editor).toHaveValue("");
  await page
    .getByRole("button", { name: "Reset spoken version", exact: true })
    .click();
  await expect(editor).toHaveValue("Original first sentence.");
  await expect(page.locator(".color-options button")).toHaveCount(12);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: "test-results/spoken-editor.png" });
});

test("Roman heading normalization is enabled by default, reversible, and subordinate to saved wording", async ({
  page,
}) => {
  const title = "Roman heading test";
  await quickBook(
    page,
    title,
    "# Chapter XVI\n\nThis body text mentions Chapter XVI.",
  );
  await select(page, "p-0");
  await page.getByRole("button", { name: "More", exact: true }).click();
  const editor = page.getByLabel("Spoken version", { exact: true });
  await expect(editor).toHaveValue("Chapter 16");
  await expect(page.locator('[data-paragraph="p-0"]')).toHaveText(
    "Chapter XVI",
  );
  await settings(page);
  const option = page.getByLabel("Read Roman numerals as numbers in headings", {
    exact: true,
  });
  await expect(option).toBeChecked();
  await option.uncheck();
  await reopen(page, title);
  await select(page, "p-0");
  await expect(editor).toHaveValue("Chapter XVI");
  await editor.fill("The sixteenth chapter.");
  await page
    .getByRole("button", { name: "Save spoken version", exact: true })
    .click();
  await settings(page);
  await option.check();
  await reopen(page, title);
  await select(page, "p-0");
  await expect(editor).toHaveValue("The sixteenth chapter.");
  await select(page, "p-1");
  await expect(editor).toHaveValue("This body text mentions Chapter XVI.");
});

test("notes filter and sort by source, and a temporary bookmark survives several jumps across books", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.evaluate(async () => {
    const documents = "/src/documents.ts",
      storage = "/src/storage.ts";
    const { createBook, paragraphsFromText } = await import(documents);
    const { saveBook, saveAnnotation, saveSettings } = await import(storage);
    const book = createBook(
      "Annotation navigation",
      paragraphsFromText(
        "# Chapter I\n\n" +
          Array.from(
            { length: 95 },
            (_, i) =>
              `Source paragraph ${i + 1} has searchable context and enough wording to give each passage its own visible reading space.`,
          ).join("\n\n"),
      ),
    );
    book.meta.id = "navigation-test";
    book.meta.position = 12;
    const second = createBook(
      "Foreign book",
      paragraphsFromText(
        "# Start\n\nA foreign paragraph has different context.",
      ),
    );
    second.meta.id = "foreign-test";
    await saveBook(book);
    await saveBook(second);
    for (const a of [
      {
        id: "early",
        paragraphId: "p-2",
        text: "Zulu note",
        color: "amber",
        kind: "note",
        quote: "Source paragraph 2",
      },
      {
        id: "late",
        paragraphId: "p-65",
        text: "Alpha note",
        color: "blue",
        kind: "note",
        quote: "Source paragraph 65",
      },
      {
        id: "bookmark",
        paragraphId: "p-80",
        text: "",
        color: "blue",
        kind: "bookmark",
        quote: "",
      },
    ])
      await saveAnnotation({
        ...a,
        bookId: book.meta.id,
        start: 0,
        end: 0,
        group: "Research",
        created: Date.now(),
      });
    await saveAnnotation({
      id: "foreign",
      bookId: second.meta.id,
      paragraphId: "p-1",
      text: "Beta foreign note",
      color: "mint",
      kind: "note",
      quote: "A foreign paragraph",
      start: 0,
      end: 0,
      group: "",
      created: Date.now(),
    });
    await saveSettings({ rightOpen: true, inspector: "notes", motion: false });
  });
  await reopen(page, "Annotation navigation");
  const cards = page.locator(".annotation-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Zulu note");
  await page.getByLabel("Annotation order").selectOption("book-desc");
  await expect(cards.first()).toContainText("Source paragraph 80");
  await page.getByLabel("Annotation order").selectOption("text-asc");
  await expect(cards.first()).toContainText("Alpha note");
  await page.getByLabel("Annotation color filter").selectOption("blue");
  await expect(cards).toHaveCount(2);
  await page.getByLabel("Search annotations").fill("paragraph 65 context");
  await expect(cards).toHaveCount(1);
  await cards.first().getByText("Full paragraph", { exact: true }).click();
  await expect(cards.first()).toContainText("has searchable context");
  await page.getByLabel("Search annotations").fill("");
  await page.getByLabel("Annotation color filter").selectOption("all");
  await page
    .locator('[data-paragraph="p-12"]')
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  const scroll = await page
    .locator(".reading-scroll")
    .evaluate((el) => el.scrollTop);
  await cards.filter({ hasText: "Alpha note" }).locator("button.quote").click();
  await expect(page.locator('[data-paragraph="p-65"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to reading", exact: true }),
  ).toBeVisible();
  await cards
    .filter({ hasText: "Source paragraph 80" })
    .locator("button.quote")
    .click();
  await expect(page.locator('[data-paragraph="p-80"]')).toBeVisible();
  await page.getByLabel("Annotation scope").selectOption("all");
  await expect(cards).toHaveCount(4);
  await cards
    .filter({ hasText: "Beta foreign note" })
    .locator("button.quote")
    .click();
  await expect(page.locator(".reading-page")).toContainText(
    "A foreign paragraph has different context.",
  );
  await page
    .getByRole("button", { name: "Return to reading", exact: true })
    .click();
  await expect(page.locator('[data-paragraph="p-12"]')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".reading-scroll")
        .evaluate((el, original) => Math.abs(el.scrollTop - original), scroll),
    )
    .toBeLessThan(3);
  await expect(
    page.getByRole("button", { name: "Return to reading", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Annotation scope").selectOption("book");
  await page.getByLabel("Annotation type").selectOption("bookmark");
  await expect(cards).toHaveCount(1);
  await cards.first().locator("button.quote").click();
  await expect(
    page.getByRole("button", { name: "Return to reading", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss temporary bookmark", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Return to reading", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/annotation-browser.png" });
});
