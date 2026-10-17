import { createContext, useContext, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Which collapsible groups are open, remembered across sessions.
export const SectionState = createContext<{
  open: Record<string, boolean>;
  toggle: (id: string, open: boolean) => void;
}>({ open: {}, toggle: () => {} });
// Heading level for groups, one below the surrounding heading.
export const SectionLevel = createContext<3 | 4>(4);

// A titled group of related controls that folds away. Collapsed content
// stays in the document (hidden), so settings search can still find it.
export function Section({
  id,
  title,
  icon,
  meta,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const state = useContext(SectionState);
  const Heading = useContext(SectionLevel) === 3 ? "h3" : "h4";
  const open = state.open[id] ?? defaultOpen;
  return (
    <section
      className={"panel-section" + (open ? " open" : "")}
      data-section={id}
    >
      <Heading className="panel-section-heading">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={"section-" + id}
          onClick={() => state.toggle(id, !open)}
        >
          {icon && (
            <span className="panel-section-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="panel-section-title">{title}</span>
          {meta !== undefined && meta !== "" && (
            <span className="panel-section-meta">{meta}</span>
          )}
          <ChevronDown className="panel-section-chevron" size={15} />
        </button>
      </Heading>
      <div id={"section-" + id} className="panel-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
