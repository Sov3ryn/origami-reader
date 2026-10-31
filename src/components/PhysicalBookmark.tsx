import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Trash2 } from "lucide-react";
import type { Annotation } from "../types";
import { bookmarkArt, bookmarkGeometry } from "../bookmarks";
import { annotationColors } from "../themes";
import { t } from "../i18n";
import { useCoverTilt } from "../useCoverTilt";
import { SleepingCatBookmark } from "./SleepingCatBookmark";
import { AnimalBookmark } from "./AnimalBookmark";
import { MidnightMoonBookmark } from "./MidnightMoonBookmark";
import { DecorativeBookmark, bookmarkMotionDetails } from "./DecorativeBookmark";
import { GlobeBookmark } from "./GlobeBookmark";
import { globeDetails } from "./globeRenderer";
import { TimeBookmark, timeBookmarkDesigns } from "./TimeBookmark";
import "./bookmarks.css";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function PhysicalBookmark({ mark, onOpen, onRemove, state = "beside", depth = 0, onSettled }: {
  mark: Annotation;
  onOpen: () => void;
  // Deletes the bookmark. Offered by right-click and by dragging it away to the right.
  onRemove?: () => void;
  state?: "inside" | "beside" | "returning";
  depth?: number;
  onSettled?: () => void;
}) {
  const art = bookmarkArt(mark.design);
  const geometry = bookmarkGeometry(mark.design);
  const imageStyle = { left: `${geometry.left}%`, top: `${geometry.top}%`, width: `${geometry.width}%`, height: `${geometry.height}%` };
  const ref = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean; offset: number } | null>(null);
  // A drag ends with a click on the button, which must not open the bookmark.
  const dragged = useRef(false);
  const removal = useRef(0);
  const removable = !!onRemove && state === "beside";
  useCoverTilt(ref, state === "beside", ".bookmark-tilt", undefined, 16);
  useEffect(() => () => clearTimeout(removal.current), []);
  useLayoutEffect(() => {
    const pages = ref.current?.closest<HTMLElement>(".reading-pages");
    const scroll = pages?.closest<HTMLElement>(".reading-scroll");
    if (!pages || !scroll) return;
    const resize = () => {
      // Continuous documents can be much taller than a screen. Use the visible sheet height.
      const sheet = pages.querySelector<HTMLElement>(".reading-page");
      const height = Math.min(sheet?.offsetHeight || 760, Math.max(240, scroll.clientHeight - 65));
      pages.style.setProperty("--bookmark-height", `${height * 2 / 3}px`);
      pages.style.setProperty("--bookmark-lane", `${height * 2 / 3 * (geometry.ratio + 0.1) + 34}px`);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(scroll);
    return () => {
      observer.disconnect();
      pages.style.removeProperty("--bookmark-height");
      pages.style.removeProperty("--bookmark-lane");
    };
  }, [geometry.ratio]);

  // The drag offset lives in CSS variables, so following the pointer does not re-render.
  const setOffset = (el: HTMLElement, offset: number) => {
    el.style.setProperty("--drag-x", `${offset}px`);
    el.style.setProperty("--drag-p", Math.max(0, Math.min(1, offset / dragDistance(el))).toFixed(3));
  };
  const dragDistance = (el: HTMLElement) => Math.min(160, Math.max(72, el.offsetWidth * 0.6));
  const release = (el: HTMLElement) => {
    el.classList.remove("dragging");
    el.style.removeProperty("--drag-x");
    el.style.removeProperty("--drag-p");
  };
  const remove = () => {
    const el = ref.current;
    if (!onRemove || !el) return;
    setMenu(null);
    el.classList.remove("dragging");
    el.classList.add("removing");
    const done = () => {
      onRemove();
      // Still here a moment later means the removal failed: show it again.
      removal.current = window.setTimeout(() => { el.classList.remove("removing"); release(el); }, 1200);
    };
    if (reducedMotion()) done();
    else removal.current = window.setTimeout(done, 220);
  };

  return <>
    <button type="button" className={"physical-bookmark " + state + (art ? " illustrated" : " colored")}
      ref={ref}
      data-bookmark-id={mark.id}
      style={{ "--bookmark-color": annotationColors.find((c) => c.id === mark.color)?.value || "#b76809", "--bookmark-depth": `${depth}px`, "--bookmark-ratio": geometry.ratio } as CSSProperties}
      aria-label={t("Return to bookmarked sentence")}
      aria-haspopup={removable ? "menu" : undefined}
      title={mark.text || mark.quote || t("Bookmark")}
      onClick={(e) => {
        e.stopPropagation();
        if (dragged.current) { dragged.current = false; return; }
        onOpen();
      }}
      onContextMenu={(e) => {
        if (!removable) return;
        e.preventDefault();
        e.stopPropagation();
        // The keyboard menu key reports no pointer position.
        const r = e.currentTarget.getBoundingClientRect();
        setMenu(e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 3 });
      }}
      onKeyDown={(e) => {
        if (removable && e.key === "Delete") { e.preventDefault(); e.stopPropagation(); remove(); }
      }}
      onPointerDown={(e) => {
        dragged.current = false;
        if (!removable || e.button !== 0) return;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, offset: 0 };
        // Captured from the press, so a quick flick that leaves the bookmark still counts.
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x;
        if (!d.moved) {
          if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - d.y)) return;
          d.moved = true;
          e.currentTarget.classList.add("dragging");
        }
        // Only to the right; leftward movement meets resistance.
        d.offset = dx > 0 ? dx : Math.max(-16, dx / 4);
        setOffset(e.currentTarget, d.offset);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.id !== e.pointerId) return;
        // A release with no move events in between still measures the distance.
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) >= 6 && Math.abs(dx) >= Math.abs(e.clientY - d.y)) { d.moved = true; d.offset = dx; }
        if (!d.moved) return;
        dragged.current = true;
        if (d.offset >= dragDistance(e.currentTarget)) remove();
        else release(e.currentTarget);
      }}
      onPointerCancel={(e) => {
        if (drag.current?.moved) release(e.currentTarget);
        drag.current = null;
      }}
      onWheel={(e) => e.stopPropagation()}
      onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === "transform") onSettled?.(); }}>
      <span className="bookmark-tilt">
        {mark.still && art ? <span className="bookmark-art"><img src={art} alt="" draggable={false} style={imageStyle} /></span>
          : mark.design === "sleeping-cat-stars" ? <SleepingCatBookmark active={state === "beside"} stillStyle={imageStyle} />
          : mark.design === "moonlit-wolf" || mark.design === "woodland-owl" ? <AnimalBookmark design={mark.design} active={state === "beside"} stillStyle={imageStyle} />
          : mark.design === "midnight-moon-leather" ? <MidnightMoonBookmark active={state === "beside"} stillStyle={imageStyle} />
          : mark.design && globeDetails[mark.design] ? <GlobeBookmark design={mark.design} active={state === "beside"} stillStyle={imageStyle} />
          : mark.design && timeBookmarkDesigns.includes(mark.design) ? <TimeBookmark design={mark.design} active={state === "beside"} stillStyle={imageStyle} />
          : mark.design && bookmarkMotionDetails[mark.design] ? <DecorativeBookmark design={mark.design} active={state === "beside"} stillStyle={imageStyle} />
          : art ? <span className="bookmark-art"><img src={art} alt="" draggable={false} style={imageStyle} /></span>
          : <span className="bookmark-color-sample" aria-hidden="true" />}
        {state === "beside" && <span className="bookmark-sheen" aria-hidden="true"
          style={art ? { ...imageStyle, maskImage: `url("${art}")`, WebkitMaskImage: `url("${art}")`, "--art-left": geometry.left, "--art-top": geometry.top, "--art-width": geometry.width, "--art-height": geometry.height } as CSSProperties : undefined} />}
      </span>
    </button>
    {menu && <BookmarkMenu x={menu.x} y={menu.y} onOpen={onOpen} onRemove={remove}
      onClose={(focus) => { setMenu(null); if (focus) ref.current?.focus({ preventScroll: true }); }} />}
  </>;
}

