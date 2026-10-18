// Sentences of a text, from the browser's sentence segmenter with its common
// mistakes undone: a title ("Mr.", "Mme.", "Dr."), an initial ("M.", "J. R.")
// or a lowercase word after the full stop does not start a new sentence.

export type SentencePiece = { index: number; segment: string };

const TITLES =
  "Mr|Mrs|Ms|Mx|Messrs|Dr|Drs|Prof|Rev|Revd|Hon|St|Ste|Sts|Sr|Sra|Srta|Sres|Jr|Capt|Cpt|Col|Gen|Lt|Sgt|Cmdr|Adm|Gov|Pres|Mme|Mmes|Mlle|Mlles|Mgr|Mgrs|Pr|Hr|Hrn|Fr|Frl|Sig|Sigg|Dott|Avv|Ing|Prof\\.ssa|Sto|Sta|Gebr|Nr|Vol|Ch|Fig|pp?|vs|cf|ca|approx|al";
const TITLE_END = new RegExp(String.raw`(?:^|[\s(\[\u201c\u2018"'\u00ab])(?:${TITLES})\.\s*$`, "u");
const INITIAL_END = /(?:^|[\s(\u201c\u2018"'\u00ab.])\p{Lu}\.\s*$/u;
const LOWER_START = /^[\s"'\u201c\u2018\u00ab(]*\p{Ll}/u;

export function sentencePieces(text: string): SentencePiece[] {
  const raw = Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(text), (s) => ({ index: s.index, segment: s.segment }));
  const out: SentencePiece[] = [];
  for (const piece of raw) {
    const prev = out[out.length - 1];
    if (prev && (TITLE_END.test(prev.segment) || INITIAL_END.test(prev.segment) || LOWER_START.test(piece.segment))) prev.segment += piece.segment;
    else out.push({ ...piece });
  }
  return out;
}
