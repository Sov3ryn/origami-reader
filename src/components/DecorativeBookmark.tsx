import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { bookmarkArt, bookmarkCanvas } from "../bookmarks";
import { useBookmarkMotion } from "./useBookmarkMotion";

type Glint = [x: number, y: number, radius: number];
type PaperFold = { path: string; hinge: [number, number, number, number]; depth: number; duration: number; delay?: number; twitch?: boolean };
type Detail = {
  deform?: "moth" | "fox";
  sheen?: string;
  softSheen?: [cx: number, cy: number, rx: number, ry: number][];
  finish?: "holographic" | "iridescent";
  glints?: Glint[];
  tint?: string;
  highlight?: string;
  lightTint?: string;
  aura?: { x: number; y: number; radius: number };
  part?: { path: string; origin: string; angle: string; duration: string; join?: string };
  paperUnderlay?: string;
  folds?: PaperFold[];
  flex?: { origin: string; angle: string; duration: string };
  ripples?: [cx: number, cy: number, rx: number, ry: number][];
  field?: { path: string; kind: "firefly" | "ember" | "petal" | "maple" | "mist" | "dew"; count: number };
  lights?: { x: number; y: number; rx: number; ry: number }[];
  water?: string[];
};

// Coordinates follow the original artwork. Only detached parts move; printed details stay on paper.
export const bookmarkMotionDetails: Record<string, Detail> = {
  "moonwatch-owl-hook": {
    part: { path: "M278 198 H490 V835 H278Z", origin: "397px 198px", angle: "1.5deg", duration: "10.5s", join: "M390 194 H404 V202 H390Z" },
    tint: "#b9d8f3", highlight: "#eaf4ff",
    softSheen: [[608, 816, 57, 645]],
  },
  "fox-key-hook": {
    part: { path: "M290 249 H560 V865 H290Z", origin: "402px 250px", angle: "1.6deg", duration: "11.5s", join: "M395 245 H409 V253 H395Z" },
    tint: "#d7a14b", highlight: "#ffe0a1",
    softSheen: [[640, 875, 66, 600]],
  },
  "silver-wisteria-moon-filigree": {
    part: { path: "M539 165 H599 V326 H539Z", origin: "568px 165px", angle: "3deg", duration: "12s", join: "M563 161 H573 V169 H563Z" },
    tint: "#c4b6eb", highlight: "#e8e2ff",
    softSheen: [[442, 268, 68, 133], [625, 874, 23, 610]],
  },
  "copper-oak-sun-filigree": {
    part: { path: "M479 228 H547 V363 H479Z", origin: "512px 230px", angle: "3.2deg", duration: "10.7s", join: "M506 225 H518 V232 H506Z" },
    tint: "#d88d49", highlight: "#ffd59b",
    softSheen: [[512, 300, 130, 134], [382, 895, 22, 585]],
  },
  "gilded-stag-leather": {
    tint: "#eab04b", highlight: "#ffe3a2",
    softSheen: [[516, 541, 134, 150], [490, 285, 115, 126], [516, 1250, 116, 176]],
    glints: [[479, 434, 11], [582, 496, 10], [507, 199, 9], [605, 1191, 9]],
  },
  "ember-dragon-leather": {
    tint: "#f29530", highlight: "#ffd69a",
    aura: { x: 535, y: 603, radius: 128 },
    softSheen: [[592, 341, 56, 132], [416, 357, 44, 149], [597, 922, 43, 180]],
    glints: [[492, 545, 10], [619, 376, 8], [519, 509, 9], [619, 1339, 8]],
  },
  "midnight-moth-ribbon": {
    deform: "moth", tint: "#edb64f", highlight: "#ffe1a1",
    softSheen: [[514, 310, 120, 112]],
    glints: [[463, 279, 9], [566, 278, 9], [515, 438, 12], [525, 588, 9]],
  },
  "silver-fox-ribbon": {
    deform: "fox", tint: "#c0d3ec", highlight: "#f4f8ff",
    softSheen: [[512, 330, 120, 136], [414, 860, 28, 430], [608, 860, 28, 430]],
    glints: [[518, 232, 9], [575, 389, 10], [611, 1120, 9]],
  },
  "plum-crane-ribbon": {
    sheen: "M427 249 L459 246 L484 286 L519 196 L538 295 L599 239 L560 312 L559 347 L488 347 L468 294 Z",
    glints: [[519, 203, 11], [558, 341, 8]],
  },
  "lavender-botanical-paper": {
    part: { path: "M294 298 Q334 277 373 307 L384 906 Q264 934 136 866 L287 423 Z", origin: "334px 305px", angle: "1.1deg", duration: "9s" },
    sheen: "M529 296 C618 177 755 298 676 418 L602 452 C732 408 713 225 598 250 Q558 256 529 296Z",
    glints: [[658, 498, 9], [583, 871, 8], [576, 1454, 8]],
  },
  "pressed-wildflowers-paper": {
    tint: "#d6ad4a", highlight: "#ffe7a6",
    part: { path: "M270 305 H378 V431 L379 560 L389 760 L401 940 Q260 969 103 888 L270 435Z", origin: "326px 309px", angle: "1.1deg", duration: "11s", join: "M302 301 H350 V312 H302Z" },
    paperUnderlay: "M390 780 H410 V953 H390Z",
    softSheen: [[656, 687, 42, 146]],
    glints: [[648, 246, 9], [682, 581, 11], [421, 800, 9], [558, 1477, 10]],
  },
  "autumn-herbarium-paper": {
    tint: "#d28b47", highlight: "#ffd49e",
    part: { path: "M270 288 H376 V409 L374 620 L384 790 L397 905 Q235 944 66 832 L270 412Z", origin: "326px 292px", angle: "1.1deg", duration: "12.5s", join: "M302 284 H350 V295 H302Z" },
    paperUnderlay: "M387 780 H408 V923 H387Z",
    softSheen: [[664, 272, 25, 92], [667, 878, 22, 84]],
    glints: [[458, 150, 9], [579, 249, 10], [538, 587, 9], [686, 1082, 11]],
  },
  "forest-gold-pennant": {
    field: { path: "M379 240 H645 V1300 L513 1480 L379 1300Z", kind: "firefly", count: 6 },
    glints: [[494, 372, 10], [572, 511, 9], [510, 1120, 10]],
    tint: "#dceca0",
  },
  "twilight-wisteria-pennant": {
    tint: "#c5b0ed", highlight: "#f3eaff",
    part: { path: "M70 254 H349 V690 H70Z", origin: "310px 254px", angle: "1.4deg", duration: "11s", join: "M285 253 H326 V258 H285Z" },
    softSheen: [[458, 464, 75, 232], [578, 715, 77, 190], [468, 1031, 78, 149]],
    glints: [[605, 297, 9], [639, 386, 9], [407, 764, 10], [527, 1257, 11]],
  },
  "sunlit-orchard-pennant": {
    tint: "#e5a23e", highlight: "#ffe3a2",
    part: { path: "M110 292 H345 V748 H110Z", origin: "297px 292px", angle: "1.2deg", duration: "12.5s", join: "M275 291 H315 V296 H275Z" },
    field: { path: "M387 195 H639 V1310 L514 1460 L387 1310Z", kind: "firefly", count: 5 },
    softSheen: [[559, 354, 38, 56], [482, 704, 40, 58], [550, 885, 43, 63]],
    glints: [[557, 349, 10], [466, 499, 10], [551, 879, 10], [460, 1126, 9]],
  },
  "origami-crane-blossoms": {
    sheen: "M253 96 L454 205 L519 23 L598 263 L688 127 L775 114 L708 144 L625 441 L601 452 L523 402 L357 322Z",
    field: { path: "M414 470 H650 V1455 H414Z", kind: "petal", count: 4 },
    tint: "#e3b2de",
  },
  "origami-fox-maple": {
    tint: "#d77732", highlight: "#ffdf9a",
    folds: [
      { path: "M180 130 H440 V310 L447 380 L441 405 L251 308Z", hinge: [251, 308, 441, 405], depth: .12, duration: 8.5 },
      { path: "M460 0 H560 V115 L553 125 L479 153Z", hinge: [479, 153, 553, 125], depth: .22, duration: 12, twitch: true },
    ],
    field: { path: "M430 565 H645 V1435 H430Z", kind: "maple", count: 3 },
    softSheen: [[571, 183, 75, 63], [585, 331, 43, 94]],
    glints: [[595, 519, 8], [606, 550, 9], [522, 976, 9]],
  },
  "origami-koi-lotus": {
    tint: "#d6b35c", highlight: "#fff4cc",
    folds: [
      { path: "M90 140 H451.388889 L405.092593 640 H90Z", hinge: [430, 371, 425, 425], depth: .1, duration: 8 },
      { path: "M746 220 L770 239 L790 289 L834 428 L730 360 L731 344Z", hinge: [746, 220, 770, 239], depth: .15, duration: 6.5, delay: -2 },
      { path: "M490 0 H630 L653 131 L636 143 L550 164 L518 126Z", hinge: [636, 143, 653, 131], depth: .14, duration: 7.5, delay: -4 },
    ],
    ripples: [[570, 634, 75, 22], [557, 885, 83, 25]],
    softSheen: [[656, 246, 52, 100]],
    glints: [[543, 579, 8], [578, 632, 9], [552, 1155, 10]],
  },
  "gothic-castle-window": {
    aura: { x: 470, y: 560, radius: 142 },
    field: { path: "M281 780 L424 841 L581 888 L659 928 L573 1070 L522 1230 L443 1360 L367 1150 L281 1020Z", kind: "mist", count: 3 },
    lights: [{ x: 524, y: 734, rx: 21, ry: 38 }, { x: 539, y: 732, rx: 19, ry: 38 }, { x: 446, y: 824, rx: 22, ry: 42 }, { x: 464, y: 824, rx: 22, ry: 42 }, { x: 539, y: 866, rx: 22, ry: 40 }, { x: 347, y: 1068, rx: 22, ry: 34 }],
    water: ["M425 1144 H496 M410 1178 H516", "M431 1220 H487 M405 1258 H471", "M445 1290 H505 M441 1320 H485"],
  },
  "moonlit-abbey-window": {
    tint: "#bedcff", highlight: "#f0f7ff", lightTint: "#ffd38b",
    aura: { x: 512, y: 518, radius: 124 },
    field: { path: "M330 650 H694 V1030 L610 1190 L509 1273 L420 1155 L330 1030Z", kind: "mist", count: 3 },
    lights: [{ x: 564, y: 619, rx: 12, ry: 26 }, { x: 594, y: 620, rx: 12, ry: 26 }, { x: 564, y: 676, rx: 12, ry: 24 }, { x: 594, y: 676, rx: 12, ry: 24 }, { x: 470, y: 816, rx: 18, ry: 30 }, { x: 551, y: 816, rx: 13, ry: 27 }, { x: 624, y: 851, rx: 14, ry: 26 }, { x: 669, y: 850, rx: 12, ry: 25 }],
    water: ["M477 1014 H542 M464 1040 H528", "M483 1092 H554 M495 1116 H546", "M501 1211 H549 M495 1235 H533"],
    glints: [[511, 74, 10], [404, 268, 9], [620, 266, 9]],
  },
  "ember-citadel-window": {
    tint: "#ff9b36", highlight: "#ffe1a1",
    aura: { x: 519, y: 510, radius: 116 },
    field: { path: "M351 575 H695 V947 L614 1100 L524 1280 L426 1110 L351 947Z", kind: "ember", count: 7 },
    lights: [{ x: 552, y: 692, rx: 12, ry: 26 }, { x: 617, y: 694, rx: 13, ry: 22 }, { x: 594, y: 579, rx: 9, ry: 16 }, { x: 386, y: 725, rx: 9, ry: 17 }],
    softSheen: [[521, 157, 66, 68], [507, 1049, 37, 45], [557, 1130, 47, 58], [543, 1202, 30, 45]],
    glints: [[521, 61, 10], [421, 257, 8], [621, 258, 8]],
  },
  "sage-lily-leaf": {
    field: { path: "M386 438 L641 451 L670 900 L538 1240 L389 1070Z", kind: "dew", count: 6 },
    glints: [[485, 361, 25], [513, 613, 23], [546, 869, 22], [589, 795, 18]],
    tint: "#efffe4",
  },
  "copper-ginkgo-leaf": {
    flex: { origin: "530px 1450px", angle: ".85deg", duration: "14s" },
    folds: [{ path: "M0 0 H1024 V600 H0Z", hinge: [0, 600, 1024, 600], depth: .055, duration: 14 }],
  },
  "midnight-lotus-leaf": {
    flex: { origin: "536px 1430px", angle: ".38deg", duration: "18s" },
    folds: [{ path: "M0 0 H1054 V450 H0Z", hinge: [0, 450, 1054, 450], depth: .065, duration: 15 }],
  },
  "moonlit-raven-feather": {
    finish: "holographic",
    tint: "#9ebfff", highlight: "#e4edff",
    flex: { origin: "512px 70px", angle: ".22deg", duration: "14s" },
    softSheen: [[508, 822, 165, 650]],
    glints: [[510, 58, 9], [531, 550, 9], [505, 1050, 10]],
  },
  "peacock-plume-feather": {
    finish: "iridescent",
    tint: "#65dbd0", highlight: "#ddfff3",
    flex: { origin: "536px 1465px", angle: ".3deg", duration: "12s" },
    softSheen: [[523, 373, 153, 186], [540, 830, 170, 400]],
    glints: [[514, 249, 13], [530, 488, 12], [567, 714, 9], [541, 1121, 10]],
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
  "gilded-thorn-dagger": {
    tint: "#efb33f", highlight: "#ffe2a3",
    softSheen: [[512, 760, 250, 850]],
    glints: [[510, 64, 12], [508, 419, 13], [520, 650, 10], [516, 943, 9]],
  },
  "moonveil-spear": {
    tint: "#8ebfff", highlight: "#e5f4ff",
    softSheen: [[512, 750, 120, 850]],
    glints: [[510, 215, 14], [510, 462, 13], [510, 648, 10], [520, 761, 7], [510, 1117, 10]],
  },
  "gold-ivy-moon-filigree": {
    tint: "#efb33f", highlight: "#ffd16a",
    part: { path: "M552 175 H580 V213 L598 239 L591 251 L616 265 L590 280 L594 292 L577 289 L567 324 L555 293 L541 296 L541 282 L518 267 L543 253 L539 238 L555 244 L555 215Z", origin: "566px 178px", angle: "3deg", duration: "11s" },
    sheen: "M382 22 H641 V1503 H382Z",
    glints: [[450, 211, 12], [597, 562, 10], [432, 1029, 9], [584, 1382, 9]],
  },
};

// Foil is drawn as plain layers under one mask image made once per design:
// the artwork's brightened texture, its outline and the soft sheen area. The
// earlier SVG version filtered the full artwork inside nested masks on every
// frame, and some GPUs then dropped the whole window for a frame.
const foilMasks = new Map<string, Promise<string>>();
function foilMask(original: string, width: number, height: number, sheen: NonNullable<Detail["softSheen"]>) {
  const key = original + "|" + JSON.stringify(sheen);
  let made = foilMasks.get(key);
  if (!made) {
    made = new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const art = document.createElement("canvas");
        art.width = width; art.height = height;
        const a = art.getContext("2d", { willReadFrequently: true })!;
        a.drawImage(image, 0, 0, width, height);
        const glow = document.createElement("canvas");
        glow.width = width; glow.height = height;
        const g = glow.getContext("2d", { willReadFrequently: true })!;
        for (const [cx, cy, rx, ry] of sheen) {
          g.save(); g.translate(cx, cy); g.scale(rx, ry);
          const fill = g.createRadialGradient(0, 0, 0, 0, 0, 1);
          fill.addColorStop(0, "#fff"); fill.addColorStop(.45, "#fff");
          fill.addColorStop(.75, "rgba(255,255,255,.45)"); fill.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = fill; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
        }
        const pixels = a.getImageData(0, 0, width, height);
        const light = g.getImageData(0, 0, width, height).data;
        const d = pixels.data;
        for (let i = 0; i < d.length; i += 4) {
          // Luminance of the artwork lifted a little (dark feathers still catch
          // the foil), by its alpha twice as in the old masks, by the sheen.
          const lum = Math.min(1, (.2125 * d[i] + .7154 * d[i + 1] + .0721 * d[i + 2]) / 255 * .9 + .16);
          const alpha = d[i + 3] / 255;
          d[i] = d[i + 1] = d[i + 2] = 255;
          d[i + 3] = Math.round(lum * alpha * alpha * light[i + 3]);
        }
        a.putImageData(pixels, 0, 0);
        art.toBlob((blob) => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("foil mask")), "image/png");
      };
      image.onerror = () => reject(new Error("foil mask"));
      image.src = original;
    });
    made.catch(() => foilMasks.delete(key));
    foilMasks.set(key, made);
  }
  return made;
}
function useFoilMask(original: string, width: number, height: number, detail: Detail | undefined) {
  const [mask, setMask] = useState<string | null>(null);
  const sheen = detail?.finish ? detail.softSheen : undefined;
  useEffect(() => {
    if (!sheen) return;
    let live = true;
    foilMask(original, width, height, sheen).then((url) => { if (live) setMask(url); }, () => {});
    return () => { live = false; };
  }, [original, width, height, sheen]);
  return sheen ? mask : null;
}