// Right-click menu for the bookmark beside the book. It is drawn in the app
// root so the 3D book's transforms do not move it.
function BookmarkMenu({ x, y, onOpen, onRemove, onClose }: {
  x: number;
  y: number;
  onOpen: () => void;
  onRemove: () => void;
  onClose: (focus: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  // Kept inside the window; a transformed ancestor would offset "fixed", so the
  // menu measures where it lands and corrects for it (as ReaderMenu does).
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.animation = "none";
    const r = el.getBoundingClientRect();
    el.style.animation = "";
    const left = x + r.width > window.innerWidth - 8 ? Math.max(8, x - r.width) : x;
    const top = y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y;
    setPlace({ left: left - (r.left - x), top: top - (r.top - y) });
  }, [x, y]);
  // The book re-renders while it reads; the latest handler is used without
  // re-running the effect, which would move the focus back to the first item.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) close.current(false); };
    const away = () => close.current(false);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", away);
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("blur", away);
    };
  }, []);
  return createPortal(
    <div ref={menu} className="book-menu-popup reader-menu bookmark-menu" role="menu" aria-label={t("Bookmark options")} style={place}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      // React events from a portal still bubble to the book, which turns pages
      // on clicks and arrow keys.
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        const list = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") || []);
        const i = list.indexOf(document.activeElement as HTMLElement);
        if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); onClose(true); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
        }
      }}>
      <button role="menuitem" onClick={() => { onClose(false); onOpen(); }}>
        <Bookmark size={15} />
        {t("Return to bookmarked sentence")}
      </button>
      <div className="book-menu-separator" role="separator" />
      <button role="menuitem" className="danger" onClick={onRemove}>
        <Trash2 size={15} />
        {t("Remove bookmark")}
      </button>
    </div>,
    document.querySelector(".app") || document.body,
  );
}
