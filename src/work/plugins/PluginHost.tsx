import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { X } from "lucide-react";
import { t } from "../../i18n";
import { pluginHostUrl, type PluginManifest } from "./plugins";

// What plugins may ask Origami for, and the permission each call needs.
const needs: Record<string, string | null> = {
  "notes.list": "notes:read",
  "notes.get": "notes:read",
  "notes.current": "notes:read",
  "editor.selection": "notes:read",
  "notes.create": "notes:write",
  "notes.append": "notes:write",
  "notes.replace": "notes:write",
  "editor.insert": "notes:write",
  "cards.list": "cards:read",
  "cards.create": "cards:write",
  "ui.notify": null,
  "ui.close": null,
  "storage.get": null,
  "storage.set": null,
};

export type PluginCalls = {
  listNotes: () => unknown;
  getNote: (id: string) => unknown;
  currentNote: () => unknown;
  selection: () => string;
  createNote: (title: string, html: string) => Promise<string>;
  appendNote: (id: string, html: string) => void;
  replaceNote: (id: string, html: string) => void;
  insert: (html: string) => boolean;
  listCards: () => unknown;
  createCard: (front: string, back: string) => Promise<string>;
  notify: (text: string) => void;
};
export type PluginCommand = { plugin: string; id: string; label: string; block?: boolean };
export type PluginHostApi = { run: (plugin: string, command: string) => void };

