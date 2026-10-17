import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

const w =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const files = [
  {
    name: "letter.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(
      zipSync({
        "word/document.xml": strToU8(
          `<w:document ${w}><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Word heading</w:t></w:r></w:p><w:p><w:r><w:t>A paragraph from Word.</w:t></w:r></w:p></w:body></w:document>`,
        ),
      }),
    ),
    title: "letter",
    text: "A paragraph from Word.",
  },
  {
    name: "notes.rtf",
    mimeType: "application/rtf",
    buffer: Buffer.from(
      "{\\rtf1\\ansi{\\info{\\title Rich notes}}Caf\\'e9 notes in RTF.\\par}",
      "latin1",
    ),
    title: "Rich notes",
    text: "Café notes in RTF.",
  },
  {
    name: "tales.fb2",
    mimeType: "application/xml",
    buffer: Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Northern Tales</book-title></title-info></description><body><section><title><p>One</p></title><p>A tale from FB2.</p></section></body></FictionBook>',
    ),
    title: "Northern Tales",
    text: "A tale from FB2.",
  },
  {
    name: "article.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      "<html><head><title>Saved article</title></head><body><nav>Menu</nav><h1>Headline</h1><p>An article paragraph.</p></body></html>",
    ),
    title: "Saved article",
    text: "An article paragraph.",
  },
];

test("Word, RTF, FB2 and HTML files import with their titles and text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await page
    .locator("input[type=file]")
    .setInputFiles(
      files.map(({ name, mimeType, buffer }) => ({ name, mimeType, buffer })),
    );
  for (const file of files) {
    const card = page.locator(".book-card").filter({ hasText: file.title });
    await expect(card).toBeVisible();
    await card.locator(".book-open").click();
    await expect(page.locator(".reading-pages")).toContainText(file.text);
    await page.locator(".back-library").click();
  }
  // Navigation menus in saved pages are left out.
  await page
    .locator(".book-card")
    .filter({ hasText: "Saved article" })
    .locator(".book-open")
    .click();
  await expect(page.locator(".reading-pages")).not.toContainText("Menu");
});
