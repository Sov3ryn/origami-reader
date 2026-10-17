import type { BoardScene } from "./model";

// Boards drawn as SVG for "Export all", loading Excalidraw only when needed.
export async function boardSvg(scene: BoardScene): Promise<string> {
  await import("./assetPath");
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  const svg = await exportToSvg({
    elements: scene.elements as never,
    appState: { ...scene.appState, exportBackground: true, theme: "light" } as never,
    files: scene.files as never,
    exportPadding: 24,
  });
  return svg.outerHTML;
}
