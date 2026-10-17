import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Connect, Plugin } from "vite";

const execute = promisify(execFile);
let choosing = false;

async function chooseFolder(): Promise<string | null> {
  const settings = { windowsHide: true, timeout: 180_000, maxBuffer: 8192 };
  try {
    if (process.platform === "win32") {
      // The script is fixed. No browser input is interpolated into shell code.
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Choose where to install Origami'
        $dialog.ShowNewFolderButton = $true
        $owner = New-Object System.Windows.Forms.Form
        $owner.TopMost = $true
        $owner.ShowInTaskbar = $false
        try {
          if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
            [Console]::Write($dialog.SelectedPath)
          }
        } finally { $dialog.Dispose(); $owner.Dispose() }
      `;
      const { stdout } = await execute(
        "powershell.exe",
        [
          "-NoProfile",
          "-STA",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        settings,
      );
      return stdout.trim() || null;
    }
    if (process.platform === "darwin") {
      const { stdout } = await execute(
        "osascript",
        [
          "-e",
          'POSIX path of (choose folder with prompt "Choose where to install Origami")',
        ],
        settings,
      );
      return stdout.trim() || null;
    }
    try {
      const { stdout } = await execute(
        "zenity",
        [
          "--file-selection",
          "--directory",
          "--title=Choose where to install Origami",
        ],
        settings,
      );
      return stdout.trim() || null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const { stdout } = await execute(
        "kdialog",
        [
          "--getexistingdirectory",
          process.env.HOME || "/",
          "--title",
          "Choose where to install Origami",
        ],
        settings,
      );
      return stdout.trim() || null;
    }
  } catch (error) {
    const result = error as { code?: string | number; stderr?: string };
    if (result.code === 1 || result.stderr?.includes("(-128)")) return null;
    throw error;
  }
}

function attach(middleware: Connect.Server) {
  middleware.use("/__installer/folder", async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    const origin = request.headers.origin;
    const host = request.headers.host;
    // Only the local preview may trigger a native dialog. No filesystem listing API.
    if (
      request.method !== "POST" ||
      !host ||
      !/^127\.0\.0\.1:\d+$/.test(host) ||
      origin !== `http://${host}`
    ) {
      response.statusCode = 403;
      response.end(
        JSON.stringify({
          error: "Open the local installer preview to browse folders.",
        }),
      );
      return;
    }
    if (choosing) {
      response.statusCode = 409;
      response.end(
        JSON.stringify({ error: "A folder chooser is already open." }),
      );
      return;
    }
    choosing = true;
    try {
      const path = await chooseFolder();
      response.end(JSON.stringify({ path, platform: process.platform }));
    } catch {
      response.statusCode = 503;
      response.end(
        JSON.stringify({
          error:
            "The system folder chooser is unavailable. Enter a location below.",
        }),
      );
    } finally {
      choosing = false;
    }
  });
}

export function nativeFolder(): Plugin {
  return {
    name: "origami-native-folder",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}
