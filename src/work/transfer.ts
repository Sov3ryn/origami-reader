import { Editor } from "@tiptap/core";
import katex from "katex";
import { decodeText, readDocx, readOdt, readRtf, type Block } from "../importers";
import { noteExtensions } from "./editorExtensions";
import { embedsAsLinks } from "./embeds/EmbedBlock";
import { inkToSvg, parseInk } from "./ink/ink";
import { toExcalidrawFile } from "./boards/model";
import { planToDxf, planToSvg } from "./plans/model";
import { clozeParts } from "./cards";
import { escapeHtml } from "./text";
import type { WorkData } from "./types";

// Runs HTML or Markdown through the note schema. Anything the editor does not
// know (scripts, styles, forms, event handlers, remote frames) is dropped.
function viaSchema<T>(content: string, markdown: boolean, read: (e: Editor) => T): T {
  const editor = new Editor({
    extensions: noteExtensions(),
    content,
    ...(markdown ? { contentType: "markdown" as const } : {}),
  });
  try {
    return read(editor);
  } finally {
    editor.destroy();
  }
}
export const cleanHtml = (html: string) => viaSchema(html, false, (e) => e.getHTML());
// ```mermaid blocks become diagrams (the HTML pass knows them; Markdown
// tokens arrive as code blocks).
export const markdownToHtml = (md: string) => {
  const html = viaSchema(md, true, (e) => e.getHTML());
  return html.includes("language-mermaid") ? cleanHtml(html) : html;
};
export const htmlToMarkdown = (html: string) => viaSchema(html, false, (e) => e.getMarkdown());

// --- Import --------------------------------------------------------------------
export const NOTE_IMPORTS = [".html", ".htm", ".xhtml", ".md", ".markdown", ".txt", ".docx", ".odt", ".rtf"];

function blocksToHtml(blocks: Block[]) {
  return blocks
    .map((b) => {
      const text = escapeHtml(b.text);
      if (b.heading) return `<h${Math.min(3, b.heading)}>${text}</h${Math.min(3, b.heading)}>`;
      if (b.quote) return `<blockquote><p>${text}</p></blockquote>`;
      return `<p>${text}</p>`;
    })
    .join("");
}
const baseName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Imported note";

// Pages saved from AI chats and artifacts are often whole apps. Their text,
// headings, lists, tables, code and images come across; the scripts do not.
export function htmlDocumentToNote(source: string, fallback: string) {
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script,style,noscript,iframe,object,embed,link,meta,template,form,svg,canvas,video,audio").forEach((el) => el.remove());
  const h1 = doc.querySelector("h1");
  const title = (doc.title || h1?.textContent || fallback).replace(/\s+/g, " ").trim().slice(0, 140);
  if (h1 && h1.textContent?.replace(/\s+/g, " ").trim() === title) h1.remove();
  const main = doc.querySelector("main, article") || doc.body;
  return { title, html: cleanHtml(main?.innerHTML || "") };
}

export function markdownToNote(md: string, fallback: string) {
  const heading = /^#\s+(.+)$/m.exec(md);
  const title = (heading?.[1] || fallback).trim().slice(0, 140);
  const body = heading && md.trimStart().startsWith(heading[0]) ? md.replace(heading[0], "") : md;
  return { title, html: markdownToHtml(body) };
}

// Imported files are data: an embed inside one (from another Origami export or
// an AI page) arrives as a plain link, and only the reader can make it live.
export async function importAsNote(file: File): Promise<{ title: string; html: string } | null> {
  const note = await readNote(file);
  return note && { ...note, html: embedsAsLinks(note.html) };
}
async function readNote(file: File): Promise<{ title: string; html: string } | null> {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  if (!NOTE_IMPORTS.includes(ext)) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fallback = baseName(file.name);
  if (ext === ".html" || ext === ".htm" || ext === ".xhtml") return htmlDocumentToNote(decodeText(bytes), fallback);
  if (ext === ".md" || ext === ".markdown") return markdownToNote(decodeText(bytes), fallback);
  if (ext === ".txt")
    return {
      title: fallback,
      html: decodeText(bytes)
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join(""),
    };
  const doc = ext === ".docx" ? readDocx(bytes) : ext === ".odt" ? readOdt(bytes) : readRtf(bytes);
  return { title: doc.title || fallback, html: blocksToHtml(doc.blocks) };
}

