// Studio: where speech is in a book's paragraphs, and the tags ("said Marie",
// "dit-il") that say who speaks. Works on plain paragraph text and returns
// character ranges, so the book's words are never rewritten.

export type Span = { start: number; end: number };
export type Tag = {
  verb: string;
  who: string;
  // "self" is the narrator speaking ("I said", "dis-je").
  kind: "name" | "pronoun" | "self";
  gender?: "m" | "f";
  start: number;
  end: number;
};
export type Speech = {
  id: string;
  paragraph: number;
  spans: Span[];
  // A quote carried on from the previous paragraph (same speaker).
  continued: boolean;
  // How it was marked: quotation marks, or a dialogue dash opening a turn.
  mark: "quote" | "dash";
  // A new speaker inside the same quotation ("... dit-il. (dash) Bonjour...").
  turn?: boolean;
  tag?: Tag;
  // Narration in the same paragraph before the speech, for action beats.
  before: Span | null;
  // In a script, the speaker's label ("ELIZABETH (softly): ") that comes first and is not read.
  label?: number;
};
export type Style = { open: string; close: string; dash: boolean };

const DASH = /^\s*(?:\u2014|\u2013|--)\s*/;
const CLOSERS: Record<string, string> = { "\u201c": "\u201d", "\u00ab": "\u00bb", "\u201e": "\u201c", "\u2018": "\u2019", '"': '"', "\u00bb": "\u00ab" };

