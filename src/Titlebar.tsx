// Custom titlebar for the frameless window.
// data-tauri-drag-region makes the strip draggable (window move);
// buttons must NOT have the attribute or they would drag instead of click.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "./lib/i18n";
import { IconGear, IconLock, IconMinus, IconSquare, IconX } from "./lib/icons";
import { useAppVersion } from "./lib/version";

interface Props {
  /** Present only while a vault is open — shows the Settings button. */
  onSettings?: () => void;
}

export function Titlebar({ onSettings }: Props) {
  const win = getCurrentWindow();
  const version = useAppVersion();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>
        <IconLock size={13} />
        N-Pass
        {version && <span className="titlebar-version">v{version}</span>}
      </span>
      <div className="titlebar-buttons">
        {onSettings && (
          <button className="settings" title={t("settings")} onClick={onSettings}>
            <IconGear size={19} />
          </button>
        )}
        <button title={t("minimize")} onClick={() => void win.minimize()}>
          <IconMinus size={20} />
        </button>
        <button title={t("maximize")} onClick={() => void win.toggleMaximize()}>
          <IconSquare size={16} />
        </button>
        <button className="close" title={t("close")} onClick={() => void win.close()}>
          <IconX size={20} />
        </button>
      </div>
    </div>
  );
}