const STORE = (id: string) => `origami.plugin.${id}`;
function storage(id: string) {
  try {
    return JSON.parse(localStorage.getItem(STORE(id)) || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

// One hidden frame per active plugin (a panel plugin's frame is shown when
// its panel is open). Frames are sandboxed and served from their own
// address; they talk to the app only through messages, checked here.
export const PluginHost = forwardRef<
  PluginHostApi,
  {
    plugins: PluginManifest[];
    dark: boolean;
    calls: PluginCalls;
    panel: string | null;
    noteId: string | null;
    onClosePanel: () => void;
    onCommands: (list: PluginCommand[]) => void;
  }
>(function PluginHost({ plugins, dark, calls, panel, noteId, onClosePanel, onCommands }, ref) {
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const commands = useRef<PluginCommand[]>([]);
  const latest = useRef({ plugins, calls, onCommands, onClosePanel, dark, noteId });
  latest.current = { plugins, calls, onCommands, onClosePanel, dark, noteId };

  useImperativeHandle(ref, () => ({
    run: (plugin, command) => frames.current.get(plugin)?.contentWindow?.postMessage({ type: "command", command }, "*"),
  }));
  useEffect(() => {
    for (const f of frames.current.values()) f.contentWindow?.postMessage({ type: "theme", dark }, "*");
  }, [dark]);
  // Plugins hear which note is open (only its id; reading it needs notes:read).
  useEffect(() => {
    for (const f of frames.current.values()) f.contentWindow?.postMessage({ type: "note", id: noteId }, "*");
  }, [noteId]);
  // Commands of plugins that were turned off go away.
  useEffect(() => {
    const ids = new Set(plugins.map((p) => p.id));
    const kept = commands.current.filter((c) => ids.has(c.plugin));
    if (kept.length !== commands.current.length) {
      commands.current = kept;
      latest.current.onCommands(kept);
    }
  }, [plugins]);

  useEffect(() => {
    async function answer(m: PluginManifest, method: string, params: Record<string, unknown>) {
      const c = latest.current.calls;
      const str = (v: unknown, max = 1_000_000) => {
        if (typeof v !== "string") throw new Error("Expected text");
        if (v.length > max) throw new Error("Too long");
        return v;
      };
      switch (method) {
        case "notes.list":
          return c.listNotes();
        case "notes.get":
          return c.getNote(str(params.id, 100));
        case "notes.current":
          return c.currentNote();
        case "editor.selection":
          return c.selection();
        case "notes.create":
          return c.createNote(str(params.title ?? "", 200), str(params.html ?? ""));
        case "notes.append":
          return c.appendNote(str(params.id, 100), str(params.html));
        case "notes.replace":
          return c.replaceNote(str(params.id, 100), str(params.html));
        case "editor.insert":
          if (!c.insert(str(params.html))) throw new Error("No note is open");
          return true;
        case "cards.list":
          return c.listCards();
        case "cards.create":
          return c.createCard(str(params.front, 2000), str(params.back ?? "", 4000));
        case "ui.notify":
          c.notify(`${m.name}: ${str(params.text, 500)}`);
          return true;
        case "ui.close":
          latest.current.onClosePanel();
          return true;
        case "storage.get":
          return storage(m.id)[str(params.key, 100)] ?? null;
        case "storage.set": {
          const all = { ...storage(m.id), [str(params.key, 100)]: params.value };
          const text = JSON.stringify(all);
          if (text.length > 256 * 1024) throw new Error("Plugin storage is full (256 KB)");
          localStorage.setItem(STORE(m.id), text);
          return true;
        }
      }
      throw new Error("Unknown call: " + method);
    }
    function onMessage(e: MessageEvent) {
      const entry = [...frames.current].find(([, f]) => f.contentWindow === e.source);
      if (!entry) return;
      const m = latest.current.plugins.find((p) => p.id === entry[0]);
      if (!m) return;
      const reply = (msg: Record<string, unknown>) => entry[1].contentWindow?.postMessage({ type: "response", ...msg }, "*");
      const data = (e.data || {}) as { type?: string; id?: unknown; label?: unknown; method?: unknown; params?: unknown };
      if (data.type === "ready") {
        entry[1].contentWindow?.postMessage({ type: "theme", dark: latest.current.dark }, "*");
        entry[1].contentWindow?.postMessage({ type: "note", id: latest.current.noteId }, "*");
      }
      else if (data.type === "command" && typeof data.id === "string" && typeof data.label === "string") {
        const cmd = { plugin: m.id, id: data.id.slice(0, 60), label: data.label.slice(0, 80) };
        commands.current = [...commands.current.filter((c) => !(c.plugin === cmd.plugin && c.id === cmd.id)), cmd].slice(0, 200);
        latest.current.onCommands(commands.current);
      } else if (data.type === "block" && typeof data.id === "string" && typeof data.label === "string") {
        // A block type, offered in the note's / menu.
        const cmd = { plugin: m.id, id: data.id.slice(0, 60), label: data.label.slice(0, 80), block: true };
        commands.current = [...commands.current.filter((c) => !(c.plugin === cmd.plugin && c.id === cmd.id && c.block)), cmd].slice(0, 200);
        latest.current.onCommands(commands.current);
      } else if (data.type === "request" && typeof data.method === "string") {
        const method = data.method;
        const need = needs[method];
        if (need === undefined) return reply({ id: data.id, error: "Unknown call: " + method });
        if (need && !(m.permissions || []).includes(need)) return reply({ id: data.id, error: `This plugin did not ask for ${need}` });
        Promise.resolve(answer(m, method, (data.params || {}) as Record<string, unknown>))
          .then((result) => reply({ id: data.id, result: result ?? null }))
          .catch((err) => reply({ id: data.id, error: err instanceof Error ? err.message : String(err) }));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const shown = plugins.find((p) => p.id === panel);
  return (
    <div className={"plugin-frames" + (shown ? " open" : "")}>
      {shown && (
        <header className="plugin-panel-head">
          <strong>{shown.panel?.title || shown.name}</strong>
          <span className="ink-spacer" />
          <button className="icon-only" aria-label={t("Close")} onClick={onClosePanel}>
            <X size={15} />
          </button>
        </header>
      )}
      {plugins.map((p) => (
        <iframe
          key={p.id}
          ref={(el) => {
            if (el) frames.current.set(p.id, el);
            else frames.current.delete(p.id);
          }}
          className={"plugin-frame" + (p.id === panel ? " shown" : "")}
          src={pluginHostUrl(p.id)}
          sandbox="allow-scripts"
          title={p.name}
          referrerPolicy="no-referrer"
        />
      ))}
    </div>
  );
});
