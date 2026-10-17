import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { t } from "../i18n";
import { coverColor } from "../coverColor";
import { languageFlag, languageName } from "../bookLanguage";
import { isUnknownAuthor } from "../authorPack";
import type { BookMeta } from "../types";
import {
  occluderBoxes,
  layoutShelves,
  roomCamera,
  type RoomScene,
  type ShelfBook,
} from "../libraryRoom";
import "./libraryRoom.css";

// A 3D library theme: a room rendered offline in Blender (tools/library-scene)
// is the backdrop, and the reader's books are live 3D on its shelves, lit by
// the same baked light. Zoom and pan crop the render and the 3D view together.
const MAX_ZOOM = 3;

type View = { zoom: number; cx: number; cy: number }; // centre in image 0..1

export function LibraryRoom({
  base: BASE,
  books,
  night,
  interfaceLanguage,
  onOpen,
}: {
  // Folder of the theme's rendered room, ending in "/".
  base: string;
  books: BookMeta[];
  night: boolean;
  interfaceLanguage: string;
  onOpen: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const layers = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<RoomScene | null>(null);
  const [failed, setFailed] = useState("");
  const [hover, setHover] = useState<{ book: BookMeta; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const view = useRef<View>({ zoom: 1, cx: 0.5, cy: 0.5 });
  const nightRef = useRef(night ? 1 : 0);
  const api = useRef<{ redraw: () => void; setNight: (n: boolean) => void } | null>(null);

  useEffect(() => {
    let live = true;
    setScene(null);
    fetch(BASE + "scene.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((s: RoomScene) => live && setScene(s))
      .catch(() => live && setFailed(t("The library room could not be loaded.")));
    return () => {
      live = false;
    };
  }, [BASE]);

  useEffect(() => {
    api.current?.setNight(night);
  }, [night]);

  useEffect(() => {
    const el = host.current;
    const canvas = canvasRef.current;
    const dust = dustRef.current;
    if (!scene || !el || !canvas || !dust) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      setFailed(t("This computer cannot show the 3D library. The usual library is still available."));
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const camera = roomCamera(scene);
    const world = new THREE.Scene();
    const loader = new THREE.TextureLoader();
    const lightTex = (name: string) => {
      const tex = loader.load(BASE + name, () => redraw());
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      return tex;
    };
    // Shared uniforms: every book material reads the same baked light.
    const uniforms = {
      lightDay: { value: lightTex("light_day.png") },
      lightNight: { value: lightTex("light_night.png") },
      lightNightDim: { value: lightTex("light_night_dim.png") },
      nightMix: { value: nightRef.current },
      flicker: { value: 1 },
      lightScale: { value: scene.lightScale },
      // The room renders are exposed; light passes are not, so books add it.
      exposureDay: { value: 2 ** (scene.exposure?.day ?? 1.3) },
      exposureNight: { value: 2 ** (scene.exposure?.night ?? 0.6) },
      uvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      resolution: { value: new THREE.Vector2(1, 1) },
    };
    const lit = (material: THREE.MeshBasicMaterial, shade = 1) => {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "void main() {",
            `uniform sampler2D lightDay, lightNight, lightNightDim;
uniform float nightMix, flicker, lightScale, exposureDay, exposureNight;
uniform vec4 uvRect;
uniform vec2 resolution;
void main() {`,
          )
          .replace(
            "#include <opaque_fragment>",
            `vec2 f = gl_FragCoord.xy / resolution;
vec2 luv = vec2(uvRect.x + f.x * uvRect.z, 1.0 - (uvRect.y + (1.0 - f.y) * uvRect.w));
vec4 ld = texture2D(lightDay, luv);
vec4 ln = mix(texture2D(lightNightDim, luv), texture2D(lightNight, luv), flicker);
vec3 light = mix(ld.rgb * exposureDay, ln.rgb * exposureNight, nightMix) * lightScale;
float cover = mix(ld.a, ln.a, nightMix);
light = mix(vec3(mix(0.35, 0.05, nightMix)), light, smoothstep(0.05, 0.6, cover));
outgoingLight *= light * ${shade.toFixed(2)};
#include <opaque_fragment>`,
          );
      };
      return material;
    };

    // The bookcase itself, invisible: it only hides the parts of books that
    // stand behind its dividers, stiles and boards, as in the render.
    const hidden = new THREE.MeshBasicMaterial({ colorWrite: false });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    for (const o of occluderBoxes(scene)) {
      const mesh = new THREE.Mesh(unit, hidden);
      mesh.position.copy(o.centre);
      mesh.scale.copy(o.size);
      mesh.renderOrder = -1;
      world.add(mesh);
    }
    // Books.
    const layout = layoutShelves(scene, books);
    const pickable: THREE.Mesh[] = [];
    const disposables: { dispose: () => void }[] = [hidden, unit];
    const pages = lit(new THREE.MeshBasicMaterial({ color: 0xe9dfc8 }), 0.9);
    disposables.push(pages);
    for (const b of layout.books) {
      const geometry = new THREE.BoxGeometry(b.w, b.h, b.d);
      const spineTex = new THREE.CanvasTexture(drawSpine(b, null, interfaceLanguage));
      spineTex.colorSpace = THREE.SRGBColorSpace;
      spineTex.anisotropy = 4;
      const spine = lit(new THREE.MeshBasicMaterial({ map: spineTex }));
      const cover = lit(new THREE.MeshBasicMaterial({ color: b.colour }), 0.55);
      const mesh = new THREE.Mesh(geometry, [cover, cover, pages, pages, spine, cover]);
      mesh.position.set(b.x, b.y, b.z);
      mesh.rotation.z = b.lean;
      mesh.userData = { book: b, rest: mesh.position.z, pull: 0 };
      world.add(mesh);
      pickable.push(mesh);
      disposables.push(geometry, spineTex, spine, cover);
      // Spines take the cover's own colour once it is known.
      if (b.meta.coverImage)
        void coverColor(b.meta.coverImage).then((c) => {
          if (!c) return;
          b.colour = c;
          cover.color.set(c);
          spineTex.image = drawSpine(b, null, interfaceLanguage);
          spineTex.needsUpdate = true;
          redraw();
        });
    }
    // Antique filler volumes: a few spine designs, one instanced draw each.
    // The designs are grey; each book's leather colour tints them.
    const VARIANTS = 6;
    for (let v = 0; v < VARIANTS; v++) {
      const group = layout.fillers.filter((_, i) => i % VARIANTS === v);
      if (!group.length) continue;
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const map = new THREE.CanvasTexture(drawAntique(v));
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      const material = lit(new THREE.MeshBasicMaterial({ map }));
      const mesh = new THREE.InstancedMesh(geometry, material, group.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      group.forEach((f, i) => {
        q.setFromEuler(new THREE.Euler(0, 0, f.lean));
        m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(f.w, f.h, f.d));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new THREE.Color(f.colour));
      });
      world.add(mesh);
      disposables.push(geometry, material, map);
    }

    // Sizing, zoom and pan: the render covers the host; the camera renders the
    // visible part of the full image (setViewOffset) so both stay aligned.
    let cw = 1,
      ch = 1,
      fw = 1,
      fh = 1,
      ox = 0,
      oy = 0;
    const imgAspect = scene.image.width / scene.image.height;
    const place = () => {
      cw = el.clientWidth;
      ch = el.clientHeight;
      const base = cw / ch > imgAspect ? cw / imgAspect : ch;
      fh = base * view.current.zoom;
      fw = fh * imgAspect;
      const v = view.current;
      ox = Math.min(Math.max(v.cx * fw - cw / 2, 0), fw - cw);
      oy = Math.min(Math.max(v.cy * fh - ch / 2, 0), fh - ch);
      v.cx = (ox + cw / 2) / fw;
      v.cy = (oy + ch / 2) / fh;
      const l = layers.current;
      if (l) {
        l.style.width = fw + "px";
        l.style.height = fh + "px";
        l.style.transform = `translate(${-ox}px, ${-oy}px)`;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(cw, ch, false);
      camera.aspect = imgAspect;
      camera.setViewOffset(fw, fh, ox, oy, cw, ch);
      camera.updateProjectionMatrix();
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      uniforms.resolution.value.copy(size);
      uniforms.uvRect.value.set(ox / fw, oy / fh, cw / fw, ch / fh);
      dust.width = Math.round(cw);
      dust.height = Math.round(ch);
      redraw();
    };

    // Rendering on demand; animation keeps going only while something moves.
    let frame = 0;
    let animating = false;
    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    let last = performance.now();
    let target: THREE.Mesh | null = null;
    const nightGoal = { value: nightRef.current };
    const dustMotes = makeDust(160);
    const dustCtx = dust.getContext("2d");
    const flickerAt = (time: number) =>
      0.72 +
      0.18 * Math.sin(time * 7.3) * Math.sin(time * 2.1 + 1.3) +
      0.1 * Math.sin(time * 23.0 + Math.sin(time * 3.7));
    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      animating = false;
      // Day and night fade into each other.
      const n = uniforms.nightMix.value;
      if (Math.abs(n - nightGoal.value) > 0.001) {
        uniforms.nightMix.value += Math.sign(nightGoal.value - n) * Math.min(Math.abs(nightGoal.value - n), dt * 0.7);
        animating = true;
      }
      const nm = uniforms.nightMix.value;
      nightRef.current = nm;
      // Flames flicker at night; the room's two night renders cross-fade in step.
      const fl = nm > 0.01 ? Math.min(1, Math.max(0, flickerAt(now / 1000))) : 1;
      uniforms.flicker.value = fl;
      if (nm > 0.01) animating = true;
      const l = layers.current;
      if (l) {
        l.style.setProperty("--night", nm.toFixed(3));
        l.style.setProperty("--flicker", fl.toFixed(3));
      }
      // Books slide out under the pointer and settle back.
      for (const mesh of pickable) {
        const goal = mesh === target ? 1 : 0;
        const u = mesh.userData;
        if (Math.abs(u.pull - goal) > 0.001) {
          u.pull += (goal - u.pull) * Math.min(1, dt * 12);
          mesh.position.z = u.rest + u.pull * 0.07;
          mesh.rotation.y = u.pull * 0.12;
          animating = true;
        }
      }
      renderer.render(world, camera);
      // Dust drifts in the sunbeams by day.
      if (dustCtx) {
        dustCtx.clearRect(0, 0, dust.width, dust.height);
        if (nm < 0.99) {
          drawDust(dustCtx, dustMotes, dt, now / 1000, { fw, fh, ox, oy, cw, ch }, 1 - nm, dustMask);
          animating = true;
        }
      }
      if (animating && !document.hidden) frame = requestAnimationFrame(tick);
    };

    // Brightness of the daytime render, to make dust glint only in the light.
    let dustMask: { data: Uint8ClampedArray; w: number; h: number } | null = null;
    const maskImg = new Image();
    maskImg.onload = () => {
      const w = 192,
        h = Math.round(192 / imgAspect);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(maskImg, 0, 0, w, h);
      dustMask = { data: ctx.getImageData(0, 0, w, h).data, w, h };
      setReady(true);
      redraw();
    };
    maskImg.src = BASE + "bg_day.webp";

    // Pointer: hover, click, drag to pan, wheel to zoom.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickable, false)[0];
      return hit ? (hit.object as THREE.Mesh) : null;
    };
    const onMove = (e: PointerEvent) => {
      if (drag) {
        const v = view.current;
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
        v.cx = drag.cx - (e.clientX - drag.x) / fw;
        v.cy = drag.cy - (e.clientY - drag.y) / fh;
        place();
        return;
      }
      const hit = pick(e);
      if (hit !== target) {
        target = hit;
        el.style.cursor = hit ? "pointer" : view.current.zoom > 1 ? "grab" : "default";
        redraw();
      }
      const r = el.getBoundingClientRect();
      setHover(hit ? { book: (hit.userData.book as ShelfBook).meta, x: e.clientX - r.left, y: e.clientY - r.top } : null);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, cx: view.current.cx, cy: view.current.cy, moved: false };
      el.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      const d = drag;
      drag = null;
      if (d && !d.moved) {
        const hit = pick(e);
        if (hit) onOpen((hit.userData.book as ShelfBook).meta.id);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = view.current;
      // Keep the point under the pointer still while zooming.
      const px = (ox + (e.clientX - r.left)) / fw;
      const py = (oy + (e.clientY - r.top)) / fh;
      const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom * Math.exp(-e.deltaY * 0.0015)));
      const k = v.zoom / zoom;
      v.cx = px + (v.cx - px) * k;
      v.cy = py + (v.cy - py) * k;
      v.zoom = zoom;
      place();
    };
    const onLeave = () => {
      target = null;
      setHover(null);
      redraw();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    const resize = new ResizeObserver(place);
    resize.observe(el);
    const visible = () => !document.hidden && redraw();
    document.addEventListener("visibilitychange", visible);
    api.current = {
      redraw,
      setNight: (value) => {
        nightGoal.value = value ? 1 : 0;
        redraw();
      },
    };
    place();
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", visible);
      resize.disconnect();
      for (const d of disposables) d.dispose();
      Object.values(uniforms).forEach((u) => (u.value instanceof THREE.Texture ? u.value.dispose() : null));
      renderer.dispose();
      api.current = null;
    };
    // Rebuilt when the books on show change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, books, interfaceLanguage, BASE]);

  if (failed) return <div className="library-room-failed">{failed}</div>;
  return (
    <div className="library-room" ref={host} aria-label={t("Library room")}>
      <div className="library-room-layers" ref={layers} style={{ ["--night" as string]: night ? 1 : 0 }}>
        <img src={BASE + "bg_day.webp"} alt="" draggable={false} />
        <img className="lr-night-dim" src={BASE + "bg_night_dim.webp"} alt="" draggable={false} />
        <img className="lr-night" src={BASE + "bg_night.webp"} alt="" draggable={false} />
      </div>
      <canvas className="library-room-books" ref={canvasRef} />
      <canvas className="library-room-dust" ref={dustRef} aria-hidden="true" />
      {!ready && <div className="library-room-loading">{t("Opening the library…")}</div>}
      {hover && (
        <div className="library-room-tip" style={{ left: hover.x + 16, top: hover.y + 12 }}>
          <strong>{hover.book.title}</strong>
          {!isUnknownAuthor(hover.book.author) && <span>{hover.book.author}</span>}
          {hover.book.language && (
            <small>
              {languageFlag(hover.book.language) && (
                <img src={`/flags/${languageFlag(hover.book.language)}.svg`} alt="" />
              )}
              {languageName(hover.book.language, interfaceLanguage)}
            </small>
          )}
        </div>
      )}
      <div className="library-room-hint">{t("Scroll to zoom, drag to look around, click a book to read")}</div>
    </div>
  );
}

