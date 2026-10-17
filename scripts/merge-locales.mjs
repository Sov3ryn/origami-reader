// Merges new translations into each locale and keeps keys in source order.
// Reads optional src/locales/delta/<code>.json files, drops keys no longer in
// source.json, then removes the delta folder.
//   node scripts/merge-locales.mjs
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), "src", "locales");
const source = JSON.parse(readFileSync(join(dir, "source.json"), "utf8"));
const deltaDir = join(dir, "delta");
for (const file of readdirSync(dir)) {
  if (!file.endsWith(".json") || file === "source.json") continue;
  const locale = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const deltaFile = join(deltaDir, file);
  const delta = existsSync(deltaFile) ? JSON.parse(readFileSync(deltaFile, "utf8")) : {};
  const merged = {};
  for (const key of source) {
    const value = delta[key] ?? locale[key];
    if (typeof value === "string" && value.trim()) merged[key] = value;
  }
  writeFileSync(join(dir, file), JSON.stringify(merged, null, 2) + "\n");
  console.log(file, Object.keys(merged).length + "/" + source.length);
}
if (existsSync(deltaDir)) rmSync(deltaDir, { recursive: true });
