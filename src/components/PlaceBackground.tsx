import { useEffect, useRef } from "react";
import "../places/origami-backgrounds.js";
import type { Place } from "../places";
import { recordFeat } from "../feats";

type BackgroundElement = HTMLElement & { useScene(entry: unknown): void };

// Hosts one <origami-background> element. It draws the place's painting and
// animations on its own canvases, pauses when hidden and follows the
// system's reduced-motion setting.
export function PlaceBackground({
  place,
  motion,
  fireworks,
}: {
  place: Place;
  motion: boolean;
  fireworks: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<BackgroundElement | null>(null);
  // A secret achievement: fireworks seen over a place that has them.
  useEffect(() => {
    if (motion && fireworks && place.effects.some((e) => e.type === "fireworks")) recordFeat("fireworks");
  }, [place, motion, fireworks]);
  useEffect(() => {
    const el = document.createElement("origami-background") as BackgroundElement;
    el.className = "place-background";
    el.setAttribute("intensity", "0.65");
    el.setAttribute("quality", "auto");
    element.current = el;
    host.current?.append(el);
    return () => {
      el.remove();
      element.current = null;
    };
  }, []);
  useEffect(() => {
    element.current?.useScene({ ...place, sourceWidth: 1672, sourceHeight: 941 });
  }, [place]);
  useEffect(() => {
    element.current?.setAttribute("motion", motion ? "on" : "off");
    element.current?.setAttribute("fireworks", fireworks ? "on" : "off");
  }, [motion, fireworks, place]);
  return <div ref={host} className="still-stage place-stage" />;
}
