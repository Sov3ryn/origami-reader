import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";

type SupporterStatus = { active: boolean; id?: string | null };
let status: SupporterStatus = { active: false };
let initialization: Promise<void> | undefined;
let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => status;
function update(next: SupporterStatus) { revision++; status = next; listeners.forEach(fn => fn()); }
export function initializeSupporter() {
  const before = revision;
  return initialization ??= (isTauri() ? invoke<SupporterStatus>("supporter_status").then(next => {
    // A delayed startup read must not undo an activation completed meanwhile.
    if (revision === before) update(next);
  }) : Promise.resolve()).catch(() => { initialization = undefined; });
}
export const supporterActive = () => status.active;
export function useSupporter() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void initializeSupporter();
  }, []);
  return current;
}
export async function activateSupporter(key: string) {
  update(await invoke<SupporterStatus>("supporter_activate", { key }));
}
export async function importSupporter() {
  const next = await invoke<SupporterStatus | null>("supporter_import");
  if (next) update(next);
}
export const exportSupporter = () => invoke<boolean>("supporter_export");
