// List search: filter hook + search box with a global Ctrl+F shortcut.
// While a query is active, drag&drop is disabled by the views (reordering
// a filtered subset would scramble the real order).

import { useEffect, useRef, useState } from "react";
import { t } from "./i18n";
import { IconSearch, IconX } from "./icons";

export function useSearch<T>(items: T[], keysOf: (item: T) => string[]) {
  const [query, setQuery] = useState("");
  // Multi-word: every word must occur somewhere in the item's fields,
  // in any order ("акк google" matches "Google account").
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = words.length
    ? items.filter((item) => {
        const haystack = keysOf(item).join("\n").toLowerCase();
        return words.every((w) => haystack.includes(w));
      })
    : items;
  return { query, setQuery, filtered, searching: words.length > 0 };
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
        placeholder={t("searchPh")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            e.currentTarget.blur();
          }
        }}
      />
      {query && (
        <button className="icon" title={t("clear")} onClick={() => onChange("")}>
          <IconX size={13} />
        </button>
      )}
    </div>
  );
}
