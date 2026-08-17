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