// --- Spines ---------------------------------------------------------------
function drawSpine(b: ShelfBook, flag: HTMLImageElement | null, lang: string) {
  const H = 512;
  const W = Math.max(40, Math.round((b.w / b.h) * H));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const base = new THREE.Color(b.colour);
  g.fillStyle = b.colour;
  g.fillRect(0, 0, W, H);
  // Cloth texture and rounded-spine shading.
  const shade = g.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.38)");
  shade.addColorStop(0.18, "rgba(255,255,255,0.10)");
  shade.addColorStop(0.5, "rgba(255,255,255,0.04)");
  shade.addColorStop(0.85, "rgba(0,0,0,0.12)");
  shade.addColorStop(1, "rgba(0,0,0,0.42)");
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},0.035)`;
    g.fillRect(Math.random() * W, Math.random() * H, 1, 1 + Math.random() * 3);
  }
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const ink = hsl.l > 0.62 ? "#2b2219" : "#ead8a6";
  // Gilt bands.
  g.fillStyle = ink;
  g.globalAlpha = 0.75;
  for (const y of [18, 26, H - 30, H - 22]) g.fillRect(4, y, W - 8, 2);
  g.globalAlpha = 1;
  // Title, then author, running top to bottom.
  g.save();
  g.translate(W / 2, 40);
  g.rotate(Math.PI / 2);
  g.fillStyle = ink;
  g.textBaseline = "middle";
  const room = H - 120;
  const author = isUnknownAuthor(b.meta.author) ? "" : b.meta.author;
  const titleSize = Math.min(W * 0.42, 30);
  g.font = `600 ${titleSize}px Georgia, "Times New Roman", serif`;
  const title = fit(g, b.meta.title, author ? room * 0.66 : room);
  const offset = author && W > 44 ? -titleSize * 0.42 : 0;
  g.fillText(title, 0, offset);
  if (author && W > 44) {
    g.font = `${Math.min(W * 0.26, 18)}px Georgia, serif`;
    g.globalAlpha = 0.85;
    g.fillText(fit(g, author, room * 0.9), 0, titleSize * 0.52);
  } else if (author) {
    g.font = `${Math.min(W * 0.3, 18)}px Georgia, serif`;
    g.globalAlpha = 0.8;
    const used = g.measureText(title).width;
    g.fillText(fit(g, author, room - used - 16), used + 16, 0);
  }
  g.restore();
  // Language mark at the foot.
  const code = b.meta.language;
  if (code) {
    g.fillStyle = ink;
    g.globalAlpha = 0.9;
    g.font = `700 ${Math.min(W * 0.36, 16)}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.fillText(code.toUpperCase().slice(0, 3), W / 2, H - 44);
    g.globalAlpha = 1;
  }
  void flag;
  void lang;
  return c;
}

