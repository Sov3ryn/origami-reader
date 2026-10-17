export const designLanguages = [
  "English",
  "Chinese",
  "Japanese",
  "Korean",
  "French",
  "German",
  "Spanish",
  "Portuguese",
  "Italian",
  "Russian",
] as const;
export type DesignLanguage = (typeof designLanguages)[number];
export type VoiceDesign = {
  name: string;
  prompt: string;
  text: string;
  language: DesignLanguage;
  gender: "female" | "male" | "unspecified";
  accent: string;
  style: string;
  portrait: string;
  temperature: number;
  seed: number;
  count: number;
};
export type VoiceTake = {
  id: string;
  createdAt: number;
  spec: VoiceDesign;
  seed: number;
  duration: number;
  rate: number;
  peaks: number[];
  take: number;
  favorite: boolean;
  notes: string;
  savedVoice: string | null;
};
export type StudioState = {
  installed: boolean;
  busy: boolean;
  previews: VoiceTake[];
};
export const designSamples: Record<DesignLanguage, string> = {
  English:
    'The rain had stopped by the time she reached the old house. A light burned in the upstairs window. "Someone is still awake," she whispered. For the first time that evening, she was not sure whether that was good news.',
  Chinese:
    "她来到老房子的时候，雨已经停了。楼上的窗户里透出一丝灯光。“还有人没睡。”她轻声说道。那天晚上，她第一次不确定，这究竟是不是一个好消息。她把手放在门上，静静地听着屋里的动静。",
  Japanese:
    "古い家に着いたときには、雨はもうやんでいた。二階の窓には明かりがともっている。「まだ誰か起きているのね」と彼女はささやいた。それが良い知らせなのかどうか、その夜初めて彼女には分からなくなった。",
  Korean:
    '그녀가 오래된 집에 도착했을 때는 비가 그쳐 있었다. 이층 창문에서 불빛이 새어 나왔다. "아직 누군가 깨어 있네." 그녀가 속삭였다. 그날 저녁 처음으로, 그것이 좋은 소식인지 확신할 수 없었다.',
  French:
    "La pluie avait cessé lorsqu’elle atteignit la vieille maison. Une lumière brillait à la fenêtre du premier étage. « Quelqu’un est encore réveillé », murmura-t-elle. Pour la première fois de la soirée, elle ne savait plus si c’était une bonne nouvelle.",
  German:
    "Als sie das alte Haus erreichte, hatte der Regen aufgehört. Im oberen Fenster brannte Licht. „Jemand ist noch wach“, flüsterte sie. Zum ersten Mal an diesem Abend war sie sich nicht sicher, ob das eine gute Nachricht war.",
  Spanish:
    "La lluvia había cesado cuando llegó a la vieja casa. Una luz brillaba en la ventana del piso de arriba. «Alguien sigue despierto», susurró. Por primera vez aquella noche, no estaba segura de que fuera una buena noticia.",
  Portuguese:
    'A chuva tinha parado quando ela chegou à velha casa. Uma luz brilhava na janela do andar de cima. "Alguém ainda está acordado", sussurrou. Pela primeira vez naquela noite, ela não tinha certeza de que aquilo era uma boa notícia.',
  Italian:
    "La pioggia era cessata quando raggiunse la vecchia casa. Una luce brillava alla finestra del piano di sopra. «Qualcuno è ancora sveglio», sussurrò. Per la prima volta quella sera, non era sicura che fosse una buona notizia.",
  Russian:
    "Когда она подошла к старому дому, дождь уже закончился. В окне второго этажа горел свет. «Кто-то ещё не спит», прошептала она. Впервые за этот вечер она не была уверена, что это хорошая новость.",
};
export const designPresets = [
  {
    name: "Warm storyteller",
    style: "Narration",
    gender: "female",
    detail:
      "A woman in her thirties with a clearly feminine, warm mezzo-soprano voice. Delicate husk at phrase endings, rounded resonance and natural flowing delivery. Intelligent storytelling, gentle suspense and understated emotion in dialogue.",
  },
  {
    name: "Fireside narrator",
    style: "Narration",
    gender: "male",
    detail:
      "A mature man with a warm baritone voice, gentle grain and relaxed resonance. Intimate audiobook narration with measured pauses, clear diction and restrained character acting. Calm and engaging, never theatrical.",
  },
  {
    name: "Quiet suspense",
    style: "Suspense",
    gender: "female",
    detail:
      "An adult woman with a clearly feminine mid-range voice, softly smoky texture and precise articulation. Controlled suspense, intimate delivery and subtle changes of emotion. Natural speaking pace without whispering.",
  },
  {
    name: "Seasoned scholar",
    style: "Scholarly",
    gender: "male",
    detail:
      "An older man with a weathered, resonant voice and a trace of dry warmth. Thoughtful, articulate narration, unhurried but conversational. Subtle vocal grain and lively curiosity without exaggerated frailty.",
  },
  {
    name: "Bright adventure",
    style: "Adventure",
    gender: "female",
    detail:
      "An adult woman with a clearly feminine, bright and full voice. Confident storytelling, crisp words and an easy smile in the delivery. Lively dialogue and controlled energy suited to long adventure stories.",
  },
  {
    name: "Clear documentary",
    style: "Informative",
    gender: "male",
    detail:
      "An adult man with a clear medium-pitched voice, smooth resonance and light natural texture. Direct, friendly explanations with accurate articulation and comfortable pacing. Engaged and composed, without an advertising tone.",
  },
] as const;
export function presetPrompt(
  index: number,
  language: DesignLanguage,
  accent: string,
) {
  return `${designPresets[index].detail} Speak in ${language}${accent.trim() ? ` with a ${accent.trim()} accent` : ""}. Clean studio speech, no music or background sound.`;
}
export const initialDesign: VoiceDesign = {
  name: "",
  prompt: presetPrompt(0, "English", "British"),
  text: designSamples.English,
  language: "English",
  gender: "female",
  accent: "British",
  style: "Narration",
  portrait: "",
  temperature: 0.7,
  seed: 42,
  count: 2,
};
export function designError(s: VoiceDesign): string {
  if (!designLanguages.includes(s.language))
    return "Choose a supported language.";
  if (s.prompt.trim().length < 20 || s.prompt.length > 2000)
    return "Describe the voice in 20 to 2,000 characters.";
  if (s.text.trim().length < 30 || s.text.length > 600)
    return "Use 30 to 600 characters of sample text.";
  if (!Number.isInteger(s.count) || s.count < 1 || s.count > 3)
    return "Choose one, two or three takes.";
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 2147483646)
    return "Use a seed between 0 and 2147483646.";
  if (
    !Number.isFinite(s.temperature) ||
    s.temperature < 0.3 ||
    s.temperature > 1.2
  )
    return "Variation must be between 0.3 and 1.2.";
  return "";
}
export function readDesignDraft(): VoiceDesign {
  try {
    const value = JSON.parse(
      localStorage.getItem("origami.voice-design.draft") || "null",
    );
    if (
      value &&
      typeof value.prompt === "string" &&
      typeof value.text === "string" &&
      designLanguages.includes(value.language)
    )
      return { ...initialDesign, ...value };
  } catch {
    /* An invalid draft must not prevent opening the studio. */
  }
  return { ...initialDesign };
}