// --- Export --------------------------------------------------------------------
const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
export function safeName(name: string) {
  const s = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80);
  if (!s) return "Untitled";
  return reserved.test(s) ? "_" + s : s;
}

const page = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{max-width:46rem;margin:3rem auto;padding:0 1.2rem;font:17px/1.65 Georgia,serif;color:#24212b;background:#fbf9f6}
h1,h2,h3{font-family:system-ui,sans-serif;line-height:1.25}
blockquote{margin:1.2em 0;padding:.2em 1em;border-left:3px solid #8f7bd8;color:#4a4553}
a.note-link,a.passage-link{color:#6a52c4;text-decoration:none;border-bottom:1px dotted}
mark{background:#f6e7a8}
table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.3em .6em}
pre{background:#f0edf5;padding:.8em;overflow:auto}
img{max-width:100%}
.formula{text-align:center;margin:1em 0}
figure.ink,figure.diagram,figure.plan{margin:1em 0;text-align:center}figure.plan svg{width:100%;height:auto}
aside.stickies{float:right;width:14rem;margin:0 0 1rem 1.5rem;font:14px/1.45 system-ui,sans-serif}aside.stickies h2{font-size:13px}.sticky{padding:.6em .8em;background:#fff3a6;box-shadow:0 2px 6px #0002}.sticky-pink{background:#ffd1e6}.sticky-green{background:#cdf3cf}.sticky-blue{background:#cfe6ff}.sticky-orange{background:#ffdcb5}.sticky-violet{background:#e3d8ff}figure.ink svg{width:100%;height:auto}figure.diagram svg{max-width:100%;height:auto}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`;

// Formulas export as MathML, which browsers draw without KaTeX's files.
const unescapeAttr = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
export function mathAsMathml(html: string) {
  return html.replace(
    /<(span|div)\b([^>]*\bdata-type="(inline|block)-math"[^>]*)>\s*<\/\1>/g,
    (_m, _tag: string, attrs: string, kind: string) => {
      const latex = unescapeAttr(/\bdata-latex="([^"]*)"/.exec(attrs)?.[1] || "");
      let out: string;
      try {
        out = katex.renderToString(latex, { output: "mathml", displayMode: kind === "block", throwOnError: false, strict: "ignore" });
      } catch {
        out = `<code>${escapeHtml(latex)}</code>`;
      }
      return kind === "block" ? `<div class="formula">${out}</div>` : out;
    },
  );
}

// Diagrams export as the SVG drawn for them, or as their text.
export function diagramsAsSvg(html: string, svgs?: Map<string, string>) {
  return html.replace(/<div\b[^>]*\bdata-diagram="([^"]*)"[^>]*>\s*<\/div>/g, (_m, raw: string) => {
    const code = unescapeAttr(raw);
    const svg = svgs?.get(code);
    return svg ? `<figure class="diagram">${svg}</figure>` : `<pre class="diagram"><code>${escapeHtml(code)}</code></pre>`;
  });
}

// Handwriting exports as an SVG drawing (with its read text for screen readers).
function inkFromTag(tag: string) {
  const data = /\bdata-ink="([^"]*)"/.exec(tag)?.[1] || "";
  const text = /\bdata-ink-text="([^"]*)"/.exec(tag)?.[1];
  return inkToSvg(parseInk(unescapeAttr(data)), text ? unescapeAttr(text) : "Handwriting");
}
export function inkAsSvg(html: string) {
  return html.replace(/<div\b[^>]*\bdata-ink="[^"]*"[^>]*>\s*<\/div>/g, (m) => `<figure class="ink">${inkFromTag(m)}</figure>`);
}

function csv(values: string[]) {
  return values.map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
}
const tsv = (s: string) => s.replace(/[\t\r\n]+/g, " ");

