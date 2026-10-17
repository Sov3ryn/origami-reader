import { expect, test } from "@playwright/test";

const story = [
  "The Lantern",
  "The lantern swung above the door while the rain kept falling on the old harbor road.",
  "Nobody came to the inn that night, and the keeper read until the candle burned low.",
].join("\n\n");

test("right-clicking book text opens the reader's own menu", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "lantern.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(story),
  });
  await page
    .locator(".book-card")
    .filter({ hasText: "lantern" })
    .locator(".book-open")
    .click();
  const paragraph = page
    .locator("[data-paragraph]")
    .filter({ hasText: "harbor road" });
  await paragraph.waitFor();

  // Without a selection, the menu offers the paragraph under the pointer.
  await paragraph.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Paragraph" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Copy paragraph" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // With a selection, it reads, annotates and copies that passage.
  const box = await paragraph.evaluate((p) => {
    const text = p.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 18);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(range);
    p.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const r = range.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y, { button: "right" });
  const selected = page.getByRole("menu", { name: "Selected text" });
  await expect(selected).toBeVisible();
  await expect(
    selected.getByRole("menuitem", { name: "Read selection" }),
  ).toBeVisible();
  await selected.getByRole("menuitem", { name: "Underline in Rose" }).click();
  await expect(selected).toHaveCount(0);
  await expect(page.getByText("Underline saved.")).toBeVisible();
  // The passage is underlined in the chosen color.
  await expect(paragraph.locator("span[style*=underline]")).toHaveText(
    "lantern swung",
  );
});
