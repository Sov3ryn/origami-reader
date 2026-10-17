import { useEffect, useRef, useState } from "react";
import { keyLabel } from "../platform";

// Shortcut keys as chips: "Ctrl+Shift+H" becomes Ctrl, Shift, H (or the Mac
// symbols).
export function Keys({ keys }: { keys: string }) {
  return (
    <span className="keys">
      {keys.split(" / ").map((combo, i) => (
        <span key={i} className="keys-combo">
          {i > 0 && <span className="keys-or">/</span>}
          {combo.split("+").map((k) => (
            <kbd key={k}>{keyLabel(k)}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

// "Switch to night (Ctrl+Shift+L)" -> ["Switch to night", "Ctrl+Shift+L"].
// Only key-like brackets count, so "(optional)" stays in the label.
const keyToken = /^(Ctrl|Cmd|Shift|Alt|Option|Space|Esc|Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right|F\d{1,2}|.)$/;
export function splitKeys(text: string): [string, string | undefined] {
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(text.trim());
  if (!m) return [text.trim(), undefined];
  const combos = m[2].split(" / ").map((c) => c.trim());
  const ok = combos.every((c) => c.split("+").every((k) => keyToken.test(k.trim())));
  return ok ? [m[1], combos.join(" / ")] : [text.trim(), undefined];
}

// One tooltip for everything inside `root`: hover (or focus with the
// keyboard) an element with data-tip, and its name shows with its shortcut
// (data-keys). Replaces the browser's plain title tooltips.
export function HoverTips({ root }: { root: React.RefObject<HTMLElement | null> }) {
  const [tip, setTip] = useState<{ label: string; keys?: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let current: HTMLElement | null = null;
    const show = (target: HTMLElement, delay: number) => {
      window.clearTimeout(timer.current);
      current = target;
      timer.current = window.setTimeout(() => {
        if (current !== target || !target.isConnected) return;
        const r = target.getBoundingClientRect();
        const below = r.top < 64;
        setTip({
          label: target.dataset.tip || "",
          keys: target.dataset.keys,
          x: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)),
          y: below ? r.bottom + 8 : r.top - 8,
          below,
        });
      }, delay);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      current = null;
      setTip(null);
    };
    // Plain title tooltips and icon buttons join in: the title moves into
    // data-tip (so the browser's own tooltip does not show twice), and a
    // trailing "(Ctrl+Shift+L)" becomes the shortcut.
    const adopt = (from: HTMLElement | null) => {
      const target = from?.closest<HTMLElement>("[data-tip], [title], button.icon-only[aria-label], button.icon-button[aria-label]");
      // An embedded frame's title names it for screen readers; it is not a tip.
      if (!target || target.tagName === "IFRAME" || target.closest(".hover-tip-skip")) return null;
      if (!target.dataset.tip) {
        const [label, keys] = splitKeys(target.getAttribute("title") || target.getAttribute("aria-label") || "");
        target.dataset.tip = label;
        if (keys && !target.dataset.keys) target.dataset.keys = keys;
        target.removeAttribute("title");
      }
      return target;
    };
    const over = (e: Event) => {
      const target = adopt(e.target as HTMLElement);
      if (target === current) return;
      if (target && el.contains(target)) show(target, 420);
      else hide();
    };
    const focus = (e: Event) => {
      const target = adopt(e.target as HTMLElement);
      if (target?.matches(":focus-visible")) show(target, 200);
    };
    el.addEventListener("mouseover", over);
    el.addEventListener("focusin", focus);
    el.addEventListener("focusout", hide);
    el.addEventListener("mousedown", hide, true);
    el.addEventListener("mouseleave", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      el.removeEventListener("mouseover", over);
      el.removeEventListener("focusin", focus);
      el.removeEventListener("focusout", hide);
      el.removeEventListener("mousedown", hide, true);
      el.removeEventListener("mouseleave", hide);
      window.removeEventListener("scroll", hide, true);
      window.clearTimeout(timer.current);
    };
  }, [root]);
  if (!tip || !tip.label) return null;
  return (
    <div className={"hover-tip" + (tip.below ? " below" : "")} style={{ left: tip.x, top: tip.y }} role="tooltip">
      <span>{tip.label}</span>
      {tip.keys && <Keys keys={tip.keys} />}
    </div>
  );
}
