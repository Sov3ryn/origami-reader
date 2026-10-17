import { BookOpen, PenLine } from "lucide-react";
import { t } from "../i18n";

// Read or Work, in the same place in both modes (Ctrl+Shift+W).
export function ModeSwitch({ work, onChange }: { work: boolean; onChange: (work: boolean) => void }) {
  return (
    <div className="mode-switch" role="radiogroup" aria-label={t("Mode (Ctrl+Shift+W)")}>
      <button role="radio" aria-checked={!work} onClick={() => onChange(false)} data-tip={t("Read mode")} data-keys="Ctrl+Shift+W">
        <BookOpen size={14} />
        {t("Read")}
      </button>
      <button role="radio" aria-checked={work} onClick={() => onChange(true)} data-tip={t("Work mode: notes and study")} data-keys="Ctrl+Shift+W">
        <PenLine size={14} />
        {t("Work")}
      </button>
    </div>
  );
}
