import { cleanSpokenText } from "./documents";
import type { Paragraph, Preferences, SpokenEdit } from "./types";

export type SpokenRange = { start: number; end: number };
type Rule = SpokenRange & { text: string };
const roman = /^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
export function romanValue(token: string): number | null {
  const normalized = token.normalize("NFKC").toUpperCase();
  if (!roman.test(normalized)) return null;
  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  return Array.from(normalized).reduce(
    (sum, c, i) =>
      sum +
      (values[c] < (values[normalized[i + 1]] || 0) ? -values[c] : values[c]),
    0,
  );
}
function headingRules(text: string): Rule[] {
  const token = "([MDCLXVI\\u2160-\\u217f]+)";
  const end = "(?=$|[\\s.:·,;\\-\\u2013\\u2014])";
  const labeled = new RegExp(
    "^\\s*(?:chapter|part|book|volume|vol\\.?|section|act|scene|appendix|chapitre|livre|tome|kapitel|capítulo)\\s+" +
      token +
      end,
    "i",
  ).exec(text);
  const match = labeled || new RegExp("^\\s*" + token + end, "i").exec(text);
  if (!match) return [];
  const numeral = match[1];
  const value = romanValue(numeral);
  if (value === null) return [];
  const start = match[0].lastIndexOf(numeral);
  const tail = text.slice(start + numeral.length);
  // Avoid changing titles beginning with a pronoun or a single initial.
  if (
    !labeled &&
    numeral.normalize("NFKC").length === 1 &&
    tail.trim() &&
    !/^\s*[.:·,;\-\u2013\u2014]/.test(tail)
  )
    return [];
  // An ordinary word such as "mix" is not a chapter index without a label.
  if (
    !labeled &&
    numeral === numeral.toLowerCase() &&
    tail.trim() &&
    !/^\s*[.:·]/.test(tail)
  )
    return [];
  return [{ start, end: start + numeral.length, text: String(value) }];
}
function boundary(text: string, n: number) {
  return !(
    n > 0 &&
    n < text.length &&
    /[\uD800-\uDBFF]/.test(text[n - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[n])
  );
}
export function validateSpokenEdits(text: string, edits: SpokenEdit[]) {
  if (
    edits.length > 1000 ||
    new TextEncoder().encode(JSON.stringify(edits)).length > 1024 * 1024
  )
    throw new Error("Spoken edits are too large.");
  let end = 0;
  for (const edit of edits) {
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < end ||
      edit.end <= edit.start ||
      edit.end > text.length ||
      typeof edit.text !== "string" ||
      !boundary(text, edit.start) ||
      !boundary(text, edit.end)
    )
      throw new Error("Spoken edits must use separate, valid text ranges.");
    end = edit.end;
  }
}
export function expandSpokenRange(
  paragraph: Paragraph,
  range: SpokenRange,
): SpokenRange {
  let { start, end } = range;
  for (const edit of paragraph.spokenEdits || []) {
    if (edit.start < end && edit.end > start) {
      start = Math.min(start, edit.start);
      end = Math.max(end, edit.end);
    }
  }
  return { start, end };
}
export function replaceSpokenRange(
  paragraph: Paragraph,
  range: SpokenRange,
  text: string | null,
): SpokenEdit[] {
  const expanded = expandSpokenRange(paragraph, range);
  const edits = (paragraph.spokenEdits || []).filter(
    (edit) => edit.end <= expanded.start || edit.start >= expanded.end,
  );
  if (text !== null) edits.push({ ...expanded, text });
  edits.sort((a, b) => a.start - b.start);
  validateSpokenEdits(paragraph.text, edits);
  return edits;
}
export function spokenText(
  paragraph: Paragraph,
  prefs: Pick<Preferences, "romanNumeralHeadings">,
  range: SpokenRange = { start: 0, end: paragraph.text.length },
): string {
  const rules =
    paragraph.kind === "heading" && prefs.romanNumeralHeadings
      ? headingRules(paragraph.text)
      : [];
  const original = (start: number, end: number) => {
    let result = "",
      at = start;
    for (const rule of rules) {
      if (rule.start < start || rule.end > end) continue;
      result += paragraph.text.slice(at, rule.start) + rule.text;
      at = rule.end;
    }
    return result + paragraph.text.slice(at, end);
  };
  let at = range.start,
    result = "";
  for (const edit of paragraph.spokenEdits || []) {
    if (edit.end <= range.start || edit.start >= range.end) continue;
    result += original(at, Math.max(at, edit.start)) + edit.text;
    at = Math.max(at, edit.end);
  }
  result += original(Math.min(at, range.end), range.end);
  return cleanSpokenText(result);
}
