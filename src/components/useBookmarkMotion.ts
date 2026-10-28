import { useEffect, useRef, useState } from "react";

// Idle decoration runs only while it is visible beside the book. Placement and
// withdrawal use the still artwork, as do reduced motion and decoding failures.
export function useBookmarkMotion(src: string, active: boolean) {
  const host = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => setReduced(media.matches);
    const visibility = () => setForeground(!document.hidden);
    preference();
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (host.current) observer.observe(host.current);
    return () => {
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    setLoaded(false);
    const image = new Image();
    image.src = src;
    void image.decode().then(() => { if (!disposed) setLoaded(true); }).catch(() => {});
    return () => { disposed = true; };
  }, [src]);

  return { host, loaded, animated: loaded && !reduced && active, paused: !visible || !foreground };
}
