import { useId, type CSSProperties } from "react";
import { bookmarkArt, bookmarkCanvas } from "../bookmarks";
import { useBookmarkMotion } from "./useBookmarkMotion";

type Glint = [x: number, y: number, radius: number];
type Detail = {
  sheen?: string;
  glints?: Glint[];
  tint?: string;
  highlight?: string;
  aura?: { x: number; y: number; radius: number };
  part?: { path: string; origin: string; angle: string; duration: string };
  field?: { path: string; kind: "firefly" | "petal" | "mist" | "dew"; count: number };
  lights?: { x: number; y: number; rx: number; ry: number }[];
  water?: string[];
};

// Coordinates follow the original artwork. Only detached parts move; printed details stay on paper.
export const bookmarkMotionDetails: Record<string, Detail> = {
  "plum-crane-ribbon": {
    sheen: "M427 249 L459 246 L484 286 L519 196 L538 295 L599 239 L560 312 L559 347 L488 347 L468 294 Z",
    glints: [[519, 203, 11], [558, 341, 8]],
  },
  "lavender-botanical-paper": {
    part: { path: "M294 298 Q334 277 373 307 L384 906 Q264 934 136 866 L287 423 Z", origin: "334px 305px", angle: "1.1deg", duration: "9s" },
    sheen: "M529 296 C618 177 755 298 676 418 L602 452 C732 408 713 225 598 250 Q558 256 529 296Z",
    glints: [[658, 498, 9], [583, 871, 8], [576, 1454, 8]],
  },
  "forest-gold-pennant": {
    field: { path: "M379 240 H645 V1300 L513 1480 L379 1300Z", kind: "firefly", count: 6 },
    glints: [[494, 372, 10], [572, 511, 9], [510, 1120, 10]],
    tint: "#dceca0",
  },
  "origami-crane-blossoms": {
    sheen: "M253 96 L454 205 L519 23 L598 263 L688 127 L775 114 L708 144 L625 441 L601 452 L523 402 L357 322Z",
    field: { path: "M414 470 H650 V1455 H414Z", kind: "petal", count: 4 },
    tint: "#e3b2de",
  },
  "gothic-castle-window": {
    aura: { x: 470, y: 560, radius: 142 },
    field: { path: "M281 780 L424 841 L581 888 L659 928 L573 1070 L522 1230 L443 1360 L367 1150 L281 1020Z", kind: "mist", count: 3 },
    lights: [{ x: 524, y: 734, rx: 21, ry: 38 }, { x: 539, y: 732, rx: 19, ry: 38 }, { x: 446, y: 824, rx: 22, ry: 42 }, { x: 464, y: 824, rx: 22, ry: 42 }, { x: 539, y: 866, rx: 22, ry: 40 }, { x: 347, y: 1068, rx: 22, ry: 34 }],
    water: ["M425 1144 H496 M410 1178 H516", "M431 1220 H487 M405 1258 H471", "M445 1290 H505 M441 1320 H485"],
  },
  "sage-lily-leaf": {
    field: { path: "M386 438 L641 451 L670 900 L538 1240 L389 1070Z", kind: "dew", count: 6 },
    glints: [[485, 361, 25], [513, 613, 23], [546, 869, 22], [589, 795, 18]],
    tint: "#efffe4",
  },
  "brass-feather": {
    tint: "#efb33f", highlight: "#ffd16a",
    sheen: "M340 28 H647 V1492 H340Z",
    glints: [[508, 55, 12], [538, 566, 9], [469, 1469, 8]],
  },
  "crane-charm-hook": {
    part: { path: "M380 211 L421 211 L431 351 L423 454 L477 389 L486 393 L461 550 L553 497 L563 500 L562 506 L460 625 L445 647 L336 634 L282 464 L239 483 L234 473 L283 446 L300 450 L361 537 L379 513Z", origin: "404px 216px", angle: "1.6deg", duration: "8.8s" },
    sheen: "M548 140 L590 148 L590 692 L652 1409 L620 1482 L568 1480 L505 1039 L552 400Z",
    glints: [[567, 719, 9], [554, 1250, 9]],
  },
  "silver-celestial-sword": {
    sheen: "M461 24 H563 V340 L681 365 V437 H582 V1479 H445 V437 H344 V365 H461Z",
    glints: [[512, 91, 16], [512, 394, 23], [512, 577, 19], [512, 719, 12]],
    tint: "#d5eaff",
  },
  "gold-ivy-moon-filigree": {
    tint: "#efb33f", highlight: "#ffd16a",
    part: { path: "M552 175 H580 V213 L598 239 L591 251 L616 265 L590 280 L594 292 L577 289 L567 324 L555 293 L541 296 L541 282 L518 267 L543 253 L539 238 L555 244 L555 215Z", origin: "566px 178px", angle: "3deg", duration: "11s" },
    sheen: "M382 22 H641 V1503 H382Z",
    glints: [[450, 211, 12], [597, 562, 10], [432, 1029, 9], [584, 1382, 9]],
  },
};

