// Custom titlebar for the frameless window.
// data-tauri-drag-region makes the strip draggable (window move);
// buttons must NOT have the attribute or they would drag instead of click.

import { getCurrentWindow } from "@tauri-apps/api/window";

export function Titlebar() {
  const win = getCurrentWindow();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>
        N-Pass
      </span>
      <div className="titlebar-buttons">
        <button title="Minimize" onClick={() => void win.minimize()}>
          –
        </button>
        <button title="Maximize" onClick={() => void win.toggleMaximize()}>
          ▢
        </button>
        <button className="close" title="Close" onClick={() => void win.close()}>
          ×
        </button>
      </div>
    </div>
  );
}
