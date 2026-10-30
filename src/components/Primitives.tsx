import { t } from "../i18n";
import { createContext, useContext, useRef, type ReactNode } from "react";
import { bindingOf, edgeFinish, type Binding } from "../binding";
import { CoverBindingContext, coverPattern } from "../coverGilding";
import { useCoverTilt } from "../useCoverTilt";
import type { BookMeta } from "../types";
import { coverTitleInk, coverTitleStyle, titleFit } from "../coverTitles";
import "../coverTitleFonts.css";
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
  binding,
  gilt = false,
}: {
  book: BookMeta;
  small?: boolean;
  binding?: Binding;
  /** The 3D book draws its own gilt frame over the cover. */
  gilt?: boolean;
}) {
  const defaults = useContext(CoverBindingContext);
  const chosen = binding || bindingOf(defaults, book.binding);
  const pattern = coverPattern(chosen.coverPattern);
  const decorated = pattern !== "normal" && chosen.cover !== "plain";
  // Lettering keeps inside a pattern or the 3D book's gilt frame.
  const framed = decorated || (gilt && chosen.cover !== "plain");
  const metal = edgeFinish(chosen.cover);
  const text = hasCoverText(book, useContext(CoverTextContext));
  const style = coverTitleStyle(book);
  const ink = coverTitleInk(book, style);
  const styled = style !== "classic";
  const foil = styled && (ink === "gold" || ink === "silver" || ink === "copper") &&
    style !== "script" && style !== "scifi" && style !== "thriller";
  return (
    <div
      className={
        "cover cover-" +
        book.cover +
        (small ? " small" : "") +
        (book.coverImage ? " cover-image" : "") +
        (framed ? " cover-framed" : "") +
        (decorated ? " cover-patterned" : "") +
        (text
          ? " title-" + style + (styled ? " styled ink-" + ink : "") + (foil ? " foil" : "")
          : "")
      }
      aria-hidden="true"
      data-cover-pattern={decorated ? pattern : undefined}
      style={{
        ...(book.coverImage
          ? {
              backgroundImage:
                (text
                  ? "linear-gradient(#11182755, #11182705 45%, #111827a0), "
                  : "") + `url("${book.coverImage}")`,
            }
          : {}),
        ["--title-fit" as string]: titleFit(book.title, style, framed),
        ...(decorated ? {
          ["--gilt-mask" as string]: `url("/cover-gilding/${pattern}.svg")`,
          ["--gilt-hi" as string]: metal.hi,
          ["--gilt-mid" as string]: metal.mid,
          ["--gilt-lo" as string]: metal.lo,
        } : {}),
      }}
    >
      {decorated && <span className="cover-pattern-foil" />}
      {text && (
        <>
          <span className="cover-rule" />
          <span className="cover-title">
            <span>{book.title}</span>
          </span>
          {styled ? (
            <span className="cover-ornament" />
          ) : (
            !book.coverImage && <img src="/crane.png" alt="" />
          )}
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
  tilt = false,
}: {
  book: BookMeta;
  small?: boolean;
  onOpen?: () => void;
  onEdit: () => void;
  always?: boolean;
  onTrash?: () => void;
  job?: CoverJob;
  tilt?: boolean;
}) {
  const tiltRoot = useRef<HTMLDivElement>(null);
  useCoverTilt(tiltRoot, tilt, ".cover");
  // Books without a cover get a small toolbar: generate, pause or resume,
  // import an image, or open the full cover editor.
  const bar = job && !book.coverImage;
  return (
    <div
      ref={tiltRoot}
      className={
        "cover-control" +
        (tilt ? " cover-tilt" : "") +
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