// extras: chart images (SVG by chart id) and spreadsheets (.xlsx as base64 by
// sheet id), made by the caller because both need libraries loaded on demand.
export type ExportExtras = { chartSvgs?: Map<string, string>; sheetFiles?: Map<string, string>; diagramSvgs?: Map<string, string>; boardSvgs?: Map<string, string> };
export function exportFiles(data: WorkData, markdown = true, extras: ExportExtras = {}): [string, string][] {
  const files: [string, string][] = [];
  // Charts go to Charts/, and notes point at them with relative paths.
  const chartFile = new Map<string, string>();
  for (const c of data.charts || []) {
    const svg = extras.chartSvgs?.get(c.id);
    if (!svg) continue;
    const name = `Charts/${safeName(c.title || "Chart")}-${c.id.slice(0, 6)}.svg`;
    chartFile.set(c.id, name);
    files.push([name, svg]);
  }
  const up = (path: string) => "../".repeat(path.split("/").length - 1);
  const chartTitle = (id: string) => data.charts?.find((c) => c.id === id)?.title || "Chart";
  const withCharts = (html: string, path: string) =>
    html.replace(/<div\b[^>]*\bdata-chart="([^"]*)"[^>]*>\s*<\/div>/g, (_m, id: string) => {
      const file = chartFile.get(id);
      return file ? `<figure class="chart"><img src="${up(path)}${file}" alt="${escapeHtml(chartTitle(id))}"></figure>` : "";
    });
  const mdCharts = (md: string, path: string) =>
    md.replace(/!\[Chart\]\(chart:([^)]*)\)/g, (_m, id: string) => {
      const file = chartFile.get(id);
      return file ? `![${chartTitle(id)}](${up(path)}${file})` : "";
    });
  const used = new Set<string>();
  const unique = (path: string, ext: string) => {
    let p = path;
    for (let n = 2; used.has((p + ext).toLowerCase()); n++) p = `${path} (${n})`;
    used.add((p + ext).toLowerCase());
    return p + ext;
  };
  const subjectPath = (id?: string): string => {
    const s = data.subjects.find((x) => x.id === id);
    if (!s) return "";
    const parent = s.parent ? subjectPath(s.parent) : "";
    return (parent ? parent + "/" : "") + safeName(s.name);
  };
  // Plans: a real-size drawing and a DXF for CAD programs. Notes showing a
  // plan point their Markdown at its drawing.
  const planFile = new Map<string, string>();
  for (const plan of data.plans || []) {
    const folder = subjectPath(plan.subjectId);
    const base = unique((folder ? folder + "/" : "") + safeName(plan.title || "Plan"), ".dxf");
    files.push([base, planToDxf(plan)]);
    files.push([base.replace(/\.dxf$/, ".svg"), planToSvg(plan)]);
    planFile.set(plan.id, base.replace(/\.dxf$/, ".svg"));
  }
  // Plans shown in notes become their drawing.
  const planOf = new Map((data.plans || []).map((p) => [p.id, p]));
  const withPlans = (html: string) =>
    html.replace(/<div\b[^>]*\bdata-plan="([^"]*)"[^>]*>\s*<\/div>/g, (_m, id: string) => {
      const plan = planOf.get(id);
      if (!plan) return "";
      const blueprint = plan.paper !== "white" && plan.paper !== "grid";
      return `<figure class="plan">${planToSvg(plan, blueprint ? "#eef5ff" : "#1d2a44", blueprint ? "#1f4e8c" : "#ffffff")}</figure>`;
    });
  for (const note of data.notes) {
    const folder = subjectPath(note.subjectId);
    const base = (folder ? folder + "/" : "") + safeName(note.title || "Untitled");
    const html = unique(base, ".html");
    // Sticky notes follow the note, as a short list at the end.
    const notesOn = (data.stickies || []).filter((s) => s.doc === note.id && s.text.trim());
    const stickyHtml = notesOn.length
      ? `<aside class="stickies"><h2>Sticky notes</h2>${notesOn.map((s) => `<p class="sticky sticky-${escapeHtml(s.color)}">${escapeHtml(s.text).replace(/\n/g, "<br>")}</p>`).join("")}</aside>`
      : "";
    const stickyMd = notesOn.length ? "\n\n## Sticky notes\n\n" + notesOn.map((s) => "> [!NOTE]\n> " + s.text.replace(/\n/g, "\n> ")).join("\n\n") : "";
    files.push([html, page(note.title || "Untitled", stickyHtml + withPlans(diagramsAsSvg(inkAsSvg(mathAsMathml(embedsAsLinks(withCharts(note.html, html)))), extras.diagramSvgs)))]);
    if (markdown) {
      // Handwriting goes to Ink/ as SVG files the Markdown points at.
      const inks = new Map<string, string>();
      for (const m of note.html.matchAll(/<div\b[^>]*\bdata-ink="[^"]*"[^>]*>/g)) {
        const id = /\bdata-ink-id="([^"]*)"/.exec(m[0])?.[1];
        if (id) inks.set(id, inkFromTag(m[0]));
      }
      const md = mdCharts(htmlToMarkdown(note.html), html)
        .replace(/!\[Plan\]\(plan:([\w-]*)\)/g, (_m, id: string) => {
          const file = planFile.get(id);
          return file ? `![${planOf.get(id)?.title || "Plan"}](${up(html)}${file})` : "";
        })
        .replace(/!\[([^\]]*)\]\(ink:([\w-]*)\)/g, (_m, text: string, id: string) => {
        const svg = inks.get(id);
        if (!svg) return text;
        const file = `Ink/${safeName(note.title || "Untitled")}-${id}.svg`;
        files.push([file, svg]);
        return `![${text}](${up(html)}${file})`;
      });
      files.push([html.replace(/\.html$/, ".md"), `# ${note.title || "Untitled"}\n\n${md}${stickyMd}\n`]);
    }
  }
  for (const sheet of data.sheets || []) {
    const b64 = extras.sheetFiles?.get(sheet.id);
    if (!b64) continue;
    const folder = subjectPath(sheet.subjectId);
    files.push([unique((folder ? folder + "/" : "") + safeName(sheet.title || "Sheet"), ".xlsx"), "base64:" + b64]);
  }
  // Boards: the drawing as .excalidraw (opens in Excalidraw and Obsidian), and a picture.
  for (const board of data.boards || []) {
    const folder = subjectPath(board.subjectId);
    const base = unique((folder ? folder + "/" : "") + safeName(board.title || "Board"), ".excalidraw");
    files.push([base, toExcalidrawFile(board)]);
    const svg = extras.boardSvgs?.get(board.id);
    if (svg) files.push([base.replace(/\.excalidraw$/, ".svg"), svg]);
  }
  const sourceTitle = (c: WorkData["cards"][number]) => c.source?.title || "";
  const plain = (c: WorkData["cards"][number]) =>
    c.type === "cloze" ? clozeParts(c.front).map((p) => p.text).join("") : c.front;
  files.push([
    "Study cards/cards.csv",
    [csv(["type", "front", "back", "source", "subject"])]
      .concat(
        data.cards.map((c) =>
          csv([c.type, c.front, c.type === "cloze" ? plain(c) : c.back, sourceTitle(c), data.subjects.find((s) => s.id === c.subjectId)?.name || ""]),
        ),
      )
      .join("\n"),
  ]);
  // Anki imports tab-separated text: basic cards, and cloze cards for the
  // "Cloze" note type.
  files.push([
    "Study cards/anki-basic.txt",
    data.cards
      .filter((c) => c.type !== "cloze")
      .map((c) => `${tsv(c.front)}\t${tsv(c.back)}`)
      .join("\n"),
  ]);
  files.push([
    "Study cards/anki-cloze.txt",
    data.cards
      .filter((c) => c.type === "cloze")
      .map((c) => {
        let n = 0;
        return `${tsv(c.front.replace(/\{\{([\s\S]+?)\}\}/g, (_m, w) => `{{c${++n}::${w}}}`))}\t${tsv(sourceTitle(c))}`;
      })
      .join("\n"),
  ]);
  files.push([
    "README.txt",
    [
      "Exported from Origami Work Mode.",
      "",
      "Each note is saved twice: as an .html page that opens in any browser, and as Markdown (.md) for other note apps.",
      "Study cards/cards.csv has every card. anki-basic.txt and anki-cloze.txt import into Anki (File, Import; use the Basic and Cloze note types).",
    ].join("\n"),
  ]);
  return files;
}
