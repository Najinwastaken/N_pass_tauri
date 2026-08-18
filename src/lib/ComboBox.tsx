// A text field with suggestions: type a new value or pick one that is
// already in use. Categories have no separate management screen — they
// exist only as the values entries carry, so this is the whole of it.

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "./icons";

interface Props {
  value: string;
  /** Values already in use, offered as suggestions. */
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ComboBox({ value, options, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  // Typing narrows the list; opening it by hand means "show me everything",
  // otherwise picking a different value after choosing one is impossible.
  const [narrowToInput, setNarrowToInput] = useState(false);
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
  const suggestions = narrowToInput
    ? options.filter((o) => o.toLowerCase().includes(typed))
    : options;

  function show(all: boolean) {
    setNarrowToInput(!all);
    setOpen(true);
  }

  return (
    <div className="select" ref={rootRef}>
      <div className="input-row">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            show(false);
          }}
          onFocus={() => show(true)}
          // Focus fires only once, so a click on the already focused field
          // would otherwise do nothing.
          onClick={() => show(true)}
        />
        {options.length > 0 && (
          <button
            type="button"
            className="icon"
            tabIndex={-1}
            onClick={() => (open ? setOpen(false) : show(true))}
          >
            <IconChevronDown
              size={14}
              className={open ? "select-chevron open" : "select-chevron"}
            />
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="select-menu" role="listbox">
          {suggestions.map((option) => {
            const current = option.toLowerCase() === typed;
            return (
              <li
                key={option}
                role="option"
                aria-selected={current}
                className={`select-option ${current ? "selected" : ""}`}
                // Picking must not move focus into the field: that would
                // reopen the list through the focus handler. preventDefault
                // on the click also cancels a <label>'s forwarding, should
                // such a widget ever end up inside one.
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
                {current && <IconCheck size={14} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
