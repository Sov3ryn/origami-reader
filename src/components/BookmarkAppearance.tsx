import { bookmarkArt, bookmarkDesigns } from "../bookmarks";
import { t } from "../i18n";
import { isOpen, rewardHint } from "../rewards";
import { readingStats } from "../places";
import type { Preferences } from "../types";
import { LockKeyhole } from "lucide-react";

export function BookmarkAppearance({ value, prefs, finishedBooks, onChange }: { value?: string; prefs: Preferences; finishedBooks: number; onChange: (id: string) => void }) {
  const stats = readingStats(prefs.readingStats);
  return <div className="bookmark-designs" role="group" aria-label={t("Bookmark appearance")}>
    <button type="button" className="bookmark-design" aria-pressed={!bookmarkArt(value)} onClick={() => onChange("")}>
      <span className="bookmark-color-sample" aria-hidden="true" /><span>{t("Colored marker")}</span>
    </button>
    {bookmarkDesigns.map(([id, name]) => {
      const locked = value !== id && !isOpen("bookmark", id, stats);
      const hint = locked ? rewardHint("bookmark", id, stats, finishedBooks) : null;
      return <button type="button" key={id} className="bookmark-design" aria-pressed={value === id} aria-disabled={locked || undefined} title={hint ? `${hint.how} ${hint.progress}` : t(name)} onClick={() => !locked && onChange(id)}>
      <img src={bookmarkArt(id)} alt="" loading="lazy" /><span>{t(name)}</span>
      {locked && <LockKeyhole size={14} aria-hidden="true" />}
      {hint && <small>{hint.how} {hint.progress}</small>}
    </button>; })}
  </div>;
}
