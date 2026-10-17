import { t } from "../i18n";
import { createContext, useContext, type ReactNode } from "react";
import type { BookMeta } from "../types";
import {
  Clock,
  ImagePlus,
  LoaderCircle,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
export const CoverTextContext = createContext(true);
export function hasCoverText(book: BookMeta, enabled: boolean): boolean {
  return (
    enabled &&
    (book.coverText === "show" ||
      (book.coverText !== "hide" &&
        (!book.coverImage || book.coverOrigin === "generated")))
  );
}
export function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
  autoFocus,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
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
      autoFocus={autoFocus}
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
  const text = hasCoverText(book, useContext(CoverTextContext));
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
                (text
                  ? "linear-gradient(#11182755, #11182705 45%, #111827a0), "
                  : "") + `url("${book.coverImage}")`,
            }
          : undefined
      }
    >
      {text && (
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

// Cover generation for books without artwork, shown on library covers.
export type CoverJob = {
  status: "generating" | "queued" | "paused" | "";
  canGenerate: boolean;
  onGenerate: () => void;
  onPause: () => void;
  onImport: (file: File) => void;
};
export function CoverControl({
  book,
  small = false,
  onOpen,
  onEdit,
  always = false,
  onTrash,
  job,
}: {
  book: BookMeta;
  small?: boolean;
  onOpen?: () => void;
  onEdit: () => void;
  always?: boolean;
  onTrash?: () => void;
  job?: CoverJob;
}) {
  // Books without a cover get a small toolbar: generate, pause or resume,
  // import an image, or open the full cover editor.
  const bar = job && !book.coverImage;
  return (
    <div
      className={
        "cover-control" +
        (always ? " cover-control-visible" : "") +
        (job?.status ? " cover-" + job.status : "")
      }
    >
      {onOpen ? (
        <button
          className="cover-open"
          aria-label={t("Open {title}", { title: book.title })}
          onClick={onOpen}
        >
          <Cover book={book} small={small} />
        </button>
      ) : (
        <Cover book={book} small={small} />
      )}
      {job?.status && (
        <span className="cover-status" role="status">
          {job.status === "generating" ? (
            <LoaderCircle className="spin" size={13} />
          ) : job.status === "queued" ? (
            <Clock size={13} />
          ) : (
            <Pause size={13} />
          )}
          {job.status === "generating"
            ? t("Creating cover...")
            : job.status === "queued"
              ? t("Waiting")
              : t("Paused")}
        </span>
      )}
      {bar ? (
        <div
          className="cover-bar"
          role="group"
          aria-label={t("Cover for {title}", { title: book.title })}
        >
          {job.status === "generating" || job.status === "queued" ? (
            <button
              aria-label={t("Pause cover for {title}", { title: book.title })}
              title={t("Pause")}
              onClick={job.onPause}
            >
              <Pause size={14} />
            </button>
          ) : (
            job.canGenerate && (
              <button
                aria-label={
                  job.status === "paused"
                    ? t("Resume cover for {title}", { title: book.title })
                    : t("Generate cover for {title}", { title: book.title })
                }
                title={
                  job.status === "paused" ? t("Resume") : t("Generate cover")
                }
                onClick={job.onGenerate}
              >
                {job.status === "paused" ? (
                  <Play size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
              </button>
            )
          )}
          <button
            aria-label={t("Import cover image for {title}", {
              title: book.title,
            })}
            title={t("Import image")}
            onClick={() => {
              // A picker made on demand keeps the library's own file input
              // the only one on the page.
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/png,image/jpeg,image/webp";
              input.onchange = () => {
                const chosen = input.files?.[0];
                if (chosen) job.onImport(chosen);
              };
              input.click();
            }}
          >
            <Upload size={14} />
          </button>
          <button
            aria-label={t("Change cover for {title}", { title: book.title })}
            title={t("Change cover")}
            onClick={onEdit}
          >
            <ImagePlus size={14} />
          </button>
        </div>
      ) : (
        <button
          className="cover-edit"
          aria-label={t("Change cover for {title}", { title: book.title })}
          title={t("Change cover")}
          onClick={onEdit}
        >
          <ImagePlus size={16} />
        </button>
      )}
      {onTrash && (
        <button
          className="cover-trash"
          aria-label={t("Move {title} to Trash", { title: book.title })}
          title={t("Move to Trash")}
          onClick={onTrash}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
