// Drag&drop reordering for entry lists.
// While dragging, an insertion line shows where the item would land; the
// list is only rearranged on drop. Esc cancels natively: the browser fires
// dragend without a drop event, so nothing is applied.

import { useEffect, useRef, useState } from "react";
import { api, EntryKind } from "../api";

export function useDragReorder<T extends { id: string }>(
  kind: EntryKind,
  items: T[],
  setItems: (items: T[]) => void,
) {
  const dragIndex = useRef<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Insertion gap: 0..items.length (line above item N, or below the last). */
  const [dropGap, setDropGap] = useState<number | null>(null);
  /** Row is draggable ONLY while the mouse is down on its grip handle —
      otherwise pressing LMB on text starts a drag instead of a selection. */
  const [armedId, setArmedId] = useState<string | null>(null);

  useEffect(() => {
    // Disarm when the button is released without a drag ever starting.
    const disarm = () => setArmedId(null);
    window.addEventListener("mouseup", disarm);
    return () => window.removeEventListener("mouseup", disarm);
  }, []);

  // Refs mirror state so the document-level handlers (attached once per
  // drag) always see current values without re-binding.
  const dropGapRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const docHandlers = useRef<{
    enter: (e: DragEvent) => void;
    over: (e: DragEvent) => void;
    drop: (e: DragEvent) => void;
  } | null>(null);

  function setGap(gap: number | null) {
    dropGapRef.current = gap;
    setDropGap(gap);
  }

  // The WHOLE document accepts drops while a drag is active. Without this
  // the browser flashes the "no drop" cursor whenever the pointer is not
  // exactly over a row (headers, gaps, empty space), because only elements
  // that preventDefault() on dragenter/dragover are valid drop targets.
  // Attached synchronously in dragstart — a state-driven effect would
  // leave the very first dragover events unhandled (cursor flicker).
  function attachDocHandlers() {
    const enter = (e: DragEvent) => e.preventDefault();
    const over = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      applyDrop();
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    docHandlers.current = { enter, over, drop };
  }

  function detachDocHandlers() {
    const h = docHandlers.current;
    if (!h) return;
    document.removeEventListener("dragenter", h.enter);
    document.removeEventListener("dragover", h.over);
    document.removeEventListener("drop", h.drop);
    docHandlers.current = null;
  }

  // Safety net: never leave document listeners behind on unmount.
  useEffect(() => detachDocHandlers, []);

  function reset() {
    detachDocHandlers();
    dragIndex.current = null;
    setDragging(null);
    setGap(null);
    setArmedId(null);
    // Anyone interested (e.g. the sidebar Esc hint) can listen.
    window.dispatchEvent(new CustomEvent("np-drag-idle"));
  }

  function applyDrop() {
    const from = dragIndex.current;
    const gap = dropGapRef.current;
    const current = itemsRef.current;
    reset();
    if (from === null || gap === null) return;

    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(gap > from ? gap - 1 : gap, 0, moved);
    setItems(next);
    void api.reorderEntries(
      kind,
      next.map((i) => i.id),
    );
  }

  function onDragStart(e: React.DragEvent, index: number) {
    // Some webviews cancel the drag unless data is set.
    e.dataTransfer.setData("text/plain", "");
    e.dataTransfer.effectAllowed = "move";
    attachDocHandlers();
    dragIndex.current = index;
    setDragging(itemsRef.current[index]?.id ?? null);
    window.dispatchEvent(new CustomEvent("np-drag-active"));
  }

  function onDragOver(e: React.DragEvent, index: number) {
    // Belt and braces: accept the drop at the row level too, not only in
    // the document-level handler — the earliest point in the chain wins.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const from = dragIndex.current;
    if (from === null) return;

    // Above or below the hovered row, depending on cursor position.
    const rect = e.currentTarget.getBoundingClientRect();
    let gap: number | null = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
    // Dropping right where the item already is would be a no-op — hide.
    if (gap === from || gap === from + 1) gap = null;
    if (gap !== dropGapRef.current) setGap(gap);
  }

  /** Spread onto each <li>. */
  function dragProps(index: number, id: string) {
    const classes: string[] = [];
    if (dragging === id) classes.push("dragging");
    if (dropGap === index) classes.push("drop-above");
    if (dropGap === index + 1 && index === items.length - 1) classes.push("drop-below");
    return {
      draggable: armedId === id,
      onDragStart: (e: React.DragEvent) => onDragStart(e, index),
      onDragOver: (e: React.DragEvent) => onDragOver(e, index),
      onDragEnd: reset, // fires after drop, or alone when Esc cancels
      className: classes.join(" "),
    };
  }

  /** Spread onto the row's grip handle. */
  function handleProps(id: string) {
    return {
      onMouseDown: () => setArmedId(id),
    };
  }

  return { dragProps, handleProps };
}
