import { useEffect, useRef, useState } from "react";
import { ImagePlus, NotebookText, RulerDimensionLine, Pin, PinOff, Plus, SmilePlus, Tag, X } from "lucide-react";
import { pageSizeOf, pageSizes, papers, type PageSize } from "./papers";
import { displayLocale, t } from "../i18n";
import type { Note } from "./types";

// Covers are soft gradients drawn from the theme, so notes stay light and
// look right in day and night scenes.
export const covers: Record<string, string> = {
  dusk: "linear-gradient(120deg, #3b2c63, #8f5b9a 55%, #e0a46c)",
  sea: "linear-gradient(120deg, #123b4f, #2f7f8f 55%, #9fd3c7)",
  forest: "linear-gradient(120deg, #1d3326, #3f6b47 55%, #b9c98a)",
  paper: "linear-gradient(120deg, #6b5a46, #b49a74 55%, #efe1c4)",
  night: "linear-gradient(120deg, #0d1226, #27325e 55%, #6d6fb3)",
  rose: "linear-gradient(120deg, #4a1f33, #a34e6b 55%, #f2b3a6)",
};
const icons = [
  "📘", "📗", "📙", "📕", "📖", "📝", "🗂️", "📅", "🔗", "💡", "🧠", "🧪",
  "🧬", "🔭", "🌍", "🏛️", "⚖️", "🎨", "🎵", "💻", "🧮", "📐", "🗺️", "🕰️",
  "🌱", "🌙", "☀️", "⭐", "🔥", "❄️", "🧛", "🐉", "👋", "✅", "❓", "❗",
];

