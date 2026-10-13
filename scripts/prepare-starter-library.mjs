// Prepare complete text editions without third-party cover art or fonts.
// Source revisions and hashes are recorded for the distribution review.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { JSDOM } from "jsdom";
import { zipSync, strToU8 } from "fflate";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, "assets", "starter-library");
const selection = JSON.parse(
  await readFile(join(destination, "selection.json"), "utf8"),
);
await mkdir(join(destination, "books"), { recursive: true });
await mkdir(join(destination, "sources"), { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const escape = (text) =>
  text.replace(
    /[<>&"]/g,
    (s) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[s],
  );
const text = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.text();
};
const parse = (source) =>
  new JSDOM(source, { contentType: "application/xhtml+xml" }).window.document;
const document = (body) =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Book</title></head><body>${body}</body></html>`;
const report = [];
for (const book of selection.books) {
  if (book.sourceKind === "author-stories") {
    const prepared = JSON.parse(
      await readFile(join(destination, "manifest.json"), "utf8"),
    ).books.find((b) => b.id === book.id);
    if (
      !prepared ||
      hash(await readFile(join(destination, "books", prepared.filename))) !==
        prepared.sha256
    )
      throw new Error(
        "Run scripts/prepare-commercial-stories.mjs to prepare the author's licensed collection first.",
      );
    report.push(prepared);
    continue;
  }
  if (
    !/^starter-[a-z-]+$/.test(book.id) ||
    !/^[a-z0-9_-]+$/.test(book.repository)
  )
    throw new Error("Invalid selection identifier");
  // Once generated, use the recorded commit, rather than silently changing editions.
  let previous;
  try {
    previous = JSON.parse(
      await readFile(join(destination, "manifest.json"), "utf8"),
    ).books.find((b) => b.id === book.id);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const page = previous ? "" : await text(book.source);
  const revision =
    previous?.revision ||
    page.match(
      new RegExp(
        `github\\.com/standardebooks/${book.repository}/commit/([a-f0-9]{40})`,
      ),
    )?.[1];
  if (!revision) throw new Error(`No source revision for ${book.title}`);
  const base = `https://raw.githubusercontent.com/standardebooks/${book.repository}/${revision}/`;
  const [packageXml, license, colophon] = await Promise.all([
    text(base + "src/epub/content.opf"),
    text(base + "LICENSE.md"),
    text(base + "src/epub/text/colophon.xhtml"),
  ]);
  const pkg = parse(packageXml);
  const items = new Map(
    Array.from(pkg.querySelectorAll("manifest > item"), (el) => [
      el.getAttribute("id"),
      el.getAttribute("href"),
    ]),
  );
  const files = Array.from(pkg.querySelectorAll("spine > itemref"), (el) =>
    items.get(el.getAttribute("idref")),
  ).filter(
    (name) =>
      !/^text\/(?:titlepage|imprint|halftitlepage|colophon|uncopyright|loi)\.xhtml$/.test(
        name,
      ),
  );
  if (
    !files.length ||
    files.some((name) => !/^text\/[a-z0-9-]+\.xhtml$/.test(name))
  )
    throw new Error(`Unexpected spine for ${book.title}`);
  const chapters = [];
  // Bounded concurrency keeps the source host load modest and output order stable.
  for (let i = 0; i < files.length; i += 6) {
    const batch = await Promise.all(
      files.slice(i, i + 6).map(async (file) => {
        const original = await text(base + "src/epub/" + file);
        const doc = parse(original);
        // Retain the reviewed runic diagrams' descriptions, without SVG art.
        // The cipher's Latin transcription remains in chapter 3.
        if (book.id === "starter-journey-center-earth") {
          for (const img of doc.querySelectorAll("body img")) {
            if (
              ![
                "../images/glyph-1.svg",
                "../images/glyph-2.svg",
                "../images/glyph-3.svg",
              ].includes(img.getAttribute("src"))
            )
              throw new Error(`Unreviewed illustration: ${file}`);
            const description = doc.createElementNS(
              "http://www.w3.org/1999/xhtml",
              "p",
            );
            description.textContent =
              "[Diagram omitted in this text-only edition: " +
              img.getAttribute("alt") +
              "]";
            img.replaceWith(description);
          }
        }
        if (
          doc.querySelector(
            "body img, body svg, body script, body iframe, body object, body audio, body video",
          )
        )
          throw new Error(`Non-text content needs review: ${file}`);
        if (
          Array.from(doc.querySelectorAll("body [href]"), (el) =>
            el.getAttribute("href"),
          ).some((href) => /^(?:https?:|\/\/|data:|javascript:)/i.test(href))
        )
          throw new Error(`External link needs review: ${file}`);
        // Retain the chapter's XHTML text and structure, removing unused style links.
        doc.querySelectorAll("head link").forEach((el) => el.remove());
        const source = new doc.defaultView.XMLSerializer().serializeToString(
          doc,
        );
        return {
          file,
          source,
          originalHash: hash(original),
          title:
            doc
              .querySelector("h1,h2,h3,title")
              ?.textContent?.replace(/\s+/g, " ")
              .trim() || file,
          body: doc.body.textContent.replace(/\s+/g, " ").trim(),
        };
      }),
    );
    chapters.push(...batch);
  }
  const entries = { mimetype: strToU8("application/epub+zip") };
  entries["META-INF/container.xml"] = strToU8(
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  const synopsis = `<h1>${escape(book.title)}</h1><p>${escape(book.author)}</p>`;
  entries["EPUB/text/title.xhtml"] = strToU8(document(synopsis));
  for (const chapter of chapters)
    entries["EPUB/" + chapter.file] = strToU8(chapter.source);
  entries["EPUB/nav.xhtml"] = strToU8(
    document(
      `<nav epub:type="toc"><h1>Contents</h1><ol>${chapters.map((ch) => `<li><a href="${ch.file}">${escape(ch.title)}</a></li>`).join("")}</ol></nav>`,
    ),
  );
  entries["EPUB/content.opf"] = strToU8(
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:origami:${book.id}</dc:identifier><dc:title>${escape(book.title)}</dc:title><dc:creator>${escape(book.author)}</dc:creator><dc:language>en</dc:language><dc:source>${escape(book.source)}</dc:source><dc:rights>${escape(book.rightsBasis)} Standard Ebooks contributions: CC0 1.0. Commercial redistribution of these text editions is permitted where local requirements are satisfied. No universal territorial clearance is claimed. See RIGHTS.txt and international-review.json.</dc:rights><meta property="dcterms:modified">2026-10-13T00:00:00Z</meta></metadata><manifest><item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((ch, i) => `<item id="c${i}" href="${ch.file}" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine><itemref idref="title"/>${chapters.map((_, i) => `<itemref idref="c${i}"/>`).join("")}</spine></package>`,
  );
  // EPUB requires the first member, mimetype, to be stored without compression.
  entries.mimetype = [entries.mimetype, { level: 0 }];
  const bytes = zipSync(entries, {
    level: 9,
    mtime: new Date("2026-10-13T00:00:00Z"),
  });
  const filename = book.id.replace("starter-", "") + ".epub";
  await writeFile(join(destination, "books", filename), bytes);
  await writeFile(
    join(destination, "sources", book.id + "-license.txt"),
    license,
  );
  // Plain-text provenance retains credits without distributing the referenced artwork.
  await writeFile(
    join(destination, "sources", book.id + "-colophon.txt"),
    "Source edition colophon. Referenced artwork, fonts and logos are excluded from Origami's text EPUB.\n\n" +
      parse(colophon).body.textContent.replace(/\s+/g, " ").trim() +
      "\n",
  );
  const info = {
    ...book,
    revision,
    filename,
    sha256: hash(bytes),
    bytes: bytes.length,
    chapterCount: chapters.filter((ch) =>
      /chapter-\d+(?:-\d+)*\.xhtml$/.test(ch.file),
    ).length,
    finalContentFile: chapters.at(-1).file,
    wordCount: chapters.reduce((n, ch) => n + ch.body.split(/\s+/).length, 0),
    contentFiles: chapters.map(({ file, originalHash }) => ({
      file,
      sha256: originalHash,
    })),
    artworkIncluded: false,
  };
  report.push(info);
  console.log(
    `${book.title}: ${info.chapterCount} chapters, ${info.wordCount.toLocaleString()} words, ${(bytes.length / 1024).toFixed(0)} KB`,
  );
}
await writeFile(
  join(destination, "manifest.json"),
  JSON.stringify(
    {
      version: selection.version,
      prepared: "2026-10-13",
      distributionIntent: selection.distributionIntent,
      globalClearance: false,
      format:
        "Five historical text EPUBs and one commercially licensed contemporary story collection; third-party artwork excluded",
      books: report,
    },
    null,
    2,
  ) + "\n",
);