// A worn leather spine in greys: raised bands, a title panel, blind tooling.
function drawAntique(variant: number) {
  const W = 64,
    H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#c8c8c8";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const v = 150 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v},${v},0.22)`;
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 4);
  }
  const bands = [3, 4, 5, 2, 4, 5][variant];
  const top = 40,
    bottom = H - 40;
  for (let b = 0; b <= bands; b++) {
    const y = top + ((bottom - top) * b) / bands;
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.fillRect(0, y - 4, W, 3);
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillRect(0, y - 1, W, 4);
  }
  if (variant % 2 === 0) {
    // A darker title panel with a tooled border between the first bands.
    const y0 = top + (bottom - top) / bands + 10;
    const y1 = y0 + Math.min(70, (bottom - top) / bands - 20);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(8, y0, W - 16, y1 - y0);
    g.strokeStyle = "rgba(255,240,200,0.55)";
    g.lineWidth = 2;
    g.strokeRect(10, y0 + 2, W - 20, y1 - y0 - 4);
    g.fillStyle = "rgba(255,240,200,0.5)";
    for (let k = 0; k < 3; k++) g.fillRect(16, y0 + 14 + k * 14, W - 32, 3);
  } else {
    g.fillStyle = "rgba(255,240,200,0.4)";
    for (const y of [top + 12, bottom - 12]) g.fillRect(10, y, W - 20, 2);
  }
  // Rounded spine: darker towards the edges, a soft highlight off-centre.
  const shade = g.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.55)");
  shade.addColorStop(0.25, "rgba(255,255,255,0.12)");
  shade.addColorStop(0.55, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  // Wear at the head and tail.
  for (const y of [0, H - 14]) {
    const wear = g.createLinearGradient(0, y, 0, y + 14);
    wear.addColorStop(y ? 0 : 1, "rgba(255,255,255,0)");
    wear.addColorStop(y ? 1 : 0, "rgba(255,255,255,0.25)");
    g.fillStyle = wear;
    g.fillRect(0, y, W, 14);
  }
  return c;
}

