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
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => pop.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true }));
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  // Arrow keys move between the items; Tab leaves the menu.
  function keys(e: React.KeyboardEvent) {
    if (e.key === "Tab") return setOpen(false);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(pop.current?.querySelectorAll<HTMLElement>("[role=menuitem]") || []);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }
  const inVault = vaults.find((v) => v.id === current);
  const label = current ? t("In the vault {name}", { name: inVault?.name || "" }) : t("Keep in a vault");
  const unlocked = vaults.filter((v) => v.unlocked && v.id !== current);
  return (
    <div className="vault-menu" ref={box}>
      <button
        ref={btn}
        className={"icon-only" + (current ? " in-vault" : "")}
        data-tip={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Lock size={16} />
      </button>
      {open && (
        <div ref={pop} className="work-menu vault-pop" role="menu" onKeyDown={keys}>
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
