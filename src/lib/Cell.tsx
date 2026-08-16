// Read-only copyable cell for list rows: place the cursor, select, smart
// Ctrl+C (no selection = whole value, via Rust with clipboard auto-clear),
// copy icon on hover that flips to a checkmark after copying.

import { useState } from "react";
import { api } from "../api";
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

export function Cell({ value, kind, wholeValue, onContextMenu }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await api.copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1100);
  }

  return (
    <span className={`cell cell-${kind}`} onContextMenu={onContextMenu}>
      <input
        readOnly
        value={value}
        title={value}
        onKeyDown={smartCopy(wholeValue)}
        onChange={() => undefined}
      />
      {value && (
        <button
          className={`icon cell-copy ${copied ? "copied" : ""}`}
          title="Copy"
          tabIndex={-1}
          onClick={() => void handleCopy()}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </button>
      )}
    </span>
  );
}
