import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Download, FileText, LoaderCircle, Mic, Pause, Play, RotateCcw, Square, Trash2, X } from "lucide-react";
import { t } from "../../i18n";
import {
  autoTranscribe,
  base64ToBlob,
  blobToBase64,
  downloadVoiceModel,
  formatDuration,
  onTranscribeProgress,
  onVoiceDownload,
  pickModel,
  savedVoiceLanguage,
  startRecording,
  transcribe,
  voiceAvailable,
  voiceStatus,
  type Recorder,
  type VoiceRecording,
  type VoiceStatus,
} from "./voice";

// What voice note blocks need from Work mode: saving and loading recordings
// for the open note (they follow its vault and workspace).
export type VoiceWorld = {
  save: (recording: Omit<VoiceRecording, "note" | "vault" | "workspace">) => Promise<void>;
  load: (id: string) => Promise<VoiceRecording | null>;
  remove: (id: string) => void;
  notify: (message: string) => void;
};
export const VoiceContext = createContext<VoiceWorld | null>(null);

type Phase = "idle" | "recording" | "saving" | "ready";

function VoiceView({ node, updateAttributes, deleteNode, editor, getPos, selected }: ReactNodeViewProps) {
  const world = useContext(VoiceContext);
  const { id, transcript, duration, language } = node.attrs as { id: string; transcript: string; duration: number; language: string };
  const [phase, setPhase] = useState<Phase>(id ? "ready" : "idle");
  const [url, setUrl] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [working, setWorking] = useState<null | { done: number; total: number }>(null);
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [downloading, setDownloading] = useState<null | number>(null);
  const [editing, setEditing] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const editable = editor.isEditable;

  useEffect(() => {
    void voiceStatus().then(setStatus).catch(() => undefined);
  }, []);
  // The saved recording, loaded when the block is shown.
  useEffect(() => {
    if (!id || !world) return;
    let gone = false;
    let made = "";
    void world.load(id).then((r) => {
      if (gone || !r) return;
      const b = base64ToBlob(r.data, r.mime);
      made = URL.createObjectURL(b);
      setBlob(b);
      setUrl(made);
    });
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, world]);
  // The live timer and level meter while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => {
      setElapsed(recorder.current?.elapsed() || 0);
      setLevel(recorder.current?.level() || 0);
    }, 120);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => () => recorder.current?.cancel(), []);

  const model = pickModel(status);

  async function record() {
    if (!voiceAvailable()) return world?.notify(t("Recording is not available on this computer."));
    try {
      recorder.current = await startRecording();
      setPaused(false);
      setPhase("recording");
    } catch {
      world?.notify(t("Origami could not use the microphone. Check that one is connected and allowed in Windows privacy settings."));
    }
  }
  async function stop() {
    const r = recorder.current;
    if (!r || !world) return;
    recorder.current = null;
    setPhase("saving");
    const { blob: recorded, duration: seconds } = await r.stop();
    const newId = crypto.randomUUID();
    await world.save({ id: newId, kind: "audio", mime: recorded.type || "audio/webm", data: await blobToBase64(recorded), duration: seconds, created: Date.now() });
    updateAttributes({ id: newId, duration: Math.round(seconds) });
    setPhase("ready");
    if (autoTranscribe() && model) void runTranscribe(recorded);
  }
  function cancel() {
    recorder.current?.cancel();
    recorder.current = null;
    deleteNode();
  }
  async function runTranscribe(source = blob) {
    if (!source || !model) return;
    setWorking({ done: 0, total: 1 });
    const off = await onTranscribeProgress(setWorking);
    try {
      const result = await transcribe(source, model, savedVoiceLanguage());
      updateAttributes({ transcript: result.text, language: result.language });
      if (!result.text) world?.notify(t("No speech was found in this recording."));
    } catch (e) {
      world?.notify(String(e).replace(/^Error: /, ""));
    } finally {
      off();
      setWorking(null);
    }
  }
  async function downloadModel() {
    setDownloading(0);
    const off = await onVoiceDownload((p) => p.total && setDownloading(p.received! / p.total));
    try {
      await downloadVoiceModel("small");
      setStatus(await voiceStatus());
    } catch (e) {
      world?.notify(String(e).replace(/^Error: /, ""));
    } finally {
      off();
      setDownloading(null);
    }
  }
  function insertText() {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (pos === undefined || !transcript) return;
    editor.chain().focus().insertContentAt(pos + node.nodeSize, { type: "paragraph", content: [{ type: "text", text: transcript }] }).run();
  }
  function remove() {
    if (id && !window.confirm(t("Delete this voice note and its recording?"))) return;
    if (id) world?.remove(id);
    deleteNode();
  }

  return (
    <NodeViewWrapper className={"voice-block" + (selected ? " selected" : "") + (phase === "recording" ? " recording" : "")} contentEditable={false} data-drag-handle>
      <div className="voice-bar">
        <Mic size={14} />
        <strong>{t("Voice note")}</strong>
        {phase === "ready" && <span className="voice-meta">{formatDuration(duration)}{language ? ` · ${language.toUpperCase()}` : ""}</span>}
        <span className="voice-spacer" />
        {editable && phase === "ready" && (
          <button className="mini quiet" aria-label={t("Delete voice note")} data-tip={t("Delete voice note")} onClick={remove}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {phase === "idle" && (
        <div className="voice-start">
          {editable ? (
            <>
              <button className="primary" onClick={() => void record()}>
                <Mic size={15} />
                {t("Start recording")}
              </button>
              <button className="mini quiet" onClick={deleteNode} aria-label={t("Remove")}>
                <X size={13} />
              </button>
            </>
          ) : (
            <span className="hint">{t("Empty voice note")}</span>
          )}
        </div>
      )}
      {phase === "recording" && (
        <div className="voice-recording">
          <span className="voice-dot" aria-hidden />
          <span className="voice-time" role="timer">{formatDuration(elapsed)}</span>
          <span className="voice-level" aria-hidden>
            <span style={{ width: `${Math.round((paused ? 0 : level) * 100)}%` }} />
          </span>
          <button
            className="mini"
            onClick={() => {
              if (paused) recorder.current?.resume();
              else recorder.current?.pause();
              setPaused(!paused);
            }}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? t("Resume") : t("Pause")}
          </button>
          <button className="mini primary" onClick={() => void stop()}>
            <Square size={12} />
            {t("Stop")}
          </button>
          <button className="mini quiet" onClick={cancel}>
            {t("Cancel")}
          </button>
        </div>
      )}
      {phase === "saving" && (
        <p className="hint">
          <LoaderCircle size={13} className="spin" /> {t("Saving the recording…")}
        </p>
      )}
      {phase === "ready" && (
        <>
          {url ? <audio controls preload="metadata" src={url} /> : id && <p className="hint">{t("The recording is not available (deleted, or in a locked vault).")}</p>}
          {working ? (
            <p className="hint voice-working">
              <LoaderCircle size={13} className="spin" />{" "}
              {working.total > 1
                ? t("Transcribing… part {done} of {total}", { done: Math.min(working.done + 1, working.total), total: working.total })
                : t("Transcribing…")}
            </p>
          ) : editing ? (
            <textarea
              className="voice-transcript-edit"
              defaultValue={transcript}
              autoFocus
              rows={Math.min(12, Math.max(3, Math.ceil((transcript || "").length / 80)))}
              onBlur={(e) => {
                updateAttributes({ transcript: e.target.value.trim() });
                setEditing(false);
              }}
            />
          ) : transcript ? (
            <p className="voice-transcript" onDoubleClick={() => editable && setEditing(true)}>
              {transcript}
            </p>
          ) : null}
          {editable && !working && (
            <div className="voice-actions">
              {model ? (
                <button className="mini" disabled={!blob} onClick={() => void runTranscribe()}>
                  {transcript ? <RotateCcw size={13} /> : <FileText size={13} />}
                  {transcript ? t("Transcribe again") : t("Transcribe")}
                </button>
              ) : downloading !== null ? (
                <span className="hint">{t("Downloading the voice note model… {percent}%", { percent: Math.round(downloading * 100) })}</span>
              ) : status?.runtime ? (
                <button className="mini" onClick={() => void downloadModel()} data-tip={t("Whisper small by OpenAI (MIT), 248 MB, runs on this computer")}>
                  <Download size={13} />
                  {t("Download the model to transcribe")}
                </button>
              ) : null}
              {transcript && (
                <>
                  <button className="mini" onClick={() => setEditing(true)}>
                    {t("Edit text")}
                  </button>
                  <button className="mini" onClick={insertText} data-tip={t("Add the text below as a normal paragraph")}>
                    {t("Insert as text")}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}

// <div data-voice="recording id" data-duration data-language>transcript</div>
export function voiceNote(interactive: boolean) {
  return Node.create({
    name: "voiceNote",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        id: {
          default: "",
          parseHTML: (el) => (el.getAttribute("data-voice") || "").replace(/[^\w-]/g, ""),
          renderHTML: (attrs) => ({ "data-voice": attrs.id }),
        },
        duration: {
          default: 0,
          parseHTML: (el) => Number(el.getAttribute("data-duration")) || 0,
          renderHTML: (attrs) => ({ "data-duration": String(attrs.duration || 0) }),
        },
        language: {
          default: "",
          parseHTML: (el) => (el.getAttribute("data-language") || "").replace(/[^a-z]/g, "").slice(0, 4),
          renderHTML: (attrs) => (attrs.language ? { "data-language": attrs.language } : {}),
        },
        transcript: {
          default: "",
          parseHTML: (el) => (el.textContent || "").trim().slice(0, 100_000),
          renderHTML: () => ({}),
        },
      };
    },
    parseHTML() {
      return [{ tag: "div[data-voice]" }];
    },
    // The transcript is kept as the block's text, so search and exports see it.
    renderHTML({ HTMLAttributes, node }) {
      return ["div", { ...HTMLAttributes, class: "voice-block" }, ["p", {}, node.attrs.transcript || ""]];
    },
    renderText: ({ node }: { node: { attrs: { transcript?: string } } }) => node.attrs.transcript || "",
    renderMarkdown: (node: { attrs?: { transcript?: string; duration?: number } }) =>
      `> Voice note (${formatDuration(node.attrs?.duration || 0)})${node.attrs?.transcript ? ": " + node.attrs.transcript : ""}`,
    ...(interactive ? { addNodeView: () => ReactNodeViewRenderer(VoiceView) } : {}),
  });
}
