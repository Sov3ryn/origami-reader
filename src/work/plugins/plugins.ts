import { invoke } from "@tauri-apps/api/core";
import { t } from "../../i18n";
import { desktop } from "../../storage";

// Work mode plugins (src-tauri/src/plugins.rs, docs/PLUGINS.md).
export type PluginManifest = {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  permissions?: string[];
  panel?: { title?: string };
  folder?: string;
  error?: string;
};
export type PluginPrefs = Record<string, { on: boolean; granted: string[] }>;

export const listPlugins = (): Promise<PluginManifest[]> => (desktop ? invoke("list_plugins") : Promise.resolve([]));
export const installPlugin = (): Promise<PluginManifest | null> => invoke("install_plugin");
export const installSamplePlugin = (): Promise<PluginManifest> => invoke("install_sample_plugin");
export const removePlugin = (id: string): Promise<void> => invoke("remove_plugin", { id });
export const openPluginsFolder = (): Promise<void> => invoke("open_plugins_folder");

// Each plugin is served from its own path on a local address.
export function pluginHostUrl(id: string) {
  const windows = /Windows/i.test(navigator.userAgent);
  return `${windows ? "http://oplugin.localhost" : "oplugin://localhost"}/${id}/__host`;
}

export const permissionLabel = (p: string) =>
  ({
    "notes:read": t("Read your notes (never notes in vaults)"),
    "notes:write": t("Add and change notes, and insert text in the open note"),
    "cards:read": t("Read your study cards"),
    "cards:write": t("Add study cards"),
  })[p] || p;

// Allowed only if the reader granted every permission the plugin asks for.
export function pluginActive(m: PluginManifest, prefs: PluginPrefs, allOff: boolean) {
  if (allOff || m.error) return false;
  const p = prefs[m.id];
  return Boolean(p?.on && (m.permissions || []).every((x) => p.granted.includes(x)));
}
