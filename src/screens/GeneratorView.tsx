import { useEffect, useState } from "react";
import { api, GeneratorOptions } from "../api";
import { t, TKey } from "../lib/i18n";
import {
  loadGenOptions,
  loadGenReveal,
  saveGenOptions,
  saveGenReveal,
} from "../lib/genPrefs";
import { IconCheck, IconCopy, IconEye, IconEyeOff, IconRefresh } from "../lib/icons";

const CLASS_OPTIONS: { key: keyof GeneratorOptions; labelKey: TKey }[] = [
  { key: "lowercase", labelKey: "lowercase" },
  { key: "uppercase", labelKey: "uppercase" },
  { key: "digits", labelKey: "digits" },
  { key: "symbols", labelKey: "symbols" },
];

export function GeneratorView() {
  const [opts, setOpts] = useState<GeneratorOptions>(loadGenOptions);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(loadGenReveal);

  function toggleReveal() {
    const next = !revealed;
    setRevealed(next);
    saveGenReveal(next); // remembered for the next visit
  }

  // Auto-regenerate whenever any option changes; remember the options so
  // the in-form generate button uses the same settings.
  useEffect(() => {
    saveGenOptions(opts);
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
        <h2>{t("generatorTitle")}</h2>
      </div>
      <div className="generator">
        <div className="generated-row">
          <code className={`generated ${revealed ? "" : "masked"}`}>
            {noClasses ? "—" : revealed ? password : "•".repeat(password.length)}
          </code>
          <button
            className="icon"
            title={revealed ? t("hide") : t("show")}
            onClick={toggleReveal}
          >
            {revealed ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
          <button
            className="icon"
            title={t("regenerate")}
            onClick={() => setOpts((o) => ({ ...o }))}
          >
            <IconRefresh size={16} />
          </button>
          <button onClick={() => void handleCopy()} disabled={noClasses}>
            {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>

        <label className="slider-label">
          {t("length")}: {opts.length}
          <input
            type="range"
            min={4}
            max={64}
            value={opts.length}
            onChange={(e) => setOpts((o) => ({ ...o, length: Number(e.target.value) }))}
          />
        </label>

        {CLASS_OPTIONS.map(({ key, labelKey }) => (
          <label key={key} className="check">
            {t(labelKey)}
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
        {noClasses && <p className="error">{t("atLeastOneClass")}</p>}
      </div>
    </div>
  );
}
