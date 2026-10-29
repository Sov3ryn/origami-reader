import { useEffect, useId, useRef, type CSSProperties } from "react";
import { bookmarkArt, bookmarkCanvas } from "../bookmarks";
import { useBookmarkMotion } from "./useBookmarkMotion";
import { watchDialMarkup } from "./timeBookmarkDial";
import { WanderingBoxArt } from "./WanderingBoxArt";

export const timeBookmarkDesigns = ["sands-of-time", "measure-of-time", "wandering-blue-box"];

export function TimeBookmark({ design, active, stillStyle }: { design: string; active: boolean; stillStyle: CSSProperties }) {
  const original = bookmarkArt(design)!;
  const { host, loaded, animated, paused } = useBookmarkMotion(original, active);
  const svg = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, "");
  const watch = design === "measure-of-time";
  useEffect(() => {
    if (!svg.current) return;
    if (!animated || paused) svg.current.pauseAnimations();
    else svg.current.unpauseAnimations();
  }, [animated, paused, loaded]);
  return <span ref={host} className="bookmark-art time-bookmark-art" data-design={design} data-animated={animated} data-paused={paused} aria-hidden="true">
    <img src={original} alt="" draggable={false} style={stillStyle}/>
    {loaded && <svg ref={svg} className="time-bookmark-animation" viewBox={bookmarkCanvas(design).viewBox} focusable="false">
      {design === "wandering-blue-box" ? <WanderingBoxArt id={id}/> : watch ? <>
        <image href="/bookmarks/measure-of-time-source.png" width="1024" height="1536"/>
        <g dangerouslySetInnerHTML={{ __html: watchDialMarkup(true) }}/>
      </> : <>
        <defs>
          <clipPath id={`${id}-glass`}><path d="M450 164 Q420 225 470 282 Q500 308 505 318 Q502 331 470 359 Q421 402 447 471 Q510 494 578 471 Q605 402 553 359 Q522 331 519 318 Q523 307 554 282 Q602 225 574 164Z"/></clipPath>
          <radialGradient id={`${id}-mote`}><stop stopColor="#fff7cc" stopOpacity=".85"/><stop offset=".35" stopColor="#ffcb52" stopOpacity=".35"/><stop offset="1" stopColor="#ffbd45" stopOpacity="0"/></radialGradient>
        </defs>
        <g clipPath={`url(#${id}-glass)`}>
          {Array.from({ length: 18 }, (_, i) => {
            const startX = 474 + (i * 23 % 77), startY = 187 + (i * 17 % 44);
            const endX = 474 + (i * 29 % 78), endY = 424 + Math.abs(endX - 512) * .55;
            const duration = 5.5 + (i % 5) * .47;
            return <g key={i} className="time-star" opacity="0">
              <animateTransform attributeName="transform" type="translate" values={`${startX} ${startY};512 318;${endX} ${endY};${endX+3} ${endY-13};${endX+5} ${endY};${endX+5} ${endY}`} keyTimes="0;.43;.72;.8;.89;1" dur={`${duration}s`} begin={`${-i*.53}s`} repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0;.85;1;1;.7;0" keyTimes="0;.12;.43;.8;.94;1" dur={`${duration}s`} begin={`${-i*.53}s`} repeatCount="indefinite"/>
              <circle r="12" fill={`url(#${id}-mote)`}/>
              {i % 3 === 0 ? <path d="M0 -5 L1.5 -1.5 L5 0 L1.5 1.5 L0 5 L-1.5 1.5 L-5 0 L-1.5 -1.5Z" fill="#fff1a6"/> : <circle r={1.5+i%2} fill="#ffe8a0"/>}
            </g>;
          })}
        </g>
      </>}
    </svg>}
  </span>;
}
