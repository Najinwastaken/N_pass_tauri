// A text field with suggestions: type a new value or pick one that is
// already in use. Categories have no separate management screen — they
// exist only as the values entries carry, so this is the whole of it.

import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "./icons";

interface Props {
  value: string;
  /** Values already in use, offered as suggestions. */
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ComboBox({ value, options, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const typed = value.trim().toLowerCase();
  const suggestions = options.filter(
    (o) => o.toLowerCase() !== typed && o.toLowerCase().includes(typed),
  );

  return (
    <div className="select" ref={rootRef}>
      <div className="input-row">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {options.length > 0 && (
          <button
            type="button"
            className="icon"
            tabIndex={-1}
            onClick={() => setOpen((v) => !v)}
          >
            <IconChevronDown size={14} className={open ? "select-chevron open" : "select-chevron"} />
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="select-menu" role="listbox">
          {suggestions.map((option) => (
            <li
              key={option}
              role="option"
              aria-selected={false}
              className="select-option"
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
