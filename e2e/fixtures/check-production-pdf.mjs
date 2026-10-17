// One-off check: import both sample PDFs into the production build served by
// `vite preview` on port 4173. Run: node e2e/fixtures/check-production-pdf.mjs
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:4173/");
await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
const files = ["e2e/fixtures/quiet-lake.pdf"];
if (existsSync("e2e/fixtures/korean-lake.pdf")) files.push("e2e/fixtures/korean-lake.pdf");
await page.locator("input[type=file]").setInputFiles(files);
for (const title of ["The Quiet Lake", "호수 이야기"].slice(0, files.length)) {
  const card = page.locator(".book-card").filter({ hasText: title });
  await card.waitFor({ timeout: 30000 });
  await card.locator(".book-open").click();
  await page.locator("[data-paragraph]").first().waitFor();
  const text = await page.locator(".reading-pages").innerText();
  console.log(title, "->", text.replace(/\s+/g, " ").slice(0, 140));
  await page.locator(".back-library").click();
}
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