export function DecorativeBookmark({ design, active, stillStyle }: {
  design: string; active: boolean; stillStyle: CSSProperties;
}) {
  const original = bookmarkArt(design)!;
  const detail = bookmarkMotionDetails[design];
  const { width, height, viewBox } = bookmarkCanvas(design);
  const id = `detail-${useId().replace(/:/g, "")}`;
  const { host, loaded, animated, paused } = useBookmarkMotion(original, active);
  const foil = useFoilMask(original, width, height, detail);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!detail.deform || !svg.current) return;
    if (!animated || paused) svg.current.pauseAnimations();
    else svg.current.unpauseAnimations();
  }, [animated, paused, loaded, detail.deform]);
  const tint = detail.tint || "#ffdf9b";
  const phase = [...design].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 11;
  return <span ref={host} className="bookmark-art decorative-bookmark-art" data-design={design}
    data-animated={animated} data-paused={paused} aria-hidden="true">
    <img className={detail.part || detail.deform || detail.folds || detail.flex ? "decorative-part-still" : undefined} src={original} alt="" draggable={false} style={stillStyle}/>
    {loaded && <svg ref={svg} className="decorative-bookmark-animation" viewBox={viewBox} focusable="false">
      <defs>
        {detail.deform && <filter id={`${id}-fabric`} filterUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} colorInterpolationFilters="sRGB">
          <feImage href={fabricMap(detail.deform)} x="0" y="0" width={width} height={height} result="motion"/>
          <feDisplacementMap in="SourceGraphic" in2="motion" xChannelSelector="R" yChannelSelector="G" scale="0" result="breathing">
            <animate attributeName="scale" values={detail.deform === "moth" ? "0;20;0" : "0;10;0"} dur={detail.deform === "moth" ? "9s" : "7s"} repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".42 0 .58 1;.42 0 .58 1"/>
          </feDisplacementMap>
          {detail.deform === "fox" && <>
            <feImage href={fabricMap("tail")} x="0" y="0" width={width} height={height} result="tail"/>
            <feDisplacementMap in="breathing" in2="tail" xChannelSelector="R" yChannelSelector="G" scale="0">
              <animate attributeName="scale" values="0;0;14;0;0" keyTimes="0;.55;.68;.82;1" dur="17s" repeatCount="indefinite" calcMode="spline" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1;.42 0 .58 1"/>
            </feDisplacementMap>
          </>}
        </filter>}
        <linearGradient id={`${id}-shine`} x1="0" x2="1" y1="1" y2="0">
          <stop stopColor={tint} stopOpacity="0"/><stop offset=".46" stopColor={tint} stopOpacity="0"/>
          <stop offset=".5" stopColor={detail.highlight || "#fff9e8"} stopOpacity=".7"/><stop offset=".54" stopColor={tint} stopOpacity="0"/>
          <stop offset="1" stopColor={tint} stopOpacity="0"/>
        </linearGradient>
        <radialGradient id={`${id}-halo`}><stop stopColor={tint} stopOpacity=".85"/><stop offset=".25" stopColor={tint} stopOpacity=".4"/><stop offset="1" stopColor={tint} stopOpacity="0"/></radialGradient>
        {detail.lightTint && <radialGradient id={`${id}-light`}><stop stopColor={detail.lightTint} stopOpacity=".85"/><stop offset=".25" stopColor={detail.lightTint} stopOpacity=".4"/><stop offset="1" stopColor={detail.lightTint} stopOpacity="0"/></radialGradient>}
        {detail.softSheen && <>
          <linearGradient id={`${id}-ribbon-shine`} x1="0" y1="0" x2=".2" y2="1">
            <stop stopColor={tint} stopOpacity="0"/><stop offset=".25" stopColor={tint} stopOpacity=".14"/>
            <stop offset=".5" stopColor={detail.highlight || "#fff9e8"} stopOpacity=".85"/>
            <stop offset=".75" stopColor={tint} stopOpacity=".14"/><stop offset="1" stopColor={tint} stopOpacity="0"/>
          </linearGradient>
          <radialGradient id={`${id}-feather`}>
            <stop stopColor="white"/><stop offset=".45" stopColor="white"/>
            <stop offset=".75" stopColor="white" stopOpacity=".45"/><stop offset="1" stopColor="white" stopOpacity="0"/>
          </radialGradient>
          <mask id={`${id}-soft-metal`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: "alpha" }}>
            {detail.softSheen.map(([cx, cy, rx, ry], i) => <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id}-feather)`}/>)}
          </mask>
        </>}
        <mask id={`${id}-alpha`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <image href={original} width={width} height={height}/>
        </mask>
        {detail.sheen && <clipPath id={`${id}-metal`}><path d={detail.sheen}/></clipPath>}
        {detail.field && <clipPath id={`${id}-field`}><path d={detail.field.path}/></clipPath>}
        {detail.part && <>
          <clipPath id={`${id}-part`}><path d={detail.part.path}/></clipPath>
          <mask id={`${id}-body`} style={{ maskType: "luminance" }} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect width={width} height={height} fill="white"/><path d={detail.part.path} fill="black"/>
            {detail.part.join && <path d={detail.part.join} fill="white"/>}
          </mask>
        </>}
        {detail.paperUnderlay && <clipPath id={`${id}-paper-underlay`}><path d={detail.paperUnderlay}/></clipPath>}
        {detail.folds && <>
          <mask id={`${id}-fold-body`} style={{ maskType: "luminance" }} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect width={width} height={height} fill="white"/>
            {detail.folds.map((fold, i) => <path key={i} d={fold.path} fill="black"/>)}
            {/* Keep a narrow original-texture overlap only along each fixed crease. */}
            {detail.folds.map((fold, i) => <path key={`join-${i}`} d={paperFoldSeam(fold)} fill="none" stroke="white" strokeWidth="3"/>)}
          </mask>
          {detail.folds.map((fold, i) => <clipPath key={i} id={`${id}-fold-${i}`}><path d={fold.path}/></clipPath>)}
        </>}
      </defs>
      <g className={detail.flex ? "bookmark-detail-flex" : undefined} style={detail.flex ? { transformOrigin: detail.flex.origin, "--flex-angle": detail.flex.angle, animationDuration: detail.flex.duration } as CSSProperties : undefined}>
      {detail.flex && !detail.folds && <image href={original} width={width} height={height}/>}
      {detail.deform && <image className="bookmark-detail-fabric" href={original} width={width} height={height} filter={`url(#${id}-fabric)`}/>}
      {detail.folds && <>
        <image href={original} width={width} height={height} mask={`url(#${id}-fold-body)`}/>
        {detail.folds.map((fold, i) => <g key={i} className={`bookmark-detail-fold${fold.twitch ? " bookmark-detail-fold-twitch" : ""}`} style={{ "--fold-transform": paperFoldTransform(fold), animationDuration: `${fold.duration}s`, animationDelay: `${fold.delay || 0}s` } as CSSProperties}>
          <image href={original} width={width} height={height} clipPath={`url(#${id}-fold-${i})`}/>
        </g>)}
      </>}
      {detail.part && <>
        <image href={original} width={width} height={height} mask={`url(#${id}-body)`}/>
        {/* Continue the nearby paper texture beneath the few fringe pixels that overlap it. */}
        {detail.paperUnderlay && <image href={original} x="-24" width={width} height={height} clipPath={`url(#${id}-paper-underlay)`}/>}
        <g className="bookmark-detail-swing" style={{ transformOrigin: detail.part.origin, "--swing-angle": detail.part.angle, animationDuration: detail.part.duration } as CSSProperties}>
          <image href={original} width={width} height={height} clipPath={`url(#${id}-part)`}/>
        </g>
      </>}
      <g mask={`url(#${id}-alpha)`}>
      <g mask={detail.part ? `url(#${id}-body)` : detail.folds ? `url(#${id}-fold-body)` : undefined}>
        {detail.aura && <circle cx={detail.aura.x} cy={detail.aura.y} r={detail.aura.radius} fill={`url(#${id}-halo)`} className="bookmark-detail-aura"/>}
        {!detail.finish && (detail.sheen || detail.softSheen) && <g clipPath={detail.sheen ? `url(#${id}-metal)` : undefined} mask={detail.softSheen ? `url(#${id}-soft-metal)` : undefined}>
          {detail.softSheen
            ? <rect className="bookmark-detail-ribbon-sheen" x="0" y="-320" width={width} height="320" fill={`url(#${id}-ribbon-shine)`} style={{ animationDelay: detail.deform ? (detail.deform === "moth" ? "-2s" : "-6s") : `${-phase}s` }}/>
            : <rect className="bookmark-detail-sheen" x="-1024" y="-600" width="2048" height="3000" fill={`url(#${id}-shine)`} style={{ animationDelay: `${-phase}s` }}/>}
        </g>}
        {detail.glints?.map(([x, y, r], i) => <g key={i} className="bookmark-detail-glint" style={{ animationDuration: `${14 + i * 3}s`, animationDelay: `${-4 - i * 6}s` }}>
          <circle cx={x} cy={y} r={r * 2.4} fill={`url(#${id}-halo)`}/>
          <path d={`M${x} ${y-r} Q${x+1} ${y-1} ${x+r*.65} ${y} Q${x+1} ${y+1} ${x} ${y+r} Q${x-1} ${y+1} ${x-r*.65} ${y} Q${x-1} ${y-1} ${x} ${y-r}`} fill={detail.highlight || "#fff3d8"}/>
        </g>)}
        {detail.field && <g clipPath={`url(#${id}-field)`}>
          {Array.from({ length: detail.field.count }, (_, i) => <g key={i} className={`bookmark-detail-${detail.field!.kind}`}
            style={{ animationDelay: `${-i * 4.7}s`, animationDuration: `${16 + i * 2.3}s`, "--drift-x": `${i % 2 ? -26 : 23}px` } as CSSProperties}>
            {detail.field!.kind === "petal" ? <path d={`M${455+i*43} ${610+i*130} q-16 -8 -9 -25 q20 5 9 25Z`} fill={tint} stroke="#9f6b9c" strokeWidth="1.5"/>
              : detail.field!.kind === "maple" ? <path transform={`translate(${467+i*54} ${690+i*226}) rotate(${i*37-25})`} d="M0 17 L-3 6 L-13 9 L-10 2 L-19 -4 L-11 -7 L-13 -15 L-4 -10 L0 -24 L5 -10 L13 -15 L11 -7 L19 -4 L10 2 L13 9 L3 6Z M0 6 V23" fill={i % 2 ? "#c74929" : "#d58b36"} stroke="#8f4924" strokeWidth="1"/>
              : detail.field!.kind === "mist" ? <ellipse cx={420+i*50} cy={800+i*175} rx="145" ry="37" fill={`url(#${id}-halo)`}/>
              : <><circle cx={412+(i*59)%205} cy={520+(i*173)%740} r={detail.field!.kind === "dew" ? 25 : 19} fill={`url(#${id}-halo)`}/><circle cx={412+(i*59)%205} cy={520+(i*173)%740} r={detail.field!.kind === "dew" ? 5 : 3} fill="#fff8cc"/></>}
          </g>)}
        </g>}
        {detail.lights?.map((light, i) => <ellipse key={i} {...light} cx={light.x} cy={light.y} fill={`url(#${id}-${detail.lightTint ? "light" : "halo"})`} className="bookmark-detail-lantern" style={{ animationDelay: `${-i*2.3}s` }}/>) }
        {detail.water?.map((d, i) => <path key={i} d={d} fill="none" stroke="#fff0bd" strokeWidth="5" strokeLinecap="round" className="bookmark-detail-water" style={{ animationDelay: `${-i*3}s` }}/>) }
        {detail.ripples?.map(([cx, cy, rx, ry], i) => <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#fff1c9" strokeWidth="3" className="bookmark-detail-ripple" style={{ transformOrigin: `${cx}px ${cy}px`, animationDelay: `${-i*6}s` }}/>) }
      </g>
      </g>
      </g>
    </svg>}
    {loaded && detail.finish && foil && <span className={`bookmark-foil-layer bookmark-foil-${detail.finish}`}
      style={{ ...stillStyle, maskImage: `url("${foil}")`, WebkitMaskImage: `url("${foil}")` }}>
      <span className="bookmark-foil-band"/>
      <span className="bookmark-foil-glow"/>
    </span>}
  </span>;
}

// Orthographic fold around a crease: every point on the hinge stays fixed.
// Paper faces remain flat, without the sampling bands of a displacement filter.
function paperFoldTransform({ hinge: [x, y, x2, y2], depth }: PaperFold) {
  const length = Math.hypot(x2 - x, y2 - y);
  if (!length) return "matrix(1,0,0,1,0,0)";
  const nx = -(y2 - y) / length, ny = (x2 - x) / length;
  const a = 1 - depth * nx * nx, b = -depth * nx * ny, d = 1 - depth * ny * ny;
  return `matrix(${a},${b},${b},${d},${x - a*x - b*y},${y - b*x - d*y})`;
}

function paperFoldSeam({ hinge: [x, y, x2, y2] }: PaperFold) {
  const length = Math.hypot(x2 - x, y2 - y) || 1;
  const dx = (x2 - x) / length * 40, dy = (y2 - y) / length * 40;
  return `M${x-dx} ${y-dy} L${x2+dx} ${y2+dy}`;
}

// Smooth displacement fades to zero before the motif edge. The original artwork
// stays continuous, avoiding cuts or duplicated fur from separate moving layers.
function fabricMap(kind: NonNullable<Detail["deform"]> | "tail") {
  const spots = kind === "moth"
    ? [[463, 315, 53, 84, "0,128,128"], [566, 315, 53, 84, "255,128,128"]]
    : kind === "fox" ? [[490, 318, 84, 100, "128,0,128"]]
    : [[582, 377, 36, 40, "230,35,128"]];
  const map = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536"><defs>${spots.map((s, i) => `<radialGradient id="g${i}"><stop stop-color="rgb(${s[4]})"/><stop offset="1" stop-color="rgb(128,128,128)"/></radialGradient>`).join("")}</defs><path fill="rgb(128,128,128)" d="M0 0H1024V1536H0Z"/>${spots.map(([cx, cy, rx, ry], i) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#g${i})"/>`).join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(map)}`;
}
