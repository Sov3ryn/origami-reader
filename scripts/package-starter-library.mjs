import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, "assets", "starter-library");
const manifest = JSON.parse(
  await readFile(join(directory, "manifest.json"), "utf8"),
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
    return `<article style="--accent:${colors[i]}"><div class="number">${String(i + 1).padStart(2, "0")}</div><div><div class="category">${escape(book.category)}</div><h2>${escape(book.title)}</h2><p class="author">${escape(book.author)} · ${book.published}</p><p>${escape(book.why)}</p><div class="metadata">${book.chapterCount} chapters · ${Math.round(book.wordCount / 1000)}k words · about ${hours.toFixed(1)} hours aloud</div><div class="links"><a href="../assets/starter-library/books/${book.filename}">Open EPUB</a><a href="${book.source}">Source edition</a></div></div></article>`;
  })
  .join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Origami starter library</title><style>
*{box-sizing:border-box}body{margin:0;background:#19171e;color:#e9e4ec;font:16px/1.65 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:56px 40px}header{margin-bottom:32px}h1{font:44px/1.15 Georgia,serif;margin:12px 0 20px}h2{font:27px/1.2 Georgia,serif;margin:7px 0 10px}.label{color:#b3a0d6;font-size:12px;text-transform:uppercase;letter-spacing:.16em}.intro{max-width:850px;color:#c5becd}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{display:flex;gap:20px;border:1px solid #39343f;border-radius:14px;padding:24px;background:#242029}.number{font:28px Georgia,serif;color:var(--accent);opacity:.7}.category{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent)}article p{color:#c5becd;margin:14px 0}.author{font-size:14px!important;color:#a9a1b1!important;margin:0!important}.metadata{font-size:12px;color:#a9a1b1}.links{display:flex;gap:24px;margin-top:18px}a{color:#cebbec;text-underline-offset:4px}.links a{color:var(--accent);font-size:13px}footer{margin-top:30px;padding:24px;border:1px solid #39343f;border-radius:14px;color:#c5becd}footer p{margin:0 0 12px}footer p:last-child{margin-bottom:0}.note{font-size:13px;color:#a9a1b1}@media(max-width:800px){main{padding:28px 18px}.grid{grid-template-columns:1fr}h1{font-size:36px}}
</style></head><body><main><header><div class="label">Origami · starter library</div><h1>Six complete books</h1><p class="intro">Selections for variety, narrative appeal and manageable starting points. Lead with <strong>The Hound of the Baskervilles</strong> for suspense, <strong>The Time Machine</strong> for a short first listen, or <strong>The Blue Castle</strong> for warmth and romance.</p></header><section class="grid">${cards}</section><footer><p><strong>Redistribution:</strong> The historical texts were reviewed for the US, Canada and UK. Standard Ebooks editorial contributions are CC0. App code remains MIT. This is not a worldwide clearance, and source cover artwork and fonts are excluded.</p><p>The realistic-fiction selection is set in the 1920s. The fantasy skews younger; the adventure is much longer. These choices are editorial recommendations, rather than a promise that every reader will enjoy every book.</p><p><a href="../assets/starter-library/RIGHTS.txt">Rights and translation record</a> · <a href="../assets/starter-library/manifest.json">Edition manifest</a> · <a href="../../outputs/Origami-Starter-Library.zip">Download the six-book pack</a></p><p class="note">Listening lengths estimate 150 words per minute. They are not generation-time estimates. Books are prepared for the planned preloaded library and can be imported now; this preparation does not modify an existing library.</p></footer></main></body></html>`;
await writeFile(join(root, "docs", "STARTER-LIBRARY.html"), html);
const entries = {};
async function collect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) await collect(target);
    else if (entry.isFile())
      entries[
        "Origami-Starter-Library/" +
          relative(directory, target).replaceAll("\\", "/")
      ] = new Uint8Array(await readFile(target));
  }
}
await collect(directory);
const output = join(dirname(root), "outputs", "Origami-Starter-Library.zip");
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  zipSync(entries, { level: 9, mtime: new Date(2026, 9, 13) }),
);
console.log(output);
