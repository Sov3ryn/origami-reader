// Owner-only tool. Private signing keys and issued supporter files stay outside Git.
import { generateKeyPairSync } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { issueKey, publicKey, verifyKey, KEY_ID } from "../supporter/keys.mjs";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, keyFile, output] = process.argv.slice(2);
function outside(path) {
  if (!path || !isAbsolute(path)) throw new Error("Provide an absolute output path outside the repository.");
  const full = resolve(path), rel = relative(repo, full);
  if (!(rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))) throw new Error("Private keys and supporter files must stay outside the repository.");
  return full;
}
if (command === "init") {
  const path = outside(keyFile);
  if (existsSync(path)) throw new Error("The private key already exists. Keep using it so old keys remain valid.");
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pem, { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ [KEY_ID]: publicKey(pem) }, null, 2));
} else if (command === "issue") {
  const target = outside(output);
  const pem = readFileSync(outside(keyFile), "utf8");
  const key = issueKey(pem);
  const keys = JSON.parse(readFileSync(resolve(repo, "supporter/public-keys.json"), "utf8").replace(/^\uFEFF/, ""));
  verifyKey(key, keys);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, key + "\n", { mode: 0o600, flag: "wx" });
  console.log(`Supporter file written to ${target}. Reusable offline, without expiry or a device limit.`);
} else {
  console.error("Usage: node scripts/supporter-key.mjs init <private.pem>\n       node scripts/supporter-key.mjs issue <private.pem> <supporter.origami-supporter>");
  process.exitCode = 1;
}
