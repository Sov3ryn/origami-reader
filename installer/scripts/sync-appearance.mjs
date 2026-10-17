import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";

// Copy only the reader's appearance renderer and artwork, never the app payload.
await mkdir("src/appearance", { recursive: true });
for (const name of ["BackgroundScene", "FishRipples", "GardenEffects"]) {
  let source = await readFile(`../src/components/${name}.tsx`, "utf8");
  source = source
    .replace('"../backgrounds"', '"../../../src/backgrounds"')
    .replace('"../types"', '"../../../src/types"');
  // Keep wind travel inside the preview rather than the browser viewport.
  source = source.replaceAll('"vw"', '"cqw"').replaceAll('"vh"', '"cqh"');
  await writeFile(
    `src/appearance/${name}.tsx`,
    `// Synced by scripts/sync-appearance.mjs from the reader's visual components.\n${source}`,
  );
}
const styles = await readFile("../src/styles.css", "utf8");
const sceneStart = styles.indexOf(".background-art {");
const sceneEnd = styles.indexOf(".ambient-options {", sceneStart);
const paperStart = styles.indexOf(".surface-paper {");
const paperEnd = styles.indexOf(".reading-kicker {", paperStart);
if ([sceneStart, sceneEnd, paperStart, paperEnd].some((value) => value < 0))
  throw new Error("Reader appearance stylesheet boundaries changed.");
let css = styles
  .slice(sceneStart, sceneEnd)
  .replaceAll("petal-wind", "reader-petal-wind")
  .replaceAll("dvh", "cqh")
  .replaceAll("vh", "cqh")
  .replaceAll("vw", "cqw");
css += styles.slice(paperStart, paperEnd);
await writeFile(
  "src/appearance/reader-appearance.css",
  `/* Synced reader scene effects and paper textures. */\n${css}`,
);
// Replace, not merge, so retired scene files do not linger in the installer.
await rm("public/backgrounds", { recursive: true, force: true });
await cp("../public/backgrounds", "public/backgrounds", { recursive: true });
await cp("../public/ambient", "public/ambient", { recursive: true });
await cp("../public/flags", "public/flags", { recursive: true });
await cp("../public/moonlit-lake.webp", "public/moonlit-lake.webp");
