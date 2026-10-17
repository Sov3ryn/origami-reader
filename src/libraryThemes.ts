// Library themes: how the library page looks. "classic" is the usual grid or
// list; "room" themes are 3D rooms rendered offline (tools/library-scene)
// whose files live in public/library-themes/<id>/.
//
// To add a theme: render its room into public/library-themes/<id>/ (bg_*,
// light_*, preview_*.webp and scene.json), then add an entry here with
// status "ready". Planned themes show as "Coming soon" cards until then.
export type LibraryTheme = {
  id: string;
  name: string;
  description: string;
  kind: "classic" | "room";
  status: "ready" | "planned";
  // Room themes: folder with the rendered room and its preview images.
  base?: string;
};

export const libraryThemes: readonly LibraryTheme[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Your books as covers or a list, over the scene you chose.",
    kind: "classic",
    status: "ready",
  },
  {
    id: "mansion",
    name: "Mansion library",
    description:
      "A walnut library with tall windows: sunbeams by day, candlelight by night. Your books stand on its shelves.",
    kind: "room",
    status: "ready",
    base: "/library-themes/mansion/",
  },
  {
    id: "cabin",
    name: "Winter cabin",
    description: "Log walls, a fire in the hearth and snow at the window.",
    kind: "room",
    status: "planned",
  },
  {
    id: "seaside",
    name: "Seaside study",
    description: "White shelves, sea light and the sound of waves.",
    kind: "room",
    status: "planned",
  },
  {
    id: "tea-room",
    name: "Japanese reading room",
    description: "Tatami, paper screens and a garden view.",
    kind: "room",
    status: "planned",
  },
];

export function libraryTheme(id: string): LibraryTheme {
  const theme = libraryThemes.find((t) => t.id === id && t.status === "ready");
  return theme || libraryThemes[0];
}
