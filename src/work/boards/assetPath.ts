// Excalidraw reads where its fonts live when it loads, so this runs first:
// the fonts come from the app (public/excalidraw-assets), never the internet.
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
export {};
