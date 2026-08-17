// Read-only copyable cell for list rows: place the cursor, select, smart
// Ctrl+C (no selection = whole value, via Rust with clipboard auto-clear),
// copy icon on hover that flips to a checkmark after copying.
// Truncated values get a styled tooltip with the full text on hover.

import { useRef, useState } from "react";
import { api } from "../api";
import { t } from "./i18n";
import { smartCopy } from "./smartCopy";
import { IconCheck, IconCopy } from "./icons";

interface Props {
  value: string;
  /** Column class suffix: rendered as `cell-<kind>` (widths in CSS). */
  kind: string;
  /** Optional smart-copy override for "whole value" (e.g. MM/YY expiry). */
  wholeValue?: (el: HTMLInputElement | HTMLTextAreaElement) => string;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const TIP_DELAY_MS = 450;
const TIP_MAX_WIDTH = 420;

export function Cell({ value, kind, wholeValue, onContextMenu }: Props) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tipTimer = useRef<number | undefined>(undefined);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  async function handleCopy() {
    await api.copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1100);
  }

  function hideTip() {
    window.clearTimeout(tipTimer.current);
    setTip(null);
  }

  function maybeShowTip() {
    const el = inputRef.current;
    // Only when the value is actually truncated with an ellipsis.
    if (!el || el.scrollWidth <= el.clientWidth) return;
    window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setTip({
        x: Math.max(8, Math.min(rect.left, window.innerWidth - TIP_MAX_WIDTH - 8)),
        y: rect.top - 6, // anchored above the cell (CSS shifts by -100%)
      });
    }, TIP_DELAY_MS);
  }

  return (
    <span className={`cell cell-${kind}`} onContextMenu={onContextMenu}>
      <input
        ref={inputRef}
        readOnly
        value={value}
        onKeyDown={smartCopy(wholeValue)}
        onChange={() => undefined}
        onMouseEnter={maybeShowTip}
        onMouseLeave={hideTip}
        onMouseDown={hideTip}
      />
      {value && (
        <button
          className={`icon cell-copy ${copied ? "copied" : ""}`}
          title={t("copy")}
          tabIndex={-1}
          onClick={() => void handleCopy()}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </button>
      )}
      {tip && (
        <div className="cell-tip" style={{ left: tip.x, top: tip.y }}>
          {value}
        </div>
      )}
    </span>
  );
}
