import type { Book, Preferences } from "../types";
import { newProduction, type Production, type Take } from "./production";

// Development only: a production made in memory from a library book, so the
// Studio editor can be laid out in a browser, where productions cannot be
// saved. Opened with ?studio-demo in the address. Some lines get a pretend
// take (generated, approved or flagged) and a small cast speaks a few lines.
export const studioDemoWanted = () =>
  import.meta.env.DEV && new URLSearchParams(location.search).has("studio-demo");

export function studioDemo(book: Book, prefs: Preferences): Production {
  const p = newProduction(book, prefs, "demo-narrator");
  const cast = [
    { id: "c1", name: "Edmond", aliases: [], gender: "m" as const, voice: "demo-1", color: "#7aa2f7" },
    { id: "c2", name: "Mercedes", aliases: [], gender: "f" as const, voice: "demo-2", color: "#e0a370" },
    { id: "c3", name: "Fernand", aliases: [], gender: "m" as const, voice: "demo-3", color: "#9ece6a" },
  ];
  const takes: Take[] = [];
  const units = p.units.map((u, i) => {
    const speech = /^[“"«]/.test(u.text);
    const speaker = speech ? cast[i % cast.length].id : undefined;
    const voiced = { ...u, speech: speech ? "s" + i : undefined, speaker, confidence: speech ? (i % 7 === 0 ? 0.5 : 0.9) : undefined };
    if (i > p.units.length * 0.4) return voiced;
    const take: Take = {
      id: "take-" + u.id,
      unit: u.id,
      file: "",
      duration: Math.max(1, u.text.split(/\s+/).length * 0.38),
      seed: 1,
      model: "demo",
      voice: "demo-narrator",
      text: u.text,
      created: Date.now(),
    };
    takes.push(take);
    return { ...voiced, take: take.id, status: i % 3 === 0 ? ("approved" as const) : i % 11 === 5 ? ("failed" as const) : ("rendered" as const) };
  });
  return { info: { ...p.info, cast }, units, takes };
}
