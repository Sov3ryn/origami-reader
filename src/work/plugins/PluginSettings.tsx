import { useEffect, useState } from "react";
import { FolderOpen, PackagePlus, Puzzle, ShieldCheck, Trash2 } from "lucide-react";
import { t } from "../../i18n";
import { desktop } from "../../storage";
import {
  installPlugin,
  installSamplePlugin,
  listPlugins,
  openPluginsFolder,
  permissionLabel,
  removePlugin,
  type PluginManifest,
  type PluginPrefs,
} from "./plugins";

// Settings, Work mode, Plugins: what is installed, what each one may do, and
// a switch that turns them all off.
export function PluginSettings({
  prefs,
  allOff,
  onPrefs,
  onAllOff,
  onError,
}: {
  prefs: PluginPrefs;
  allOff: boolean;
  onPrefs: (prefs: PluginPrefs) => void;
  onAllOff: (off: boolean) => void;
  onError: (e: unknown) => void;
}) {
  const [list, setList] = useState<PluginManifest[] | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const refresh = () =>
    void listPlugins()
      .then(setList)
      .catch((e) => (setList([]), onError(e)));
  useEffect(refresh, []);
  if (!desktop) return <p className="hint">{t("Plugins need the desktop app.")}</p>;

  const turnOn = (m: PluginManifest) => onPrefs({ ...prefs, [m.id]: { on: true, granted: [...(m.permissions || [])] } });
  const turnOff = (m: PluginManifest) => onPrefs({ ...prefs, [m.id]: { on: false, granted: prefs[m.id]?.granted || [] } });
  return (
    <div className="plugin-settings">
      <p className="hint">
        {t("Plugins add commands, panels and tools to Work mode. Each runs in its own sealed frame with no internet access and sees only what you allow below. Notes and cards in vaults are never shared with plugins.")}
      </p>
      <label className="check-label">
        <input type="checkbox" checked={allOff} onChange={(e) => onAllOff(e.target.checked)} />
        {t("Turn off all plugins")}
      </label>
      {list === null ? null : list.length === 0 ? (
        <p className="conn-empty">{t("No plugins installed yet.")}</p>
      ) : (
        <ul className="plugin-list">
          {list.map((m) => {
            const on = Boolean(prefs[m.id]?.on);
            const perms = m.permissions || [];
            const missing = perms.filter((p) => !prefs[m.id]?.granted.includes(p));
            return (
              <li key={m.id} className={"plugin-item" + (on && !allOff ? " on" : "")}>
                <div className="plugin-item-head">
                  <Puzzle size={16} />
                  <strong>{m.name || m.id}</strong>
                  {m.version && <small>{m.version}</small>}
                  {m.author && <small>· {m.author}</small>}
                  <span className="ink-spacer" />
                  {!m.error && (
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={on && !missing.length}
                        disabled={allOff}
                        onChange={(e) => {
                          if (!e.target.checked) turnOff(m);
                          else if (perms.length) setAsking(m.id);
                          else turnOn(m);
                        }}
                      />
                      {on && !missing.length ? t("On") : t("Off")}
                    </label>
                  )}
                  <button
                    className="icon-only"
                    aria-label={t("Remove plugin")}
                    onClick={() => {
                      if (!window.confirm(t('Remove the plugin "{name}"?', { name: m.name || m.id }))) return;
                      void removePlugin(m.id)
                        .then(() => {
                          const { [m.id]: _gone, ...rest } = prefs;
                          onPrefs(rest);
                          refresh();
                        })
                        .catch(onError);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {m.error ? <p className="hint plugin-error">{m.error}</p> : m.description && <p className="hint">{m.description}</p>}
                {perms.length > 0 && (asking === m.id || on) && (
                  <div className={"plugin-perms" + (asking === m.id ? " asking" : "")}>
                    <span>
                      <ShieldCheck size={14} />
                      {asking === m.id ? t("This plugin asks to:") : t("Allowed to:")}
                    </span>
                    <ul>
                      {perms.map((p) => (
                        <li key={p}>{permissionLabel(p)}</li>
                      ))}
                    </ul>
                    {asking === m.id && (
                      <div className="dialog-actions">
                        <button onClick={() => setAsking(null)}>{t("Cancel")}</button>
                        <button className="primary" onClick={() => (turnOn(m), setAsking(null))}>
                          {t("Allow and turn on")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="plugin-actions">
        <button onClick={() => void installPlugin().then((m) => m && refresh()).catch(onError)}>
          <PackagePlus size={15} />
          {t("Add a plugin from a folder…")}
        </button>
        {!list?.some((m) => m.id === "sample-note-tools") && (
          <button onClick={() => void installSamplePlugin().then(refresh).catch(onError)}>
            <Puzzle size={15} />
            {t("Add the sample plugin")}
          </button>
        )}
        <button className="text-button" onClick={() => void openPluginsFolder().catch(onError)}>
          <FolderOpen size={15} />
          {t("Open the plugins folder")}
        </button>
      </div>
      <p className="hint">{t("Only add plugins you trust. Writing your own is explained in docs/PLUGINS.md, with the sample as a starting point.")}</p>
    </div>
  );
}
