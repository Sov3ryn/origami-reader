import { t } from "../i18n";

// Paper for each document. "default" follows the workspace theme.
export type PaperId = "default" | "paper" | "sepia" | "lined" | "grid" | "dots" | "blueprint";
export const papers = (): { id: PaperId; label: string; swatch: string }[] => [
  { id: "default", label: t("Theme"), swatch: "linear-gradient(135deg, var(--panel) 50%, var(--bg) 50%)" },
  { id: "paper", label: t("Paper"), swatch: "#f4efe3" },
  { id: "sepia", label: t("Sepia"), swatch: "#ebdcbb" },
  { id: "lined", label: t("Lined"), swatch: "repeating-linear-gradient(#fdfdf8 0 7px, #9fb6d6 7px 8px)" },
  { id: "grid", label: t("Math grid"), swatch: "#fbfbf7 linear-gradient(#7c9cc955 1px, transparent 1px) 0 0 / 6px 6px, linear-gradient(90deg, #7c9cc955 1px, #fbfbf7 1px) 0 0 / 6px 6px" },
  { id: "dots", label: t("Dot grid"), swatch: "radial-gradient(#8a95a8 1px, #fbfbf7 1.4px) 0 0 / 6px 6px" },
  { id: "blueprint", label: t("Blueprint"), swatch: "#1f4e8c linear-gradient(#ffffff40 1px, transparent 1px) 0 0 / 8px 8px" },
];
// Boards use the same papers as their background.
export const boardPaper: Record<PaperId, { bg: string; grid: boolean }> = {
  default: { bg: "#ffffff", grid: false },
  paper: { bg: "#f4efe3", grid: false },
  sepia: { bg: "#ebdcbb", grid: false },
  lined: { bg: "#fdfdf8", grid: true },
  grid: { bg: "#fbfbf7", grid: true },
  dots: { bg: "#fbfbf7", grid: true },
  blueprint: { bg: "#1f4e8c", grid: true },
};
