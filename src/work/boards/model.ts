// Boards: whiteboards and diagrams drawn with Excalidraw (MIT), stored as its
// scene (elements, a few view settings, and pasted images).
export type BoardScene = {
  elements: readonly Record<string, unknown>[];
  appState: { viewBackgroundColor?: string; gridSize?: number | null; gridModeEnabled?: boolean };
  files: Record<string, unknown>;
};
export type BoardDoc = {
  id: string;
  kind: "board";
  title: string;
  scene: BoardScene;
  subjectId?: string;
  icon?: string;
  pinned?: boolean;
  paper?: string;
  created: number;
  updated: number;
  vault?: string;
};

export const emptyScene = (): BoardScene => ({ elements: [], appState: {}, files: {} });

// The words on a board, for search.
export function boardText(board: BoardDoc, limit = 4000) {
  const out: string[] = [];
  for (const e of board.scene.elements) {
    if (e.isDeleted) continue;
    const text = typeof e.text === "string" ? e.text : typeof e.originalText === "string" ? e.originalText : "";
    if (text) out.push(text);
    if (typeof e.link === "string" && e.link) out.push(e.link);
  }
  return out.join("\n").slice(0, limit);
}

export const boardIsEmpty = (board: BoardDoc) => !board.scene.elements.some((e) => !e.isDeleted);

// Only what the scene needs, without deleted elements or unused images.
export function cleanScene(elements: readonly Record<string, unknown>[], appState: Record<string, unknown>, files: Record<string, unknown>): BoardScene {
  const kept = elements.filter((e) => !e.isDeleted);
  const used = new Set(kept.map((e) => e.fileId).filter((id): id is string => typeof id === "string"));
  return {
    elements: kept,
    appState: {
      viewBackgroundColor: typeof appState.viewBackgroundColor === "string" ? appState.viewBackgroundColor : undefined,
      gridSize: typeof appState.gridSize === "number" ? appState.gridSize : null,
      gridModeEnabled: Boolean(appState.gridModeEnabled),
    },
    files: Object.fromEntries(Object.entries(files).filter(([id]) => used.has(id))),
  };
}

// A version number for the scene, to save only when something changed.
export const sceneVersion = (elements: readonly Record<string, unknown>[]) =>
  elements.reduce((n, e) => n + (typeof e.version === "number" ? e.version : 0) * 31 + (e.isDeleted ? 7 : 0), elements.length);

// An .excalidraw file, which excalidraw.com and Obsidian's Excalidraw open.
export function toExcalidrawFile(board: BoardDoc) {
  return JSON.stringify(
    { type: "excalidraw", version: 2, source: "Origami", elements: board.scene.elements, appState: board.scene.appState, files: board.scene.files },
    null,
    1,
  );
}
export function fromExcalidrawFile(text: string): BoardScene | null {
  try {
    const v = JSON.parse(text);
    if (v?.type !== "excalidraw" || !Array.isArray(v.elements)) return null;
    return { elements: v.elements, appState: v.appState || {}, files: v.files || {} };
  } catch {
    return null;
  }
}
