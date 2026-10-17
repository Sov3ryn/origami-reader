import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { t } from "./i18n";
import { desktop } from "./storage";

// Component updates (src-tauri/src/update.rs). Until an update address and
// key are built in, `configured` is false and nothing is ever checked.
export type UpdateStatus = {
  configured: boolean;
  // Installed by the installer (components.json beside the app).
  managed: boolean;
  platform: string;
  installed: Record<string, string>;
};
export type UpdateComponent = { id: string; version: string; size: number; restart?: boolean };
export type UpdateFound = { version?: string; notes?: string; released?: string; components: UpdateComponent[] };

const none: UpdateStatus = { configured: false, managed: false, platform: "web", installed: {} };
export const updateStatus = (): Promise<UpdateStatus> => (desktop ? invoke("update_status") : Promise.resolve(none));
export const checkUpdates = (): Promise<UpdateFound> => invoke("check_updates");
export const installUpdate = (): Promise<boolean> => invoke("install_update");
export const restartApp = (): Promise<void> => invoke("restart_app");
export const onUpdateProgress = (fn: (p: { received: number; total: number }) => void) =>
  listen<{ received: number; total: number }>("update-progress", (e) => fn(e.payload));

// Automatic checks happen at most once a day.
const DAY_KEY = "origami.updateChecked";
export function checkedToday() {
  try {
    return localStorage.getItem(DAY_KEY) === new Date().toDateString();
  } catch {
    return false;
  }
}
export function markChecked() {
  try {
    localStorage.setItem(DAY_KEY, new Date().toDateString());
  } catch {
    /* private window */
  }
}

export const componentName = (id: string) =>
  ({
    app: "Origami Reader",
    workers: t("Speech and artwork workers"),
    voices: t("Voices"),
    python: t("Python runtime"),
    "image-runtime": t("Artwork engine"),
  })[id] || id;
export const formatSize = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
