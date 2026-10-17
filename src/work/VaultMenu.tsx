import { useEffect, useRef, useState } from "react";
import { KeyRound, Lock, LockOpen } from "lucide-react";
import { t } from "../i18n";
import type { Vault } from "../storage";

// Keeps one document (with its cards, sticky notes and history) in a vault,
// or takes it out. Only unlocked vaults can receive documents.
export function VaultMenu({
  vaults,
  current,
  onChoose,
  onUnlock,
}: {
  vaults: Vault[];
  current?: string;
  onChoose: (vault: string | null) => void;
  onUnlock?: (vault: Vault) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const inVault = vaults.find((v) => v.id === current);
  const unlocked = vaults.filter((v) => v.unlocked && v.id !== current);
  return (
    <div className="vault-menu" ref={box}>
      <button
        className={"icon-only" + (current ? " in-vault" : "")}
        data-tip={current ? t("In the vault {name}", { name: inVault?.name || "" }) : t("Keep in a vault")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Lock size={16} />
      </button>
      {open && (
        <div className="work-menu vault-pop" role="menu">
          {current && (
            <button role="menuitem" onClick={() => (setOpen(false), onChoose(null))}>
              <LockOpen size={15} />
              {t("Take out of the vault")}
            </button>
          )}
          {unlocked.map((v) => (
            <button key={v.id} role="menuitem" onClick={() => (setOpen(false), onChoose(v.id))}>
              <Lock size={15} />
              {t("Keep in the vault {name}", { name: v.name })}
            </button>
          ))}
          {onUnlock &&
            vaults
              .filter((v) => !v.unlocked)
              .map((v) => (
                <button key={v.id} role="menuitem" onClick={() => (setOpen(false), onUnlock(v))}>
                  <KeyRound size={15} />
                  {t("Unlock {name}…", { name: v.name })}
                </button>
              ))}
          {!current && !vaults.length && <p className="hint">{t("Create a vault in Read mode first.")}</p>}
          <p className="hint">{t("Vault documents are encrypted and hidden while the vault is locked.")}</p>
        </div>
      )}
    </div>
  );
}
