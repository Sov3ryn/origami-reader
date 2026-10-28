import { PageSticky } from "./PageSticky";
import { t } from "../i18n";
import { memo } from "react";
import { Bookmark, CircleAlert, MessageSquare } from "lucide-react";
import { annotationColors } from "../themes";
import type { Annotation, Paragraph } from "../types";

export type SentenceMark = { paragraph: number; start: number; end: number };
export type ReadingPageActions = {
  openAnnotation: (a: Annotation) => void;
  retry: (paragraph: number) => void;
  // A sticky note changed (null: removed).
  sticky: (a: Annotation, patch: Partial<Annotation> | null) => void;
  // The sticky note just made, opened for writing.
  freshSticky: () => string | null;
};

const colorOf = (id: string) =>
  annotationColors.find((c) => c.id === id)?.value;

export function paragraphText(
  p: Paragraph,
  marks: Annotation[],
  spoken: SentenceMark | null,
) {
  const underlines = marks.filter((n) => n.kind !== "bookmark" && n.end > n.start);
  if (!underlines.length && !spoken) return p.text;
  const cuts = [
    ...new Set([
      0,
      p.text.length,
      ...underlines.flatMap((n) => [
        Math.max(0, n.start),
        Math.min(p.text.length, n.end),
      ]),
      ...(spoken ? [spoken.start, spoken.end] : []),
    ]),
  ].sort((a, b) => a - b);
  return cuts.slice(0, -1).map((start, i) => {
    const end = cuts[i + 1];
    const mark = underlines.find((n) => n.start <= start && n.end >= end);
    return (
      <span
        key={start}
        className={
          spoken && spoken.start <= start && spoken.end >= end
            ? "sentence-mark"
            : undefined
        }
        style={
          mark
            ? {
                textDecoration: "underline",
                textDecorationColor: colorOf(mark.color),
                textDecorationThickness: "2px",
                textUnderlineOffset: "5px",
              }
            : undefined
        }
      >
        {p.text.slice(start, end)}
      </span>
    );
  });
}

// One reading page. Memoized so narration and selection changes re-render only
// the page they touch, even when a long book is shown as continuous pages.
export const ReadingPage = memo(function ReadingPage({
  index,
  total,
  start,
  end,
  paragraphs,
  author,
  format,
  className,
  progress,
  annotationsByParagraph,
  speaking,
  sentence,
  unvoiced,
  actions,
}: {
  // Interface language; a change re-renders the page footer.
  language: string;
  index: number;
  total: number;
  start: number;
  end: number;
  paragraphs: Paragraph[];
  author: string;
  format: string;
  className: string;
  progress: "pages" | "paragraphs" | "percentage";
  annotationsByParagraph: Map<string, Annotation[]>;
  // Paragraph being read on this page, or -1.
  speaking: number;
  sentence: SentenceMark | null;
  // Paragraphs on this page that could not be voiced, as a stable string key.
  unvoiced: string;
  actions: ReadingPageActions;
}) {
  const failed = new Set(unvoiced ? unvoiced.split(",").map(Number) : []);
  return (
    <article
      data-reading-page={index}
      aria-label={t("Page {index} of {total}", {
        index: index + 1,
        total: total,
      })}
      className={className}
    >
      <div className="reading-kicker">
        {author}
        <span>{format}</span>
      </div>
      {paragraphs.slice(start, end).map((p, offset) => {
        const n = start + offset;
        const marks = annotationsByParagraph.get(p.id) || [];
        const spoken = sentence && sentence.paragraph === n ? sentence : null;
        return (
          <div
            key={p.id}
            className={
              "passage " +
              (speaking === n
                ? spoken
                  ? "speaking-sentence"
                  : "speaking"
                : "")
            }
            id={"passage-" + p.id}
          >
            <div className="margin-tools">
              {failed.has(n) && (
                <button
                  className="unvoiced-marker"
                  title={t(
                    "This passage could not be voiced. Select to retry from here.",
                  )}
                  aria-label={t("Passage not read. Retry from here")}
                  onClick={() => actions.retry(n)}
                >
                  <CircleAlert size={17} />
                </button>
              )}
              {marks.filter((a) => a.kind !== "sticky").slice(0, 3).map((a) => (
                <button
                  key={a.id}
                  title={a.text || a.kind}
                  aria-label={t("Open {kind}", { kind: a.kind })}
                  style={{ color: colorOf(a.color) }}
                  onClick={() => actions.openAnnotation(a)}
                >
                  {a.kind === "bookmark" ? (
                    <Bookmark size={17} />
                  ) : (
                    <MessageSquare size={17} />
                  )}
                </button>
              ))}
            </div>
            {marks
              .filter((a) => a.kind === "sticky")
              .map((a, i) => (
                <PageSticky
                  key={a.id}
                  note={a}
                  index={i}
                  autoOpen={actions.freshSticky() === a.id}
                  onChange={(patch) => actions.sticky(a, patch)}
                  onDelete={() => actions.sticky(a, null)}
                />
              ))}
            {p.kind === "heading" ? (
              <h2
                data-paragraph={p.id}
                data-heading-level={p.headingLevel || 2}
                data-align={p.align}
              >
                {paragraphText(p, marks, spoken)}
              </h2>
            ) : (
              <p
                data-paragraph={p.id}
                data-quote={p.quote || undefined}
                data-align={p.align}
              >
                {paragraphText(p, marks, spoken)}
              </p>
            )}
          </div>
        );
      })}
      <div className="page-footer">
        <span>
          {progress === "paragraphs"
            ? t("Paragraphs {start} to {end} of {count}", {
                start: start + 1,
                end: end,
                count: paragraphs.length,
              })
            : progress === "percentage"
              ? `${Math.round(((index + 1) / total) * 100)}%`
              : t("Page {index} of {total}", {
                  index: index + 1,
                  total: total,
                })}
        </span>
      </div>
    </article>
  );
});
