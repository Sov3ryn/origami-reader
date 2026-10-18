import { BookOpen } from "lucide-react";
import { t } from "../../src/i18n";
import translations from "../../assets/starter-library/translations.json";
import manifest from "../../assets/starter-library/manifest.json";

// The language of the six starter books. Translations are AI first editions
// (assets/starter-library/translations); a book without one stays in English.
const index = translations as Record<string, Record<string, unknown>>;
const total = manifest.books.length;
const counts = new Map<string, number>();
for (const book of Object.values(index)) for (const code of Object.keys(book)) counts.set(code, (counts.get(code) || 0) + 1);

export const starterLanguageCodes = ["en", ...[...counts.keys()].sort()];

function nativeName(code: string) {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code) || code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}
const booksIn = (code: string) => (code === "en" ? total : counts.get(code) || counts.get(code.split("-")[0]) || 0);
const known = (code: string) => (code === "en" || counts.has(code) ? code : counts.has(code.split("-")[0]) ? code.split("-")[0] : "en");

export function StarterBooks({ value, interfaceLanguage, onChange }: { value: string; interfaceLanguage: string; onChange: (code: string) => void }) {
  const chosen = value || known(interfaceLanguage);
  const count = booksIn(chosen);
  return (
    <div className="starter-books">
      <BookOpen size={20} aria-hidden="true" />
      <label htmlFor="starter-language">
        <strong>{t("Starter books")}</strong>
        <small>
          {chosen === "en"
            ? t("Six complete classics to start your library.")
            : count < total
              ? t("{count} of the six books in this language; the others stay in English. Translations are AI editions.", { count })
              : t("All six books in this language. Translations are AI editions.")}
        </small>
      </label>
      <select id="starter-language" value={chosen} onChange={(e) => onChange(e.target.value)}>
        {starterLanguageCodes.map((code) => (
          <option key={code} value={code}>
            {nativeName(code)}
            {booksIn(code) < total ? ` (${booksIn(code)}/${total})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The starter books line on the review page. */
export function starterLabel(value: string, interfaceLanguage: string) {
  const chosen = value || known(interfaceLanguage);
  if (chosen === "en") return t("{language} (original editions)", { language: nativeName(chosen) });
  return t("{language} ({count} of {total} books translated)", { language: nativeName(chosen), count: chosen === "en" ? total : booksIn(chosen), total });
}
