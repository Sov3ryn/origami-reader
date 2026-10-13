import type { ReactNode } from "react";
import type { BookMeta } from "../types";
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
      className={"cover cover-" + book.cover + (small ? " small" : "")}
      aria-hidden="true"
    >
      <span className="cover-rule" />
      <span className="cover-title">{book.title}</span>
      <img src="/crane.png" alt="" />
      <span className="cover-author">{book.author}</span>
    </div>
  );
}
