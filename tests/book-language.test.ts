import { describe, expect, it } from "vitest";
import {
  detectBookLanguage,
  detectLanguage,
  languageFlag,
} from "../src/bookLanguage";

const samples: Record<string, string> = {
  en: "The old man walked to the harbour with his dog, and it was clear that he had not slept. He looked at the boats for a long time but said nothing.",
  fr: "Le vieil homme marchait vers le port avec son chien, et il était clair qu'il ne dormait pas. Il regardait les bateaux dans la brume mais ne disait rien.",
  es: "El viejo caminaba hacia el puerto con su perro, y era claro que no había dormido. Miraba los barcos por mucho tiempo pero no decía nada a nadie.",
  de: "Der alte Mann ging mit seinem Hund zum Hafen, und es war klar, dass er nicht geschlafen hatte. Er sah die Boote lange an, sagte aber nichts.",
  it: "Il vecchio camminava verso il porto con il suo cane, ed era chiaro che non aveva dormito. Guardava le barche per molto tempo ma non diceva niente.",
  pt: "O velho caminhava para o porto com o seu cão, e era claro que não tinha dormido. Olhava os barcos durante muito tempo mas não dizia nada.",
  nl: "De oude man liep met zijn hond naar de haven, en het was duidelijk dat hij niet had geslapen. Hij keek lang naar de boten maar zei niets.",
  pl: "Stary człowiek szedł do portu ze swoim psem i było jasne, że nie spał. Patrzył na łodzie bardzo długo, ale nic nie mówił, jak zawsze.",
  tr: "Yaşlı adam köpeğiyle limana yürüdü ve uyumadığı çok açıktı. Teknelere uzun süre baktı ama bir şey söylemedi, sadece bekledi ve düşündü.",
  id: "Orang tua itu berjalan ke pelabuhan dengan anjingnya, dan jelas bahwa dia tidak tidur. Dia melihat perahu itu dalam waktu yang lama.",
  vi: "Ông lão đi bộ ra bến cảng cùng con chó của mình, và rõ ràng là ông đã không ngủ. Ông nhìn những chiếc thuyền rất lâu nhưng không nói gì.",
  ru: "Старик шёл к гавани со своей собакой, и было ясно, что он не спал. Он долго смотрел на лодки, но ничего не говорил и только молчал.",
  uk: "Старий ішов до гавані зі своїм собакою, і було ясно, що він не спав. Він довго дивився на човни, але нічого не казав і тільки мовчав.",
  ko: "노인은 개와 함께 항구로 걸어갔고, 그가 잠을 자지 않았다는 것은 분명했다. 그는 오랫동안 배들을 바라보았지만 아무 말도 하지 않았다.",
  ja: "老人は犬と一緒に港へ歩いていった。彼が眠っていないことは明らかだった。彼は長い間船を見つめていたが、何も言わなかった。",
  zh: "老人带着他的狗走向港口，很明显他一夜没有睡觉。他看着那些船看了很久，但是什么也没有说，只是静静地站在那里。",
  ar: "مشى الرجل العجوز إلى الميناء مع كلبه، وكان من الواضح أنه لم ينم. نظر إلى القوارب لفترة طويلة لكنه لم يقل شيئا.",
  hi: "बूढ़ा आदमी अपने कुत्ते के साथ बंदरगाह की ओर चला, और साफ़ था कि वह सोया नहीं था। वह बहुत देर तक नावों को देखता रहा।",
  th: "ชายชราเดินไปที่ท่าเรือกับสุนัขของเขา และเห็นได้ชัดว่าเขาไม่ได้นอน เขามองดูเรือเป็นเวลานานแต่ไม่ได้พูดอะไรเลย",
};

describe("book language", () => {
  for (const [code, text] of Object.entries(samples))
    it(`recognizes ${code}`, () => {
      expect(detectLanguage(text)).toBe(code);
    });

  it("gives up on text that is too short or unclear", () => {
    expect(detectLanguage("OK")).toBe("");
    expect(detectLanguage("1234 5678 ---- ....")).toBe("");
  });

  it("samples across the book so a foreign preface does not decide", () => {
    const paragraphs = [
      { text: samples.fr },
      ...Array.from({ length: 50 }, () => ({ text: samples.en })),
    ];
    expect(detectBookLanguage(paragraphs)).toBe("en");
  });

  it("maps languages to the bundled flags", () => {
    expect(languageFlag("pt")).toBe("br");
    expect(languageFlag("uk")).toBe("ua");
    expect(languageFlag("la")).toBe("");
  });
});
