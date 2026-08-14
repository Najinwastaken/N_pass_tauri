// Custom titlebar for the frameless window.
// data-tauri-drag-region makes the strip draggable (window move);
// buttons must NOT have the attribute or they would drag instead of click.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconLock, IconMinus, IconSquare, IconX } from "./lib/icons";

export function Titlebar() {
  const win = getCurrentWindow();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>
        <IconLock size={13} />
        N-Pass
      </span>
      <div className="titlebar-buttons">
        <button title="Minimize" onClick={() => void win.minimize()}>
          <IconMinus size={15} />
        </button>
        <button title="Maximize" onClick={() => void win.toggleMaximize()}>
          <IconSquare size={13} />
        </button>
        <button className="close" title="Close" onClick={() => void win.close()}>
          <IconX size={15} />
        </button>
      </div>
    </div>
  );
}
