import { createContext, useContext, useRef } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Download, PencilLine, Table2, Trash2 } from "lucide-react";
import { t } from "../../i18n";
import type { CellValue } from "../sheets/model";
import { ChartView, type ChartHandle } from "./ChartView";
import type { ChartSpec } from "./spec";

// What chart blocks need from Work Mode: the charts, their numbers (live from
// sheets), and actions.
export type ChartWorld = {
  charts: Map<string, ChartSpec>;
  rowsFor: (spec: ChartSpec) => CellValue[][];
  sourceLabel: (spec: ChartSpec) => string;
  onEdit: (id: string) => void;
  onOpenSheet: (sheetId: string) => void;
  saveFile: (name: string, data: string, kind: "png" | "svg") => void;
  locale?: string;
};
export const ChartContext = createContext<ChartWorld | null>(null);

function ChartNodeView({ node, deleteNode, selected }: ReactNodeViewProps) {
  const world = useContext(ChartContext);
  const handle = useRef<ChartHandle | null>(null);
  const spec = world?.charts.get(node.attrs.id);
  return (
    <NodeViewWrapper className={"chart-block" + (selected ? " selected" : "")} data-drag-handle contentEditable={false}>
      {!spec || !world ? (
        <p className="conn-empty">{t("This chart is not available. It may be in a locked vault, or deleted.")}</p>
      ) : (
        <>
          <div className="chart-block-bar">
            <span className="chart-block-source">{world.sourceLabel(spec)}</span>
            {spec.source.kind === "sheet" && (
              <button className="mini" onClick={() => world.onOpenSheet((spec.source as { sheetId: string }).sheetId)}>
                <Table2 size={13} />
                {t("Open sheet")}
              </button>
            )}
            <button className="mini" onClick={() => world.onEdit(spec.id)}>
              <PencilLine size={13} />
              {t("Edit")}
            </button>
            <button
              className="mini"
              aria-label={t("Download image")}
              onClick={() => {
                const d = handle.current?.png();
                if (d) world.saveFile(spec.title || "chart", d, "png");
              }}
            >
              <Download size={13} />
            </button>
            <button className="mini quiet" aria-label={t("Remove from note")} onClick={deleteNode}>
              <Trash2 size={13} />
            </button>
          </div>
          <div onDoubleClick={() => world.onEdit(spec.id)}>
            <ChartView spec={spec} rows={world.rowsFor(spec)} height={360} locale={world.locale} onReady={(h) => (handle.current = h)} />
          </div>
        </>
      )}
    </NodeViewWrapper>
  );
}

// A chart inside a note: <div data-chart="id">. The chart itself is a work
// item, so the same chart can sit in several notes and follow its sheet.
export function chartBlock(interactive: boolean) {
  return Node.create({
    name: "chartBlock",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        id: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-chart") || "",
          renderHTML: (attrs) => ({ "data-chart": attrs.id }),
        },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-chart]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, class: "chart-block" }];
    },
    renderMarkdown: (node: { attrs?: { id?: string } }) => `![Chart](chart:${node.attrs?.id || ""})`,
    ...(interactive ? { addNodeView: () => ReactNodeViewRenderer(ChartNodeView) } : {}),
  });
}
