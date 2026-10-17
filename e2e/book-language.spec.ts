import { expect, test } from "@playwright/test";

const french =
  "Le vieil homme marchait vers le port avec son chien, et il était clair qu'il ne dormait pas. Il regardait les bateaux dans la brume mais ne disait rien.";

test("imported books show a flag for their language, editable in Details", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "le-port.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(Array(6).fill(french).join("\n\n")),
  });
  const card = page.locator(".book-card").filter({ hasText: "le-port" });
  await expect(card.locator(".book-flag[title=French]")).toBeVisible();
  // Starter books are scanned in the background and get their flag too.
  await expect(
    page
      .locator(".book-card")
      .filter({ hasText: "Dracula" })
      .locator(".book-flag[title=English]"),
  ).toBeVisible();

  await card.locator(".book-open").click();
  await page.locator("[data-paragraph]").first().waitFor();
  await page
    .getByRole("button", { name: "Expand inspector", exact: true })
    .click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Book language" })
    .selectOption("es");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page.locator(".back-library").click();
  await expect(card.locator(".book-flag[title=Spanish]")).toBeVisible();
});
