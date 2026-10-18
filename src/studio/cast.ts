import { invoke } from "@tauri-apps/api/core";
import { speechUnits } from "../documents";
import { spokenText } from "../spokenText";
import type { Book, Preferences, Voice } from "../types";
import { attribute, type Character } from "./attribution";
import { findSpeech, speechText, type Speech } from "./dialogue";
import type { ProductionUnit } from "./production";

// Studio, phase 2: who speaks. The local analysis model (Ministral 3 through
// llama.cpp) lists the characters passage by passage; the rules attribute
// each piece of speech and the model answers only the lines the rules are not
// sure of (docs/STUDIO-PHASE0.md, section 9). The script is then cut into
// narration and speech so every character can have a voice.

export type CastMember = {
  id: string;
  name: string;
  aliases: string[];
  gender: "m" | "f" | "?";
  voice: string;
  color: string;
  lines?: number;
};
export type AnalysisStatus = { ready: boolean; model?: string; gpu?: boolean; message?: string };
export type Attributed = { speaker: string | null; confidence: number; source: "rules" | "model" | "rules-fallback" | "reader" };

export const analysisStatus = (): Promise<AnalysisStatus> => invoke("studio_analysis_status");
export const stopAnalysis = () => invoke<void>("studio_analysis_stop");
async function chat<T>(system: string, user: string, schema: object, maxTokens = 4000): Promise<T> {
  return JSON.parse(await invoke<string>("studio_analysis_chat", { system, user, schema, maxTokens })) as T;
}

const COLORS = ["#e58fa8", "#7fb3e6", "#8fd19e", "#e6b45c", "#b39ddb", "#4dd0c1", "#f08a5d", "#9ccc65", "#f48fb1", "#64b5f6", "#ffd54f", "#ce93d8"];
export const castColor = (i: number) => COLORS[i % COLORS.length];

// --- The cast list ------------------------------------------------------------------------
type Found = { name: string; aliases: string[]; gender: "male" | "female" | "unknown" | "group"; speaks: boolean };
const APOS = String.fromCharCode(0x2019);
const norm = (s: string) => (s || "").split(APOS).join("'").toLowerCase().replace(/\s+/g, " ").trim();
const ROSTER_SYSTEM =
  "You list the characters who appear or are named in a passage of a novel. Merge different ways of naming the " +
  "same person into one character (full name, first name, surname, title, nickname, or a description used for one " +
  "person such as 'the stranger' or 'his wife'). Keep different people separate. Mark speaks=true if the character " +
  "says anything aloud in the passage. Known characters from earlier passages are listed: reuse their exact name " +
  "when the same person appears. Answer only with JSON.";
const ROSTER_SCHEMA = {
  type: "object",
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          gender: { type: "string", enum: ["male", "female", "unknown", "group"] },
          speaks: { type: "boolean" },
        },
        required: ["name", "aliases", "gender", "speaks"],
      },
    },
  },
  required: ["characters"],
};

/** Adds a passage's characters. Two entries are one person only when a full name
 * matches: a shared surname or a vague description must not join two people. */
export function mergeRoster(roster: Found[], found: Found[]) {
  for (const c of found) {
    const name = norm(c.name);
    if (!name) continue;
    const hit = roster.find((r) => name === norm(r.name) || r.aliases.some((a) => norm(a) === name) || c.aliases.some((a) => norm(a) === norm(r.name)));
    if (hit) {
      hit.aliases = [...new Set([...hit.aliases, ...c.aliases, ...(c.name !== hit.name ? [c.name] : [])])];
      hit.speaks = hit.speaks || c.speaks;
      if (hit.gender === "unknown") hit.gender = c.gender;
    } else roster.push({ ...c, aliases: [...c.aliases] });
  }
  return roster;
}

