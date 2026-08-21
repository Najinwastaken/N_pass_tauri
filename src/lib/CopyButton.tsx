// A copy button that answers back.
//
// Copying a secret goes straight from the vault to the clipboard inside
// Rust — nothing appears on screen, nothing is selected, no value is shown.
// Without a reply the click is indistinguishable from a miss, and the most
// common action in the whole app becomes a leap of faith. The same check
// mark the text cells flash is used here, so one gesture reads the same way
// everywhere.

import { useEffect, useRef, useState } from "react";

import { IconCheck, IconCopy } from "./icons";

/** How long the check stays up. Long enough to be seen, short enough that a
    second copy of the same thing still reads as a second copy. */
const FLASH_MS = 1100;

interface Props {
  title: string;
  size?: number;
  /** Runs the copy. Its promise is awaited so the check only appears once
      the value is actually on the clipboard. */
  onCopy: () => Promise<unknown>;
  className?: string;
}

export function CopyButton({ title, size = 15, onCopy, className = "" }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // A row can disappear mid-flash (delete, lock, a merge reloading the list).
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleClick() {
    await onCopy();
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), FLASH_MS);
  }

  return (
    <button
      className={`icon copy-flash ${copied ? "copied" : ""} ${className}`}
      title={title}
      onClick={() => void handleClick()}
    >
      {copied ? <IconCheck size={size - 2} /> : <IconCopy size={size} />}
    </button>
  );
}