function fit(g: CanvasRenderingContext2D, text: string, max: number) {
  if (g.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && g.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

// --- Dust ------------------------------------------------------------------------
type Mote = { x: number; y: number; vx: number; vy: number; r: number; p: number };
function makeDust(n: number): Mote[] {
  return Array.from({ length: n }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.004,
    vy: (Math.random() - 0.3) * 0.003,
    r: 0.6 + Math.random() * 1.6,
    p: Math.random() * Math.PI * 2,
  }));
}
function drawDust(
  g: CanvasRenderingContext2D,
  motes: Mote[],
  dt: number,
  time: number,
  v: { fw: number; fh: number; ox: number; oy: number; cw: number; ch: number },
  strength: number,
  mask: { data: Uint8ClampedArray; w: number; h: number } | null,
) {
  if (!mask) return;
  for (const m of motes) {
    m.x += (m.vx + Math.sin(time * 0.3 + m.p) * 0.0015) * dt;
    m.y += (m.vy + Math.cos(time * 0.23 + m.p) * 0.0012) * dt;
    if (m.x < 0) m.x += 1;
    if (m.x > 1) m.x -= 1;
    if (m.y < 0) m.y += 1;
    if (m.y > 1) m.y -= 1;
    const i = (Math.floor(m.y * mask.h) * mask.w + Math.floor(m.x * mask.w)) * 4;
    const lum = (mask.data[i] * 0.3 + mask.data[i + 1] * 0.55 + mask.data[i + 2] * 0.15) / 255;
    const glow = Math.max(0, (lum - 0.45) / 0.4);
    if (glow <= 0) continue;
    const sx = m.x * v.fw - v.ox;
    const sy = m.y * v.fh - v.oy;
    if (sx < -4 || sy < -4 || sx > v.cw + 4 || sy > v.ch + 4) continue;
    const twinkle = 0.55 + 0.45 * Math.sin(time * 1.7 + m.p * 3);
    g.globalAlpha = Math.min(0.85, glow * twinkle * strength * 0.8);
    g.fillStyle = "#fff4dc";
    g.beginPath();
    g.arc(sx, sy, m.r * (v.fw / 1920), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}
