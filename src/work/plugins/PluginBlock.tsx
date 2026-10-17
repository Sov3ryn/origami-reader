import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Puzzle, Trash2 } from "lucide-react";
import { t } from "../../i18n";
import { pluginHostUrl, type PluginManifest } from "./plugins";

// What plugin blocks need from Work mode: the plugins turned on, the theme,
// and a way to show a message.
export type PluginBlockWorld = { active: Map<string, PluginManifest>; dark: boolean; notify: (text: string) => void };
export const PluginBlockContext = createContext<PluginBlockWorld | null>(null);

const STORE = (id: string) => `origami.plugin.${id}`;
const MAX_DATA = 64 * 1024;

// A block drawn by a plugin in its own sealed frame. The frame may read and
// save only this block's data, set its height, show a message and use the
// plugin's small store; nothing else in the note or the app.
function PluginBlockView({ node, updateAttributes, deleteNode, selected, editor }: ReactNodeViewProps) {
  const world = useContext(PluginBlockContext);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(140);
  const plugin = world?.active.get(node.attrs.plugin);
  const latest = useRef({ node, updateAttributes, world });
  latest.current = { node, updateAttributes, world };

  useEffect(() => {
    if (!plugin) return;
    const onMessage = (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win) return;
      const { node, updateAttributes, world } = latest.current;
      const m = (e.data || {}) as { type?: string; id?: unknown; method?: string; params?: Record<string, unknown>; height?: number };
      const reply = (msg: Record<string, unknown>) => win.postMessage({ type: "response", id: m.id, ...msg }, "*");
      if (m.type === "ready") win.postMessage({ type: "theme", dark: world?.dark }, "*");
      else if (m.type === "resize" && typeof m.height === "number") setHeight(Math.round(Math.min(900, Math.max(40, m.height))));
      else if (m.type === "request") {
        try {
          switch (m.method) {
            case "block.get":
              return reply({ result: node.attrs.data ? JSON.parse(node.attrs.data) : null });
            case "block.save": {
              const text = JSON.stringify(m.params?.data ?? null);
              if (text.length > MAX_DATA) throw new Error("Block data is limited to 64 KB");
              if (!editor.isEditable) throw new Error("This note cannot be changed here");
              updateAttributes({ data: text });
              return reply({ result: true });
            }
            case "ui.notify":
              world?.notify(`${plugin.name}: ${String(m.params?.text ?? "").slice(0, 500)}`);
              return reply({ result: true });
            case "storage.get": {
              const all = JSON.parse(localStorage.getItem(STORE(plugin.id)) || "{}");
              return reply({ result: all[String(m.params?.key)] ?? null });
            }
            case "storage.set": {
              const all = { ...JSON.parse(localStorage.getItem(STORE(plugin.id)) || "{}"), [String(m.params?.key)]: m.params?.value };
              const text = JSON.stringify(all);
              if (text.length > 256 * 1024) throw new Error("Plugin storage is full (256 KB)");
              localStorage.setItem(STORE(plugin.id), text);
              return reply({ result: true });
            }
            default:
              throw new Error("Not available in a block: " + m.method);
          }
        } catch (err) {
          reply({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [plugin, editor]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "theme", dark: world?.dark }, "*");
  }, [world?.dark]);

  return (
    <NodeViewWrapper className={"plugin-block" + (selected ? " selected" : "")} contentEditable={false} data-drag-handle>
      <div className="chart-block-bar">
        <Puzzle size={13} />
        <span className="chart-block-source">{plugin?.name || node.attrs.plugin}</span>
        {editor.isEditable && (
          <button className="mini quiet" aria-label={t("Remove from note")} onClick={deleteNode}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {plugin ? (
        <iframe
          ref={frame}
          className="plugin-block-frame"
          style={{ height }}
          src={`${pluginHostUrl(plugin.id)}?block=${encodeURIComponent(node.attrs.type)}`}
          sandbox="allow-scripts"
          title={plugin.name}
          referrerPolicy="no-referrer"
        />
      ) : (
        <p className="conn-empty">{t("This block needs the plugin “{name}”, which is off or not installed. Its saved data is kept.", { name: node.attrs.plugin })}</p>
      )}
    </NodeViewWrapper>
  );
}

// <div data-plugin-block="plugin id" data-type="..." data-data="{json}">.
export function pluginBlock(interactive: boolean) {
  return Node.create({
    name: "pluginBlock",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      const clean = (v: string | null, max: number) => (v || "").slice(0, max);
      return {
        plugin: {
          default: "",
          parseHTML: (el) => clean(el.getAttribute("data-plugin-block"), 40).replace(/[^a-z0-9-]/g, ""),
          renderHTML: (attrs) => ({ "data-plugin-block": attrs.plugin }),
        },
        type: {
          default: "",
          parseHTML: (el) => clean(el.getAttribute("data-type"), 60),
          renderHTML: (attrs) => ({ "data-type": attrs.type }),
        },
        data: {
          default: "",
          parseHTML: (el) => clean(el.getAttribute("data-data"), MAX_DATA),
          renderHTML: (attrs) => (attrs.data ? { "data-data": attrs.data } : {}),
        },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-plugin-block]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, class: "plugin-block" }];
    },
    renderMarkdown: () => "",
    ...(interactive ? { addNodeView: () => ReactNodeViewRenderer(PluginBlockView) } : {}),
  });
}
