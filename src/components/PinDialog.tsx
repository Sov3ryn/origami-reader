import { useEffect, useRef, useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import { t } from "../i18n";

export type PinRequest = {
  title: string;
  body?: string;
  // "enter" asks for one PIN; "create" asks twice and needs the warning
  // acknowledged; "change" asks for the current PIN, then a new one twice.
  mode: "enter" | "create" | "change";
  // Asks for a vault name too, starting from this value.
  name?: string;
  submit: string;
  // Runs the action; a thrown error is shown in the dialog, which stays open.
  run: (values: { name: string; pin: string; current: string }) => Promise<void>;
};

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

export function PinDialog({
  request,
  onClose,
}: {
  request: PinRequest;
  onClose: () => void;
}) {
  const first = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(request.name ?? "");
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    first.current?.focus();
    const modal = first.current?.closest(".modal-scrim");
    const siblings = Array.from(modal?.parentElement?.children || []).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== modal,
    );
    const previous = siblings.map((el) => el.inert);
    siblings.forEach((el) => {
      el.inert = true;
    });
    return () =>
      siblings.forEach((el, i) => {
        el.inert = previous[i];
      });
  }, []);
  const asksNew = request.mode !== "enter";
  async function submit() {
    if (request.name !== undefined && !name.trim())
      return setProblem(t("Enter a vault name."));
    if (request.mode === "change" && current.length < 4)
      return setProblem(t("Enter the current PIN."));
    if (pin.length < 4) return setProblem(t("Use a PIN of 4 to 8 digits."));
    if (asksNew && pin !== again)
      return setProblem(t("The two PINs do not match."));
    if (request.mode === "create" && !understood)
      return setProblem(t("Confirm that you understand the warning."));
    setBusy(true);
    setProblem("");
    try {
      await request.run({ name: name.trim(), pin, current });
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setPin("");
      setAgain("");
      if (request.mode === "change") setCurrent("");
    } finally {
      setBusy(false);
    }
  }
  const pinInput = (
    label: string,
    value: string,
    set: (v: string) => void,
    focus = false,
  ) => (
    <label>
      {label}
      <input
        ref={focus ? first : undefined}
        className="pin-input"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        minLength={4}
        maxLength={8}
        value={value}
        onChange={(e) => set(digits(e.target.value))}
      />
    </label>
  );
  return (
    <div className="modal-scrim">
      <section
        className="quick-dialog pin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-dialog-title"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
        }}
      >
        <header className="pin-heading">
          <LockKeyhole size={18} aria-hidden="true" />
          <h2 id="pin-dialog-title">{request.title}</h2>
          <button
            className="icon-button"
            aria-label={t("Close")}
            disabled={busy}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        {request.body && <p>{request.body}</p>}
        <form
          className="pin-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {request.name !== undefined && (
            <label>
              {t("Vault name")}
              <input
                ref={first}
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {request.mode === "change" &&
            pinInput(t("Current PIN"), current, setCurrent, true)}
          {pinInput(
            asksNew ? t("New PIN (4 to 8 digits)") : t("PIN"),
            pin,
            setPin,
            request.mode !== "change" && request.name === undefined,
          )}
          {asksNew && pinInput(t("Repeat the new PIN"), again, setAgain)}
          {request.mode === "create" && (
            <div className="pin-warning" role="note">
              <strong>{t("If you forget this PIN, the contents may be impossible to recover.")}</strong>{" "}
              {t(
                "Origami keeps no copy of the PIN and cannot reset it. Write it down somewhere safe. The encryption keeps out curious eyes; a short PIN will not stop a determined expert with access to this computer.",
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                />
                {t("I understand")}
              </label>
            </div>
          )}
          {problem && (
            <p className="hint pin-problem" role="alert">
              {problem}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              {t("Cancel")}
            </button>
            <button type="submit" disabled={busy}>
              {busy ? t("Checking…") : request.submit}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
