import { useEffect, useRef, type RefObject } from "react";

// Line highlight and reading strip: a band that follows the pointer over the
// book, or the sentence being read aloud. The strip also dims the text above
// and below. Positions update directly on the element, without re-rendering.
export function FocusOverlay({
  mode,
  container,
  lineHeight,
}: {
  mode: "line" | "strip";
  container: RefObject<HTMLElement | null>;
  lineHeight: number;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = container.current;
    const band = overlay.current;
    if (!area || !band) return;
    let frame = 0;
    let pointerY: number | null = null;
    const place = () => {
      frame = 0;
      const rect = area.getBoundingClientRect();
      // Without a pointer over the book, follow the sentence being read.
      const spoken =
        pointerY === null
          ? area.querySelector(".sentence-mark")?.getBoundingClientRect()
          : null;
      const y = pointerY ?? (spoken ? spoken.top + lineHeight / 2 : null);
      band.style.left = rect.left + "px";
      band.style.top = rect.top + "px";
      band.style.width = rect.width + "px";
      band.style.height = rect.height + "px";
      if (y === null || y < rect.top || y > rect.bottom) {
        band.style.opacity = "0";
        return;
      }
      band.style.opacity = "1";
      band.style.setProperty("--focus-y", y - rect.top + "px");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const move = (e: PointerEvent) => {
      pointerY = e.clientY;
      schedule();
    };
    const leave = () => {
      pointerY = null;
      schedule();
    };
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerleave", leave);
    area.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Follow narration as the highlighted sentence moves.
    const watch = window.setInterval(() => {
      if (pointerY === null) schedule();
    }, 400);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(watch);
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
      area.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [container, lineHeight]);
  return (
    <div
      ref={overlay}
      className={"focus-overlay focus-" + mode}
      style={{ ["--focus-h" as string]: lineHeight * 1.25 + "px" }}
      aria-hidden="true"
    />
  );
}
