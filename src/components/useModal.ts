import { useEffect, useState, type RefObject } from "react";

const FOCUSABLE = "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[href],[tabindex]:not([tabindex='-1'])";

/**
 * Makes a dialog modal for the keyboard and screen readers: everything around
 * its scrim (up to the app shell, except the notices) becomes inert, focus moves inside, and when
 * the dialog closes focus goes back to what opened it. `ref` is the scrim.
 * Inside the dialog, an element marked `data-autofocus` gets the first focus.
 */
export function useModal(ref: RefObject<HTMLElement | null>) {
  // Read while rendering, before an autoFocus inside the dialog moves focus.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    const scrim = ref.current;
    if (!scrim) return;
    const changed: HTMLElement[] = [];
    let node: HTMLElement = scrim;
    while (node !== document.body) {
      const parent = node.parentElement;
      if (!parent) break;
      for (const el of Array.from(parent.children))
        // Notices stay usable, so an Undo can still be pressed.
        if (el instanceof HTMLElement && el !== node && !el.inert && !el.classList.contains("toast-region")) {
          el.inert = true;
          changed.push(el);
        }
      if (parent.classList.contains("app")) break;
      node = parent;
    }
    if (!scrim.contains(document.activeElement)) {
      const target = scrim.querySelector<HTMLElement>("[data-autofocus]") || scrim.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    }
    return () => {
      changed.forEach((el) => {
        el.inert = false;
      });
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
