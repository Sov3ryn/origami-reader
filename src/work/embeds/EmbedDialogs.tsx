import { useState } from "react";
import { Globe, ShieldAlert, Wifi } from "lucide-react";
import { t } from "../../i18n";
import { providerNames, toEmbed } from "./providers";

// Asked once, before any embed loads: what going online means.
export function ConsentDialog({ onChoice }: { onChoice: (allow: boolean) => void }) {
  return (
    <div className="modal-scrim">
      <section className="quick-dialog consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <header>
          <Wifi size={20} />
          <h2 id="consent-title">{t("Allow online embeds?")}</h2>
        </header>
        <p>{t("Videos, posts, maps and other embeds play inside your notes, but they come from the internet:")}</p>
        <ul>
          <li>{t("They need an internet connection. Offline, they show a link instead.")}</li>
          <li>{t("Each one loads from its service (YouTube, Spotify, Google Maps and so on), which sees your IP address and may use cookies under its own privacy policy.")}</li>
          <li>{t("Origami sends nothing else: your notes, books and cards never leave this computer.")}</li>
        </ul>
        <p className="hint">
          <ShieldAlert size={13} /> {t("You can turn this off at any time in Settings, Work mode. Embeds then show as plain links.")}
        </p>
        <div className="dialog-actions">
          <button onClick={() => onChoice(false)}>{t("Not now")}</button>
          <button className="primary" autoFocus onClick={() => onChoice(true)}>
            {t("Allow online embeds")}
          </button>
        </div>
      </section>
    </div>
  );
}

// Paste a link and see what it becomes before inserting it.
export function EmbedDialog({ onInsert, onClose }: { onInsert: (url: string, page: boolean) => void; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [page, setPage] = useState(false);
  const known = toEmbed(url);
  const embed = known || (page ? toEmbed(url, true) : null);
  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim());
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="quick-dialog embed-dialog" role="dialog" aria-modal="true" aria-labelledby="embed-title">
        <h2 id="embed-title">{t("Embed from the web")}</h2>
        <label className="card-field">
          <span>{t("Link")}</span>
          <input
            autoFocus
            value={url}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && embed && onInsert(url.trim(), !known)}
          />
        </label>
        {valid && (
          <p className={"embed-detect" + (embed ? " ok" : "")}>
            <Globe size={14} />
            {known
              ? t("{name} · ready to embed", { name: known.provider })
              : t("Not a service Origami knows. Many sites refuse to be shown inside another app.")}
          </p>
        )}
        {valid && !known && (
          <label className="check-label">
            <input type="checkbox" checked={page} onChange={(e) => setPage(e.target.checked)} />
            {t("Try to embed this page anyway")}
          </label>
        )}
        <details className="embed-services">
          <summary>{t("{count} services supported", { count: providerNames.length })}</summary>
          <p>{providerNames.join(" · ")}</p>
        </details>
        <div className="dialog-actions">
          <button onClick={onClose}>{t("Cancel")}</button>
          <button className="primary" disabled={!embed} onClick={() => onInsert(url.trim(), !known)}>
            {t("Insert")}
          </button>
        </div>
      </section>
    </div>
  );
}
