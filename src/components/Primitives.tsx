import type { ReactNode } from "react";
import type { BookMeta } from "../types";
import { ImagePlus } from "lucide-react";
export function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={"icon-button " + (active ? "active" : "")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Cover({
  book,
  small = false,
}: {
  book: BookMeta;
  small?: boolean;
}) {
  return (
    <div
      className={
        "cover cover-" +
        book.cover +
        (small ? " small" : "") +
        (book.coverImage ? " cover-image" : "")
      }
      aria-hidden="true"
      style={
        book.coverImage
          ? {
              backgroundImage:
                (book.coverOrigin === "generated"
                  ? "linear-gradient(#11182755, #11182705 45%, #111827a0), "
                  : "") + `url("${book.coverImage}")`,
            }
          : undefined
      }
    >
      {(!book.coverImage || book.coverOrigin === "generated") && (
        <>
          <span className="cover-rule" />
          <span className="cover-title">{book.title}</span>
          {!book.coverImage && <img src="/crane.png" alt="" />}
          <span className="cover-author">{book.author}</span>
        </>
      )}
    </div>
  );
}

export function CoverControl({
  book,
  small = false,
  onOpen,
  onEdit,
  always = false,
}: {
  book: BookMeta;
  small?: boolean;
  onOpen?: () => void;
  onEdit: () => void;
  always?: boolean;
}) {
  return (
    <div className={"cover-control" + (always ? " cover-control-visible" : "")}>
      {onOpen ? (
        <button
          className="cover-open"
          aria-label={"Open " + book.title}
          onClick={onOpen}
        >
          <Cover book={book} small={small} />
        </button>
      ) : (
        <Cover book={book} small={small} />
      )}
      <button
        className="cover-edit"
        aria-label={"Change cover for " + book.title}
        title="Change cover"
        onClick={onEdit}
      >
        <ImagePlus size={16} />
      </button>
    </div>
  );
}