/** The book's dialogue convention, from how its paragraphs are written. */
export function dialogueStyle(paragraphs: string[], language: string): Style {
  let curly = 0, straight = 0, single = 0, guillemets = 0, reversed = 0, low = 0, dashes = 0;
  for (const p of paragraphs) {
    curly += count(p, "\u201c");
    straight += count(p, '"');
    single += (p.match(/(^|[\s(\u2014])\u2018/g) || []).length;
    guillemets += count(p, "\u00ab");
    reversed += (p.match(/^\s*\u00bb/g) || []).length;
    low += count(p, "\u201e");
    if (DASH.test(p)) dashes++;
  }
  const dash = dashes > paragraphs.length * 0.02 || (dashes > 3 && /^(fr|es|ru|uk|pl|it|pt|ca|bg)/.test(language));
  const options: [number, string][] = [[curly, "\u201c"], [straight / 2, '"'], [single, "\u2018"], [guillemets, "\u00ab"], [low, "\u201e"], [reversed, "\u00bb"]];
  options.sort((a, b) => b[0] - a[0]);
  const open = options[0][0] > 0 ? options[0][1] : language.startsWith("fr") ? "\u00ab" : "\u201c";
  return { open, close: CLOSERS[open], dash };
}

function count(text: string, c: string) {
  let n = 0;
  for (let i = text.indexOf(c); i >= 0; i = text.indexOf(c, i + 1)) n++;
  return n;
}

// --- Speech verbs -------------------------------------------------------------------
const EN_VERBS =
  "said|says|say|replied|replies|cried|cries|asked|asks|answered|answers|continued|continues|added|adds|returned|observed|exclaimed|rejoined|whispered|muttered|murmured|shouted|began|resumed|inquired|enquired|repeated|interrupted|remarked|called|sighed|laughed|declared|protested|urged|insisted|faltered|stammered|retorted|responded|explained|screamed|sobbed|groaned|went on|thought|wrote|pursued|persisted|concluded|agreed|admitted|demanded|begged|pleaded|suggested|warned|announced|whimpered|snapped|growled|hissed|breathed|called out|cried out";
const FR_VERBS =
  "dit|dis|disait|r\u00e9pondit|r\u00e9pond|r\u00e9pondis|reprit|reprend|repris|s['\u2019]\u00e9cria|s['\u2019]\u00e9crie|m['\u2019]\u00e9criai|demanda|demande|demandai|ajouta|ajoute|ajoutai|continua|continue|continuai|r\u00e9pliqua|r\u00e9plique|r\u00e9pliquai|murmura|murmure|murmurai|cria|crie|criai|poursuivit|poursuit|poursuivis|interrompit|interrompt|observa|fit|fait|fis|insista|balbutia|hurla|soupira|chuchota|s['\u2019]exclama|riposta|objecta|acheva|conclut|r\u00e9p\u00e9ta|pensa|songea|s['\u2019]informa|grommela|gronda|lan\u00e7a|expliqua|d\u00e9clara|avoua|proposa|annon\u00e7a|risqua|hasarda|appuya|interrogea|ordonna|supplia|s['\u2019]\u00e9tonna|se dit|se dit|se r\u00e9cria|se h\u00e2ta d['\u2019]ajouter|dit[- ]il";

const NAME_EN = "(?:(?:Mr|Mrs|Miss|Ms|Dr|Lady|Lord|Sir|Colonel|Captain|Aunt|Uncle|Mister|Madam|Count|Professor)\\.?\\s+)?\\p{Lu}[\\p{L}\'\u2019-]+(?:\\s+\\p{Lu}[\\p{L}\'\u2019-]+)?";
const NOUN_EN = "(?:her|his|their|the|my|our)\\s+(?!(?:to|with|at|in|as|for|of|from|after|again|once|and)\\b)[a-z]+(?:\\s+(?![a-z]+ly\\b)[a-z]+){0,2}";
const PRON_EN = "he|she|I|they|we";
const NAME_FR =
  `(?:(?:M\\.|Mme|Mlle|Mgr|Mr\\.|Mrs\\.|Miss|monsieur|madame|mademoiselle|ma\u00eetre|Ma\u00eetre|milady|milord|lord|lady|sir|mistress|mister)\\s+)?(?:(?:de|d['\u2019]|du|des|la|le)\\s*)?\\p{Lu}[\\p{L}'\u2019-]+(?:\\s+(?:(?:de|d['\u2019]|du|des|la|le)\\s*)?\\p{Lu}[\\p{L}'\u2019-]+)*`;
const NOUN_FR = "(?:le|la|les|l[\'\u2019]|un|une|son|sa|ses|leur|notre|mon|ma)\\s*\\p{Ll}[\\p{L}\'\u2019-]*(?:\\s+\\p{Ll}[\\p{L}\'\u2019-]+){0,2}";
const PRON_FR = "il|elle|je|ils|elles|on|nous";

const enAfter = new RegExp(
  `^[\\s,;:\u2014-]*(?:(?<verb>${EN_VERBS})\\s+(?<who>${PRON_EN}|${NAME_EN}|${NOUN_EN})|(?<who2>${PRON_EN}|${NAME_EN}|${NOUN_EN})\\s+(?:[a-z]+ly\\s+)?(?<verb2>${EN_VERBS}))\\b`,
  "u",
);
const enBefore = new RegExp(`(?<who>${PRON_EN}|${NAME_EN}|${NOUN_EN})\\s+(?:[a-z]+ly\\s+)?(?<verb>${EN_VERBS})(?:\\s+[a-z]+ly)?(?:\\s+to\\s+\\w+(?:\\s+\\w+)?)?\\s*[,:\u2014-]?\\s*$`, "u");
const frIncise = new RegExp(
  `^(?:(?:lui|leur|me|nous|vous|se)\\s+)?(?:avait\\s+|a\\s+)?(?<verb>${FR_VERBS})(?:(?:-t)?-\\s?(?<pron>${PRON_FR})\\b|(?:\\s+\\p{L}+ment)?,?\\s+(?<who>${NAME_FR}|${NOUN_FR}))`,
  "u",
);
const frBefore = new RegExp(`(?<who>${NAME_FR}|${NOUN_FR}|${PRON_FR})\\s+(?<verb>${FR_VERBS})\\s*[,:]?\\s*$`, "u");

const FEMALE = new Set(["she", "elle", "elles"]);
const MALE = new Set(["he", "il", "ils"]);
const SELF = new Set(["I", "je", "we", "nous"]);

function tagFrom(verb: string, who: string, start: number, end: number): Tag {
  const w = who.trim();
  const lower = w.toLowerCase();
  if (SELF.has(w) || SELF.has(lower)) return { verb, who: w, kind: "self", start, end };
  if (FEMALE.has(lower) || MALE.has(lower) || lower === "they" || lower === "on")
    return { verb, who: w, kind: "pronoun", gender: FEMALE.has(lower) ? "f" : MALE.has(lower) ? "m" : undefined, start, end };
  return { verb, who: w.replace(/[,.;:!?]+$/, ""), kind: "name", start, end };
}

/** A tag in the narration right after a quote ("," said she, "said Mr. Darcy"). */
export function tagAfter(text: string, from: number, language: string): Tag | undefined {
  const rest = text.slice(from, from + 120);
  if (language.startsWith("fr")) {
    const lead = /^[\s,;:!?\u2026.]*/.exec(rest)![0].length;
    const m = frIncise.exec(rest.slice(lead));
    if (!m?.groups) return undefined;
    const who = m.groups.pron || m.groups.who;
    return tagFrom(m.groups.verb, who, from + lead, from + lead + m[0].length);
  }
  const m = enAfter.exec(rest);
  if (!m?.groups) return undefined;
  const who = m.groups.who || m.groups.who2;
  const verb = m.groups.verb || m.groups.verb2;
  if (!who || !verb || /^(?:The|But|And|Then|So|Yet|Now|When|As)$/.test(who)) return undefined;
  return tagFrom(verb, who, from + m.index, from + m[0].length);
}

/** A tag in the narration just before a quote ("Elizabeth said, "). */
export function tagBefore(text: string, until: number, language: string): Tag | undefined {
  const head = text.slice(Math.max(0, until - 120), until);
  const offset = Math.max(0, until - 120);
  const m = (language.startsWith("fr") ? frBefore : enBefore).exec(head);
  if (!m?.groups?.who) return undefined;
  return tagFrom(m.groups.verb, m.groups.who, offset + m.index, offset + m[0].length);
}

// --- French incises inside dash or guillemet speech ---------------------------------
// "Je le dirai, s'écria Milady avec une exaltation feinte, le jour où..."
const INCISE_LEAD = /([,!?\u2026]|\.\.\.)\s+(?=\S)/gu;
function carveIncises(text: string, span: Span): { spans: Span[]; tag?: Tag } {
  const out: Span[] = [];
  let tag: Tag | undefined;
  let cursor = span.start;
  INCISE_LEAD.lastIndex = span.start;
  for (let m = INCISE_LEAD.exec(text); m && m.index < span.end; m = INCISE_LEAD.exec(text)) {
    const at = m.index + m[0].length;
    if (at >= span.end) break;
    const found = frIncise.exec(text.slice(at, span.end));
    if (!found?.groups) continue;
    // The incise runs to the next comma, semicolon or full stop.
    const tail = /[,;.:!?]/.exec(text.slice(at + found[0].length, span.end));
    const end = tail ? at + found[0].length + tail.index : span.end;
    tag ??= tagFrom(found.groups.verb, found.groups.pron || found.groups.who, at, end);
    out.push({ start: cursor, end: m.index + m[1].length });
    cursor = tail ? end + 1 : span.end;
    while (cursor < span.end && /\s/.test(text[cursor])) cursor++;
    INCISE_LEAD.lastIndex = cursor;
  }
  // "s'écria l'émule de Tréville, furieux." The last word describes the speaker.
  const rest = text.slice(cursor, span.end).trim();
  const aside = tag && span.end === text.length && (/^en \p{L}+ant\b/u.test(rest) || rest.split(/\s+/).length <= 2) && /^(?:en\s+\p{L}+ant\b.*|(?:en\s+)?\p{Ll}\p{L}*(?:ant|ante|eux|euse|\u00e9|\u00e9e|\u00e9s|\u00e9es)\.?)$/u.test(rest);
  if (cursor < span.end && !aside) out.push({ start: cursor, end: span.end });
  return { spans: out.filter((s) => /\p{L}|\p{N}/u.test(text.slice(s.start, s.end))), tag };
}

// Inside one quotation, a dash after the end of a sentence starts the next speaker:
// «Bonjour, dit-il. (dash) Bonjour, répondit-elle.»
function splitTurns(text: string, span: Span): Span[] {
  const parts: Span[] = [];
  const re = /([.!?\u2026\u00bb])\s+(?:\u2014|\u2013|--)\s*/g;
  re.lastIndex = span.start;
  let start = span.start;
  for (let m = re.exec(text); m && m.index < span.end; m = re.exec(text)) {
    parts.push({ start, end: m.index + 1 });
    start = m.index + m[0].length;
  }
  parts.push({ start, end: span.end });
  return parts;
}

// "surface", "reading sauce": short quoted words with no sentence punctuation.
function isMention(words: string) {
  const t = words.trim();
  return t.split(/\s+/).length <= 3 && !/[.!?\u2026]$/.test(t);
}

/** Every piece of speech in the paragraphs, in reading order. */
export function findSpeech(paragraphs: string[], language: string, style = dialogueStyle(paragraphs, language)): Speech[] {
  const speech: Speech[] = [];
  const french = language.startsWith("fr");
  let carried = false; // a quotation left open at the end of the previous paragraph
  paragraphs.forEach((text, paragraph) => {
    let n = 0;
    const push = (spans: Span[], mark: Speech["mark"], continued: boolean, before: Span | null, tag?: Tag, turn = false) => {
      if (!spans.length) return;
      speech.push({ id: `${paragraph}.${n++}`, paragraph, spans, continued, mark, tag, before, ...(turn ? { turn } : {}) });
    };
    const dash = style.dash && DASH.exec(text);
    if (dash && (!carried || style.open === "\u00ab")) {
      // A dialogue turn: the whole paragraph is speech except incises.
      const close = style.open === "\u00ab" ? text.lastIndexOf("\u00bb") : -1;
      const end = close > dash[0].length ? close : text.length;
      carried = style.open === "\u00ab" ? carried && close < 0 : false;
      // Inside a dash turn, a dash usually sets off an aside, not a new speaker.
      const turns = [{ start: dash[0].length, end }];
      for (const turn of turns) {
        const { spans, tag } = french ? carveIncises(text, turn) : { spans: [turn], tag: tagAfter(text, turn.end, language) };
        push(spans, "dash", false, null, tag);
      }
      return;
    }
    let i = 0;
    let continued = carried && text.trimStart().startsWith(style.open);
    if (carried && !continued && !text.includes(style.open) && text.includes(style.close)) {
      // Some editions do not repeat the opening mark on a continued paragraph.
      continued = true;
    }
    carried = false;
    let narrationStart = 0;
    while (i < text.length) {
      const openAt = continued && i === 0 && !text.trimStart().startsWith(style.open) ? -1 : text.indexOf(style.open, i);
      if (openAt < 0 && !(continued && i === 0)) break;
      const start = openAt < 0 ? 0 : openAt + style.open.length;
      let closeAt = text.indexOf(style.close, start);
      if (style.close === style.open && closeAt < 0) closeAt = -1;
      if (style.open === "\u2018") {
        // Skip apostrophes: a closing mark followed by a letter is inside a word.
        while (closeAt >= 0 && /\p{L}/u.test(text[closeAt + 1] || "")) closeAt = text.indexOf(style.close, closeAt + 1);
      }
      const end = closeAt < 0 ? text.length : closeAt;
      if (closeAt < 0) carried = true;
      const before = openAt > narrationStart ? { start: narrationStart, end: openAt } : null;
      const turns = french ? splitTurns(text, { start, end }) : [{ start, end }];
      turns.forEach((turn, k) => {
        let { spans, tag } = french ? carveIncises(text, turn) : { spans: [turn], tag: undefined as Tag | undefined };
        if (k === turns.length - 1 && closeAt >= 0) tag ??= tagAfter(text, closeAt + style.close.length, language);
        if (k === 0 && openAt >= 0) tag ??= tagBefore(text, openAt, language);
        if (!tag && !continued && closeAt >= 0 && isMention(text.slice(turn.start, turn.end))) return;
        push(spans, "quote", continued && k === 0 && n === 0, k === 0 ? before : null, tag, k > 0);
      });
      continued = false;
      if (closeAt < 0) break;
      i = closeAt + style.close.length;
      narrationStart = i;
    }
  });
  mergeSplitQuotes(speech, paragraphs, language);
  return speech;
}

// English writes one speaker's line as two quotes around a tag:
// "You are uniformly charming," said he, "and I..." The second part has no tag
// of its own; it is the same speech.
function mergeSplitQuotes(speech: Speech[], paragraphs: string[], language: string) {
  if (language.startsWith("fr")) return;
  for (let k = speech.length - 1; k > 0; k--) {
    const a = speech[k - 1], b = speech[k];
    if (a.paragraph !== b.paragraph || b.continued || b.mark !== "quote" || a.mark !== "quote") continue;
    const text = paragraphs[a.paragraph];
    const gap = text.slice(a.spans[a.spans.length - 1].end, b.spans[0].start).replace(/\b(?:Mr|Mrs|Ms|Dr|St|Mme|Mlle|M)\./g, "X");
    // Only a tag (and its punctuation) between the two quotes.
    if (a.tag && gap.length < 90 && !/[.!?]\s*[\u201d"\u2019]?\s*\p{Lu}/u.test(gap.slice(1, -1).replace(/^[\u201d"\u2019]/, ""))) {
      a.spans.push(...b.spans);
      speech.splice(k, 1);
    } else if (!a.tag && b.tag && gap.length < 90 && /^[\u201d"\u2019]?[,\u2014]/.test(gap)) {
      a.spans.push(...b.spans);
      a.tag = b.tag;
      speech.splice(k, 1);
    }
  }
}

/** The words of one piece of speech. */
export function speechText(paragraphs: string[], s: Speech) {
  return s.spans.map((p) => paragraphs[s.paragraph].slice(p.start, p.end)).join(" ").replace(/\s+/g, " ").trim();
}
