import { useEffect, useRef, useState, type CSSProperties } from "react";
import { bookmarkArt, bookmarkCanvas } from "../bookmarks";
import { useBookmarkMotion } from "./useBookmarkMotion";
import { createGlobeRenderer, globeDetails, globeTexture, type GlobeRenderer } from "./globeRenderer";

export function GlobeBookmark({ design, active, stillStyle }: { design: string; active: boolean; stillStyle: CSSProperties }) {
  const original = bookmarkArt(design)!;
  const detail = globeDetails[design];
  const { host, loaded, animated, paused } = useBookmarkMotion(original, active);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [renderer, setRenderer] = useState<GlobeRenderer | null>(null);
  const [x, y, w, h] = bookmarkCanvas(design).viewBox.split(" ").map(Number);
  const src = globeTexture(detail.kind);
  useEffect(() => {
    if (!loaded || !animated || !canvas.current) return;
    let disposed = false;
    let created: GlobeRenderer | null = null;
    setRenderer(null);
    delete canvas.current.dataset.ready;
    void createGlobeRenderer(canvas.current, detail.kind, src, detail.period).then(value => {
      if (disposed) { value.destroy(); return; }
      created = value; setRenderer(value);
    }).catch(() => { /* Keep the complete still illustration on texture or canvas failure. */ });
    return () => { disposed = true; created?.destroy(); };
  }, [loaded, animated, detail, src]);
  useEffect(() => { renderer?.setRunning(animated && !paused); }, [renderer, animated, paused]);
  return <span ref={host} className="bookmark-art globe-bookmark-art" data-design={design} data-animated={animated} data-paused={paused} aria-hidden="true">
    <img src={original} alt="" draggable={false} style={stillStyle}/>
    <canvas ref={canvas} className="bookmark-globe-sphere" data-kind={detail.kind} data-texture={src} data-period={detail.period}
      style={{ left: `${(detail.cx - detail.radius - x) / w * 100}%`, top: `${(detail.cy - detail.radius - y) / h * 100}%`, width: `${detail.radius * 2 / w * 100}%`, height: `${detail.radius * 2 / h * 100}%` }}/>
  </span>;
}
