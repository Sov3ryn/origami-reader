import type { ReactNode } from "react";
import { t } from "../i18n";
import { PRIVATE_BETA } from "../release";
import { ModeSwitch, type AppMode } from "../work/ModeSwitch";

/** The side panel's width, one for Read, Work and Studio so the panel keeps
 * its place when the mode changes. In pixels on screen (the interface size
 * applied); `onChange` takes a dragged width. */
export type SideWidth = {
  width: number;
  min: number;
  max: number;
  fallback: number;
  onChange: (width: number) => void;
};

// The top of the side panel in every mode: the Origami name and the mode
// switch, drawn the same in Read, Work and Studio. `onHome` makes the name a
// button back to the mode's first page; `tools` sit at the end of the name row.
export function ModeHeader({
  mode,
  onChange,
  onHome,
  tools,
}: {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  onHome?: () => void;
  tools?: ReactNode;
}) {
  const name = (
    <>
      <img src="/crane.png" alt="" />
      <span className="mode-brand-text">
        <span className="mode-brand-name">{t("Origami")}</span>
        {PRIVATE_BETA && <span className="beta-badge">{t("Private beta")}</span>}
      </span>
    </>
  );
  return (
    <div className="mode-header">
      <div className="mode-brand">
        {onHome ? (
          <button className="mode-brand-home" onClick={onHome} data-tip={t("Home")}>
            {name}
          </button>
        ) : (
          <span className="mode-brand-home">{name}</span>
        )}
        {tools}
      </div>
      <ModeSwitch mode={mode} onChange={onChange} />
    </div>
  );
}
