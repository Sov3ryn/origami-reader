import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  EyeOff,
  FileText,
  GalleryVerticalEnd,
  Highlighter,
  Link2,
  Network,
  Plus,
  ShieldCheck,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { t } from "../i18n";
import { MathText } from "./FormulaDialog";
import type { Match } from "./text";
import type { LinkBatch, Note, StudyCard } from "./types";

export type DocInfo = {
  id: string;
  kind: "note" | "highlight";
  title: string;
  subtitle: string;
  excerpt: string;
  color?: string;
  bookId?: string;
  paragraphId?: string;
  noteId?: string;
  // Set for notes inside a vault.
  vault?: string;
};
export type LinkedItem = { id: string; title: string; subtitle: string; kind: "note" | "passage"; bookId?: string; paragraphId?: string };

type Tab = "links" | "cards" | "map";

export function Connections({
  note,
  outgoing,
  backlinks,
  suggestions,
  mentions,
  cards,
  batch,
  modelName,
  modelActive,
  indexing,
  onGetModel,
  onOpen,
  onOpenPassage,
  onLink,
  onHide,
  onLinkMentions,
  onLinkForMe,
  onUndoBatch,
  onStudy,
  onAddCard,
}: {
  note: Note;
  outgoing: LinkedItem[];
  backlinks: LinkedItem[];
  suggestions: (Match & { doc: DocInfo })[];
  mentions: { title: string; count: number }[];
  cards: StudyCard[];
  batch?: LinkBatch;
  modelName: string;
  modelActive: boolean;
  // Notes and highlights the model has still to read.
  indexing: number;
  onGetModel: () => void;
  onOpen: (noteId: string) => void;
  onOpenPassage: (bookId: string, paragraphId: string) => void;
  onLink: (doc: DocInfo) => void;
  onHide: (doc: DocInfo) => void;
  onLinkMentions: (title: string) => void;
  onLinkForMe: () => void;
  onUndoBatch: () => void;
  onStudy: () => void;
  onAddCard: () => void;
}) {
  const [tab, setTab] = useState<Tab>("links");
  const [more, setMore] = useState(false);
  const shown = more ? suggestions : suggestions.slice(0, 5);
  const linked = [...outgoing, ...backlinks.filter((b) => !outgoing.some((o) => o.id === b.id))];
  return (
    <aside className="work-connections" aria-label={t("Connections")}>
      <div className="connections-tabs" role="tablist">
        {(
          [
            ["links", t("Links"), <Link2 size={14} />],
            ["cards", t("Cards"), <GalleryVerticalEnd size={14} />],
            ["map", t("Map"), <Network size={14} />],
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {icon}
            {label}
            {id === "cards" && cards.length > 0 && <span className="count">{cards.length}</span>}
          </button>
        ))}
      </div>
      <div className="connections-body">
        {tab === "links" && (
          <>
            <section className="conn-section">
              <h3>
                {t("Linked here")}
                <span className="count">{linked.length}</span>
              </h3>
              {linked.length === 0 && <p className="conn-empty">{t("Type [[ in your note to link another note.")}</p>}
              {linked.map((l) => (
                <button
                  key={l.kind + l.id}
                  className="conn-row linked"
                  onClick={() => (l.kind === "note" ? onOpen(l.id) : onOpenPassage(l.bookId!, l.paragraphId!))}
                >
                  {l.kind === "note" ? <FileText size={14} /> : <BookOpen size={14} />}
                  <span>
                    <strong>{l.title}</strong>
                    <small>{l.subtitle}</small>
                  </span>
                </button>
              ))}
            </section>
            <section className="conn-section">
              <h3>
                {t("Related")}
                <span className="count">{suggestions.length}</span>
              </h3>
              {suggestions.length === 0 && (
                <p className="conn-empty">
                  {note.html.length < 120
                    ? t("Related notes and highlights appear here as you write.")
                    : t("Nothing close yet. Related notes and highlights appear as your library grows.")}
                </p>
              )}
              {shown.map((s) => (
                <Suggestion key={s.id} s={s} vault={note.vault} onOpen={onOpen} onOpenPassage={onOpenPassage} onLink={onLink} onHide={onHide} />
              ))}
              {suggestions.length > 5 && (
                <button className="text-button conn-more" onClick={() => setMore(!more)}>
                  {more ? t("Show fewer") : t("Show {count} more", { count: suggestions.length - 5 })}
                </button>
              )}
            </section>
            {mentions.length > 0 && (
              <section className="conn-section">
                <h3>
                  {t("Mentioned, not linked")}
                  <span className="count">{mentions.length}</span>
                </h3>
                {mentions.map((m) => (
                  <div key={m.title} className="conn-row mention">
                    <FileText size={14} />
                    <span>
                      <strong>{m.title}</strong>
                      <small>{m.count === 1 ? t("Mentioned once") : t("Mentioned {count} times", { count: m.count })}</small>
                    </span>
                    <button className="mini" onClick={() => onLinkMentions(m.title)}>
                      <Link2 size={13} />
                      {t("Link")}
                    </button>
                  </div>
                ))}
              </section>
            )}
            <div className="conn-footer">
              <button className="link-for-me" onClick={onLinkForMe}>
                <Wand2 size={15} />
                {t("Link for me…")}
              </button>
              {batch && (
                <button className="text-button" onClick={onUndoBatch}>
                  <Undo2 size={13} />
                  {t("Undo last batch ({count})", { count: batch.links.reduce((n, l) => n + l.targets.length, 0) })}
                </button>
              )}
              {!modelActive && (
                <button className="model-offer" onClick={onGetModel}>
                  <Sparkles size={14} />
                  <span>
                    <strong>{t("Find links by meaning")}</strong>
                    <small>{t("Add the free Connections model, in English, French and 50 more languages.")}</small>
                  </span>
                </button>
              )}
              <span className="local-chip" title={modelName}>
                <ShieldCheck size={13} />
                {modelActive
                  ? indexing > 0
                    ? t("Reading your notes… {count} left", { count: indexing })
                    : t("On this computer · {model}", { model: modelName.replace(/ Multilingual R2$/, "").replace(/^Granite Embedding /, "Granite ") })
                  : t("On this computer")}
              </span>
            </div>
          </>
        )}
        {tab === "cards" && (
          <section className="conn-section">
            <div className="conn-actions">
              <button onClick={onAddCard}>
                <Plus size={14} />
                {t("Add card")}
              </button>
              <button className="primary" disabled={!cards.length} onClick={onStudy}>
                <Sparkles size={14} />
                {t("Study these")}
              </button>
            </div>
            {cards.length === 0 && (
              <p className="conn-empty">
                {t("Select text and choose Card, or write a line like “Mitochondria :: the cell’s power plant”.")}
              </p>
            )}
            {cards.map((c) => (
              <div key={c.id} className="mini-card">
                <strong>{c.type === "cloze" ? c.front.replace(/\{\{([\s\S]+?)\}\}/g, "[$1]") : c.front.includes("$$") ? <MathText text={c.front} /> : c.front}</strong>
                {c.back && (
                  <span>
                    <MathText text={c.back} />
                  </span>
                )}
                <small>
                  {c.schedule.reps === 0
                    ? t("New")
                    : c.schedule.due <= Date.now()
                      ? t("Due now")
                      : t("Next {date}", { date: new Date(c.schedule.due).toLocaleDateString() })}
                </small>
              </div>
            ))}
          </section>
        )}
        {tab === "map" && (
          <NoteMap note={note} linked={linked} related={suggestions.slice(0, 6)} onOpen={onOpen} onOpenPassage={onOpenPassage} />
        )}
      </div>
    </aside>
  );
}

