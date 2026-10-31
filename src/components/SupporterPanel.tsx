import { useState } from "react";
import { t } from "../i18n";
import { activateSupporter, exportSupporter, importSupporter, useSupporter } from "../supporter";
import "./supporterPanel.css";

export function SupporterPanel() {
  const status = useSupporter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setProblem(false);
    try { await action(); setKey(""); } catch { setProblem(true); } finally { setBusy(false); }
  }
  return <section className="supporter-panel" aria-label={t("Supporter key")} aria-busy={busy}>
    <h4>{t("Supporter key")}</h4>
    {status.active ? <>
      <p role="status">{t("All cosmetics unlocked. Thank you for supporting Origami!")}</p>
      <p className="hint">{t("Your key never expires. Keep a backup to restore it after reinstalling or on another computer.")}</p>
      <button disabled={busy} onClick={() => void run(exportSupporter)}>{t("Back up supporter key")}</button>
    </> : <>
      <p className="hint">{t("Paste your supporter key or import its backup file. All cosmetics can also be earned through achievements.")}</p>
      <form onSubmit={e => { e.preventDefault(); void run(() => activateSupporter(key)); }}>
        <textarea aria-label={t("Supporter key")} value={key} maxLength={4096} rows={3} spellCheck={false} autoComplete="off" autoCapitalize="off" disabled={busy} dir="ltr" onChange={e => setKey(e.target.value)} />
        <div className="donate-actions">
          <button disabled={busy || !key.trim()} type="submit">{t("Activate supporter key")}</button>
          <button disabled={busy} type="button" onClick={() => void run(importSupporter)}>{t("Import supporter key")}</button>
        </div>
      </form>
    </>}
    {problem && <p role="alert">{t("Could not activate or save the key. Check the key and try again.")}</p>}
  </section>;
}
