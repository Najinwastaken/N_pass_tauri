// List search: filter hook + search box with a global Ctrl+F shortcut.
// While a query is active, drag&drop is disabled by the views (reordering
// a filtered subset would scramble the real order).

import { useEffect, useRef, useState } from "react";
import { IconSearch, IconX } from "./icons";

export function useSearch<T>(items: T[], keysOf: (item: T) => string[]) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((item) => keysOf(item).some((s) => s.toLowerCase().includes(q)))
    : items;
  return { query, setQuery, filtered, searching: q.length > 0 };
}

interface BoxProps {
  query: string;
  onChange: (query: string) => void;
}

export function SearchBox({ query, onChange }: BoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+F focuses the box (layout-independent via e.code).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "KeyF") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="search-box">
      <IconSearch size={14} />
      <input
        ref={inputRef}
        value={query}
        placeholder="Search…  (Ctrl+F)"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            e.currentTarget.blur();
          }
        }}
      />
      {query && (
        <button className="icon" title="Clear" onClick={() => onChange("")}>
          <IconX size={13} />
        </button>
      )}
    </div>
  );
}
