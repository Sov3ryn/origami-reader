import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// A button that opens a small floating panel. Escape, a click outside or the
// button itself closes it, and focus returns to the button.
export function Popover({
  label,
  icon,
  text,
  className = "",
  panelClassName = "",
  children,
}: {
  label: string;
  icon: ReactNode;
  // Visible button text; icon-only when omitted.
  text?: string;
  className?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ top: 0, right: 0 });
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !button.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);
  function toggle() {
    if (open) return setOpen(false);
    const r = button.current!.getBoundingClientRect();
    setPlace({
      top: r.bottom + 6,
      right: Math.max(8, window.innerWidth - r.right),
    });
    setOpen(true);
    requestAnimationFrame(() =>
      panel.current
        ?.querySelector<HTMLElement>("button,select,input")
        ?.focus({ preventScroll: true }),
    );
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className={
          (text ? "" : "icon-button ") + className + (open ? " active" : "")
        }
        aria-label={text ? undefined : label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        {icon}
        {text}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={label}
          className={"popover-panel " + panelClassName}
          style={{ top: place.top, right: place.right }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              button.current?.focus();
            }
          }}
        >
          {children}
        </div>
      )}
    </>
  );
}
