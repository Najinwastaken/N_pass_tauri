import { useState } from "react";
import { api } from "../api";
import { t } from "../lib/i18n";
import { StrengthMeter } from "../lib/strength";

interface Props {
  onCreated: (name: string) => void;
  onBack: () => void;
}

export function CreateProfile({ onCreated, onBack }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  function fail(message: string) {
    setError(message);
    setShake((n) => n + 1); // changing the key re-triggers the CSS animation
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return fail(t("errNameRequired"));
    if (!password) return fail(t("errPasswordRequired"));
    if (password !== repeat) return fail(t("errPasswordsMismatch"));

    setBusy(true);
    setError("");
    try {
      await api.createProfile(name.trim(), password);
      onCreated(name.trim());
    } catch (err) {
      const code = String(err);
      if (code === "profile_exists") fail(t("errProfileExists"));
      else if (code === "invalid_name") fail(t("errInvalidName"));
      else fail(code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <h1 className="app-title">{t("newProfile")}</h1>
      <form className="card form" onSubmit={handleSubmit}>
        <label>
          {t("profileName")}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("profileNamePh")}
            maxLength={40}
          />
        </label>
        <label>
          {t("masterPassword")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <StrengthMeter password={password} />
        <label>
          {t("repeatPassword")}
          <input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <p className="warning">{t("noRecoveryWarning")}</p>
        {error && (
          <p className="error shake" key={shake}>
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onBack} disabled={busy}>
            {t("back")}
          </button>
          <button type="submit" disabled={busy}>
            {busy ? t("creating") : t("createBtn")}
          </button>
        </div>
      </form>
    </div>
  );
}
