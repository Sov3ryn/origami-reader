import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Download, KeyRound, Lock, LockOpen, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { t } from "../i18n";
import type { Vault } from "../storage";
import { MAIN, type WorkspaceDoc } from "./workspaces";

// The workspace menu at the top of the sidebar.
export function WorkspaceSwitcher({
  workspaces,
  active,
  vaults,
  onSwitch,
  onCreate,
  onRename,
  onDuplicate,
  onExport,
  onImport,
  onVault,
  onDelete,
  onUnlock,
  onLock,
}: {
  workspaces: WorkspaceDoc[];
  active: WorkspaceDoc;
  vaults: Vault[];
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (ws: WorkspaceDoc) => void;
  onDuplicate: (ws: WorkspaceDoc) => void;
  onExport: (ws: WorkspaceDoc) => void;
  onImport: () => void;
  onVault: (ws: WorkspaceDoc, vault: string | null) => void;
  onDelete: (ws: WorkspaceDoc) => void;
  onUnlock: (vault: Vault) => void;
  onLock: (vault: Vault) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  const unlocked = vaults.filter((v) => v.unlocked);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const vaultName = (id?: string) => vaults.find((v) => v.id === id)?.name;
  return (
    <div className="workspace-switcher" ref={box}>
      <button className="workspace-current" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} data-tip={t("Workspaces")}>
        <span className="workspace-dot" style={{ background: active.color }} />
        <span className="workspace-name">{active.name}</span>
        {active.vault && <Lock size={12} />}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="workspace-menu" role="menu">
          <div className="work-menu-label">{t("Workspaces")}</div>
          {workspaces.map((w) => (
            <button key={w.id} role="menuitemradio" aria-checked={w.id === active.id} onClick={act(() => onSwitch(w.id))}>
              <span className="workspace-dot" style={{ background: w.color }} />
              <span className="workspace-name">{w.name}</span>
              {w.vault && (
                <small>
                  <Lock size={11} /> {vaultName(w.vault)}
                </small>
              )}
              {w.id === active.id && <Check size={14} />}
            </button>
          ))}
          {vaults.length > 0 && <div className="work-menu-label">{t("Vaults")}</div>}
          {vaults.map((v) =>
            v.unlocked ? (
              <button key={v.id} role="menuitem" onClick={act(() => onLock(v))}>
                <Lock size={15} />
                {t("Lock {name}", { name: v.name })}
              </button>
            ) : (
              <button key={v.id} role="menuitem" onClick={act(() => onUnlock(v))}>
                <KeyRound size={15} />
                {t("Unlock {name}…", { name: v.name })}
              </button>
            ),
          )}
          <div className="work-menu-label">{t("New")}</div>
          <button role="menuitem" onClick={act(onCreate)}>
            <Plus size={15} />
            {t("New workspace")}
          </button>
          <button role="menuitem" onClick={act(onImport)}>
            <Upload size={15} />
            {t("Import a workspace…")}
          </button>
          <div className="work-menu-label">{active.name}</div>
          <button role="menuitem" onClick={act(() => onRename(active))}>
            <Pencil size={15} />
            {t("Rename")}
          </button>
          <button role="menuitem" onClick={act(() => onDuplicate(active))}>
            <Copy size={15} />
            {t("Duplicate")}
          </button>
          <button role="menuitem" onClick={act(() => onExport(active))}>
            <Download size={15} />
            {t("Export to a file…")}
          </button>
          {active.vault ? (
            <button role="menuitem" onClick={act(() => onVault(active, null))}>
              <LockOpen size={15} />
              {t("Take out of the vault")}
            </button>
          ) : unlocked.length ? (
            unlocked.map((v) => (
              <button key={v.id} role="menuitem" onClick={act(() => onVault(active, v.id))}>
                <Lock size={15} />
                {t("Keep in the vault {name}", { name: v.name })}
              </button>
            ))
          ) : (
            <p className="hint workspace-hint">{t("To keep a workspace in a vault, unlock a vault above, or create one in Read mode.")}</p>
          )}
          {active.id !== MAIN && (
            <button role="menuitem" className="danger" onClick={act(() => onDelete(active))}>
              <Trash2 size={15} />
              {t("Delete workspace")}
            </button>
          )}
          <p className="hint workspace-hint">{t("Workspaces and documents in a locked vault appear when it is unlocked.")}</p>
        </div>
      )}
    </div>
  );
}