// The guided builder: plain choices that become a voice description, so no
// one has to know how to write a prompt. Values are English because the
// creator model reads English descriptions best, whatever the voice speaks.
export type VoiceBuilder = {
  age: "young adult" | "adult" | "middle-aged" | "older";
  pitch: "low" | "medium" | "high";
  tones: string[];
  pace: "slow" | "natural" | "brisk";
  delivery: "storytelling" | "conversational" | "dramatic" | "documentary" | "soothing";
};
export const builderTones = [
  "warm",
  "calm",
  "bright",
  "gravelly",
  "breathy",
  "crisp",
  "smoky",
  "gentle",
  "rich",
  "playful",
] as const;
export const initialBuilder: VoiceBuilder = {
  age: "adult",
  pitch: "medium",
  tones: ["warm", "calm"],
  pace: "natural",
  delivery: "storytelling",
};
const deliveryText: Record<VoiceBuilder["delivery"], string> = {
  storytelling:
    "Engaging audiobook storytelling with clear diction, gentle suspense and understated emotion in dialogue.",
  conversational:
    "Relaxed, friendly and conversational, as if talking to one listener across a table.",
  dramatic:
    "Expressive, dramatic delivery with vivid character voices, kept controlled and never shouted.",
  documentary:
    "Clear, composed documentary narration with accurate articulation and an even, trustworthy tone.",
  soothing:
    "Soft, soothing bedtime delivery with smooth phrasing and calm, unhurried pauses.",
};
const paceText: Record<VoiceBuilder["pace"], string> = {
  slow: "A slow, measured pace with generous pauses.",
  natural: "A natural reading pace.",
  brisk: "A brisk, lively pace that never sounds rushed.",
};
export function composePrompt(
  b: VoiceBuilder,
  gender: VoiceDesign["gender"],
  language: DesignLanguage,
  accent: string,
): string {
  const person =
    gender === "female" ? "woman" : gender === "male" ? "man" : "person";
  const article = b.age === "adult" || b.age === "older" ? "An" : "A";
  const tones = b.tones.length
    ? b.tones.length === 1
      ? b.tones[0]
      : b.tones.slice(0, -1).join(", ") + " and " + b.tones.at(-1)
    : "clear";
  const feminine = gender === "female" ? " clearly feminine," : gender === "male" ? " clearly masculine," : "";
  return `${article} ${b.age} ${person} with a${feminine} ${b.pitch}-pitched, ${tones} voice. ${deliveryText[b.delivery]} ${paceText[b.pace]} Speak in ${language}${accent.trim() ? ` with a ${accent.trim()} accent` : ""}. Clean studio speech, no music or background sound.`;
}
export const commonAccents = [
  "American",
  "British",
  "Scottish",
  "Irish",
  "Welsh",
  "Australian",
  "Canadian",
  "Southern American",
  "New Zealand",
  "South African",
  "Indian",
  "Neutral",
];
