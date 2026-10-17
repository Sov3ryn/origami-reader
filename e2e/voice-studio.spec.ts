import { test, expect } from "@playwright/test";
test("voice workspace preserves a design draft and clearly requires the native creator", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Voices", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "My voices", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Create a voice", exact: true }).click();
  await page.getByLabel("Voice name", { exact: true }).fill("Harbor narrator");
  await page
    .getByRole("button", { name: "Seasoned scholar", exact: true })
    .click();
  await expect(
    page.getByLabel("Voice description", { exact: true }),
  ).toHaveValue(/older man/);
  await page.getByLabel("Language", { exact: true }).selectOption("French");
  await expect(page.getByLabel("Sample passage", { exact: true })).toHaveValue(
    /La pluie/,
  );
  await expect(
    page.getByRole("button", { name: /Generate takes/ }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "My voices", exact: true }).click();
  await expect(page.getByLabel("Voice name", { exact: true })).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Voices", exact: true }).click();
  await page.getByRole("tab", { name: "Create a voice", exact: true }).click();
  await expect(page.getByLabel("Voice name", { exact: true })).toHaveValue(
    "Harbor narrator",
  );
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue(
    "French",
  );
  await page.screenshot({
    path: "../outputs/Origami-Voice-Studio/studio-browser.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Manage models", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Qwen VoiceDesign 1.7B", exact: true }),
  ).toBeVisible();
});