function Suggestion({
  s,
  vault,
  onOpen,
  onOpenPassage,
  onLink,
  onHide,
}: {
  s: Match & { doc: DocInfo };
  vault?: string;
  onOpen: (id: string) => void;
  onOpenPassage: (bookId: string, paragraphId: string) => void;
  onLink: (doc: DocInfo) => void;
  onHide: (doc: DocInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const d = s.doc;
  return (
    <div className={"suggestion strength-" + s.strength}>
      <button className="suggestion-main" aria-expanded={open} onClick={() => setOpen(!open)}>
        {d.kind === "note" ? <FileText size={14} /> : <Highlighter size={14} style={d.color ? { color: d.color } : undefined} />}
        <span>
          <strong>{d.title}</strong>
          <small>
            {s.shared.length
              ? t("Both mention {words}", { words: s.shared.join(", ") })
              : s.semantic
                ? t("Similar meaning · {source}", { source: d.subtitle })
                : d.subtitle}
          </small>
        </span>
        <span className="strength-dot" title={t(s.strength === "strong" ? "Strong match" : s.strength === "likely" ? "Likely match" : "Loose match")} />
        <ChevronDown size={14} className="chev" />
      </button>
      {open && (
        <div className="suggestion-detail">
          <small>{d.subtitle}</small>
          <p>{d.excerpt}</p>
        </div>
      )}
      <div className="suggestion-actions">
        <button
          className="mini primary"
          disabled={Boolean(d.kind === "note" && d.vault && d.vault !== vault)}
          title={d.kind === "note" && d.vault && d.vault !== vault ? t("This note is in a vault. Linking would copy its title outside the vault.") : undefined}
          onClick={() => onLink(d)}
        >
          <Link2 size={13} />
          {d.kind === "note" ? t("Link") : t("Quote")}
        </button>
        <button
          className="mini"
          onClick={() => (d.kind === "note" ? onOpen(d.noteId || d.id) : onOpenPassage(d.bookId!, d.paragraphId!))}
        >
          <ArrowUpRight size={13} />
          {t("Open")}
        </button>
        <button className="mini quiet" onClick={() => onHide(d)} title={t("Never suggest this pair again")}>
          <EyeOff size={13} />
          {t("Hide")}
        </button>
      </div>
    </div>
  );
}

// A small neighbourhood map: this note in the middle, links around it and
// related items further out.
function NoteMap({
  note,
  linked,
  related,
  onOpen,
  onOpenPassage,
}: {
  note: Note;
  linked: LinkedItem[];
  related: (Match & { doc: DocInfo })[];
  onOpen: (id: string) => void;
  onOpenPassage: (bookId: string, paragraphId: string) => void;
}) {
  const nodes = useMemo(() => {
    const out: { key: string; x: number; y: number; label: string; kind: string; ring: 1 | 2; go: () => void }[] = [];
    const place = (items: { key: string; label: string; kind: string; go: () => void }[], r: number, ring: 1 | 2, offset: number) =>
      items.forEach((it, i) => {
        const a = offset + (i / Math.max(1, items.length)) * Math.PI * 2 - Math.PI / 2;
        out.push({ ...it, ring, x: 150 + Math.cos(a) * r, y: 150 + Math.sin(a) * r });
      });
    place(
      linked.slice(0, 8).map((l) => ({
        key: "l" + l.id,
        label: l.title,
        kind: l.kind,
        go: () => (l.kind === "note" ? onOpen(l.id) : onOpenPassage(l.bookId!, l.paragraphId!)),
      })),
      78,
      1,
      0,
    );
    place(
      related
        .filter((r) => !linked.some((l) => l.id === r.doc.id))
        .map((r) => ({
          key: "r" + r.id,
          label: r.doc.title,
          kind: r.doc.kind,
          go: () => (r.doc.kind === "note" ? onOpen(r.doc.id) : onOpenPassage(r.doc.bookId!, r.doc.paragraphId!)),
        })),
      128,
      2,
      Math.PI / 6,
    );
    return out;
  }, [linked, related, onOpen, onOpenPassage]);
  if (!nodes.length)
    return <p className="conn-empty">{t("Links and related ideas will appear here as a small map.")}</p>;
  return (
    <div className="note-map">
      <svg viewBox="0 0 300 300" role="img" aria-label={t("Map of this note's links")}>
        {nodes.map((n) => (
          <line key={"e" + n.key} x1={150} y1={150} x2={n.x} y2={n.y} className={n.ring === 1 ? "edge linked" : "edge related"} />
        ))}
        <circle cx={150} cy={150} r={13} className="node center" />
        {nodes.map((n) => (
          <g key={n.key} className={"map-node " + n.kind + (n.ring === 2 ? " faint" : "")} onClick={n.go} tabIndex={0} role="button" onKeyDown={(e) => e.key === "Enter" && n.go()}>
            <circle cx={n.x} cy={n.y} r={n.ring === 1 ? 8 : 6} className="node" />
            <text x={n.x} y={n.y + (n.y > 150 ? 20 : -13)} textAnchor="middle">
              {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
            </text>
          </g>
        ))}
      </svg>
      <p className="map-title">{note.title || t("Untitled")}</p>
      <p className="hint">{t("Solid lines are your links. Faint dots are related ideas.")}</p>
    </div>
  );
}
