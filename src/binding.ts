// The binding of the 3D book in book mode: page edges, spine and cover, each
// plain or gilded with a metal finish. Set for all books, and changed per
// book. Plain is open to everyone; the metals are earned (see rewards.ts).
export type FinishId = "plain" | "silver" | "gunmetal" | "rose-gold" | "copper" | "gold";
export type EdgeFinish = {
  id: FinishId;
  name: string;
  // Highlight, body and shadow of the metal (or paper, for plain edges).
  hi: string;
  mid: string;
  lo: string;
};
export const edgeFinishes: EdgeFinish[] = [
  { id: "plain", name: "Plain", hi: "#f3ecdd", mid: "#ddd3bf", lo: "#b9ad96" },
  { id: "silver", name: "Silver", hi: "#f7f9fb", mid: "#b7bfc8", lo: "#68717c" },
  { id: "gunmetal", name: "Gunmetal", hi: "#b4bac2", mid: "#5d646e", lo: "#262a30" },
  { id: "rose-gold", name: "Rose gold", hi: "#fbe0d6", mid: "#d49c8b", lo: "#87564a" },
  { id: "copper", name: "Copper", hi: "#f7c193", mid: "#c37a48", lo: "#6a3a1d" },
  { id: "gold", name: "Gold", hi: "#fff3b8", mid: "#d6a83a", lo: "#7a5413" },
];

// The finish to draw: an unknown one falls back to plain. Locks apply only
// when choosing, so a finish already on a book keeps being drawn.
export function edgeFinish(id: string | undefined): EdgeFinish {
  return edgeFinishes.find((f) => f.id === id) || edgeFinishes[0];
}

// Where the gilding goes. Page edges are plain paper or a metal; the spine's
// title and bands and the cover's frame are printed in ink ("plain") or gilded.
export type BindingPart = "edges" | "spine" | "cover";
export type Binding = Record<BindingPart, FinishId> & { coverPattern?: string };
export const defaultBinding: Binding = { edges: "plain", spine: "plain", cover: "plain" };
/** The binding a book is drawn with: its own choices over the default for all books. */
export function bindingOf(all: Partial<Binding> | undefined, book?: Partial<Binding>): Binding {
  const pick = (part: BindingPart) => edgeFinish(book?.[part] ?? all?.[part] ?? defaultBinding[part]).id;
  const coverPattern = book?.coverPattern ?? all?.coverPattern;
  return { edges: pick("edges"), spine: pick("spine"), cover: pick("cover"), ...(coverPattern ? { coverPattern } : {}) };
}

// Spine cloth for covers made by Origami, which have no image to read.
export const presetSpines: Record<string, string> = {
  forest: "#5f7a58",
  paper: "#2c425b",
};
// Artwork behind the preset covers that do use an image.
export const presetCoverImages: Record<string, string> = {
  lake: "/moonlit-lake.webp",
};

/** How thick a volume is, as a share of its page height: about 300 words a
 * page, a sheet of book paper for every two pages, so a short story is a slim
 * booklet and a long novel a brick. */
export function bookThickness(words: number) {
  const pages = Math.max(0, words) / 300;
  return Math.min(0.22, Math.max(0.025, 0.018 + pages / 3200));
}
