import { t } from "../i18n";
import { keyLabel } from "../platform";
export const shortcuts: { keys: string[]; action: string; group: string }[] = [
  {
    group: "Listening",
    keys: ["Space"],
    action: "Read aloud, pause or resume",
  },
  { group: "Listening", keys: ["Ctrl", "Right"], action: "Next sentence" },
  { group: "Listening", keys: ["Ctrl", "Left"], action: "Previous sentence" },
  {
    group: "Listening",
    keys: ["Ctrl", "Shift", "Right"],
    action: "Next paragraph",
  },
  {
    group: "Listening",
    keys: ["Ctrl", "Shift", "Left"],
    action: "Previous paragraph",
  },
  { group: "Listening", keys: [">"], action: "Faster" },
  { group: "Listening", keys: ["<"], action: "Slower" },
  {
    group: "Listening",
    keys: ["Media keys"],
    action: "Play, pause, next and previous",
  },
  {
    group: "Reading",
    keys: ["Left", "Right"],
    action: "Previous or next page",
  },
  {
    group: "Reading",
    keys: ["Ctrl", "F"],
    action: "Find in book or search the library",
  },
  {
    group: "Reading",
    keys: ["Ctrl", "B"],
    action: "Bookmark the current position",
  },
  { group: "Reading", keys: ["Ctrl", "="], action: "Larger text" },
  { group: "Reading", keys: ["Ctrl", "-"], action: "Smaller text" },
  { group: "Reading", keys: ["Ctrl", "Shift", "F"], action: "Focus mode" },
  { group: "Reading", keys: ["Ctrl", "Shift", "C"], action: "Make a study card" },
  {
    group: "Workspace",
    keys: ["Ctrl", "Shift", "W"],
    action: "Switch between Read, Work and Studio",
  },
  {
    group: "Workspace",
    keys: ["Ctrl", "Shift", "L"],
    action: "Switch between day and night",
  },
  { group: "Workspace", keys: ["Ctrl", "O"], action: "Import documents" },
  { group: "Workspace", keys: ["Ctrl", ","], action: "Settings" },
  {
    group: "Workspace",
    keys: ["Ctrl", "\\"],
    action: "Show or hide navigation",
  },
  { group: "Workspace", keys: ["?"], action: "Keyboard shortcuts" },
  {
    group: "Workspace",
    keys: ["Esc"],
    action: "Clear the selection or close a dialog",
  },
];

// Keys typed into fields, menus, dialogs and editable text are never shortcuts.
export function shortcutTarget(event: KeyboardEvent) {
  const el = event.target as HTMLElement | null;
  if (!el || !el.closest) return true;
  return !el.closest(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),textarea,select,[contenteditable="true"],[role="dialog"]',
  );
}

export function ShortcutList() {
  const groups = [...new Set(shortcuts.map((s) => s.group))];
  return (
    <div className="shortcut-list">
      {groups.map((group) => (
        <section key={group}>
          <h4>{t(group)}</h4>
          <dl>
            {shortcuts
              .filter((s) => s.group === group)
              .map((s) => (
                <div key={s.action}>
                  <dt>
                    {s.keys.map((k, i) => (
                      <span key={k + i}>
                        {i > 0 && <span className="key-plus">+</span>}
                        <kbd>{t(keyLabel(k))}</kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{t(s.action)}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
