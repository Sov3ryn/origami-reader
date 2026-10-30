import { createContext } from "react";
import type { Binding } from "./binding";

export const coverPatterns = [
  ["normal", "Normal"],
  ["quiet-classic", "Quiet Classic"],
  ["botanical", "Botanical"],
  ["celestial", "Celestial"],
  ["gothic", "Gothic"],
  ["art-deco", "Art Deco"],
  ["origami", "Origami"],
] as const;
export type CoverPattern = (typeof coverPatterns)[number][0];
export function coverPattern(value?: string): CoverPattern {
  return coverPatterns.find(([id]) => id === value)?.[0] || "normal";
}
export const CoverBindingContext = createContext<Partial<Binding>>({});
