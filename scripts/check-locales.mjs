// Validates translations against src/locales/source.json:
// every key present, no extra keys, identical {placeholders}, and leading or
// trailing spaces preserved. Untranslated values are listed as warnings.
//   node scripts/check-locales.mjs [code ...]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), "src", "locales");
const source = JSON.parse(readFileSync(join(dir, "source.json"), "utf8"));
const wanted = process.argv.slice(2);
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
// Strings that legitimately stay the same in every language.
const universal = /^(Origami( Reader| Studio)?|EPUB|TXT|Markdown|PDF|Ctrl|Shift|Alt|Tab|Esc|Linux|macOS|Windows|Garamond|Palatino|OpenDyslexic|Atkinson Hyperlegible|Aa|[\d\s/·.%×+-]+)$/;
let failed = false;
for (const file of readdirSync(dir).sort()) {
  const code = file.replace(/\.json$/, "");
  if (file === "source.json" || !file.endsWith(".json")) continue;
  if (wanted.length && !wanted.includes(code)) continue;
  let locale;
  try {
    locale = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (error) {
    console.log(`${code}: invalid JSON (${error.message})`);
    failed = true;
    continue;
  }
  const missing = source.filter((k) => typeof locale[k] !== "string" || !locale[k].trim());
  const extra = Object.keys(locale).filter((k) => !source.includes(k));
  const badPlaceholders = source.filter(
    (k) => locale[k] && placeholders(k) !== placeholders(locale[k]),
  );
  const edges = source.filter(
    (k) =>
      locale[k] &&
      ((/^\s/.test(k) && !/^\s/.test(locale[k])) || (/\s$/.test(k) && !/\s$/.test(locale[k]))),
  );
  const same = source.filter((k) => locale[k] === k && !universal.test(k) && /[a-z]{3}/.test(k));
  const ok = !missing.length && !badPlaceholders.length;
  if (!ok) failed = true;
  console.log(
    `${code}: ${Object.keys(locale).length}/${source.length} keys` +
      (missing.length ? `, ${missing.length} missing` : "") +
      (extra.length ? `, ${extra.length} extra` : "") +
      (badPlaceholders.length ? `, ${badPlaceholders.length} placeholder errors` : "") +
      (edges.length ? `, ${edges.length} edge-space differences` : "") +
      (same.length ? `, ${same.length} left in English` : "") +
      (ok ? " OK" : " FAILED"),
  );
  for (const k of badPlaceholders.slice(0, 5)) console.log("   placeholder:", JSON.stringify(k), "->", JSON.stringify(locale[k]));
  for (const k of missing.slice(0, 5)) console.log("   missing:", JSON.stringify(k));
}
process.exit(failed ? 1 : 0);
