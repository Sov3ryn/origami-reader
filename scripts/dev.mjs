import { existsSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { spawn } from "node:child_process";
const local = resolve(".local/worker.json");
const env = { ...process.env };
if (existsSync(local)) env.ORIGAMI_WORKER_CONFIG = local;
const covers = resolve(".local/cover-engine.json");
if (existsSync(covers)) env.ORIGAMI_COVER_CONFIG = covers;
const cargo = resolve("../work/origami-tools/cargo");
const rustup = resolve("../work/origami-tools/rustup");
if (existsSync(cargo) && existsSync(rustup)) {
  env.CARGO_HOME = cargo;
  env.RUSTUP_HOME = rustup;
  // Windows calls it "Path"; reuse whichever spelling is present.
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") || "PATH";
  env[key] = resolve(cargo, "bin") + delimiter + (env[key] || "");
}
const cli = resolve("node_modules/@tauri-apps/cli/tauri.js");
const child = spawn(process.execPath, [cli, "dev"], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 1));
