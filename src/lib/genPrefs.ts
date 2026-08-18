// Last-used generator options, shared between the Generator page and the
// in-form generate button. Length/class toggles are not secrets, so
// localStorage is fine.

import { GeneratorOptions } from "../api";

const KEY = "genOptions";

export const GEN_DEFAULTS: GeneratorOptions = {
  length: 16,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
};

export function loadGenOptions(): GeneratorOptions {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return GEN_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<GeneratorOptions>;
    const opts: GeneratorOptions = {
      ...GEN_DEFAULTS,
      ...parsed,
      length: Math.min(64, Math.max(4, Number(parsed.length) || GEN_DEFAULTS.length)),
    };
    // A saved "all classes off" state would make generation fail.
    if (!opts.lowercase && !opts.uppercase && !opts.digits && !opts.symbols) {
      return GEN_DEFAULTS;
    }
    return opts;
  } catch {
    return GEN_DEFAULTS;
  }
}

export function saveGenOptions(opts: GeneratorOptions) {
  localStorage.setItem(KEY, JSON.stringify(opts));
}

// Whether the Generator page shows the result openly. Default: visible —
// a freshly generated string is not bound to any account yet.
const REVEAL_KEY = "genReveal";

export function loadGenReveal(): boolean {
  return localStorage.getItem(REVEAL_KEY) !== "0";
}

export function saveGenReveal(revealed: boolean) {
  localStorage.setItem(REVEAL_KEY, revealed ? "1" : "0");
}

// Whether the password field of the NEW-entry form starts revealed.
// Only that one field remembers the choice: an exposed password is one
// click away from being regenerated, while an issued key or a card CVV
// cannot be reissued cheaply — those always start masked, as does every
// existing entry opened for editing.
const NEW_ENTRY_REVEAL_KEY = "newEntryReveal";

export function loadNewEntryReveal(): boolean {
  return localStorage.getItem(NEW_ENTRY_REVEAL_KEY) === "1";
}

export function saveNewEntryReveal(revealed: boolean) {
  localStorage.setItem(NEW_ENTRY_REVEAL_KEY, revealed ? "1" : "0");
}
