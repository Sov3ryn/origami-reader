import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { Annotation } from "../types";
import { bookmarkArt, bookmarkGeometry } from "../bookmarks";
import { annotationColors } from "../themes";
import { t } from "../i18n";
import { SleepingCatBookmark } from "./SleepingCatBookmark";
import { AnimalBookmark } from "./AnimalBookmark";
import { MidnightMoonBookmark } from "./MidnightMoonBookmark";
import { DecorativeBookmark, bookmarkMotionDetails } from "./DecorativeBookmark";
import { GlobeBookmark } from "./GlobeBookmark";
import { globeDetails } from "./globeRenderer";
import { TimeBookmark, timeBookmarkDesigns } from "./TimeBookmark";
import "./bookmarks.css";

export function PhysicalBookmark({ mark, onOpen, state = "beside", depth = 0, onSettled }: {
  mark: Annotation;
  onOpen: () => void;
  state?: "inside" | "beside" | "returning";
  depth?: number;
  onSettled?: () => void;
}) {
  const art = bookmarkArt(mark.design);
  const geometry = bookmarkGeometry(mark.design);
  const imageStyle = { left: `${geometry.left}%`, top: `${geometry.top}%`, width: `${geometry.width}%`, height: `${geometry.height}%` };
  const ref = useRef<HTMLButtonElement>(null);
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
  return <button type="button" className={"physical-bookmark " + state + (art ? " illustrated" : " colored")}
    ref={ref}
    data-bookmark-id={mark.id}
    style={{ "--bookmark-color": annotationColors.find((c) => c.id === mark.color)?.value || "#b76809", "--bookmark-depth": `${depth}px`, "--bookmark-ratio": geometry.ratio } as CSSProperties}
    aria-label={t("Return to bookmarked sentence")}
    title={mark.text || mark.quote || t("Bookmark")}
    onClick={(e) => { e.stopPropagation(); onOpen(); }}
    onWheel={(e) => e.stopPropagation()}
    onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === "transform") onSettled?.(); }}>
    {mark.still && art ? <span className="bookmark-art"><img src={art} alt="" draggable={false} style={imageStyle} /></span>
      : mark.design === "sleeping-cat-stars" ? <SleepingCatBookmark active={state === "beside"} stillStyle={imageStyle} />
      : mark.design === "moonlit-wolf" || mark.design === "woodland-owl" ? <AnimalBookmark design={mark.design} active={state === "beside"} stillStyle={imageStyle} />
      : mark.design === "midnight-moon-leather" ? <MidnightMoonBookmark active={state === "beside"} stillStyle={imageStyle} />
      : mark.design && globeDetails[mark.design] ? <GlobeBookmark design={mark.design} active={state === "beside"} stillStyle={imageStyle} />
      : mark.design && timeBookmarkDesigns.includes(mark.design) ? <TimeBookmark design={mark.design} active={state === "beside"} stillStyle={imageStyle} />
      : mark.design && bookmarkMotionDetails[mark.design] ? <DecorativeBookmark design={mark.design} active={state === "beside"} stillStyle={imageStyle} />
      : art ? <span className="bookmark-art"><img src={art} alt="" draggable={false} style={imageStyle} /></span>
      : <span className="bookmark-color-sample" aria-hidden="true" />}
  </button>;
}
