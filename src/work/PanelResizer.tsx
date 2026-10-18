import { useRef } from "react";
import { t } from "../i18n";

// A drag handle in the gap beside a side panel. Drag to resize, arrow keys
// for 16 px steps, double-click to go back to the default width.
export function PanelResizer({
  side,
  width,
  min,
  max,
  fallback,
  inset,
  label,
  onChange,
}: {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  fallback: number;
  // Distance from the container edge to the panel (padding), and half the gap after it.
  inset: { edge: number; gap: number };
  label: string;
  onChange: (width: number) => void;
}) {
  const handle = useRef<HTMLDivElement>(null);
  const clamp = (w: number) => Math.round(Math.max(min, Math.min(max, w)));
  const position = inset.edge + width + inset.gap;
  return (
    <div
      ref={handle}
      className={`panel-resizer ${side}`}
      style={side === "left" ? { left: position - 4 } : { right: position - 4 }}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-tip={t("Drag to resize. Double-click to reset.")}
      onDoubleClick={() => onChange(fallback)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
        const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
        if (e.key === grow) onChange(clamp(width + step));
        else if (e.key === shrink) onChange(clamp(width - step));
        else if (e.key === "Home") onChange(min);
        else if (e.key === "End") onChange(max);
        else return;
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        const box = handle.current?.parentElement?.getBoundingClientRect();
        if (!box || e.button !== 0) return;
        e.preventDefault();
        handle.current?.setPointerCapture(e.pointerId);
        document.body.classList.add("resizing-panel");
        const move = (ev: PointerEvent) => {
          const w = side === "left" ? ev.clientX - box.left - inset.edge - inset.gap : box.right - ev.clientX - inset.edge - inset.gap;
          onChange(clamp(w));
        };
        const up = () => {
          document.body.classList.remove("resizing-panel");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      }}
    />
  );
}

/** A remembered panel width from this computer, or the default. */
export function rememberedWidth(key: string, fallback: number) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}
export function rememberWidth(key: string, width: number) {
  try {
    localStorage.setItem(key, String(width));
  } catch {
    // Private windows may refuse storage; the width simply is not kept.
  }
}
