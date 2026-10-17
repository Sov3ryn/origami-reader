import { languageFlag, languageName } from "../bookLanguage";

// A small flag for the language a book is written in, or its code when no
// flag fits. The flag itself is decorative with a tooltip; screen readers
// hear the language name as separate text, so titles stay clean headings.
export function LanguageFlag({
  code,
  interfaceLanguage,
}: {
  code: string;
  interfaceLanguage: string;
}) {
  const name = languageName(code, interfaceLanguage);
  const flag = languageFlag(code);
  return (
    <>
      {flag ? (
        <img
          className="flag book-flag"
          src={`/flags/${flag}.svg`}
          alt=""
          title={name}
        />
      ) : (
        <span
          className="flag flag-badge book-flag"
          aria-hidden="true"
          title={name}
        >
          {code.toUpperCase()}
        </span>
      )}
      <span className="visually-hidden">{name}</span>
    </>
  );
}