export function DecorativeBookmark({ design, active, stillStyle }: {
  design: string; active: boolean; stillStyle: CSSProperties;
}) {
  const original = bookmarkArt(design)!;
  const detail = bookmarkMotionDetails[design];
  const { width, height, viewBox } = bookmarkCanvas(design);
  const id = `detail-${useId().replace(/:/g, "")}`;
  const { host, loaded, animated, paused } = useBookmarkMotion(original, active);
  const tint = detail.tint || "#ffdf9b";
  const phase = [...design].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 11;
  return <span ref={host} className="bookmark-art decorative-bookmark-art" data-design={design}
    data-animated={animated} data-paused={paused} aria-hidden="true">
    <img className={detail.part ? "decorative-part-still" : undefined} src={original} alt="" draggable={false} style={stillStyle}/>
    {loaded && <svg className="decorative-bookmark-animation" viewBox={viewBox} focusable="false">
      <defs>
        <linearGradient id={`${id}-shine`} x1="0" x2="1" y1="1" y2="0">
          <stop stopColor={tint} stopOpacity="0"/><stop offset=".46" stopColor={tint} stopOpacity="0"/>
          <stop offset=".5" stopColor={detail.highlight || "#fff9e8"} stopOpacity=".7"/><stop offset=".54" stopColor={tint} stopOpacity="0"/>
          <stop offset="1" stopColor={tint} stopOpacity="0"/>
        </linearGradient>
        <radialGradient id={`${id}-halo`}><stop stopColor={tint} stopOpacity=".85"/><stop offset=".25" stopColor={tint} stopOpacity=".4"/><stop offset="1" stopColor={tint} stopOpacity="0"/></radialGradient>
        <mask id={`${id}-alpha`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <image href={original} width={width} height={height}/>
        </mask>
        {detail.sheen && <clipPath id={`${id}-metal`}><path d={detail.sheen}/></clipPath>}
        {detail.field && <clipPath id={`${id}-field`}><path d={detail.field.path}/></clipPath>}
        {detail.part && <>
          <clipPath id={`${id}-part`}><path d={detail.part.path}/></clipPath>
          <mask id={`${id}-body`} style={{ maskType: "luminance" }} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect width={width} height={height} fill="white"/><path d={detail.part.path} fill="black"/>
          </mask>
        </>}
      </defs>
      {detail.part && <>
        <image href={original} width={width} height={height} mask={`url(#${id}-body)`}/>
        <g className="bookmark-detail-swing" style={{ transformOrigin: detail.part.origin, "--swing-angle": detail.part.angle, animationDuration: detail.part.duration } as CSSProperties}>
          <image href={original} width={width} height={height} clipPath={`url(#${id}-part)`}/>
        </g>
      </>}
      <g mask={`url(#${id}-alpha)`}>
      <g mask={detail.part ? `url(#${id}-body)` : undefined}>
        {detail.aura && <circle cx={detail.aura.x} cy={detail.aura.y} r={detail.aura.radius} fill={`url(#${id}-halo)`} className="bookmark-detail-aura"/>}
        {detail.sheen && <g clipPath={`url(#${id}-metal)`}>
          <rect className="bookmark-detail-sheen" x="-1024" y="-600" width="2048" height="3000" fill={`url(#${id}-shine)`} style={{ animationDelay: `${-phase}s` }}/>
        </g>}
        {detail.glints?.map(([x, y, r], i) => <g key={i} className="bookmark-detail-glint" style={{ animationDuration: `${14 + i * 3}s`, animationDelay: `${-4 - i * 6}s` }}>
          <circle cx={x} cy={y} r={r * 2.4} fill={`url(#${id}-halo)`}/>
          <path d={`M${x} ${y-r} Q${x+1} ${y-1} ${x+r*.65} ${y} Q${x+1} ${y+1} ${x} ${y+r} Q${x-1} ${y+1} ${x-r*.65} ${y} Q${x-1} ${y-1} ${x} ${y-r}`} fill={detail.highlight || "#fff3d8"}/>
        </g>)}
        {detail.field && <g clipPath={`url(#${id}-field)`}>
          {Array.from({ length: detail.field.count }, (_, i) => <g key={i} className={`bookmark-detail-${detail.field!.kind}`}
            style={{ animationDelay: `${-i * 4.7}s`, animationDuration: `${16 + i * 2.3}s`, "--drift-x": `${i % 2 ? -26 : 23}px` } as CSSProperties}>
            {detail.field!.kind === "petal" ? <path d={`M${455+i*43} ${610+i*130} q-16 -8 -9 -25 q20 5 9 25Z`} fill={tint} stroke="#9f6b9c" strokeWidth="1.5"/>
              : detail.field!.kind === "mist" ? <ellipse cx={420+i*50} cy={800+i*175} rx="145" ry="37" fill={`url(#${id}-halo)`}/>
              : <><circle cx={412+(i*59)%205} cy={520+(i*173)%740} r={detail.field!.kind === "dew" ? 25 : 19} fill={`url(#${id}-halo)`}/><circle cx={412+(i*59)%205} cy={520+(i*173)%740} r={detail.field!.kind === "dew" ? 5 : 3} fill="#fff8cc"/></>}
          </g>)}
        </g>}
        {detail.lights?.map((light, i) => <ellipse key={i} {...light} cx={light.x} cy={light.y} fill={`url(#${id}-halo)`} className="bookmark-detail-lantern" style={{ animationDelay: `${-i*2.3}s` }}/>) }
        {detail.water?.map((d, i) => <path key={i} d={d} fill="none" stroke="#fff0bd" strokeWidth="5" strokeLinecap="round" className="bookmark-detail-water" style={{ animationDelay: `${-i*3}s` }}/>) }
      </g>
      </g>
    </svg>}
  </span>;
}
