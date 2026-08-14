// Drag&drop reordering for entry lists.
// Items shift live while dragging; the new order is persisted on drop.

import { useRef, useState } from "react";
import { api, EntryKind } from "../api";

export function useDragReorder<T extends { id: string }>(
  kind: EntryKind,
  items: T[],
  setItems: (items: T[]) => void,
) {
  const dragIndex = useRef<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  function onDragStart(index: number) {
    dragIndex.current = index;
    setDragging(items[index]?.id ?? null);
  }

  function onDragEnter(index: number) {
    const from = dragIndex.current;
    if (from === null || from === index) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    dragIndex.current = index;
    setItems(next);
  }

  function onDragEnd() {
    dragIndex.current = null;
    setDragging(null);
    void api.reorderEntries(
      kind,
      items.map((i) => i.id),
    );
  }

  /** Spread onto each <li>. */
  function dragProps(index: number, id: string) {
    return {
      draggable: true,
      onDragStart: () => onDragStart(index),
      onDragEnter: () => onDragEnter(index),
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDragEnd,
      className: dragging === id ? "dragging" : "",
    };
  }

  return dragProps;
}
