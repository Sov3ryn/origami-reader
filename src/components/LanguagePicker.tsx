import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { detectLanguage, getLanguage, languages, t } from "../i18n";

export function Flag({ code, label }: { code: string; label?: string }) {
  const language = getLanguage(code);
  if (!language.flag)
    return (
      <span
        className="flag flag-badge"
        role={label ? "img" : undefined}
        aria-label={label}
      >
        {language.code.split("-")[0].toUpperCase()}
      </span>
    );
  return (
    <img
      className="flag"
      src={`/flags/${language.flag}.svg`}
      alt={label || ""}
      width={20}
      height={15}
      draggable={false}
    />
  );
}

// Interface language. "" follows the operating system language.
export function LanguagePicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (code: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const detected = detectLanguage();
  const active = getLanguage(value || detected);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  const choose = (code: string) => {
    setOpen(false);
    onChange(code);
  };
  return (
    <div className={"language-picker" + (compact ? " compact" : "")} ref={root}>
      <button
        type="button"
        className="language-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Interface language: {language}", {
          language: active.native,
        })}
        onClick={() => setOpen(!open)}
      >
        {compact ? <Languages size={16} /> : null}
        <Flag code={active.code} />
        <span>{active.native}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          className="language-menu"
          role="listbox"
          aria-label={t("Language")}
        >
          <button
            role="option"
            aria-selected={!value}
            className={!value ? "chosen" : ""}
            onClick={() => choose("")}
          >
            <Flag code={detected} />
            <span>
              {t("Match system language")}
              <small>{getLanguage(detected).native}</small>
            </span>
            {!value && <Check size={14} />}
          </button>
          {languages.map((language) => (
            <button
              key={language.code}
              role="option"
              aria-selected={value === language.code}
              className={value === language.code ? "chosen" : ""}
              onClick={() => choose(language.code)}
            >
              <Flag code={language.code} />
              <span>
                <bdi lang={language.code}>{language.native}</bdi>
                {language.native !== language.name && (
                  <small>{language.name}</small>
                )}
              </span>
              {value === language.code && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
