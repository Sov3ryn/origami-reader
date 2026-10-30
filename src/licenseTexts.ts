import { useEffect, useState } from "react";
import appLicenseEnglish from "../APP-LICENSE.md?raw";
import modelNoticesEnglish from "../docs/licenses/MODEL-NOTICES.txt?raw";

// The app license and the model notices in each interface language
// (docs/licenses/translations). English is the original; a language without a
// translation shows it. Each translation is its own chunk, loaded when chosen.
const translations = import.meta.glob<string>(
  ["../docs/licenses/translations/APP-LICENSE.*.md", "../docs/licenses/translations/MODEL-NOTICES.*.txt"],
  { query: "?raw", import: "default" },
);

export type LicenseText = "app" | "models";
const english: Record<LicenseText, string> = { app: appLicenseEnglish, models: modelNoticesEnglish };
const file = (kind: LicenseText, code: string) =>
  kind === "app"
    ? `../docs/licenses/translations/APP-LICENSE.${code}.md`
    : `../docs/licenses/translations/MODEL-NOTICES.${code}.txt`;

export function hasTranslation(kind: LicenseText, code: string) {
  return code !== "en" && file(kind, code) in translations;
}

export function englishText(kind: LicenseText) {
  return english[kind];
}

/** The text in `code`, English until the translation has loaded (or when there is none). */
export function useLicenseText(kind: LicenseText, code: string) {
  const [text, setText] = useState(english[kind]);
  useEffect(() => {
    let live = true;
    const load = hasTranslation(kind, code) ? translations[file(kind, code)] : null;
    setText(english[kind]);
    void load?.()
      .then((t) => live && setText(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [kind, code]);
  return text;
}
