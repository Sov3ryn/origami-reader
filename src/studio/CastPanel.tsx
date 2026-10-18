import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Mic2, Play, Sparkles, Square, Users, Wand2 } from "lucide-react";
import { t } from "../i18n";
import * as store from "../storage";
import type { Voice } from "../types";
import { analysisStatus, MOODS, type AnalysisStatus, type CastMember } from "./cast";
import type { Production } from "./production";
import { StudioSetup } from "./StudioSetup";

// The cast: every character with their colour, lines and voice. Analyse finds
// the characters and who says each line; voices can be changed, auditioned on
// the character's own lines, and duplicate entries merged.
export function CastPanel({
  production,
  voices,
  busy,
  progress,
  onAnalyse,
  onVoice,
  onMerge,
  onDesign,
  onMood,
  script,
}: {
  script?: boolean;
  onDesign: (character: CastMember) => void;
  onMood: (character: CastMember, mood: string) => void;
  production: Production;
  voices: Voice[];
  busy: boolean;
  progress: string;
  onAnalyse: () => void;
  onVoice: (character: string, voice: string) => void;
  onMerge: (from: string, into: string) => void;
}) {
  const { info, units } = production;
  const cast = info.cast || [];
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [open, setOpen] = useState("");
  const [listening, setListening] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    void analysisStatus().then(setStatus).catch(() => setStatus({ ready: false }));
    return () => audio.current?.pause();
  }, []);
  const lines = (id: string) => units.filter((u) => u.speaker === id).length;
  const narration = units.filter((u) => !u.speaker).length;
  const uncertain = units.filter((u) => u.speech && (u.confidence ?? 1) < 0.7).length;

  async function listen(c: CastMember | null) {
    const key = c?.id ?? "narrator";
    audio.current?.pause();
    if (listening === key) return setListening("");
    const sample = units.find((u) => (c ? u.speaker === c.id : !u.speaker && !u.heading) && u.text.length > 25) || units.find((u) => (c ? u.speaker === c.id : !u.speaker));
    if (!sample) return;
    setListening(key);
    try {
      const result = await store.synthesize(sample.text.slice(0, 300), c?.voice || info.voice);
      const a = new Audio("data:audio/wav;base64," + result.audio);
      audio.current = a;
      a.onended = () => setListening("");
      await a.play();
    } catch {
      setListening("");
    }
  }
  const voiceSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {!voices.some((v) => v.id === value) && <option value={value}>{value}</option>}
      {voices.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="studio-cast">
      <div className="studio-cast-head">
        {info.analysis ? (
          <p className="studio-hint">
            {t("{n} characters, {speech} spoken lines.", { n: String(cast.length), speech: String(info.analysis.speech) })}{" "}
            {uncertain > 0 && t("{n} lines need a check.", { n: String(uncertain) })}
          </p>
        ) : (
          <p className="studio-hint">{t("Find the characters and who says each line, so every character can have a voice.")}</p>
        )}
        {script && <p className="studio-hint">{t("This book is a script: the speakers come from its labels, and the labels are not read.")}</p>}
        {busy ? (
          <>
            <button onClick={onAnalyse} data-tip={t("Stop the analysis")}>
              <Square size={14} /> {t("Stop")}
            </button>
            <p className="studio-hint small" role="status">
              {progress || t("Analysing")}
            </p>
          </>
        ) : (
          <button className={info.analysis ? "" : "primary"} onClick={onAnalyse} disabled={!status?.ready && !script}>
            <Sparkles size={14} /> {info.analysis ? t("Analyse again") : t("Find the characters")}
          </button>
        )}
        {status && !status.ready && !script && (
          <>
            <p className="studio-warn">{t("The analysis model is not installed on this computer.")}</p>
            <StudioSetup only={["analysis"]} onChange={() => void analysisStatus().then(setStatus).catch(() => undefined)} />
          </>
        )}
        {status?.ready && !busy && <p className="studio-hint small">{t("Runs on this computer ({model}). A novel takes a few minutes with a graphics card.", { model: status.model || "" })}</p>}
      </div>
      <ul className="studio-cast-list">
        <li className="studio-cast-row narrator">
          <div className="studio-cast-main">
            <span className="studio-swatch" style={{ background: "var(--muted)" }} aria-hidden="true" />
            <span className="studio-cast-name">
              <strong>{t("Narrator")}</strong>
              <small>{t("{n} lines", { n: String(narration) })}</small>
            </span>
            <button className="icon-only" onClick={() => void listen(null)} aria-label={t("Listen")} data-tip={t("Listen")}>
              {listening === "narrator" ? <Square size={13} /> : <Play size={13} />}
            </button>
          </div>
        </li>
        {[...cast]
          .sort((a, b) => lines(b.id) - lines(a.id))
          .map((c) => (
            <li key={c.id} className="studio-cast-row">
              <div className="studio-cast-main">
                <button className="icon-only plain" onClick={() => setOpen(open === c.id ? "" : c.id)} aria-expanded={open === c.id} aria-label={t("Details")}>
                  {open === c.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className="studio-swatch" style={{ background: c.color }} aria-hidden="true" />
                <span className="studio-cast-name">
                  <strong>{c.name}</strong>
                  <small>
                    {t("{n} lines", { n: String(lines(c.id)) })}
                    {c.gender !== "?" ? " · " + (c.gender === "f" ? t("female") : t("male")) : ""}
                  </small>
                </span>
                <button className="icon-only" onClick={() => void listen(c)} aria-label={t("Listen to {name}", { name: c.name })} data-tip={t("Listen")} disabled={!lines(c.id)}>
                  {listening === c.id ? <Square size={13} /> : <Play size={13} />}
                </button>
              </div>
              <label className="studio-cast-voice">
                <Mic2 size={13} />
                {voiceSelect(c.voice, (v) => onVoice(c.id, v), t("Voice of {name}", { name: c.name }))}
              </label>
              {open === c.id && (
                <div className="studio-cast-more">
                  {c.aliases.length > 0 && (
                    <p className="studio-hint small">
                      {t("Also called")} {c.aliases.slice(0, 8).join(", ")}
                    </p>
                  )}
                  <button onClick={() => onDesign(c)} disabled={busy || !status?.ready}>
                    <Wand2 size={13} /> {t("Design a voice from the book")}
                  </button>
                  <label className="studio-field">
                    <span>{t("Make a mood version of this voice")}</span>
                    <select value="" onChange={(e) => e.target.value && onMood(c, e.target.value)} disabled={busy}>
                      <option value="">{t("Choose a mood")}</option>
                      {MOODS.map(([id, label]) => (
                        <option key={id} value={id}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                    <small className="muted">{t("Opens the voice designer with this voice's description and one of the character's lines. A mood version is a new voice close to this one: listen before saving it, then choose it for the lines that need it.")}</small>
                  </label>
                  <label className="studio-field">
                    <span>{t("Same person as")}</span>
                    <select value="" onChange={(e) => e.target.value && onMerge(c.id, e.target.value)}>
                      <option value="">{t("Choose to merge")}</option>
                      {cast
                        .filter((o) => o.id !== c.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              )}
            </li>
          ))}
      </ul>
      {!cast.length && info.analysis && (
        <p className="studio-hint">
          <Users size={13} /> {t("No speaking characters were found.")}
        </p>
      )}
    </div>
  );
}
