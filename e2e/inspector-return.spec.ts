import { expect, test } from "@playwright/test";

test("a plain click in the book returns the inspector to the earlier tab", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "harbor.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "The Harbor\n\nThe lantern swung above the door while the rain kept falling on the old harbor road.",
    ),
  });
  await page
    .locator(".book-card")
    .filter({ hasText: "harbor" })
    .locator(".book-open")
    .click();
  const paragraph = page
    .locator("[data-paragraph]")
    .filter({ hasText: "harbor road" });
  await paragraph.waitFor();
  const expand = page.getByRole("button", {
    name: "Expand inspector",
    exact: true,
  });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole("tab", { name: "Voice", exact: true }).click();

  // Selecting text switches to the selection tools.
  await paragraph.evaluate((p) => {
    const text = p.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 18);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    p.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(
    page.getByRole("tab", { name: "Selection", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  // A single click in the text goes back to Voice.
  await paragraph.click({ position: { x: 5, y: 5 } });
  await expect(
    page.getByRole("tab", { name: "Voice", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
