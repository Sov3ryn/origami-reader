import { useId, type CSSProperties } from "react";
import { useBookmarkMotion } from "./useBookmarkMotion";

const original = "/bookmarks/midnight-moon-leather.png";
const crescent = "M563 422 C510 402 455 431 427 476 C396 527 414 583 454 616 C504 656 581 648 618 585 C576 625 511 620 480 574 C444 523 467 449 520 430 C535 424 549 422 563 422 Z";
const stars = [
  { x: 523, y: 278, size: 25, duration: 13, delay: -9 },
  { x: 439, y: 716, size: 22, duration: 17, delay: -3 },
  { x: 520, y: 875, size: 19, duration: 19, delay: -12 },
  { x: 588, y: 456, size: 12, duration: 23, delay: -4 },
  { x: 625, y: 1213, size: 12, duration: 21, delay: -10 },
];

export function MidnightMoonBookmark({ active, stillStyle }: {
  active: boolean;
  stillStyle: CSSProperties;
}) {
  const id = useId().replace(/:/g, "");
  const { host, loaded, animated, paused } = useBookmarkMotion(original, active);
  return <span ref={host} className="bookmark-art midnight-moon-art"
    data-animated={animated} data-paused={paused} aria-hidden="true">
    <img src={original} alt="" draggable={false} style={stillStyle} />
    {loaded && <svg className="midnight-moon-animation" viewBox="342 32 339 1441" focusable="false">
      <defs>
        <filter id={`${id}-moon-halo`} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <radialGradient id={`${id}-starlight`}>
          <stop stopColor="#fff5d4" stopOpacity=".8" />
          <stop offset=".32" stopColor="#ffdd91" stopOpacity=".35" />
          <stop offset="1" stopColor="#ffc86e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="midnight-moon-glow">
        <path d={crescent} fill="#ffd180" filter={`url(#${id}-moon-halo)`} />
        <path d={crescent} fill="#fff1bb" opacity=".16" />
      </g>
      {stars.map(({ x, y, size: r, duration, delay }) => <g key={`${x}-${y}`} className="midnight-star"
        style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}>
        <circle cx={x} cy={y} r={r * 1.8} fill={`url(#${id}-starlight)`} />
        <path d={`M${x} ${y-r} Q${x+2} ${y-2} ${x+r*.65} ${y} Q${x+2} ${y+2} ${x} ${y+r} Q${x-2} ${y+2} ${x-r*.65} ${y} Q${x-2} ${y-2} ${x} ${y-r}Z`} fill="#fff4d5" />
      </g>)}
    </svg>}
  </span>;
}
