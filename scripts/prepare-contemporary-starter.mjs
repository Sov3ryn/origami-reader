// Text-only adaptation of the author's explicitly licensed edition.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { zipSync, strToU8 } from "fflate";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, "assets/starter-library");
const sourceUrl =
  "https://craphound.com/littlebrother/Cory_Doctorow_-_Little_Brother.htm";
const sourceHash =
  "9a03c6daa7886e2878eda38bdbb97e7855d5c7883bea26b6aff248573cbbbe34";
const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error("Little Brother source download failed");
const bytes = new Uint8Array(await response.arrayBuffer());
const hash = (data) => createHash("sha256").update(data).digest("hex");
if (hash(bytes) !== sourceHash)
  throw new Error(
    "The author's edition changed. Review the new source before updating the pinned hash.",
  );
const doc = new JSDOM(new TextDecoder().decode(bytes)).window.document;
const paragraphs = Array.from(doc.querySelectorAll("body p"), (p) =>
  p.textContent.replace(/\s+/g, " ").trim(),
).filter(Boolean);
if (
  !paragraphs.some((p) =>
    p.includes("Attribution-NonCommercial-ShareAlike 3.0"),
  )
)
  throw new Error("Source license missing");
const escape = (s) =>
  s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
  );
const xhtml = (body, title) =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${escape(title)}</title></head><body>${body}</body></html>`;
const sections = [
  {
    title: "Publication and license notes",
    file: "frontmatter.xhtml",
    paragraphs: [],
  },
];
for (const paragraph of paragraphs) {
  const chapter = paragraph.match(/^Chapter (\d+)$/);
  const heading =
    chapter ||
    /^(Epilogue|Afterword by Bruce Schneier|Afterword by Andrew "bunnie" Huang, Xbox Hacker|BIBLIOGRAPHY|ACKNOWLEDGEMENTS|Creative Commons)$/.test(
      paragraph,
    );
  if (heading)
    sections.push({
      title: paragraph,
      file: chapter
        ? `chapter-${chapter[1]}.xhtml`
        : `backmatter-${sections.length}.xhtml`,
      paragraphs: [],
    });
  else sections.at(-1).paragraphs.push(paragraph);
}
if (sections.filter((s) => s.file.startsWith("chapter-")).length !== 21)
  throw new Error("Chapter boundaries changed");
const book = {
  id: "starter-little-brother",
  title: "Little Brother",
  author: "Cory Doctorow",
  published: 2008,
  category: "Contemporary tech thriller",
  sourceKind: "author-html",
  source: "https://craphound.com/littlebrother/download/",
  editionSource: sourceUrl,
  license: "CC-BY-NC-SA-3.0",
  commercialRedistribution: false,
  why: "A teenager in modern San Francisco fights an invasive surveillance crackdown after a terrorist attack. Fast, tense and directly interested in privacy, technology and civil rights. Contemporary to its 2008 publication, not a story set in 2026. Includes mature themes and a brief sexual scene, but is not erotica.",
};
const notice =
  "Little Brother by Cory Doctorow, copyright 2008 Cory Doctorow. Author's HTML edition adapted to text-only EPUB for Origami, 13 October 2026. All source paragraphs, bookstore dedications, epilogue, afterwords and license text are retained in source order. Visual formatting simplified; images and external resources excluded. This EPUB adaptation is offered under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported (CC BY-NC-SA 3.0). License: https://creativecommons.org/licenses/by-nc-sa/3.0/ . Source: " +
  sourceUrl +
  " . No endorsement by the author is implied. This book is not covered by Origami's MPL 2.0 source license. Commercial redistributors must omit it or obtain separate permission. Do not apply DRM.\n";
const entries = { mimetype: [strToU8("application/epub+zip"), { level: 0 }] };
entries["META-INF/container.xml"] = strToU8(
  `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
);
entries["EPUB/text/title.xhtml"] = strToU8(
  xhtml(
    `<h1>${book.title}</h1><p>${book.author}</p><p>${escape(notice)}</p>`,
    book.title,
  ),
);
for (const section of sections)
  entries["EPUB/text/" + section.file] = strToU8(
    xhtml(
      `<h2>${escape(section.title)}</h2>${section.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("")}`,
      section.title,
    ),
  );
entries["EPUB/nav.xhtml"] = strToU8(
  xhtml(
    `<nav epub:type="toc"><h1>Contents</h1><ol>${sections.map((s) => `<li><a href="text/${s.file}">${escape(s.title)}</a></li>`).join("")}</ol></nav>`,
    "Contents",
  ),
);
entries["EPUB/content.opf"] = strToU8(
  `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:origami:${book.id}</dc:identifier><dc:title>${book.title}</dc:title><dc:creator>${book.author}</dc:creator><dc:language>en</dc:language><dc:source>${sourceUrl}</dc:source><dc:rights>${escape(notice)}</dc:rights><meta property="dcterms:modified">2026-10-13T00:00:00Z</meta></metadata><manifest><item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${sections.map((s, i) => `<item id="s${i}" href="text/${s.file}" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine><itemref idref="title"/>${sections.map((_, i) => `<itemref idref="s${i}"/>`).join("")}</spine></package>`,
);
const epub = zipSync(entries, {
  level: 9,
  mtime: new Date("2026-10-13T00:00:00Z"),
});
await mkdir(join(destination, "sources"), { recursive: true });
await writeFile(join(destination, "books/little-brother.epub"), epub);
const licenseStart = paragraphs.findIndex(
  (p) => p === "Creative Commons Legal Code",
);
if (licenseStart < 0) throw new Error("Full license not found");
await writeFile(
  join(destination, "sources/starter-little-brother-license.txt"),
  notice + "\n" + paragraphs.slice(licenseStart).join("\n\n") + "\n",
);
await writeFile(
  join(destination, "sources/starter-little-brother-colophon.txt"),
  notice + `\nPinned source SHA-256: ${sourceHash}\n`,
);
const selection = JSON.parse(
  await readFile(join(destination, "selection.json"), "utf8"),
);
selection.books = selection.books.map((b) =>
  ["starter-great-gatsby", book.id].includes(b.id) ? book : b,
);
await writeFile(
  join(destination, "selection.json"),
  JSON.stringify(selection, null, 2) + "\n",
);
const manifest = JSON.parse(
  await readFile(join(destination, "manifest.json"), "utf8"),
);
const info = {
  ...book,
  revision: sourceHash,
  filename: "little-brother.epub",
  sha256: hash(epub),
  bytes: epub.length,
  chapterCount: 21,
  wordCount: paragraphs.join(" ").split(/\s+/).length,
  sourceParagraphCount: paragraphs.length,
  contentFiles: [{ file: sourceUrl, sha256: sourceHash }],
  artworkIncluded: false,
};
manifest.books = manifest.books.map((b) =>
  ["starter-great-gatsby", book.id].includes(b.id) ? info : b,
);
manifest.format =
  "Complete text EPUBs; five historical editions and one separately licensed contemporary novel";
await writeFile(
  join(destination, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    title: book.title,
    chapters: 21,
    paragraphs: paragraphs.length,
    bytes: epub.length,
    license: book.license,
  }),
);
