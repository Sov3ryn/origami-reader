import { useEffect, useRef, useState } from "react";
import { ChevronsDownUp, Trash2 } from "lucide-react";
import { t } from "../i18n";
import { stickyColors } from "../work/stickies/Stickies";
import type { Annotation } from "../types";

// A sticky note on a book page: a coloured tab in the margin beside its
// passage that opens into a small note (it may cover the text while open).
export function PageSticky({
  note,
  index,
  autoOpen,
  onChange,
  onDelete,
}: {
  note: Annotation;
  index: number;
  autoOpen: boolean;
  onChange: (patch: Partial<Annotation>) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(autoOpen || !note.text);
  const [text, setText] = useState(note.text);
  const timer = useRef<number | undefined>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setText(note.text), [note.text]);
  useEffect(() => {
    if (open && autoOpen) area.current?.focus();
  }, [open, autoOpen]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const color = stickyColors[note.color] || stickyColors.yellow;
  const save = (value: string) => {
    window.clearTimeout(timer.current);
    if (value !== note.text) onChange({ text: value });
  };
  if (!open)
    return (
      <button
        className="page-sticky-tab"
        style={{ background: color.bg, borderColor: color.edge, top: index * 30 }}
        data-tip={text || t("Sticky note")}
        aria-label={t("Open sticky note")}
        onClick={() => setOpen(true)}
      >
        {text.split("\n")[0].slice(0, 18) || "…"}
      </button>
    );
  return (
    <aside className="page-sticky" style={{ background: color.bg, borderColor: color.edge, top: index * 30 }} aria-label={t("Sticky note")}>
      <header>
        {Object.entries(stickyColors).map(([name, c]) => (
          <button
            key={name}
            className={"sticky-color" + (note.color === name ? " active" : "")}
            style={{ background: c.bg, borderColor: c.edge }}
            aria-label={name}
            onClick={() => onChange({ color: name })}
          />
        ))}
        <span className="sticky-spacer" />
        <button className="sticky-tool" data-tip={t("Fold")} onClick={() => (save(text), setOpen(false))}>
          <ChevronsDownUp size={13} />
        </button>
        <button className="sticky-tool" data-tip={t("Remove sticky note")} onClick={onDelete}>
          <Trash2 size={13} />
        </button>
      </header>
      <textarea
        ref={area}
        value={text}
        placeholder={t("Write something…")}
        aria-label={t("Sticky note")}
        onChange={(e) => {
          const v = e.target.value.slice(0, 4000);
          setText(v);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => onChange({ text: v }), 600);
        }}
        onBlur={() => save(text)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") (save(text), setOpen(false));
        }}
      />
    </aside>
  );
}