export function NoteHeader({
  note,
  words,
  subjectSize,
  onChange,
  children,
}: {
  note: Note;
  // The subject's page size, which the note follows unless it has its own.
  subjectSize?: PageSize;
  words: number;
  onChange: (patch: Partial<Note>) => void;
  // The title field, placed between the icon and the details.
  children: React.ReactNode;
}) {
  const [picker, setPicker] = useState<"icon" | "cover" | "paper" | "size" | null>(null);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // An open picker closes on a click outside it and its buttons, and on Escape.
  useEffect(() => {
    if (!picker) return;
    const outside = (e: MouseEvent) => {
      const target = e.target as Node;
      const keep = box.current?.querySelectorAll(".note-picker, .note-header-tools, .note-icon, .cover-change") || [];
      if (!Array.from(keep).some((el) => el.contains(target))) setPicker(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPicker(null);
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", key);
    };
  }, [picker]);
  const tags = note.tags || [];
  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "").slice(0, 32);
    setTagDraft(null);
    if (tag && !tags.some((x) => x.toLowerCase() === tag.toLowerCase())) onChange({ tags: [...tags, tag] });
  };
  return (
    <div ref={box} className={"note-header" + (note.cover ? " with-cover" : "")}>
      {note.cover && covers[note.cover] && (
        <div className="note-cover" style={{ background: covers[note.cover] }}>
          <button className="cover-change" onClick={() => setPicker(picker === "cover" ? null : "cover")}>
            {t("Change cover")}
          </button>
        </div>
      )}
      {note.icon && (
        <button className="note-icon" aria-label={t("Change icon")} onClick={() => setPicker(picker === "icon" ? null : "icon")}>
          {note.icon}
        </button>
      )}
      <div className="note-header-tools">
        {!note.icon && (
          <button onClick={() => setPicker(picker === "icon" ? null : "icon")}>
            <SmilePlus size={14} />
            {t("Add icon")}
          </button>
        )}
        {!note.cover && (
          <button onClick={() => setPicker(picker === "cover" ? null : "cover")}>
            <ImagePlus size={14} />
            {t("Add cover")}
          </button>
        )}
        <button onClick={() => setPicker(picker === "paper" ? null : "paper")}>
          <NotebookText size={14} />
          {note.paper && note.paper !== "default" ? papers().find((p) => p.id === note.paper)?.label || t("Paper") : t("Paper")}
        </button>
        <button onClick={() => setPicker(picker === "size" ? null : "size")}>
          <RulerDimensionLine size={14} />
          {pageSizes().find((p) => p.id === pageSizeOf(note, { pageSize: subjectSize }))?.label}
        </button>
        <button onClick={() => onChange({ pinned: !note.pinned })}>
          {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          {note.pinned ? t("Unpin") : t("Pin")}
        </button>
      </div>
      {picker === "icon" && (
        <div className="note-picker icons" role="listbox" aria-label={t("Icons")}>
          {icons.map((i) => (
            <button
              key={i}
              role="option"
              aria-selected={note.icon === i}
              onClick={() => {
                onChange({ icon: i });
                setPicker(null);
              }}
            >
              {i}
            </button>
          ))}
          {note.icon && (
            <button
              className="picker-remove"
              onClick={() => {
                onChange({ icon: undefined });
                setPicker(null);
              }}
            >
              {t("Remove")}
            </button>
          )}
        </div>
      )}
      {picker === "paper" && (
        <div className="note-picker papers" role="listbox" aria-label={t("Paper")}>
          {papers().map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={(note.paper || "default") === p.id}
              onClick={() => {
                onChange({ paper: p.id === "default" ? undefined : p.id });
                setPicker(null);
              }}
            >
              <span className="paper-chip" style={{ background: p.swatch }} />
              {p.label}
            </button>
          ))}
        </div>
      )}
      {picker === "size" && (
        <div className="note-picker papers" role="listbox" aria-label={t("Page size")}>
          {subjectSize && (
            <button
              role="option"
              aria-selected={!note.pageSize}
              onClick={() => {
                onChange({ pageSize: undefined });
                setPicker(null);
              }}
            >
              {t("Same as subject ({size})", { size: pageSizes().find((p) => p.id === subjectSize)!.label })}
            </button>
          )}
          {pageSizes().map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={subjectSize ? note.pageSize === p.id : pageSizeOf(note) === p.id}
              onClick={() => {
                // Without a subject, standard is the default and is not stored.
                onChange({ pageSize: !subjectSize && p.id === "standard" ? undefined : p.id });
                setPicker(null);
              }}
            >
              <span className={"size-chip " + p.id} />
              {p.label}
            </button>
          ))}
        </div>
      )}
      {picker === "cover" && (
        <div className="note-picker covers" role="listbox" aria-label={t("Covers")}>
          {Object.entries(covers).map(([id, bg]) => (
            <button
              key={id}
              role="option"
              aria-selected={note.cover === id}
              aria-label={id}
              style={{ background: bg }}
              onClick={() => {
                onChange({ cover: id });
                setPicker(null);
              }}
            />
          ))}
          {note.cover && (
            <button
              className="picker-remove"
              onClick={() => {
                onChange({ cover: undefined });
                setPicker(null);
              }}
            >
              {t("Remove")}
            </button>
          )}
        </div>
      )}
      {children}
      <div className="note-props" aria-label={t("Note details")}>
        <Tag size={13} />
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            #{tag}
            <button aria-label={t("Remove tag {tag}", { tag })} onClick={() => onChange({ tags: tags.filter((x) => x !== tag) })}>
              <X size={11} />
            </button>
          </span>
        ))}
        {tagDraft === null ? (
          <button className="tag-add" onClick={() => setTagDraft("")}>
            <Plus size={12} />
            {t("Tag")}
          </button>
        ) : (
          <input
            className="tag-input"
            autoFocus
            value={tagDraft}
            placeholder={t("tag")}
            onChange={(e) => setTagDraft(e.target.value)}
            onBlur={() => addTag(tagDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagDraft);
              }
              if (e.key === "Escape") setTagDraft(null);
            }}
          />
        )}
        <span className="note-meta">
          {words === 1 ? t("1 word") : t("{count} words", { count: words.toLocaleString(displayLocale()) })}
          {words > 120 && ` · ${t("{minutes} min read", { minutes: Math.max(1, Math.round(words / 230)) })}`}
        </span>
      </div>
    </div>
  );
}
