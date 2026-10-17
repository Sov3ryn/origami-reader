import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

// Build a single-file design preview that can open without a web server.
// It contains only this setup interface and its branding artwork.
const output = resolve("dist");
let html = await readFile(resolve(output, "index.html"), "utf8");
const script = html.match(/<script[^>]+src="\.\/([^\"]+)"[^>]*><\/script>/);
const stylesheet = html.match(/<link[^>]+href="\.\/([^\"]+\.css)"[^>]*>/);
if (!script || !stylesheet)
  throw new Error("Expected Vite script and stylesheet entries.");
let js = await readFile(resolve(output, script[1]), "utf8");
let css = await readFile(resolve(output, stylesheet[1]), "utf8");
const files = ["crane.png", "moonlit-lake.webp"];
for (const directory of ["backgrounds", "ambient", "flags"]) {
  for (const file of await readdir(resolve(output, directory)))
    if (/\.(svg|png|webp)$/.test(file)) files.push(`${directory}/${file}`);
}
for (const name of files) {
  const mime = name.endsWith(".svg")
    ? "image/svg+xml"
    : name.endsWith(".webp")
      ? "image/webp"
      : "image/png";
  const data = `data:${mime};base64,${(await readFile(resolve(output, name))).toString("base64")}`;
  for (const path of [`./${name}`, `/${name}`]) {
    js = js.replaceAll(`"${path}"`, () => `"${data}"`);
    html = html.replaceAll(`"${path}"`, () => `"${data}"`);
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  css = css.replace(
    new RegExp(`url\\([^)]*${escaped}[^)]*\\)`, "g"),
    () => `url("${data}")`,
  );
}
js = js.replaceAll("</script", "<\\/script");
html = html.replace(script[0], () => `<script type="module">${js}</script>`);
html = html.replace(stylesheet[0], () => `<style>${css}</style>`);
await writeFile(resolve(output, "Origami-Setup-Preview.html"), html);
console.log("Created dist/Origami-Setup-Preview.html (interface only).");
