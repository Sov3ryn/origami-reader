// Collects every interface string into src/locales/source.json, the list that
// translations are made from. Run after adding text to the interface:
//   node scripts/extract-strings.mjs [--check]
// --check reports strings missing from each locale without writing files.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const src = join(root, "src");
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name !== "locales") walk(path);
    } else if (/\.(ts|tsx)$/.test(name.name) && !name.name.endsWith(".d.ts"))
      files.push(path);
  }
};
walk(src);
// The installer shares this catalog. Its step titles, summary rows and lists
// pass plain literals to helpers, so capitalized literals there are included.
const installer = join(root, "installer", "src");
const installerFiles = readdirSync(installer)
  .filter((n) => /\.(ts|tsx)$/.test(n))
  .map((n) => join(installer, n));
files.push(...installerFiles);

const strings = new Set();
const literal = String.raw`"((?:[^"\\]|\\.)*)"`;
const patterns = [
  new RegExp(String.raw`\bt\(\s*` + literal, "g"),
  new RegExp(String.raw`new Error\(\s*` + literal, "g"),
  new RegExp(String.raw`\breport\(\s*` + literal, "g"),
  new RegExp(String.raw`\bnotify\(\s*` + literal, "g"),
];
// Labels stored in data lists and shown through t(label).
const dataFiles = {
  "themes.ts": [/\bname: "([^"]+)"/g, /\blabel: "([^"]+)"/g],
  "backgrounds.ts": [/\bname: "([^"]+)"/g],
  "binding.ts": [/\bname: "([^"]+)"/g],
  "components/AppearancePanel.tsx": [/\bname: "([^"]+)"/g],
  "components/AudioVisualizer.tsx": [/\bname: "([^"]+)"/g],
  "components/Shortcuts.tsx": [/\baction: "([^"]+)"/g, /\bgroup: "([^"]+)"/g],
  "App.tsx": [/\blabel: "([^"]+)"/g],
  "comfort.ts": [/\bname: "([^"]+)"/g, /\bdescription:\s*"([^"]+)"/g],
  "components/TextMenu.tsx": [/\bname: "([^"]+)"/g],
  "studio/StudioSetup.tsx": [/\bname: "([^"]+)"/g, /\bdoes: "([^"]+)"/g],
  // Mood labels: ["id", "Label", "prompt for the voice designer"].
  // Store profiles: name, credited narrator and note, and the stores that refuse.
  "studio/production.ts": [/\bname: "((?:[^"\\]|\\.)*)"/g, /\bnarrator: "((?:[^"\\]|\\.)*)"/g, /\bnote: "((?:[^"\\]|\\.)*)"/g, /refusingStores = "((?:[^"\\]|\\.)*)"/g],
  // Cast analysis steps: progress("Step", fraction).
  "studio/cast.ts": [/\["[a-z]+", "([A-Z][a-z]+)", "[A-Z][^"]{20,}"\]/g, /\bprogress\(\s*"([^"]+)"/g],
  // Cover title styles and inks: ["id", "Label"].
  "coverTitles.ts": [/\["[a-z]+", "([A-Z][^"]+)"\]/g],
  // Bookmark designs and cover patterns: ["id", "Label"].
  "bookmarks.ts": [/\["[a-z-]+", "([A-Z][^"]+)"\]/g],
  "coverGilding.ts": [/\["[a-z-]+", "([A-Z][^"]+)"\]/g],
  // Achievement names and goals, and the chapter titles: ["id", "Title"].
  "achievements.ts": [/\bname: "([^"]+)"/g, /\bgoal: "([^"]+)"/g, /\["[a-z]+", "([A-Z][^"]+)"\]/g],
  // Voice note spoken languages: ["code", "Label"].
  "work/voice/voice.ts": [/\["[a-z]*", "([^"]+)"\]/g],
  // Model descriptions and hardware notes, shown on the Models page.
  "modelCatalog.ts": [/\bdescription:\s*"([^"]+)"/g, /\bhardware:\s*"([^"]+)"/g],
  // Voice designer presets (name and style) and designError messages.
  "voiceDesign.ts": [/\bname: "([^"]+)"/g, /\bstyle: "([^"]+)"/g, /return "([^"]+)";/g],
};
// Single-quoted messages, used when the text itself contains double quotes.
const single = String.raw`'((?:[^'\\]|\\.)*)'`;
const singlePatterns = [
  new RegExp(String.raw`\bt\(\s*` + single, "g"),
  new RegExp(String.raw`\bnotify\(\s*` + single, "g"),
];
// Data literals such as "Garden · Spring day" mean the real character.
const unescape = (s) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const pattern of patterns)
    for (const m of text.matchAll(pattern)) strings.add(JSON.parse('"' + m[1] + '"'));
  for (const pattern of singlePatterns)
    for (const m of text.matchAll(pattern))
      strings.add(m[1].replace(/\\(['\\])/g, "$1"));
  if (installerFiles.includes(file))
    for (const m of text.matchAll(/"((?:[A-Z][^"\\]*[a-z][^"\\]*)|(?:\d\d \/ [A-Z]+))"/g))
      if (!/^[A-Z][a-zA-Z]*[A-Z]|\.(tsx?|css|png|svg|json)$|^(GET|POST)$/.test(m[1])) strings.add(m[1]);
  const rel = file.slice(src.length + 1).replaceAll("\\", "/");
  // Effect labels live in one object in backgrounds.ts.
  if (rel === "backgrounds.ts") {
    const block = text.slice(
      text.indexOf("effectLabels = {"),
      text.indexOf("} as const"),
    );
    for (const m of block.matchAll(/: "([^"]+)"/g)) strings.add(unescape(m[1]));
  }
  // Take review issues live in one record in production.ts. Only that block is
  // read, so the per-language credit table further down is left out.
  if (rel === "studio/production.ts") {
    const start = text.indexOf("issueText: Record<Issue, string> = {");
    if (start >= 0) {
      const block = text.slice(start, text.indexOf("};", start));
      for (const m of block.matchAll(/: "([^"]+)"/g)) strings.add(unescape(m[1]));
    }
  }
  for (const pattern of dataFiles[rel] || [])
    for (const m of text.matchAll(pattern)) strings.add(unescape(m[1]).replace(/\\(["\\])/g, "$1"));
}
// Place names and their celebration or milestone names, from the generated catalog.
for (const place of JSON.parse(readFileSync(join(src, "places", "places.json"), "utf8"))) {
  strings.add(place.title);
  strings.add(place.event);
}
// Values used as both data and display text.
for (const s of [
  "All books", "Favorites", "Unsorted", "Trash", "All", "Books", "Documents",
  "Between sentences", "Between paragraphs", "After headings",
  "Appearance", "Listening", "Pronunciation", "Voices", "Cover art",
  "Workspace", "Shortcuts", "Space", "Left", "Right", "Media keys", "Esc",
])
  strings.add(s);
const list = [...strings]
  .filter((s) => /[A-Za-z]{2,}/.test(s) && !s.startsWith("/"))
  .filter((s) => !/^(Speech unit limit|Spoken edits must|Spoken edits are too)/.test(s))
  .sort((a, b) => a.localeCompare(b));

const out = join(src, "locales", "source.json");
if (process.argv.includes("--check")) {
  for (const name of readdirSync(join(src, "locales"))) {
    if (name === "source.json" || !name.endsWith(".json")) continue;
    const locale = JSON.parse(readFileSync(join(src, "locales", name), "utf8"));
    const missing = list.filter((s) => !locale[s]);
    console.log(name, missing.length ? missing.length + " missing" : "complete");
  }
} else {
  writeFileSync(out, JSON.stringify(list, null, 2) + "\n");
  console.log(list.length + " strings written to src/locales/source.json");
  if (!existsSync(join(src, "locales", "fr.json")))
    console.log("No translations yet.");
}
