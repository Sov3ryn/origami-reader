import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, ImageUp, Sparkles, SquareDashed, Trash2, X } from "lucide-react";
import { t } from "../i18n";
import { fitMask, loadPicture, MAX_MASKS, maskFrom, maskOrder, type Mask, type PictureSet } from "./pictures";
import type { StudyCard, Subject } from "./types";

// The picture sets the study screens can draw from.
export const PictureContext = createContext<Map<string, PictureSet>>(new Map());

// A picture card while studying: the asked box is marked, the others are
// hidden or left visible depending on the set.
export function PictureFace({ card, revealed }: { card: StudyCard; revealed: boolean }) {
  const set = useContext(PictureContext).get(card.picture?.set || "");
  if (!set?.image) return <p className="hint">{t("This picture is not available (deleted, or in a locked vault).")}</p>;
  const order = maskOrder(set.masks);
  return (
    <div className="picture-face" style={{ aspectRatio: `${set.width} / ${set.height}`, width: `min(100%, calc(62vh * ${set.width / set.height}))` }}>
      <img src={set.image} alt={set.title} draggable={false} />
      {order.map((m) => {
        const target = m.id === card.picture?.mask;
        if (!target && set.hide === "one") return null;
        return (
          <span
            key={m.id}
            className={"picture-mask" + (target ? " target" : "") + (target && revealed ? " revealed" : "")}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
          >
            {target && (revealed ? m.label && <b>{m.label}</b> : "?")}
          </span>
        );
      })}
    </div>
  );
}

type Drag =
  | { kind: "new"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "move"; id: string; from: { x: number; y: number }; start: Mask }
  | { kind: "size"; id: string; from: { x: number; y: number }; start: Mask };

