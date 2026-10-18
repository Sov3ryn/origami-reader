import { BookOpen, Clapperboard, PenLine } from "lucide-react";
import { t } from "../i18n";

export type AppMode = "read" | "work" | "studio";

// Read, Work or Studio, in the same place in every mode (Ctrl+Shift+W cycles).
export function ModeSwitch({ mode, onChange }: { mode: AppMode; onChange: (mode: AppMode) => void }) {
  const option = (value: AppMode, label: string, tip: string, Icon: typeof BookOpen) => (
    <button role="radio" aria-checked={mode === value} onClick={() => onChange(value)} data-tip={tip} data-keys="Ctrl+Shift+W">
      <Icon size={14} />
      {label}
    </button>
  );
  return (
    <div className="mode-switch" role="radiogroup" aria-label={t("Mode (Ctrl+Shift+W)")}>
      {option("read", t("Read"), t("Read mode"), BookOpen)}
      {option("work", t("Work"), t("Work mode: notes and study"), PenLine)}
      {option("studio", t("Studio"), t("Studio: audiobooks and books"), Clapperboard)}
    </div>
  );
}

export const nextMode = (mode: AppMode): AppMode => (mode === "read" ? "work" : mode === "work" ? "studio" : "read");
