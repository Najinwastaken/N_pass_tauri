import { useEffect, useState } from "react";
import { api, GeneratorOptions } from "../api";
import { IconCheck, IconCopy, IconRefresh } from "../lib/icons";

const DEFAULTS: GeneratorOptions = {
  length: 16,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
};

const CLASS_OPTIONS: { key: keyof GeneratorOptions; label: string }[] = [
  { key: "lowercase", label: "Lowercase (a–z)" },
  { key: "uppercase", label: "Uppercase (A–Z)" },
  { key: "digits", label: "Digits (0–9)" },
  { key: "symbols", label: "Symbols (!@#…)" },
];

export function GeneratorView() {
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULTS);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  // Auto-regenerate whenever any option changes.
  useEffect(() => {
    void api
      .generatePassword(opts)
      .then(setPassword)
      .catch(() => setPassword(""));
    setCopied(false);
  }, [opts]);

  const noClasses = !opts.lowercase && !opts.uppercase && !opts.digits && !opts.symbols;

  async function handleCopy() {
    if (!password) return;
    await api.copyText(password);
    setCopied(true);
  }

  const toggle = (field: keyof GeneratorOptions) => () =>
    setOpts((o) => ({ ...o, [field]: !o[field] }));

  return (
    <div className="view">
      <div className="view-header">
        <h2>Password generator</h2>
      </div>
      <div className="generator">
        <div className="generated-row">
          <code className="generated">{noClasses ? "—" : password}</code>
          <button
            className="icon"
            title="Regenerate"
            onClick={() => setOpts((o) => ({ ...o }))}
          >
            <IconRefresh size={16} />
          </button>
          <button onClick={() => void handleCopy()} disabled={noClasses}>
            {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <label className="slider-label">
          Length: {opts.length}
          <input
            type="range"
            min={4}
            max={64}
            value={opts.length}
            onChange={(e) => setOpts((o) => ({ ...o, length: Number(e.target.value) }))}
          />
        </label>

        {CLASS_OPTIONS.map(({ key, label }) => (
          <label key={key} className="check">
            {label}
            <span className="switch">
              <input
                type="checkbox"
                checked={opts[key] as boolean}
                onChange={toggle(key)}
              />
              <span className="switch-track" />
            </span>
          </label>
        ))}
        {noClasses && <p className="error">Enable at least one character class.</p>}
      </div>
    </div>
  );
}
