// Prepare the author's commercially licensed stories without third-party artwork.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { zipSync, strToU8 } from "fflate";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, "assets/starter-library");
const selection = JSON.parse(
  await readFile(join(destination, "selection.json"), "utf8"),
);
const book = selection.books.find((b) => b.id === "starter-grayson-stories");
if (!book || book.license !== "CC-BY-SA-4.0" || !book.commercialRedistribution)
  throw new Error("Commercial story selection required");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const escape = (s) =>
  s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
  );
const snapshotDir = join(root, ".local/international-starter-sources");
await mkdir(snapshotDir, { recursive: true });
const manifest = JSON.parse(
  await readFile(join(destination, "manifest.json"), "utf8"),
);
const previous = manifest.books.find((b) => b.id === book.id);
const sourceFiles = [];
async function fetchText(url, filename) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok)
    throw new Error(`Source download failed: ${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const expected = previous?.sourceFiles.find((f) => f.url === url);
  if (expected && expected.sha256 !== hash(bytes))
    throw new Error(`Pinned source changed, review before updating: ${url}`);
  await writeFile(join(snapshotDir, filename), bytes);
  sourceFiles.push({ url, sha256: hash(bytes) });
  return new TextDecoder().decode(bytes);
}
const licensePage = await fetchText(book.licenseSource, "author-license.html");
const licenseDoc = new JSDOM(licensePage).window.document;
const licenseText = licenseDoc
  .querySelector("main")
  ?.textContent.replace(/\s+/g, " ")
  .trim();
if (
  !licenseText?.includes("Attribution-ShareAlike 4.0") ||
  !licenseText.includes("free to request payment")
)
  throw new Error("Author's commercial license statement changed");
const legalText = await fetchText(
  "https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt",
  "CC-BY-SA-4.0.txt",
);
if (
  !legalText.includes("worldwide") ||
  !legalText.includes("Attribution-ShareAlike 4.0")
)
  throw new Error("CC license retrieval failed");
const index = new JSDOM(await fetchText(book.source, "story-index.html")).window
  .document;
const links = Array.from(index.querySelectorAll("main li a[href]"), (a) => ({
  title: a.textContent.replace(/\s+/g, " ").trim(),
  url: new URL(a.getAttribute("href"), book.source).href,
}));
if (
  links.length !== 16 ||
  new Set(links.map((l) => l.url)).size !== 16 ||
  links.some((l) => !l.url.startsWith("https://gbmj.net/stories/"))
)
  throw new Error("Story index changed; review the collection");
const sections = [];
for (let i = 0; i < links.length; i++) {
  const link = links[i];
  const doc = new JSDOM(await fetchText(link.url, `story-${i + 1}.html`)).window
    .document;
  const main = doc.querySelector("main");
  if (!main || main.querySelector("script,iframe,object,audio,video"))
    throw new Error("Unexpected story structure");
  const sourceBlocks = Array.from(
    main.querySelectorAll("p,h1,h2,h3,blockquote"),
    (p) => p.textContent.replace(/\s+/g, " ").trim(),
  ).filter(Boolean);
  const copyrights = Array.from(doc.querySelectorAll("footer p"), (p) =>
    p.textContent.replace(/\s+/g, " ").trim(),
  )
    .filter(Boolean)
    .join("\n");
  main.querySelectorAll("img,svg,style,nav").forEach((e) => e.remove());
  main.querySelectorAll("a").forEach((a) => a.replaceWith(...a.childNodes));
  main
    .querySelectorAll("*")
    .forEach((e) =>
      Array.from(e.attributes).forEach((a) => e.removeAttribute(a.name)),
    );
  const heading = main.querySelector("h1");
  if (
    !heading ||
    heading.textContent.replace(/\s+/g, " ").trim() !== link.title
  )
    throw new Error("Story heading mismatch");
  const replacement = doc.createElement("h2");
  replacement.textContent = link.title;
  heading.replaceWith(replacement);
  sections.push({
    title: link.title,
    url: link.url,
    file: `text/chapter-${i + 1}.xhtml`,
    body: Array.from(main.childNodes, (node) =>
      new doc.defaultView.XMLSerializer().serializeToString(node),
    ).join(""),
    sourceBlocks,
    copyrights,
  });
}
const notice = `${book.title} by ${book.author}. Text-only EPUB assembled from the author's online collection, reviewed 13 October 2026. Individual story copyright and publication notices appear in the credits. Original story wording and order are retained; website navigation, images and styling are excluded. Licensed separately from Origami under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0). Source: ${book.source} . Author license: ${book.licenseSource} . License: https://creativecommons.org/licenses/by-sa/4.0/ . Commercial redistribution is permitted with attribution, applicable ShareAlike conditions and no DRM. No author endorsement is implied. ${book.contentNotice}`;
const xhtml = (body, title) =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${escape(title)}</title></head><body>${body}</body></html>`;
const entries = { mimetype: [strToU8("application/epub+zip"), { level: 0 }] };
entries["META-INF/container.xml"] = strToU8(
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
);
entries["EPUB/text/title.xhtml"] = strToU8(
  xhtml(
    `<h1>${escape(book.title)}</h1><p>${escape(book.author)}</p><p>${escape(notice)}</p>`,
    book.title,
  ),
);
for (const section of sections)
  entries["EPUB/" + section.file] = strToU8(xhtml(section.body, section.title));
entries["EPUB/text/credits.xhtml"] = strToU8(
  xhtml(
    `<h2>Sources and license</h2><p>${escape(notice)}</p>${sections.map((s) => `<h3>${escape(s.title)}</h3><p>${escape(s.url)}</p><p>${escape(s.copyrights)}</p>`).join("")}<h3>Author's license statement</h3><p>${escape(licenseText)}</p><pre>${escape(legalText)}</pre>`,
    "Sources and license",
  ),
);
entries["EPUB/nav.xhtml"] = strToU8(
  xhtml(
    `<nav epub:type="toc"><h1>Contents</h1><ol>${sections.map((s) => `<li><a href="${s.file}">${escape(s.title)}</a></li>`).join("")}</ol></nav>`,
    "Contents",
  ),
);
entries["EPUB/content.opf"] = strToU8(
  `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:origami:${book.id}</dc:identifier><dc:title>${escape(book.title)}</dc:title><dc:creator>${escape(book.author)}</dc:creator><dc:language>en</dc:language><dc:source>${book.source}</dc:source><dc:rights>${escape(notice)}</dc:rights><meta property="dcterms:modified">2026-10-13T00:00:00Z</meta></metadata><manifest><item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${sections.map((s, i) => `<item id="s${i}" href="${s.file}" media-type="application/xhtml+xml"/>`).join("")}<item id="credits" href="text/credits.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="title"/>${sections.map((_, i) => `<itemref idref="s${i}"/>`).join("")}<itemref idref="credits"/></spine></package>`,
);
const epub = zipSync(entries, {
  level: 9,
  mtime: new Date("2026-10-13T00:00:00Z"),
});
await writeFile(join(destination, "books/grayson-stories.epub"), epub);
await writeFile(join(destination, "CC-BY-SA-4.0.txt"), legalText);
await writeFile(
  join(destination, "sources/starter-grayson-stories-license.txt"),
  notice + "\n\n" + licenseText + "\n",
);
await writeFile(
  join(destination, "sources/starter-grayson-stories-colophon.txt"),
  notice +
    "\n\n" +
    sections
      .map((s) => s.title + "\n" + s.url + "\n" + s.copyrights)
      .join("\n\n") +
    "\n",
);
const info = {
  ...book,
  revision: hash(sourceFiles.map((f) => f.sha256).join("")),
  sourceFiles,
  filename: "grayson-stories.epub",
  sha256: hash(epub),
  bytes: epub.length,
  chapterCount: 16,
  wordCount: sections
    .flatMap((s) => s.sourceBlocks)
    .join(" ")
    .split(/\s+/).length,
  finalContentFile: sections.at(-1).file,
  contentFiles: sections.map((s) => ({
    file: s.file,
    sha256: hash(s.sourceBlocks.join("\n")),
    sourceBlocks: s.sourceBlocks.length,
  })),
  artworkIncluded: false,
};
manifest.books = manifest.books.filter((b) => b.id !== book.id);
manifest.books.push(info);
await writeFile(
  join(destination, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    title: info.title,
    stories: 16,
    words: info.wordCount,
    bytes: info.bytes,
    license: info.license,
  }),
);
