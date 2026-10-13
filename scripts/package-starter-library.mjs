import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, "assets", "starter-library");
const manifest = JSON.parse(
  await readFile(join(directory, "manifest.json"), "utf8"),
);
const review = JSON.parse(
  await readFile(join(directory, "international-review.json"), "utf8"),
);
const country = process.argv
  .find((a) => a.startsWith("--country="))
  ?.slice(10)
  .toUpperCase();
if (
  process.argv.includes("--release") &&
  (!country || !review.releaseCountries.includes(country))
)
  throw new Error(
    "Release packaging requires a reviewed destination: --release --country=CODE. Unreviewed and special-fee destinations need separate review.",
  );
if (
  manifest.books.length !== 6 ||
  manifest.books.some(
    (b) => !b.commercialRedistribution || /(?:^|-)NC(?:-|$)/.test(b.license),
  )
)
  throw new Error(
    "The release selection must have six commercially redistributable titles.",
  );
const escape = (text) =>
  text.replace(
    /[<>&"]/g,
    (s) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[s],
  );
const colors = [
  "#938dc8",
  "#81b7cf",
  "#a5b5a7",
  "#d1a29f",
  "#d0b26a",
  "#b3a0d6",
];
const cards = manifest.books
  .map((book, i) => {
    const hours = book.wordCount / (150 * 60);
    return `<article style="--accent:${colors[i]}"><div class="number">${String(i + 1).padStart(2, "0")}</div><div><div class="category">${escape(book.category)}</div><h2>${escape(book.title)}</h2><p class="author">${escape(book.author)} · ${escape(book.publicationLabel || String(book.published))}</p><p>${escape(book.why)}</p><div class="metadata">${book.chapterCount} ${book.sourceKind === "author-stories" ? "stories" : "chapters"} · ${Math.round(book.wordCount / 1000)}k words · about ${hours.toFixed(1)} hours aloud</div><div class="links"><a href="../assets/starter-library/books/${book.filename}">Open EPUB</a><a href="${book.source}">Source edition</a></div></div></article>`;
  })
  .join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Origami starter library</title><style>
*{box-sizing:border-box}body{margin:0;background:#19171e;color:#e9e4ec;font:16px/1.65 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:56px 40px}header{margin-bottom:32px}h1{font:44px/1.15 Georgia,serif;margin:12px 0 20px}h2{font:27px/1.2 Georgia,serif;margin:7px 0 10px}.label{color:#b3a0d6;font-size:12px;text-transform:uppercase;letter-spacing:.16em}.intro{max-width:850px;color:#c5becd}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{display:flex;gap:20px;border:1px solid #39343f;border-radius:14px;padding:24px;background:#242029}.number{font:28px Georgia,serif;color:var(--accent);opacity:.7}.category{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent)}article p{color:#c5becd;margin:14px 0}.author{font-size:14px!important;color:#a9a1b1!important;margin:0!important}.metadata{font-size:12px;color:#a9a1b1}.links{display:flex;gap:24px;margin-top:18px}a{color:#cebbec;text-underline-offset:4px}.links a{color:var(--accent);font-size:13px}footer{margin-top:30px;padding:24px;border:1px solid #39343f;border-radius:14px;color:#c5becd}footer p{margin:0 0 12px}footer p:last-child{margin-bottom:0}.note{font-size:13px;color:#a9a1b1}@media(max-width:800px){main{padding:28px 18px}.grid{grid-template-columns:1fr}h1{font-size:36px}}
</style></head><body><main><header><div class="label">Origami · starter library</div><h1>Six complete books</h1><p class="intro">Six complete English editions selected for pay-what-you-want distribution. Try <strong>Journey to the Center of the Earth</strong> for adventure, <strong>Pride and Prejudice</strong> for dialogue, or the modern story collection for a shorter first listen.</p></header><section class="grid">${cards}</section><footer><p><strong>Redistribution:</strong> Five historical texts with all known text contributors deceased before 1925, plus a contemporary collection whose author expressly permits paid redistribution under CC BY-SA 4.0. Origami code remains MPL 2.0. No NC-only book is selected.</p><p>The economic-term review covers the US, Canada, UK, EU, Australia, Brazil, India, mainland China, Japan, Mexico and Jamaica. <strong>This is not unconditional worldwide clearance.</strong> Special public-domain fees, declarations and unreviewed destinations remain release gates. See the international review record.</p><p>The contemporary slot is a sixteen-story collection with realistic and speculative fiction, not a present-day novel. It includes adult themes and sexual references. Verne uses Malleson’s 1877 translation; the three runic diagrams are described in text. Source art and fonts are excluded.</p><p><a href="../assets/starter-library/RIGHTS.txt">Rights and translation record</a> · <a href="../assets/starter-library/manifest.json">Edition manifest</a> · <a href="../assets/starter-library/international-review.json">International review</a> · <a href="../../outputs/Origami-Starter-Library.zip">Download the six-book pack</a></p><p class="note">Listening lengths estimate 150 words per minute. They are not generation-time estimates. Books are prepared for the planned preloaded library and can be imported now; this preparation does not modify an existing library.</p></footer></main></body></html>`;
await writeFile(join(root, "docs", "STARTER-LIBRARY.html"), html);
const entries = {};
// Use an explicit allowlist so removed or stale books cannot enter a release ZIP.
const files = [
  "README.txt",
  "RIGHTS.txt",
  "selection.json",
  "manifest.json",
  "international-review.json",
  "CC0-1.0.txt",
  "CC-BY-SA-4.0.txt",
];
for (const book of manifest.books) {
  if (
    !/^starter-[a-z-]+$/.test(book.id) ||
    !/^[a-z-]+\.epub$/.test(book.filename)
  )
    throw new Error("Unexpected book path");
  const bytes = await readFile(join(directory, "books", book.filename));
  if (createHash("sha256").update(bytes).digest("hex") !== book.sha256)
    throw new Error("Prepared book hash mismatch");
  files.push(
    "books/" + book.filename,
    "sources/" + book.id + "-license.txt",
    "sources/" + book.id + "-colophon.txt",
  );
}
for (const name of files)
  entries["Origami-Starter-Library/" + name] = new Uint8Array(
    await readFile(join(directory, name)),
  );
if (process.argv.includes("--release"))
  entries["Origami-Starter-Library/DESTINATION.txt"] = new TextEncoder().encode(
    "Reviewed destination: " +
      country +
      ". See RIGHTS.txt for scope and requirements.\n",
  );
const output = join(
  dirname(root),
  "outputs",
  process.argv.includes("--release")
    ? `Origami-Starter-Library-${country}.zip`
    : "Origami-Starter-Library.zip",
);
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  zipSync(entries, { level: 9, mtime: new Date(2026, 9, 13) }),
);
console.log(output);
