import { createContext, useContext, useMemo } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { DraftingCompass, PencilRuler, Trash2 } from "lucide-react";
import { t } from "../../i18n";
import { planToSvg, type PlanDoc } from "./model";

// What plan blocks need from Work mode: the plans, and opening one.
export type PlanWorld = { plans: Map<string, PlanDoc>; onOpen: (id: string) => void };
export const PlanContext = createContext<PlanWorld | null>(null);

export const planColors = (plan: PlanDoc) =>
  plan.paper === "white" || plan.paper === "grid" ? { ink: "#1d2a44", paper: "#ffffff" } : { ink: "#eef5ff", paper: "#1f4e8c" };

function PlanView({ node, deleteNode, selected, editor }: ReactNodeViewProps) {
  const world = useContext(PlanContext);
  const plan = world?.plans.get(node.attrs.id);
  // Redrawn whenever the plan changes, so the note always shows the latest.
  const svg = useMemo(() => {
    if (!plan) return "";
    const c = planColors(plan);
    return planToSvg(plan, c.ink, c.paper);
  }, [plan]);
  return (
    <NodeViewWrapper className={"plan-block" + (selected ? " selected" : "")} contentEditable={false} data-drag-handle>
      {!plan || !world ? (
        <p className="conn-empty">{t("This plan is not available. It may be in a locked vault, or deleted.")}</p>
      ) : (
        <>
          <div className="chart-block-bar">
            <DraftingCompass size={13} />
            <span className="chart-block-source">
              {plan.title || t("Untitled plan")} · {plan.units}
            </span>
            <button className="mini" onClick={() => world.onOpen(plan.id)}>
              <PencilRuler size={13} />
              {t("Open plan")}
            </button>
            {editor.isEditable && (
              <button className="mini quiet" aria-label={t("Remove from note")} onClick={deleteNode}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div className="plan-block-drawing" onDoubleClick={() => world.onOpen(plan.id)} dangerouslySetInnerHTML={{ __html: svg }} />
        </>
      )}
    </NodeViewWrapper>
  );
}

// <div data-plan="plan id">: a live drawing of a plan inside a note.
export function planBlock(interactive: boolean) {
  return Node.create({
    name: "planBlock",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        id: {
          default: "",
          parseHTML: (el) => (el.getAttribute("data-plan") || "").replace(/[^\w-]/g, ""),
          renderHTML: (attrs) => ({ "data-plan": attrs.id }),
        },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-plan]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, class: "plan-block" }];
    },
    renderMarkdown: (node: { attrs?: { id?: string } }) => `![Plan](plan:${node.attrs?.id || ""})`,
    ...(interactive ? { addNodeView: () => ReactNodeViewRenderer(PlanView) } : {}),
  });
}