const PRONOUNS = new Set(["he", "she", "him", "her", "they", "i", "me", "you", "we", "il", "elle", "lui", "ils", "elles", "je", "moi", "on", "nous", "vous"]);
const GENERIC = /^(the|a|an|le|la|l'|un|une|les)\s*(man|woman|girl|boy|lady|gentleman|person|one|other|stranger|servant|homme|femme|fille|personne|autre|inconnu|inconnue)$/i;
// "his wife", "her mother", "sa femme": who they mean depends on the sentence, so they
// are never kept as a character's alias (they once gave a wife's lines to another woman).
const RELATIONAL = /^(his|her|their|my|your|our|its|son|sa|ses|leur|leurs|mon|ma|mes|ton|ta|tes|votre|vos|notre|nos)\s/i;
/** Drops pronouns, long or generic descriptions and aliases two characters share. */
export function cleanRoster(roster: Found[]): Found[] {
  const count = new Map<string, number>();
  for (const c of roster) for (const a of new Set(c.aliases.map(norm))) count.set(a, (count.get(a) || 0) + 1);
  return roster
    .filter((c) => c.gender !== "group" && !PRONOUNS.has(norm(c.name)))
    .map((c) => ({
      ...c,
      aliases: c.aliases.filter((a) => {
        const n = norm(a);
        return !(PRONOUNS.has(n) || RELATIONAL.test(n) || n.split(" ").length > 4 || /^(the one|celui qui|celle qui|the ones)/.test(n) || GENERIC.test(n) || (count.get(n) || 0) > 1 || n === norm(c.name));
      }),
    }));
}

// --- Attribution by the model -----------------------------------------------------------
const ATTRIBUTION_SYSTEM =
  "You attribute quoted speech in novels to characters. You are given a passage with numbered speech units " +
  "marked like [U 12], a cast list with ids, and some answers that are already known. For every unit " +
  "that is not already known, give the id of the character who speaks those words. Use the cues in the text: " +
  "speech tags (said X, dit-il, reprit l'inconnu), who is present, turn-taking in two-person exchanges (speakers " +
  "usually alternate), names used in address (a name inside the quote is usually the listener, not the speaker), " +
  "and action beats next to the quote. If the narrator of a first-person book speaks, answer NARRATOR. If the speaker " +
  "is not in the cast, answer OTHER. Answer only with JSON.";

const SURE = 0.9;
const placeholder = (s: string | null) => !s || s.startsWith("?");

export type Analysis = {
  cast: (Character & { name: string; speaks: boolean })[];
  speech: Speech[];
  speakers: Map<string, Attributed>;
};

/** The whole analysis of a book. `progress` gets a step and a share from 0 to 1. */
export async function analyse(
  paragraphs: string[],
  language: string,
  progress: (step: string, value: number) => void,
  cancelled: () => boolean,
): Promise<Analysis> {
  const speech = findSpeech(paragraphs, language);
  const withSpeech = new Set(speech.map((s) => s.paragraph));
  // 1. The cast, from passages that contain speech.
  const roster: Found[] = [];
  const CHUNK = 60;
  const chunks: number[] = [];
  for (let start = 0; start < paragraphs.length; start += CHUNK) {
    let has = false;
    for (let p = start; p < start + CHUNK && !has; p++) has = withSpeech.has(p);
    if (has) chunks.push(start);
  }
  for (const [i, start] of chunks.entries()) {
    if (cancelled()) throw new Error("cancelled");
    progress("Finding the characters", (i / Math.max(1, chunks.length)) * 0.45);
    const known = roster.map((r) => ({ name: r.name, aliases: r.aliases.slice(0, 6) }));
    const user = "Known characters:\n" + JSON.stringify(known) + "\n\nPassage:\n" + paragraphs.slice(start, start + CHUNK).join("\n\n");
    try {
      const got = await chat<{ characters: Found[] }>(ROSTER_SYSTEM, user, ROSTER_SCHEMA);
      mergeRoster(roster, got.characters);
    } catch (e) {
      if (String(e).includes("not installed")) throw e;
    }
  }
  const cleaned = cleanRoster(roster);
  const cast = cleaned.map((c) => ({
    id: c.name,
    name: c.name,
    aliases: c.aliases,
    gender: (c.gender === "male" ? "m" : c.gender === "female" ? "f" : "?") as Character["gender"],
    speaks: c.speaks,
  }));
  // 2. Rules first.
  const NARRATOR_ID = "~narrator~";
  const rules = attribute(speech, paragraphs, cast, NARRATOR_ID);
  const speakers = new Map<string, Attributed>();
  speech.forEach((s, k) => {
    const r = rules[k];
    speakers.set(s.id, { speaker: placeholder(r.speaker) ? null : r.speaker, confidence: placeholder(r.speaker) ? 0 : r.confidence, source: "rules" });
  });
  // 3. The model answers what the rules are not sure of, 40 paragraphs at a time with 6 before for context.
  const ids = cast.map((_, i) => `C${i + 1}`);
  const back = new Map(cast.map((c, i) => [ids[i], c.id]));
  const castText = cast
    .map((c, i) => `${ids[i]}: ${c.name} (${c.aliases.slice(0, 5).join(", ") || "no aliases"}; ${c.gender === "f" ? "female" : c.gender === "m" ? "male" : "unknown"})`)
    .join("\n");
  const byParagraph = new Map<number, Speech[]>();
  for (const s of speech) byParagraph.set(s.paragraph, [...(byParagraph.get(s.paragraph) || []), s]);
  const STEP = 40;
  const total = Math.ceil(paragraphs.length / STEP);
  for (let start = 0, n = 0; start < paragraphs.length; start += STEP, n++) {
    if (cancelled()) throw new Error("cancelled");
    const end = Math.min(paragraphs.length, start + STEP);
    const target = speech.filter((s) => s.paragraph >= start && s.paragraph < end);
    const ask = target.filter((s) => (speakers.get(s.id)?.confidence || 0) < SURE);
    if (!ask.length || !cast.length) continue;
    progress("Deciding who speaks", 0.45 + (n / Math.max(1, total)) * 0.5);
    const number = new Map(target.map((s, i) => [s.id, String(i + 1)]));
    const lines: string[] = [];
    for (let p = Math.max(0, start - 6); p < end; p++) {
      let text = paragraphs[p];
      if (p >= start)
        for (const s of [...(byParagraph.get(p) || [])].sort((a, b) => b.spans[0].start - a.spans[0].start))
          text = text.slice(0, s.spans[0].start) + `[U ${number.get(s.id)}]` + text.slice(s.spans[0].start);
      lines.push(text);
    }
    const knownText =
      target
        .filter((s) => !ask.includes(s))
        .map((s) => {
          const sp = speakers.get(s.id)!.speaker;
          return `${number.get(s.id)} = ${sp === NARRATOR_ID ? "NARRATOR" : ids[cast.findIndex((c) => c.id === sp)] || "OTHER"}`;
        })
        .join("\n") || "none";
    const askText = ask.map((s) => `${number.get(s.id)}: ${speechText(paragraphs, s).slice(0, 160)}`).join("\n");
    const unitIds = ask.map((s) => number.get(s.id)!);
    const schema = {
      type: "object",
      properties: {
        answers: {
          type: "array",
          minItems: unitIds.length,
          maxItems: unitIds.length,
          items: {
            type: "object",
            properties: {
              id: { type: "string", enum: unitIds },
              speaker: { type: "string", enum: [...ids, "NARRATOR", "OTHER"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["id", "speaker", "confidence"],
          },
        },
      },
      required: ["answers"],
    };
    const user = `Cast:\n${castText}\n\nPassage:\n${lines.join("\n\n")}\n\nAlready known:\n${knownText}\n\nUnits to answer:\n${askText}`;
    try {
      const got = await chat<{ answers: { id: string; speaker: string; confidence: "high" | "medium" | "low" }[] }>(ATTRIBUTION_SYSTEM, user, schema);
      for (const a of got.answers) {
        const s = ask[unitIds.indexOf(a.id)];
        if (!s) continue;
        const speaker = a.speaker === "NARRATOR" ? NARRATOR_ID : back.get(a.speaker) ?? null;
        speakers.set(s.id, { speaker, confidence: { high: 0.9, medium: 0.7, low: 0.4 }[a.confidence], source: "model" });
      }
    } catch (e) {
      if (String(e).includes("not installed")) throw e;
    }
  }
  // 4. Consistency: carried-on speech and further speech in the same paragraph share a speaker.
  const firstInParagraph = new Map<number, Speech>();
  speech.forEach((s, k) => {
    const a = speakers.get(s.id)!;
    if (s.continued && k > 0 && speakers.get(speech[k - 1].id)?.speaker) {
      speakers.set(s.id, { ...speakers.get(speech[k - 1].id)!, source: a.source });
    } else if (firstInParagraph.has(s.paragraph) && !s.turn && a.confidence < SURE) {
      const first = speakers.get(firstInParagraph.get(s.paragraph)!.id)!;
      if (first.speaker) speakers.set(s.id, { ...first, source: a.source });
    }
    if (!firstInParagraph.has(s.paragraph)) firstInParagraph.set(s.paragraph, s);
  });
  // The first-person narrator speaks with the narrator's voice.
  for (const [id, a] of speakers) if (a.speaker === NARRATOR_ID) speakers.set(id, { ...a, speaker: null, confidence: Math.max(a.confidence, 0.9) });
  progress("Done", 1);
  return { cast, speech, speakers };
}

// --- Voices --------------------------------------------------------------------------------
const LANGUAGE_NAMES: Record<string, string> = { en: "english", fr: "french", de: "german", es: "spanish", it: "italian", pt: "portuguese", ru: "russian", ja: "japanese", ko: "korean", zh: "chinese" };

/** A voice for every character: the right gender and language, a different voice for
 * each of the main characters, and never the voice of someone they talk with. */
export function suggestVoices(
  cast: Pick<CastMember, "id" | "gender" | "lines">[],
  voices: Voice[],
  narrator: string,
  language: string,
  talks: Map<string, Set<string>>,
) {
  const lang = LANGUAGE_NAMES[(language || "en").slice(0, 2).toLowerCase()];
  const usable = voices.filter((v) => v.available);
  const chosen = new Map<string, string>();
  const uses = new Map<string, number>();
  const order = [...cast].sort((a, b) => (b.lines || 0) - (a.lines || 0));
  for (const c of order) {
    let best = "";
    let bestScore = -Infinity;
    for (const v of usable) {
      let score = 0;
      if (lang && v.languages.some((l) => l.toLowerCase() === lang)) score += 4;
      const g = v.gender === "female" ? "f" : v.gender === "male" ? "m" : "?";
      if (c.gender !== "?" && g === c.gender) score += 3;
      if (c.gender !== "?" && g !== "?" && g !== c.gender) score -= 4;
      score -= 2.5 * (uses.get(v.id) || 0);
      if (v.id === narrator) score -= (c.lines || 0) > 5 ? 3 : 1;
      for (const other of talks.get(c.id) || []) if (chosen.get(other) === v.id) score -= 6;
      if (score > bestScore) {
        bestScore = score;
        best = v.id;
      }
    }
    if (best) {
      chosen.set(c.id, best);
      uses.set(best, (uses.get(best) || 0) + 1);
    }
  }
  return chosen;
}

/** Who talks with whom: speakers of neighbouring speech, within three paragraphs. */
export function conversations(speech: Speech[], speakers: Map<string, Attributed>) {
  const talks = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (a === b) return;
    talks.set(a, new Set([...(talks.get(a) || []), b]));
    talks.set(b, new Set([...(talks.get(b) || []), a]));
  };
  for (let i = 1; i < speech.length; i++) {
    const a = speakers.get(speech[i - 1].id)?.speaker;
    const b = speakers.get(speech[i].id)?.speaker;
    if (a && b && speech[i].paragraph - speech[i - 1].paragraph <= 3) add(a, b);
  }
  return talks;
}

// --- The script, cut into narration and speech ---------------------------------------------
const TITLE_END = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|Mme|Mlle|Mgr|M|Messrs|Capt|Col|Gen|Rev|Prof)\.$/;
const OPENERS = ["\u201c", "\u00ab", "\u201e", "\u2018", '"'];
const CLOSERS = ["\u201d", "\u00bb", "\u201c", "\u2019", '"'];
const hasWords = (s: string) => /[\p{L}\p{N}]/u.test(s);

/** New units for the whole book: narration for the narrator, speech for its speaker.
 * A unit whose text did not change keeps its id, takes and approval. */
export function castUnits(
  book: Book,
  prefs: Preferences,
  speech: Speech[],
  speakers: Map<string, Attributed>,
  cast: CastMember[],
  old: ProductionUnit[],
): ProductionUnit[] {
  const voiceOf = new Map(cast.map((c) => [c.id, c.voice]));
  const bySpeech = new Map<number, Speech[]>();
  for (const s of speech) bySpeech.set(s.paragraph, [...(bySpeech.get(s.paragraph) || []), s]);
  const oldByParagraph = new Map<number, ProductionUnit[]>();
  for (const u of old) oldByParagraph.set(u.paragraph, [...(oldByParagraph.get(u.paragraph) || []), u]);
  const out: ProductionUnit[] = [];
  book.paragraphs.forEach((p, i) => {
    const segments: { text: string; speech?: Speech }[] = [];
    // A piece of speech keeps its own quotation marks (and the spaces inside guillemets).
    const widen = (span: { start: number; end: number }) => {
      let start = span.start;
      let end = span.end;
      let a = start;
      while (a > 0 && p.text[a - 1] === " ") a--;
      if (a > 0 && OPENERS.includes(p.text[a - 1])) start = a - 1;
      let b = end;
      while (b < p.text.length && p.text[b] === " ") b++;
      if (b < p.text.length && CLOSERS.includes(p.text[b])) end = b + 1;
      return { start, end };
    };
    const spans = (bySpeech.get(i) || [])
      .flatMap((s) => s.spans.map((span) => ({ span: widen(span), s })))
      .sort((a, b) => a.span.start - b.span.start);
    if (p.kind === "heading" || !spans.length) segments.push({ text: p.text });
    else {
      let at = 0;
      for (const { span, s } of spans) {
        if (span.start > at) segments.push({ text: p.text.slice(at, span.start) });
        segments.push({ text: p.text.slice(span.start, span.end), speech: s });
        at = span.end;
      }
      if (at < p.text.length) segments.push({ text: p.text.slice(at) });
    }
    // Punctuation alone (a closing quote, a comma) joins the segment before it.
    const merged: typeof segments = [];
    for (const seg of segments) {
      if (!hasWords(seg.text) && merged.length) merged[merged.length - 1].text += seg.text;
      else if (!hasWords(seg.text)) continue;
      else merged.push({ ...seg });
    }
    const previous = oldByParagraph.get(i) || [];
    let n = 0;
    merged.forEach((seg) => {
      const spoken = spokenText({ ...p, text: seg.text.trim(), spokenEdits: segments.length === 1 ? p.spokenEdits : undefined }, prefs, undefined, book.meta.id);
      const pieces = speechUnits(spoken, 400, prefs.skipSpeechMarkup !== false).map((u) => u.text);
      const joined: string[] = [];
      for (const piece of pieces) {
        if (joined.length && TITLE_END.test(joined[joined.length - 1])) joined[joined.length - 1] += " " + piece;
        else joined.push(piece);
      }
      const who = seg.speech ? speakers.get(seg.speech.id) : undefined;
      for (const text of joined) {
        const same = previous.find((u) => u.text === text || u.original === text);
        const base: ProductionUnit = same
          ? { ...same }
          : { id: `p${i}-v${n}`, chapter: p.chapter, paragraph: i, paragraphId: p.id, heading: p.kind === "heading", text, status: "pending" };
        if (!same && out.some((u) => u.id === base.id)) base.id = `p${i}-v${n}-${out.length}`;
        n++;
        const speaker = who?.speaker || undefined;
        const voice = speaker ? voiceOf.get(speaker) : undefined;
        const unit: ProductionUnit = { ...base, speaker, speech: seg.speech?.id, confidence: seg.speech ? who?.confidence ?? 0 : undefined, voice };
        // A take made with another voice no longer fits.
        if (same && (same.voice || "") !== (voice || "") && same.status !== "approved" && same.take) unit.status = "pending";
        out.push(unit);
      }
    });
  });
  return out;
}

/** How many lines each character speaks. */
export function lineCounts(units: ProductionUnit[]) {
  const counts = new Map<string, number>();
  for (const u of units) if (u.speaker) counts.set(u.speaker, (counts.get(u.speaker) || 0) + 1);
  return counts;
}

// --- A voice for a character, from the book ---------------------------------------------------
const DESIGN_LANGUAGES: Record<string, string> = { en: "English", fr: "French", de: "German", es: "Spanish", it: "Italian", pt: "Portuguese", ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese" };

/** Passages where the book describes or names the character, for the voice description. */
export function passagesAbout(paragraphs: string[], c: Pick<CastMember, "name" | "aliases">, limit = 24) {
  const names = [c.name, ...c.aliases].filter((n) => n.length > 2);
  const hits = paragraphs.filter((p) => names.some((n) => p.includes(n)));
  // The first mentions usually carry the description.
  return hits.slice(0, limit);
}

/** A voice-designer draft for a character: a short description written by the analysis
 * model from the book's own passages, and one of the character's lines to try it on. */
export async function designDraft(c: CastMember, paragraphs: string[], line: string, language: string) {
  const schema = {
    type: "object",
    properties: {
      description: { type: "string", maxLength: 300 },
      gender: { type: "string", enum: ["female", "male", "unspecified"] },
    },
    required: ["description", "gender"],
  };
  const system =
    "You write short voice descriptions for an audiobook voice designer. From the passages of a novel, describe how " +
    "one character's speaking voice should sound: apparent age, pitch, pace, timbre, accent if the book gives one, and " +
    "temperament. One or two sentences in English, no names, no story details. Answer only with JSON.";
  const NL = String.fromCharCode(10);
  const about = passagesAbout(paragraphs, c).join(NL + NL).slice(0, 9000);
  const user = `Character: ${c.name}${c.aliases.length ? " (also " + c.aliases.slice(0, 4).join(", ") + ")" : ""}${NL}${NL}Passages:${NL}${about}`;
  const got = await chat<{ description: string; gender: "female" | "male" | "unspecified" }>(system, user, schema, 400);
  return {
    name: c.name,
    prompt: got.description,
    text: line.slice(0, 300),
    language: DESIGN_LANGUAGES[(language || "en").slice(0, 2).toLowerCase()] || "English",
    gender: got.gender,
  };
}
