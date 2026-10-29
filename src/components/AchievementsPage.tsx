import { Check, LockKeyhole, Sparkles } from "lucide-react";
import { achieved, achievements, chapters, progressOf, type Achievement } from "../achievements";
import { edgeFinishes } from "../binding";
import { bookmarkArt, bookmarkDesigns } from "../bookmarks";
import { t } from "../i18n";
import { requirementHint } from "../places";
import { annotationColors, themes } from "../themes";
import type { ReadingStats } from "../types";

// Every achievement by chapter, with how far along the reader is and what it
// unlocks. Secret ones stay hidden until found.
export function AchievementsPage({ stats, completedBooks }: { stats: ReadingStats; completedBooks: number }) {
  const done = achievements.filter((a) => achieved(a, stats, completedBooks)).length;
  return (
    <div className="achievements-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("{done} of {total} earned", { done, total: achievements.length })}</span>
          <h1>{t("Achievements")}</h1>
        </div>
      </div>
      <p className="hint achievements-intro">
        {t("Reading, coming back and trying new parts of Origami unlock themes, finishes, ribbon colours and bookmarks.")}
      </p>
      {chapters.map(([chapter, title]) => {
        const list = achievements.filter((a) => a.chapter === chapter);
        const earned = list.filter((a) => achieved(a, stats, completedBooks)).length;
        return (
          <section key={chapter} className="achievement-chapter" aria-labelledby={"chapter-" + chapter}>
            <h2 id={"chapter-" + chapter}>
              {t(title)} <span className="count">{earned} / {list.length}</span>
            </h2>
            <div className="achievement-grid">
              {list.map((a) => (
                <AchievementCard key={a.id} a={a} stats={stats} completedBooks={completedBooks} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AchievementCard({ a, stats, completedBooks }: { a: Achievement; stats: ReadingStats; completedBooks: number }) {
  const earned = achieved(a, stats, completedBooks);
  const hidden = a.secret && !earned;
  const hint = a.metric ? requirementHint(a.metric, a.value!, stats, completedBooks) : null;
  const progress = progressOf(a, stats, completedBooks);
  return (
    <article className={"achievement" + (earned ? " earned" : "") + (hidden ? " secret" : "")}>
      <div className="achievement-head">
        <span className="achievement-mark" aria-hidden="true">
          {earned ? <Check size={15} /> : hidden ? <Sparkles size={15} /> : <LockKeyhole size={14} />}
        </span>
        <div>
          <h3>{hidden ? t("Secret") : t(a.name)}</h3>
          <p>{hidden ? t("A secret achievement. Keep exploring Origami.") : hint ? hint.how : t(a.goal)}</p>
        </div>
      </div>
      {!hidden && a.metric && !earned && (
        <div className="achievement-progress">
          <span style={{ width: Math.round(progress * 100) + "%" }} />
          <small>{hint!.progress}</small>
        </div>
      )}
      {!hidden && <Rewards a={a} />}
    </article>
  );
}

function Rewards({ a }: { a: Achievement }) {
  return (
    <ul className="achievement-rewards" aria-label={t("Unlocks")}>
      {(a.bookmarks || []).map((id) => (
        <li key={id} className="reward-bookmark">
          <img src={bookmarkArt(id)} alt="" loading="lazy" />
          <span>{t(bookmarkDesigns.find(([key]) => key === id)?.[1] || id)}</span>
        </li>
      ))}
      {(a.themes || []).map((id) => {
        const th = themes.find((x) => x.id === id);
        return (
          <li key={id}>
            <i className="reward-swatch" style={{ background: th?.bg, borderColor: th?.accent }} />
            <span>{t(th?.name || id)}</span>
          </li>
        );
      })}
      {(a.finishes || []).map((id) => {
        const f = edgeFinishes.find((x) => x.id === id);
        return (
          <li key={id}>
            <i className="reward-swatch" style={{ background: `linear-gradient(135deg, ${f?.hi}, ${f?.mid}, ${f?.lo})` }} />
            <span>{t("{finish} finish", { finish: t(f?.name || id) })}</span>
          </li>
        );
      })}
      {a.ribbons?.length ? (
        <li>
          {a.ribbons.map((id) => (
            <i key={id} className="reward-swatch ribbon" style={{ background: annotationColors.find((c) => c.id === id)?.value }} />
          ))}
          <span>
            {t("{colours} ribbons", {
              colours: a.ribbons.map((id) => t(annotationColors.find((c) => c.id === id)?.label || id)).join(", "),
            })}
          </span>
        </li>
      ) : null}
    </ul>
  );
}
