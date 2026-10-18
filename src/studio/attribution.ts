// Studio: who says each piece of speech, from the book's own cues. Rules come
// first; whatever stays uncertain is left for the language model or the reader.
import type { Speech } from "./dialogue";

export type Character = { id: string; aliases: string[]; gender: "m" | "f" | "?" };
export type Attribution = {
  id: string;
  speaker: string | null;
  confidence: number;
  // What decided it, shown to the reader and used when corrections spread.
  cue: "explicit" | "descriptive" | "anaphoric" | "self" | "continued" | "introduced" | "paragraph" | "beat" | "turn" | "other" | "none";
};

const CURLY = String.fromCharCode(0x2019);
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(CURLY)
    .join("'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const ARTICLE = /^(?:the|le|la|les|l'|un|une)\s*/;
const SKIP = /^(mr|mrs|miss|lady|lord|sir|the|his|her|le|la|les|de|du|des|mme|mlle|monsieur|madame|un|une|autre|other|jeune|young|old|vieux|homme|man|femme|woman)$/;
// "l'autre", "the other": the other person in a two-person exchange.
const OTHER = /^(?:l'autre|the other|celui-ci|celle-ci|ce dernier|cette derniere|the latter)$/;

/** Finds the character a name or description refers to ("Miss Bennet", "the innkeeper"). */
export function aliasIndex(cast: Character[]) {
  const exact = new Map<string, string>();
  const words = new Map<string, Set<string>>();
  for (const c of cast) {
    for (const name of [c.id, ...c.aliases]) {
      const f = fold(name);
      if (!f) continue;
      exact.set(f, c.id);
      exact.set(f.replace(ARTICLE, ""), c.id);
      // Surnames and first names on their own ("Darcy", "Athos").
      for (const w of f.split(/[\s']+/)) {
        if (w.length < 3 || SKIP.test(w)) continue;
        if (!words.has(w)) words.set(w, new Set());
        words.get(w)!.add(c.id);
      }
    }
  }
  return (who: string): string | null => {
    const parts = fold(who).replace(/[,.;:!?]+$/, "").split(" ");
    // Longest first: "le jeune homme exaspere" finds "le jeune homme".
    for (let n = parts.length; n > 0; n--) {
      const f = parts.slice(0, n).join(" ");
      if (OTHER.test(f)) return "?other";
      const hit = exact.get(f) ?? exact.get(f.replace(ARTICLE, ""));
      if (hit) return hit;
    }
    const hits = new Set<string>();
    for (const w of parts.slice(0, 4).join(" ").replace(ARTICLE, "").split(/[\s']+/)) for (const id of words.get(w) || []) hits.add(id);
    return hits.size === 1 ? [...hits][0] : null;
  };
}

/** Characters named in a stretch of narration, in order of appearance. */
export function mentions(text: string, cast: Character[]) {
  const found: { id: string; at: number }[] = [];
  const f = fold(text);
  for (const c of cast) {
    for (const name of [c.id, ...c.aliases]) {
      const n = fold(name);
      if (n.length < 3) continue;
      const re = new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}])`, "gu");
      for (let m = re.exec(f); m; m = re.exec(f)) found.push({ id: c.id, at: m.index });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

// A narration paragraph that hands over to the next one: "Mr. Bennet coolly
// observed:" / "il répéta joyeusement:". Returns the subject it names.
function introducer(text: string, cast: Character[], gender: Map<string, string>, recentNamed: string[]) {
  if (!/[:\u2014\u2013-]\s*$/.test(text)) return null;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const last = sentences[sentences.length - 1];
  const named = mentions(last, cast);
  if (named.length) return { id: named[0].id, confidence: 0.85, cue: "introduced" as const };
  const pron = /\b(he|she|il|elle)\b/i.exec(last);
  if (pron) {
    const g = /^(she|elle)$/i.test(pron[1]) ? "f" : "m";
    const id = [...recentNamed].reverse().find((r) => gender.get(r) === g);
    if (id) return { id, confidence: 0.6, cue: "introduced" as const };
  }
  return null;
}

/** The rules pass. Returns one attribution per piece of speech, in order. */
export function attribute(speech: Speech[], paragraphs: string[], cast: Character[], narrator?: string): Attribution[] {
  const find = aliasIndex(cast);
  const gender = new Map<string, string>(cast.map((c) => [c.id, c.gender]));
  const out: Attribution[] = speech.map((s) => ({ id: s.id, speaker: null, confidence: 0, cue: "none" }));
  const firstOfParagraph = new Map<number, number>();
  speech.forEach((s, k) => firstOfParagraph.has(s.paragraph) || firstOfParagraph.set(s.paragraph, k));
  const narration = paragraphs.map((text, p) => {
    let t = text;
    for (const s of speech) if (s.paragraph === p) for (const span of s.spans) t = t.slice(0, span.start) + " ".repeat(span.end - span.start) + t.slice(span.end);
    return t;
  });
  const named = (p: number, upto?: number) =>
    mentions(narration.slice(Math.max(0, p - 2), p).join(" ") + " " + (upto === undefined ? "" : narration[p].slice(0, upto)), cast).map((m) => m.id);
  // Names used in address inside the speech ("My dear Mr. Bennet, ...").
  const addressed = (k: number) => {
    const s = speech[k];
    return mentions(s.spans.map((span) => paragraphs[s.paragraph].slice(span.start, span.end)).join(" | "), cast).map((m) => m.id);
  };

  // 1. Cues on the speech itself.
  speech.forEach((s, k) => {
    const set = (speaker: string | null, confidence: number, cue: Attribution["cue"]) => {
      if (speaker) out[k] = { id: s.id, speaker, confidence, cue };
    };
    if (s.continued && k > 0) return set(out[k - 1].speaker ?? "?prev", 0.95, "continued");
    if (s.tag?.kind === "name") {
      const who = find(s.tag.who);
      if (who === "?other") return set("?other", 0.8, "other");
      if (who) return set(who, 0.95, /^(?:the|his|her|my|le|la|l'|un|une|son|sa)\b/.test(fold(s.tag.who)) ? "descriptive" : "explicit");
    }
    if (s.tag?.kind === "self" && narrator) return set(narrator, 0.9, "self");
    if (s.tag?.kind === "pronoun" && s.tag.gender) {
      const recent = named(s.paragraph, s.spans[0].start).filter((id) => gender.get(id) === s.tag!.gender);
      if (recent.length) return set(recent[recent.length - 1], 0.6, "anaphoric");
      return set("?pronoun:" + s.tag.gender, 0.3, "anaphoric");
    }
    // Speech handed over by the previous narration paragraph.
    if (firstOfParagraph.get(s.paragraph) === k && s.paragraph > 0 && !speech.some((t) => t.paragraph === s.paragraph - 1)) {
      const intro = introducer(paragraphs[s.paragraph - 1], cast, gender, named(s.paragraph - 1));
      if (intro) return set(intro.id, intro.confidence, intro.cue);
    }
    if (s.before && firstOfParagraph.get(s.paragraph) === k && s.before.end - s.before.start < 300) {
      const beat = mentions(paragraphs[s.paragraph].slice(s.before.start, s.before.end), cast).filter((m) => m.at < 60);
      if (beat.length) return set(beat[0].id, 0.65, "beat");
    }
  });

  // 2. One speaker per paragraph unless a new turn starts inside a quotation.
  speech.forEach((s, k) => {
    const first = firstOfParagraph.get(s.paragraph)!;
    if (first === k || s.turn) return;
    if (out[k].confidence < 0.9 && out[first].confidence >= 0.6) out[k] = { ...out[first], id: s.id, cue: "paragraph", confidence: Math.min(0.9, out[first].confidence) };
    else if (out[first].confidence < 0.6 && out[k].confidence >= 0.85) out[first] = { ...out[k], id: speech[first].id, cue: "paragraph" };
  });

  // 3. Exchanges: consecutive turns of two people answering each other.
  type Turn = { units: number[] };
  const runs: Turn[][] = [];
  let run: Turn[] = [];
  let lastP = -10;
  speech.forEach((s, k) => {
    const between = paragraphs.slice(lastP + 1, s.paragraph).join(" ");
    const sameTurn = s.paragraph === lastP && !s.turn;
    if (!sameTurn && (s.paragraph - lastP > 2 || between.length > 250)) {
      if (run.length) runs.push(run);
      run = [];
    }
    if (sameTurn) run[run.length - 1].units.push(k);
    else run.push({ units: [k] });
    lastP = s.paragraph;
  });
  if (run.length) runs.push(run);
  const speakerOf = (t: Turn) => {
    const best = t.units.map((k) => out[k]).filter((a) => a.speaker && !a.speaker.startsWith("?")).sort((a, b) => b.confidence - a.confidence)[0];
    return best && best.confidence >= 0.6 ? best : null;
  };
  for (const turns of runs) {
    const anchors = turns.map((t, i) => ({ i, a: speakerOf(t) })).filter((x) => x.a && x.a.confidence >= 0.6) as { i: number; a: Attribution }[];
    const people = [...new Set(anchors.map((x) => x.a.speaker!))];
    if (people.length === 1 && turns.length > 1) {
      const counts = new Map<string, number>();
      for (const x of anchors) for (const k of turns[x.i].units) for (const id of addressed(k)) if (id !== people[0]) counts.set(id, (counts.get(id) || 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (top) people.push(top[0]);
    }
    turns.forEach((t, i) => {
      const current = speakerOf(t);
      const before = [...anchors].reverse().find((x) => x.i < i);
      const after = anchors.find((x) => x.i > i);
      let guess: string | null = null;
      let confidence = 0;
      if (people.length === 2) {
        const near = anchors.find((x) => x.i === i) ?? (!before ? after! : !after ? before : i - before.i <= after.i - i ? before : after);
        const other = people.find((p) => p !== near.a.speaker)!;
        guess = (i - near.i) % 2 === 0 ? near.a.speaker : other;
        const consistent = anchors.every((x) => ((x.i - near.i) % 2 === 0) === (x.a.speaker === near.a.speaker));
        confidence = consistent ? 0.8 : 0.5;
      } else if (before && after && before.a.speaker !== after.a.speaker && (after.i - before.i) % 2 === 1) {
        // Between two different anchors with an odd distance, they take turns.
        guess = (i - before.i) % 2 === 0 ? before.a.speaker : after.a.speaker;
        confidence = 0.6;
      } else if (before && i - before.i === 1 && turns[before.i - 1] && speakerOf(turns[before.i - 1])?.speaker !== before.a.speaker) {
        // A reply to the last speaker in a longer exchange.
        const prev = speakerOf(turns[before.i - 1]);
        if (prev) {
          guess = prev.speaker;
          confidence = 0.45;
        }
      }
      for (const k of t.units) {
        const a = out[k];
        if (a.speaker === "?other") {
          // "l'autre": the other one of the two people in the exchange.
          const last = before?.a.speaker;
          const other = people.length === 2 && last ? people.find((p) => p !== last) : null;
          out[k] = { ...a, speaker: other ?? null, confidence: other ? 0.75 : 0 };
          continue;
        }
        if (a.speaker?.startsWith("?pronoun:")) {
          const g = a.speaker.slice(9);
          const match = people.filter((p) => gender.get(p) === g);
          out[k] = match.length === 1 ? { ...a, speaker: match[0], confidence: 0.8 } : { ...a, speaker: guess && gender.get(guess) === g ? guess : null, confidence: guess ? 0.5 : 0 };
          continue;
        }
        if (guess && (!current || current.confidence < confidence) && a.confidence < confidence) out[k] = { id: a.id, speaker: guess, confidence, cue: "turn" };
      }
    });
  }
  speech.forEach((s, k) => {
    if (s.continued && k > 0 && out[k - 1].speaker && !out[k - 1].speaker!.startsWith("?")) out[k] = { ...out[k - 1], id: s.id, cue: "continued", confidence: Math.min(0.95, out[k - 1].confidence + 0.05) };
    const first = firstOfParagraph.get(s.paragraph)!;
    if (first !== k && !s.turn && out[first].speaker && out[k].confidence < 0.9 && out[first].confidence >= out[k].confidence)
      out[k] = { ...out[first], id: s.id, cue: "paragraph" };
  });
  // Placeholders that found nobody.
  return out.map((a) => (a.speaker?.startsWith("?") ? { ...a, speaker: null, confidence: 0 } : a));
}
