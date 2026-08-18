// Keeps the list scroll position across a trip into the entry form.
// Editing an entry near the bottom of a long list and being thrown back
// to the top after Save is disorienting, so the position is restored.

import { useEffect, useRef } from "react";

/** The scrolling container of the main pane (see .content in App.css). */
function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".content");
}

/**
 * @param formOpen whether the view currently shows the form instead of the list
 * @param items    the list data — restoring waits until the rows are back
 * @returns        call it right before opening the form
 */
export function useListScroll(formOpen: boolean, items: unknown[]): () => void {
  const saved = useRef<number | null>(null);

  useEffect(() => {
    if (formOpen || saved.current === null) return;
    const el = scroller();
    if (el) el.scrollTop = saved.current;
    saved.current = null;
  }, [formOpen, items]);

  return () => {
    saved.current = scroller()?.scrollTop ?? 0;
  };
}