// The editor for one set: the picture, boxes drawn over it, and the answers.
export function PicturePage({
  set,
  subjects,
  cardCount,
  onChange,
  onDelete,
  onStudy,
  onBack,
  fail,
}: {
  set: PictureSet;
  subjects: Subject[];
  cardCount: number;
  onChange: (patch: Partial<PictureSet>) => void;
  onDelete: () => void;
  onStudy: () => void;
  onBack: () => void;
  fail: (e: unknown) => void;
}) {
  // Edits stay here and are saved shortly after the last change, so typing a
  // label does not rewrite the picture on every key.
  const [draft, setDraft] = useState(set);
  const pending = useRef<Partial<PictureSet>>({});
  const timer = useRef<number | undefined>(undefined);
  const flush = useRef(() => {});
  flush.current = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const p = pending.current;
    pending.current = {};
    if (Object.keys(p).length) onChange(p);
  };
  useEffect(() => () => flush.current(), []);
  function edit(patch: Partial<PictureSet>, now = false) {
    setDraft((d) => ({ ...d, ...patch }));
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    if (now) flush.current();
    else timer.current = window.setTimeout(() => flush.current(), 600);
  }
  const setMasks = (masks: Mask[], now = false) => edit({ masks }, now);

  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const labels = useRef(new Map<string, HTMLInputElement>());
  const order = maskOrder(draft.masks);
  const numberOf = new Map(order.map((m, i) => [m.id, i + 1]));

  async function choose(file: Blob | undefined | null) {
    if (!file) return;
    setBusy(true);
    try {
      const pic = await loadPicture(file);
      // A new picture keeps the boxes only when it has the same shape.
      const same = draft.width && Math.abs(pic.width / pic.height - draft.width / draft.height) < 0.01;
      if (!same && draft.masks.length && !window.confirm(t("The new picture has another shape, so its {count} boxes and their cards will be removed. Replace the picture?", { count: draft.masks.length })))
        return;
      edit({ ...pic, masks: same ? draft.masks : [] }, true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  // Pasting a picture works on this page only (or with nothing focused),
  // not while typing or working elsewhere.
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!set.image && (!document.activeElement || document.activeElement === document.body || !document.activeElement.closest("input,textarea,select,[contenteditable]")))
      page.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    function paste(e: ClipboardEvent) {
      const target = e.target as HTMLElement;
      if (target !== document.body && !page.current?.contains(target)) return;
      if (target.closest("input,textarea")) return;
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void choose(file);
      }
    }
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  const at = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  function down(e: React.PointerEvent) {
    if (e.button !== 0 || !stage.current) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-mask]");
    const p = at(e);
    stage.current.setPointerCapture(e.pointerId);
    if (target) {
      const m = draft.masks.find((x) => x.id === target.dataset.mask);
      if (!m) return;
      setSelected(m.id);
      setDrag({ kind: (e.target as HTMLElement).classList.contains("picture-handle") ? "size" : "move", id: m.id, from: p, start: m });
    } else {
      if (draft.masks.length >= MAX_MASKS) return;
      setSelected(null);
      setDrag({ kind: "new", from: p, to: p });
    }
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const p = at(e);
    if (drag.kind === "new") return setDrag({ ...drag, to: p });
    const dx = p.x - drag.from.x;
    const dy = p.y - drag.from.y;
    const s = drag.start;
    const next = drag.kind === "move" ? fitMask({ ...s, x: s.x + dx, y: s.y + dy }) : fitMask({ ...s, w: Math.min(1 - s.x, s.w + dx), h: Math.min(1 - s.y, s.h + dy) });
    setDraft((d) => ({ ...d, masks: d.masks.map((m) => (m.id === s.id ? next : m)) }));
  }
  function up() {
    if (!drag) return;
    if (drag.kind === "new") {
      const m = maskFrom(drag.from, drag.to);
      // A click without a drag only clears the selection.
      if (Math.abs(drag.to.x - drag.from.x) > 0.008 && Math.abs(drag.to.y - drag.from.y) > 0.008) {
        setMasks([...draft.masks, m], true);
        setSelected(m.id);
        window.setTimeout(() => labels.current.get(m.id)?.focus(), 0);
      }
    } else setMasks(draft.masks, true);
    setDrag(null);
  }
  function remove(id: string) {
    setMasks(
      draft.masks.filter((m) => m.id !== id),
      true,
    );
    if (selected === id) setSelected(null);
  }
  function key(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input,textarea,select")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      remove(selected);
    }
    if (e.key === "Escape") setSelected(null);
  }

  const preview = drag?.kind === "new" ? maskFrom(drag.from, drag.to, "new") : null;
  const unlabelled = draft.masks.filter((m) => !m.label.trim()).length;
  return (
    <section className="work-page picture-page" ref={page} onKeyDown={key} tabIndex={-1}>
      <header className="work-page-head">
        <div className="picture-title">
          <button className="text-button" onClick={onBack}>
            <ArrowLeft size={14} />
            {t("Study cards")}
          </button>
          <input
            className="picture-name"
            value={draft.title}
            placeholder={t("What the picture shows, for example: Parts of the heart")}
            aria-label={t("Title")}
            maxLength={140}
            onChange={(e) => edit({ title: e.target.value })}
          />
        </div>
        <div className="work-page-actions">
          <button onClick={() => fileInput.current?.click()} disabled={busy}>
            <ImageUp size={15} />
            {draft.image ? t("Replace the picture") : t("Choose a picture")}
          </button>
          <button className="primary" disabled={!cardCount} onClick={() => {
            flush.current();
            onStudy();
          }}>
            <Sparkles size={15} />
            {t("Study {count}", { count: cardCount })}
          </button>
          <button className="quiet" aria-label={t("Delete these picture cards")} data-tip={t("Delete these picture cards")} onClick={() => window.confirm(t("Delete this picture and its cards?")) && onDelete()}>
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/bmp"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="picture-options">
        <div className="segmented" role="radiogroup" aria-label={t("While studying")}>
          <button role="radio" aria-checked={draft.hide === "all"} className={draft.hide === "all" ? "active" : ""} onClick={() => edit({ hide: "all" }, true)} data-tip={t("Every box is covered and the one asked is marked")}>
            {t("Hide all, ask one")}
          </button>
          <button role="radio" aria-checked={draft.hide === "one"} className={draft.hide === "one" ? "active" : ""} onClick={() => edit({ hide: "one" }, true)} data-tip={t("Only the box asked is covered")}>
            {t("Hide one at a time")}
          </button>
        </div>
        {subjects.length > 0 && (
          <select aria-label={t("Subject")} value={draft.subjectId || ""} onChange={(e) => edit({ subjectId: e.target.value || undefined }, true)}>
            <option value="">{t("No subject")}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!draft.image ? (
        <div
          className="picture-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void choose([...e.dataTransfer.files].find((f) => f.type.startsWith("image/")));
          }}
        >
          <ImagePlus size={34} />
          <strong>{t("Add a diagram, map or photo")}</strong>
          <p>{t("Drop a picture here, paste one with Ctrl+V, or choose a file. Then drag boxes over the parts to learn.")}</p>
          <button className="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {t("Choose a picture")}
          </button>
        </div>
      ) : (
        <div className="picture-editor">
          <div className="picture-stage-wrap">
            <div
              ref={stage}
              className="picture-stage"
              style={{ aspectRatio: `${draft.width} / ${draft.height}`, width: `min(100%, calc(72vh * ${draft.width / draft.height}))` }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => setDrag(null)}
            >
              <img src={draft.image} alt={draft.title} draggable={false} />
              {[...draft.masks, ...(preview ? [preview] : [])].map((m) => (
                <span
                  key={m.id}
                  data-mask={m.id === "new" ? undefined : m.id}
                  className={"picture-mask edit" + (selected === m.id ? " selected" : "") + (m.id === "new" ? " drawing" : "")}
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
                >
                  {m.id !== "new" && <i>{numberOf.get(m.id)}</i>}
                  {m.id !== "new" && <span className="picture-handle" aria-hidden />}
                </span>
              ))}
            </div>
            <p className="hint">{t("Drag over a part to cover it. Drag a box to move it, its corner to resize it; Delete removes the selected box.")}</p>
          </div>
          <aside className="picture-list" aria-label={t("Boxes")}>
            <h3>
              <SquareDashed size={15} />
              {t("{count} boxes", { count: draft.masks.length })}
            </h3>
            {!order.length && <p className="hint">{t("Each box becomes a card. Write what it hides: that is the answer.")}</p>}
            {order.map((m) => (
              <label key={m.id} className={"picture-row" + (selected === m.id ? " selected" : "")} onFocus={() => setSelected(m.id)}>
                <i>{numberOf.get(m.id)}</i>
                <input
                  ref={(el) => {
                    if (el) labels.current.set(m.id, el);
                    else labels.current.delete(m.id);
                  }}
                  value={m.label}
                  placeholder={t("Answer")}
                  maxLength={200}
                  onChange={(e) => setMasks(draft.masks.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const i = order.findIndex((x) => x.id === m.id);
                      labels.current.get(order[i + 1]?.id || "")?.focus();
                    }
                  }}
                />
                <button className="icon-only mini" aria-label={t("Remove box")} onClick={() => remove(m.id)}>
                  <X size={13} />
                </button>
              </label>
            ))}
            {unlabelled > 0 && <p className="hint">{t("Boxes without an answer are still asked; you check yourself against the picture.")}</p>}
          </aside>
        </div>
      )}
    </section>
  );
}
