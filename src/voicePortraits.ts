import type { Voice } from "./types";

export const VOICE_PORTRAIT_SIZE = { width: 256, height: 256 };
// Fictional character art, not an inference of the speaker's actual appearance.
const characters: Record<string, string> = {
  "maeve-crimson-desert":
    "adult woman, wavy auburn hair, freckles, green eyes, leather jacket, determined expression, burgundy backdrop",
  "maeve-part1":
    "adult woman, auburn hair, freckles, green eyes, dark wool sweater, thoughtful expression, plum backdrop",
  "alistair-highland-scholar":
    "elderly man, silver beard, weathered face, tweed jacket, gentle scholarly expression, forest green backdrop",
  "julian-fireside-storyteller":
    "middle-aged man, dark hair touched with silver, neatly trimmed beard, wool cardigan, warm expression, amber backdrop",
  "ronan-irish-charm":
    "adult man, tousled brown hair, light stubble, linen shirt, relaxed smile, teal backdrop",
  "vivienne-london-velvet":
    "adult woman, short dark bob, tailored charcoal jacket, confident expression, smoky blue backdrop",
  "evelyn-amber-poise":
    "middle-aged woman, chestnut hair, cream blouse, calm poised expression, warm amber backdrop",
  "eira-northern-ember":
    "middle-aged woman, silver-blonde hair, blue wool sweater, warm expression, cool slate backdrop",
  "isabel-madrid-fireside":
    "adult woman, wavy chestnut hair, rust wool cardigan, welcoming smile, terracotta backdrop",
  "mateo-madrid-fireside":
    "adult man, dark curly hair, short beard, brown linen shirt, gentle expression, warm copper backdrop",
  "lucia-seda-medianoche":
    "adult woman, long dark hair, high-neck navy blouse, thoughtful expression, midnight blue backdrop",
};

export function voicePortraitPrompt(voice: Voice): string {
  if (voice.portraitPrompt) return voice.portraitPrompt;
  if (voice.portraitAppearance?.trim())
    return voice.portraitAppearance.trim().slice(0, 1400);
  if (characters[voice.id]) return characters[voice.id];
  let hash = 0;
  for (const char of voice.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const backgrounds = [
    "plum",
    "slate blue",
    "forest green",
    "warm amber",
    "teal",
    "burgundy",
  ];
  const hair = [
    "wavy brown",
    "short dark",
    "silver",
    "auburn",
    "curly chestnut",
  ];
  const subject =
    voice.gender === "female"
      ? "adult woman"
      : voice.gender === "male"
        ? "adult man"
        : "adult person";
  const styles = voice.styles.map((s) => s.toLocaleLowerCase());
  const expression =
    styles.includes("expressive") || styles.includes("character")
      ? "lively expression"
      : styles.includes("warm") || styles.includes("conversational")
        ? "welcoming smile"
        : "thoughtful expression";
  return `${subject}, ${hair[hash % hair.length]} hair, wool jacket, ${expression}, ${backgrounds[hash % backgrounds.length]} backdrop`;
}
