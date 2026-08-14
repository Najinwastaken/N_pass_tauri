// Custom titlebar for the frameless window.
// data-tauri-drag-region makes the strip draggable (window move);
// buttons must NOT have the attribute or they would drag instead of click.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconGear, IconLock, IconMinus, IconSquare, IconX } from "./lib/icons";

interface Props {
  /** Present only while a vault is open — shows the Settings button. */
  onSettings?: () => void;
}

export function Titlebar({ onSettings }: Props) {
  const win = getCurrentWindow();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>
        <IconLock size={13} />
        N-Pass
      </span>
      <div className="titlebar-buttons">
        {onSettings && (
          <button className="settings" title="Settings" onClick={onSettings}>
            <IconGear size={19} />
          </button>
        )}
        <button title="Minimize" onClick={() => void win.minimize()}>
          <IconMinus size={20} />
        </button>
        <button title="Maximize" onClick={() => void win.toggleMaximize()}>
          <IconSquare size={16} />
        </button>
        <button className="close" title="Close" onClick={() => void win.close()}>
          <IconX size={20} />
        </button>
      </div>
    </div>
  );
}
