import { useState } from "react";
import { api } from "../api";
import { t } from "../lib/i18n";

interface Props {
  profile: string;
  onUnlocked: () => void;
  onBack: () => void;
}

export function Unlock({ profile, onUnlocked, onBack }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.unlock(profile, password);
      onUnlocked();
    } catch (err) {
      setPassword("");
      setShake((n) => n + 1);
      setError(String(err) === "wrong_password" ? "" : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <h1 className="app-title">{profile}</h1>
      <form className="card form" onSubmit={handleSubmit}>
        {/* key={shake} remounts the input so the CSS shake animation replays */}
        <input
          key={shake}
          className={shake > 0 ? "shake" : ""}
          type="password"
          autoFocus
          placeholder={t("masterPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onBack} disabled={busy}>
            {t("back")}
          </button>
          <button type="submit" disabled={busy || !password}>
            {busy ? t("unlocking") : t("unlockBtn")}
          </button>
        </div>
      </form>
    </div>
  );
}
