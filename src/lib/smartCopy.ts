// Signature feature: smart Ctrl+C for input fields.
// - no selection  -> copy the WHOLE field value (optionally transformed)
// - has selection -> copy just the selection
// Everything goes through the Rust copy command, so the 30 s auto-clear
// applies to every copy made inside the app.

import { useEffect } from "react";
import { api } from "../api";

type CopyableElement = HTMLInputElement | HTMLTextAreaElement;

/**
 * Returns an onKeyDown handler implementing smart copy.
 * `wholeValue` lets a field override what "the whole value" means
 * (e.g. card number without dashes, month/year by cursor position).
 */
export function smartCopy(
  wholeValue?: (el: CopyableElement) => string,
): (e: React.KeyboardEvent<CopyableElement>) => void {
  return (e) => {
    // e.code is layout-independent ("KeyC" also on Cyrillic layouts).
    if (!e.ctrlKey || e.code !== "KeyC") return;
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    const text =
      start !== null && end !== null && start !== end
        ? el.value.slice(start, end)
        : wholeValue
          ? wholeValue(el)
          : el.value;

    e.preventDefault();
    if (text) void api.copyText(text);
  };
}

/** Card expiry "MM/YY": cursor before the slash copies MM, after — YY. */
export function expiryWholeValue(el: CopyableElement): string {
  const value = el.value;
  const slash = value.indexOf("/");
  if (slash === -1) return value;
  const cursor = el.selectionStart ?? 0;
  return cursor <= slash ? value.slice(0, slash) : value.slice(slash + 1);
}

/** Strip everything but digits (card number copies without separators). */
export function digitsOnly(el: CopyableElement): string {
  return el.value.replace(/\D/g, "");
}

/**
 * Clicking anywhere outside a read-only cell input clears its selection
 * and focus. Most app surfaces are user-select:none, so the browser never
 * clears it on its own. Call once per list view.
 */
export function useClearCellSelection() {
  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) || !active.readOnly) return;
      if (ev.target instanceof Node && active.parentElement?.contains(ev.target)) return;
      active.setSelectionRange(0, 0);
      active.blur();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
}
