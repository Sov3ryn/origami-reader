import { useId, type CSSProperties, type SVGProps } from "react";
import { bookmarkArt, bookmarkCanvas } from "../bookmarks";
import { useBookmarkMotion } from "./useBookmarkMotion";

const wolfBody = "M225 0 H780 V245 L745 274 L724 339 H225Z";
const wolfTail = "M746 265 Q796 288 837 357 Q884 432 874 519 Q873 574 841 620 Q821 656 839 679 Q851 694 862 675 Q881 683 874 707 Q866 749 815 745 Q737 728 718 667 Q687 592 720 513 Q743 458 726 403 Q714 367 711 325Z";
const wolfEar = "M276 0 H345 L372 75 L354 99 L281 105Z";
const owlBody = "M316 0 H742 V521 H685 V400 H584 V382 H398 V400 H316Z";
const owlHead = "M325 0 H650 V168 Q642 213 602 235 Q548 252 490 229 Q409 231 352 198Z";

export function AnimalBookmark({ design, active, stillStyle }: {
  design: "moonlit-wolf" | "woodland-owl"; active: boolean; stillStyle: CSSProperties;
}) {
  const wolf = design === "moonlit-wolf";
  const original = bookmarkArt(design)!;
  const { width, height, viewBox } = bookmarkCanvas(design);
  const id = `animal-${useId().replace(/:/g, "")}`;
  const { host, loaded, animated, paused } = useBookmarkMotion(original, active);
  const body = wolf ? wolfBody : owlBody;
  const texture = (props: SVGProps<SVGImageElement> = {}) => <image href={original} width={width} height={height} {...props}/>;
  return <span ref={host} className="bookmark-art animal-bookmark-art" data-design={design}
    data-animated={animated} data-paused={paused} aria-hidden="true">
    <img className="animal-bookmark-still" src={original} alt="" draggable={false} style={stillStyle}/>
    {loaded && <svg className="animal-bookmark-animation" viewBox={viewBox} focusable="false">
      <defs>
        <clipPath id={`${id}-body`}><path d={body}/></clipPath>
        <clipPath id={`${id}-tail`}><path d={wolfTail}/></clipPath>
        <clipPath id={`${id}-ear`}><path d={wolfEar}/></clipPath>
        <clipPath id={`${id}-head`}><path d={owlHead}/></clipPath>
        <mask id={`${id}-paper`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: "luminance" }}>
          <rect width={width} height={height} fill="white"/><path d={body} fill="black"/>
          {wolf && <path d={wolfTail} fill="black"/>}
        </mask>
        <mask id={`${id}-face`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: "luminance" }}>
          <rect width={width} height={height} fill="white"/>
          {wolf ? <path d={wolfEar} fill="black"/> : <rect width={width} height="205" fill="black"/>}
        </mask>
        <linearGradient id={`${id}-lid`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ead2a4"/><stop offset="1" stopColor="#ad7a42"/>
        </linearGradient>
        {[{ x: 443, y: 120 }, { x: 535, y: 142 }].map(({ x, y }, i) => <clipPath key={i} id={`${id}-eye-${i}`}>
          <ellipse cx={x} cy={y} rx="20" ry="24"/>
        </clipPath>)}
      </defs>
      {texture({ className: "animal-bookmark-paper", mask: `url(#${id}-paper)` })}
      <g className={wolf ? "animal-wolf-breath" : "animal-owl-breath"}>
        {wolf && <g className="animal-wolf-tail">{texture({ clipPath: `url(#${id}-tail)` })}</g>}
        <g clipPath={`url(#${id}-body)`}>{texture({ mask: `url(#${id}-face)` })}</g>
        {wolf ? <g className="animal-wolf-ear">{texture({ clipPath: `url(#${id}-ear)` })}</g>
          : <g className="animal-owl-head">
            {texture({ clipPath: `url(#${id}-head)` })}
            {[{ x: 443, y: 120 }, { x: 535, y: 142 }].map(({ x, y }, i) => <g key={i} clipPath={`url(#${id}-eye-${i})`}>
              <g className="animal-owl-lid" style={{ transformOrigin: `${x}px ${y - 25}px` }}>
                <rect x={x - 23} y={y - 25} width="46" height="51" fill={`url(#${id}-lid)`}/>
                {texture({ y: i === 0 ? -52 : -56 })}
                <path d={`M${x-20} ${y+3} Q${x} ${y+17} ${x+20} ${y+3}`} fill="none" stroke="#49301c" strokeWidth="3" strokeLinecap="round"/>
                <path d={`M${x-13} ${y-18} l-3 10 M${x-4} ${y-21} l-2 12 M${x+5} ${y-21} l2 12 M${x+13} ${y-18} l3 10`} fill="none" stroke="#f4dfbb" strokeWidth="1.5" opacity=".7"/>
              </g>
            </g>)}
          </g>}
      </g>
    </svg>}
  </span>;
}
