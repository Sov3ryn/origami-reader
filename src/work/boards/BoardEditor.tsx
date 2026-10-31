import "./assetPath";
import { useEffect, useMemo, useRef } from "react";
import { Excalidraw, exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { cleanScene, sceneVersion, type BoardScene } from "./model";

// Loaded only when a board opens (Excalidraw is large).

export type BoardApi = {
  png: () => Promise<Blob | null>;
  svg: () => Promise<string>;
  setPaper: (background: string, grid: boolean) => void;
  // The board as it is now, including changes not saved yet (null before the first change).
  scene: () => BoardScene | null;
};
type Scene = Parameters<typeof exportToSvg>[0];

export default function BoardEditor({
  scene,
  dark,
  language,
  embedsAllowed,
  onChange,
  onReady,
  onOpenLink,
}: {
  scene: BoardScene;
  dark: boolean;
  language: string;
  embedsAllowed: boolean;
  onChange: (scene: BoardScene) => void;
  onReady?: (api: BoardApi | null) => void;
  onOpenLink: (url: string) => void;
}) {
  const excalidraw = useRef<{ updateScene: (s: { appState: Record<string, unknown> }) => void } | null>(null);
  const latest = useRef({ onChange, onOpenLink });
  latest.current = { onChange, onOpenLink };
  // What was last saved: shapes, background, grid and images.
  const key = (elements: readonly Record<string, unknown>[], appState: Record<string, unknown>, files: Record<string, unknown>) =>
    `${sceneVersion(elements)}|${appState.viewBackgroundColor ?? ""}|${Boolean(appState.gridModeEnabled)}|${Object.keys(files).length}`;
  const last = useRef(key(scene.elements, scene.appState, scene.files));
  const timer = useRef<number | undefined>(undefined);
  const live = useRef<{ elements: readonly Record<string, unknown>[]; appState: Record<string, unknown>; files: Record<string, unknown> } | null>(null);
  const initial = useMemo(
    () => ({
      elements: scene.elements as never,
      appState: { ...scene.appState, theme: dark ? "dark" : "light" } as never,
      files: scene.files as never,
      scrollToContent: true,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const flush = () => {
    window.clearTimeout(timer.current);
    const s = live.current;
    if (!s) return;
    const v = key(s.elements, s.appState, s.files);
    if (v === last.current) return;
    last.current = v;
    latest.current.onChange(cleanScene(s.elements, s.appState, s.files));
  };
  useEffect(() => {
    onReady?.({
      setPaper: (background, grid) =>
        excalidraw.current?.updateScene({ appState: { viewBackgroundColor: background, gridModeEnabled: grid, gridSize: 20 } }),
      png: () => {
        const s = live.current || { elements: scene.elements, appState: scene.appState, files: scene.files };
        return exportToBlob({ ...(s as unknown as Scene), mimeType: "image/png", appState: { ...s.appState, exportBackground: true } as never, exportPadding: 24 });
      },
      svg: async () => {
        const s = live.current || { elements: scene.elements, appState: scene.appState, files: scene.files };
        const el = await exportToSvg({ ...(s as unknown as Scene), appState: { ...s.appState, exportBackground: true } as never, exportPadding: 24 });
        return el.outerHTML;
      },
      scene: () => {
        const s = live.current;
        return s ? cleanScene(s.elements, s.appState, s.files) : null;
      },
    });
    return () => {
      flush();
      onReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const langCode = { fr: "fr-FR", ko: "ko-KR", hi: "hi-IN", es: "es-ES" }[language.slice(0, 2)] || "en";
  return (
    <div className="board-canvas">
      <Excalidraw
        initialData={initial}
        excalidrawAPI={(api) => (excalidraw.current = api as unknown as typeof excalidraw.current)}
        theme={dark ? "dark" : "light"}
        langCode={langCode}
        aiEnabled={false}
        autoFocus
        // Web embeds on a board follow the same online consent as notes.
        validateEmbeddable={embedsAllowed}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, export: { saveFileToDisk: true } },
        }}
        onLinkOpen={(element, event) => {
          const link = (element as { link?: string }).link;
          if (link && /^https?:\/\//.test(link)) {
            event.preventDefault();
            latest.current.onOpenLink(link);
          }
        }}
        onChange={(elements, appState, files) => {
          live.current = {
            elements: elements as unknown as Record<string, unknown>[],
            appState: appState as unknown as Record<string, unknown>,
            files: files as unknown as Record<string, unknown>,
          };
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, 800);
        }}
      />
    </div>
  );
}
