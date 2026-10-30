import { createContext, useContext, useEffect, type RefObject } from "react";

export const CoverMotionContext = createContext(true);
type Entry = { target: HTMLElement; anchor: HTMLElement; visible: boolean };
const entries = new Set<Entry>();
let stop: (() => void) | undefined;
const reset = ({ target }: Entry) => {
  target.style.removeProperty("--pointer-x");
  target.style.removeProperty("--pointer-y");
  target.style.removeProperty("--foil-x");
  target.removeAttribute("data-pointer-near");
};

// One pointer listener and at most one frame per event, shared by all visible
// covers. The untransformed anchor avoids feedback from a tilting cover.
function listen() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(any-hover: hover) and (any-pointer: fine)");
  let frame = 0;
  let point: { x: number; y: number } | null = null;
  const clear = () => { point = null; cancelAnimationFrame(frame); frame = 0; entries.forEach(reset); };
  const update = () => {
    frame = 0;
    if (!point || reduced.matches || !fine.matches || document.hidden || document.querySelector("dialog[open], .modal-scrim")) { entries.forEach(reset); return; }
    for (const entry of entries) {
      if (!entry.visible) { reset(entry); continue; }
      const r = entry.anchor.getBoundingClientRect();
      const dx = Math.max(r.left - point.x, 0, point.x - r.right);
      const dy = Math.max(r.top - point.y, 0, point.y - r.bottom);
      const distance = Math.hypot(dx, dy);
      if (!r.width || !r.height || distance >= 72) { reset(entry); continue; }
      const strength = (1 - distance / 72) ** 2;
      const x = Math.max(-1, Math.min(1, (point.x - r.left - r.width / 2) / (r.width / 2))) * strength;
      const y = Math.max(-1, Math.min(1, (point.y - r.top - r.height / 2) / (r.height / 2))) * strength;
      entry.target.style.setProperty("--pointer-x", x.toFixed(3));
      entry.target.style.setProperty("--pointer-y", y.toFixed(3));
      entry.target.style.setProperty("--foil-x", `${50 + x * 35}%`);
      entry.target.setAttribute("data-pointer-near", "true");
    }
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.buttons) { clear(); return; }
    point = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("pointerleave", clear);
  window.addEventListener("blur", clear);
  window.addEventListener("scroll", clear, true);
  window.addEventListener("resize", clear);
  document.addEventListener("visibilitychange", clear);
  reduced.addEventListener("change", clear);
  fine.addEventListener("change", clear);
  return () => {
    clear();
    window.removeEventListener("pointermove", move);
    document.documentElement.removeEventListener("pointerleave", clear);
    window.removeEventListener("blur", clear);
    window.removeEventListener("scroll", clear, true);
    window.removeEventListener("resize", clear);
    document.removeEventListener("visibilitychange", clear);
    reduced.removeEventListener("change", clear);
    fine.removeEventListener("change", clear);
  };
}

export function useCoverTilt(root: RefObject<HTMLElement | null>, enabled: boolean, targetSelector: string, anchorSelector?: string) {
  const motion = useContext(CoverMotionContext);
  useEffect(() => {
    if (!enabled || !motion || !root.current) return;
    const target = root.current.querySelector<HTMLElement>(targetSelector);
    const anchor = anchorSelector ? root.current.querySelector<HTMLElement>(anchorSelector) : root.current;
    if (!target || !anchor) return;
    const entry: Entry = { target, anchor, visible: false };
    const observer = new IntersectionObserver(([state]) => { entry.visible = state.isIntersecting; if (!entry.visible) reset(entry); });
    observer.observe(anchor);
    entries.add(entry);
    stop ??= listen();
    return () => {
      observer.disconnect(); reset(entry); entries.delete(entry);
      if (!entries.size) { stop?.(); stop = undefined; }
    };
  }, [root, enabled, motion, targetSelector, anchorSelector]);
}
