import { createContext, useContext, useEffect, useState } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { ExternalLink, Globe, Trash2, WifiOff } from "lucide-react";
import { t } from "../../i18n";
import { escapeHtml } from "../text";
import { toEmbed } from "./providers";

// What embeds need from the app: whether online embeds were allowed, a way
// to ask, and opening a link in the browser.
export type EmbedWorld = {
  allowed: boolean;
  ask: () => void;
  openExternal: (url: string) => void;
};
export const EmbedContext = createContext<EmbedWorld | null>(null);

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function EmbedView({ node, deleteNode, selected }: ReactNodeViewProps) {
  const world = useContext(EmbedContext);
  const online = useOnline();
  const url: string = node.attrs.url;
  const embed = toEmbed(url, Boolean(node.attrs.page));
  const name = embed?.provider || t("Web page");
  const bar = (
    <div className="embed-bar">
      <Globe size={13} />
      <span className="embed-provider">{name}</span>
      <span className="embed-url" title={url}>
        {url.replace(/^https?:\/\/(www\.)?/, "")}
      </span>
      <button className="mini" onClick={() => world?.openExternal(url)} data-tip={t("Open in your browser")}>
        <ExternalLink size={13} />
      </button>
      <button className="mini quiet" onClick={deleteNode} aria-label={t("Remove from note")}>
        <Trash2 size={13} />
      </button>
    </div>
  );
  let body: React.ReactNode;
  if (!embed) body = <p className="embed-note">{t("This link can no longer be embedded.")}</p>;
  else if (!world?.allowed)
    body = (
      <div className="embed-off">
        <p>{t("Online embeds are off. This {name} content would load from the internet.", { name })}</p>
        <button className="mini primary" onClick={() => world?.ask()}>
          {t("Allow online embeds…")}
        </button>
      </div>
    );
  else if (!online)
    body = (
      <div className="embed-off">
        <WifiOff size={18} />
        <p>{t("You are offline. This {name} content needs an internet connection.", { name })}</p>
      </div>
    );
  else
    body = (
      <div className="embed-frame" style={embed.height ? { height: embed.height } : { aspectRatio: String(embed.ratio || 16 / 9) }}>
        <iframe
          src={embed.src}
          title={`${name}: ${url}`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms"
        />
      </div>
    );
  return (
    <NodeViewWrapper className={"media-embed kind-" + (embed?.kind || "page") + (selected ? " selected" : "")} data-drag-handle contentEditable={false}>
      {bar}
      {body}
    </NodeViewWrapper>
  );
}

// <div data-embed="https://..."> in notes. Exports turn it into a plain link.
export function embedBlock(interactive: boolean) {
  return Node.create({
    name: "mediaEmbed",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        url: {
          default: "",
          parseHTML: (el) => {
            const v = el.getAttribute("data-embed") || "";
            return /^https?:\/\//.test(v) ? v : "";
          },
          renderHTML: (attrs) => ({ "data-embed": attrs.url }),
        },
        page: {
          default: false,
          parseHTML: (el) => el.getAttribute("data-page") === "true",
          renderHTML: (attrs) => (attrs.page ? { "data-page": "true" } : {}),
        },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-embed]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, class: "media-embed" }];
    },
    renderMarkdown: (node: { attrs?: { url?: string } }) => {
      const url = node.attrs?.url || "";
      return `[${toEmbed(url, true)?.provider || url}](${url})`;
    },
    ...(interactive ? { addNodeView: () => ReactNodeViewRenderer(EmbedView) } : {}),
  });
}

// Exported HTML shows embeds as links, so files stay offline and safe.
export function embedsAsLinks(html: string) {
  return html.replace(/<div\b[^>]*\bdata-embed="([^"]*)"[^>]*>\s*<\/div>/g, (_m, url: string) => {
    const name = toEmbed(url, true)?.provider || url;
    return `<p class="embed-link">${escapeHtml(name)}: <a href="${url}">${url}</a></p>`;
  });
}
