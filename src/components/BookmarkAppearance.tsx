import { useState } from "react";
import { bookmarkArt, bookmarkDesigns } from "../bookmarks";
import { t } from "../i18n";
import { isOpen, rewardHint } from "../rewards";
import { readingStats } from "../places";
import type { Preferences } from "../types";
import { LockKeyhole } from "lucide-react";

type Style = "animated" | "still" | "ribbon";

// A bookmark is an illustrated design that moves (the default), the same
// design held still, or a plain ribbon in the ribbon colour.
export function BookmarkAppearance({ value, still = false, prefs, finishedBooks, onChange }: {
  value?: string;
  still?: boolean;
  prefs: Preferences;
  finishedBooks: number;
  onChange: (design: string, still: boolean) => void;
}) {
  const stats = readingStats(prefs.readingStats);
  const current: Style = !bookmarkArt(value) ? "ribbon" : still ? "still" : "animated";
  const [style, setStyle] = useState<Style>(current);
  const styles: [Style, string][] = [["animated", t("Animated")], ["still", t("Still")], ["ribbon", t("Ribbon")]];
  return <div className="bookmark-appearance">
    <div className="segmented bookmark-styles" role="group" aria-label={t("Bookmark style")}>
      {styles.map(([id, name]) => <button type="button" key={id} aria-pressed={style === id} className={style === id ? "active" : ""} onClick={() => {
        setStyle(id);
        // A chosen design keeps its look and only starts or stops moving.
        if (id !== "ribbon" && current !== "ribbon") onChange(value!, id === "still");
      }}>{name}</button>)}
    </div>
    {style === "ribbon" ? <div className="bookmark-designs" role="group" aria-label={t("Bookmark appearance")}>
      <button type="button" className="bookmark-design" aria-pressed={current === "ribbon"} onClick={() => onChange("", false)}>
        <span className="bookmark-color-sample" aria-hidden="true" /><span>{t("Plain ribbon")}</span>
      </button>
      <p className="hint">{t("A flat ribbon in the ribbon colour.")}</p>
    </div> : <div className="bookmark-designs" role="group" aria-label={t("Bookmark appearance")}>
      {bookmarkDesigns.map(([id, name]) => {
        const locked = value !== id && !isOpen("bookmark", id, stats);
        const hint = locked ? rewardHint("bookmark", id, stats, finishedBooks) : null;
        const chosen = value === id && current === style;
        return <button type="button" key={id} className="bookmark-design" aria-pressed={chosen} aria-disabled={locked || undefined} title={hint ? `${hint.how} ${hint.progress}` : t(name)} onClick={() => !locked && onChange(id, style === "still")}>
          <img src={bookmarkArt(id)} alt="" loading="lazy" /><span>{t(name)}</span>
          {locked && <LockKeyhole size={14} aria-hidden="true" />}
          {hint && <small>{hint.how} {hint.progress}</small>}
        </button>;
      })}
    </div>}
  </div>;
}
