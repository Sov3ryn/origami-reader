import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText, Link2, LoaderCircle, Wand2, X } from "lucide-react";
import { useModal } from "../components/useModal";
import { t } from "../i18n";
import type { Match } from "./text";
import type { Note } from "./types";

export type Proposal = Match & { from: Note; to: Note; key: string; reason?: string };
export type LinkScope = "note" | "subject" | "all";
type Filter = "strong" | "likely" | "all";

// Automatic linking, always reviewed first: the reader sees every proposed
// link, unticks what they do not want, and confirms. Nothing changes before.
export function LinkForMe({
  hasSubject,
  propose,
  onConfirm,
  onClose,
}: {
  hasSubject: boolean;
  propose: (scope: LinkScope) => Proposal[];
  onConfirm: (accepted: Proposal[], rejected: Proposal[]) => Promise<void>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<LinkScope | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("likely");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const scrim = useRef<HTMLDivElement>(null);
  useModal(scrim);
  // Escape closes, except while links are being added.
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, onClose]);

  function start(s: LinkScope) {
    setScope(s);
    const list = propose(s);
    setProposals(list);
    setTicked(new Set(list.filter((p) => p.strength !== "weak").map((p) => p.key)));
  }
  function applyFilter(f: Filter) {
    setFilter(f);
    setTicked(
      new Set(
        proposals
          .filter((p) => f === "all" || p.strength === "strong" || (f === "likely" && p.strength === "likely"))
          .map((p) => p.key),
      ),
    );
  }
  const groups = useMemo(() => {
    const m = new Map<string, Proposal[]>();
    for (const p of proposals) m.set(p.from.id, [...(m.get(p.from.id) || []), p]);
    return [...m.values()];
  }, [proposals]);
  const count = ticked.size;
  const notes = new Set(proposals.filter((p) => ticked.has(p.key)).map((p) => p.from.id)).size;

  return (
    <div ref={scrim} className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="link-for-me-title" className="quick-dialog link-for-me-dialog">
        <header className="lfm-head">
          <Wand2 size={18} />
          <h2 id="link-for-me-title">{t("Link for me")}</h2>
          <button className="icon-only" aria-label={t("Close")} disabled={busy} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {!scope ? (
          <>
            <p>{t("Origami looks for notes that belong together. You review every link before anything changes.")}</p>
            <div className="lfm-scopes">
              <button onClick={() => start("note")}>
                <strong>{t("This note")}</strong>
                <small>{t("Links between this note and the rest")}</small>
              </button>
              <button disabled={!hasSubject} onClick={() => start("subject")}>
                <strong>{t("This subject")}</strong>
                <small>{t("Every note in the same subject")}</small>
              </button>
              <button onClick={() => start("all")}>
                <strong>{t("All my notes")}</strong>
                <small>{t("Can take a moment with many notes")}</small>
              </button>
            </div>
          </>
        ) : proposals.length === 0 ? (
          <div className="lfm-empty">
            <p>{t("No new links to suggest. Your notes are already well connected, or need a little more writing first.")}</p>
            <button onClick={() => setScope(null)}>{t("Back")}</button>
          </div>
        ) : (
          <>
            <p className="lfm-summary">
              {t("{count} links across {notes} notes", { count: proposals.length, notes: groups.length })}
            </p>
            <div className="lfm-tools">
              <div className="segmented lfm-filter" role="radiogroup" aria-label={t("Which links to tick")}>
                {(
                  [
                    ["strong", t("Strong only")],
                    ["likely", t("Strong and likely")],
                    ["all", t("Everything")],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} role="radio" aria-checked={filter === id} className={filter === id ? "active" : ""} onClick={() => applyFilter(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <button className="text-button" onClick={() => setTicked(new Set(proposals.map((p) => p.key)))}>
                {t("Tick all")}
              </button>
              <button className="text-button" onClick={() => setTicked(new Set())}>
                {t("Untick all")}
              </button>
            </div>
            <div className="lfm-list">
              {groups.map((group) => (
                <div key={group[0].from.id} className="lfm-group">
                  <h3>
                    <FileText size={14} />
                    {group[0].from.title || t("Untitled")}
                  </h3>
                  {group.map((p) => (
                    <div key={p.key} className={"lfm-row strength-" + p.strength}>
                      <label>
                        <input
                          type="checkbox"
                          checked={ticked.has(p.key)}
                          onChange={(e) =>
                            setTicked((old) => {
                              const next = new Set(old);
                              if (e.target.checked) next.add(p.key);
                              else next.delete(p.key);
                              return next;
                            })
                          }
                        />
                        <span>
                          <strong>
                            <Link2 size={12} /> {p.to.title || t("Untitled")}
                          </strong>
                          <small>
                            {p.reason || (p.shared.length ? t("Both mention {words}", { words: p.shared.join(", ") }) : p.semantic ? t("Similar meaning") : "")}
                            {" · "}
                            {p.strength === "strong" ? t("Strong match") : p.strength === "likely" ? t("Likely match") : t("Loose match")}
                          </small>
                        </span>
                      </label>
                      <button className="icon-only" aria-expanded={open === p.key} aria-label={t("Show the matching text")} onClick={() => setOpen(open === p.key ? null : p.key)}>
                        <ChevronDown size={14} />
                      </button>
                      {open === p.key && (
                        <div className="lfm-snippets">
                          <p>{excerpt(p.from.html, p.shared)}</p>
                          <p>{excerpt(p.to.html, p.shared)}</p>
                          <small>{t("Added to the Related list at the end of the note.")}</small>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <footer className="dialog-actions">
              <button disabled={busy} onClick={() => setScope(null)}>
                {t("Back")}
              </button>
              <button
                className="primary"
                disabled={!count || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onConfirm(
                      proposals.filter((p) => ticked.has(p.key)),
                      proposals.filter((p) => !ticked.has(p.key)),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? <LoaderCircle size={15} className="spin" /> : <Link2 size={15} />}
                {count === 1 ? t("Link 1") : t("Link {count}", { count })}
                {notes > 0 && <small>{t("in {notes} notes", { notes })}</small>}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

function excerpt(html: string, words: string[]) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const at = words.map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 60);
  return (start ? "…" : "") + text.slice(start, start + 180) + (text.length > start + 180 ? "…" : "");
}
