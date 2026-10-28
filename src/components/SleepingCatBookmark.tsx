import { useId, type CSSProperties } from "react";
import { useBookmarkMotion } from "./useBookmarkMotion";

const original = "/bookmarks/sleeping-cat-stars-v2.png";

// One texture, clipped into independent pieces. The corrected tail originates
// at the rear haunch and hangs outside the paper, so its stars never move.
const tail = "M741 211 C804 223 850 313 857 399 C866 479 823 551 798 596 C779 631 781 672 801 687 C817 697 834 680 807 668 C821 653 844 665 849 685 C863 716 841 739 808 737 C762 737 741 709 728 674 C711 626 732 575 754 530 C778 483 790 444 782 398 C776 351 758 321 734 291 Z";
const body = "M275 0 H766 V210 L743 214 Q750 274 732 305 Q714 333 685 335 H408 Q374 347 349 338 L275 340 Z";
const ear = "M307 92 Q318 84 341 106 Q370 123 383 171 L380 207 L307 202 Z";
const earTip = "M307 92 Q318 84 341 106 Q370 123 376 163 L368 177 L307 173 Z";

export function SleepingCatBookmark({ active, stillStyle }: {
  active: boolean;
  stillStyle: CSSProperties;
}) {
  const id = useId().replace(/:/g, "");
  const { host, loaded, animated, paused } = useBookmarkMotion(original, active);
  return <span ref={host} className="bookmark-art sleeping-cat-art"
    data-animated={animated} data-paused={paused} aria-hidden="true">
    <img className="sleeping-cat-still" src={original} alt="" draggable={false} style={stillStyle} />
    {loaded && <svg className="sleeping-cat-animation" viewBox="286 26 573 1483" focusable="false">
      <defs>
        <clipPath id={`${id}-ribbon`}><rect x="334" y="334" width="357" height="1174" /></clipPath>
        <clipPath id={`${id}-body`}><path d={body} /></clipPath>
        <clipPath id={`${id}-tail`}><path d={tail} /></clipPath>
        <clipPath id={`${id}-ear`}><path d={ear} /></clipPath>
        <mask id={`${id}-head`} maskUnits="userSpaceOnUse" x="270" y="0" width="520" height="370">
          <rect x="270" width="520" height="370" fill="white" />
          <path d={earTip} fill="black" />
        </mask>
      </defs>
      <image href={original} width="1024" height="1536" clipPath={`url(#${id}-ribbon)`} />
      <g className="sleeping-cat-breath">
        <g className="sleeping-cat-tail"><image href={original} width="1024" height="1536" clipPath={`url(#${id}-tail)`} /></g>
        <g mask={`url(#${id}-head)`}><image href={original} width="1024" height="1536" clipPath={`url(#${id}-body)`} /></g>
        <g className="sleeping-cat-ear"><image href={original} width="1024" height="1536" clipPath={`url(#${id}-ear)`} /></g>
      </g>
    </svg>}
  </span>;
}
