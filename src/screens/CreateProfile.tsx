import { useState } from "react";
import { api } from "../api";
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
    if (!name.trim()) return fail("Profile name is required");
    if (!password) return fail("Master password is required");
    if (password !== repeat) return fail("Passwords do not match");

    setBusy(true);
    setError("");
    try {
      await api.createProfile(name.trim(), password);
      onCreated(name.trim());
    } catch (err) {
      const code = String(err);
      if (code === "profile_exists") fail("A profile with this name already exists");
      else if (code === "invalid_name")
        fail("Only letters, digits, spaces, - and _ are allowed");
      else fail(code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <h1 className="app-title">New profile</h1>
      <form className="card form glow-card" onSubmit={handleSubmit}>
        <label>
          Profile name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Misha"
            maxLength={40}
          />
        </label>
        <label>
          Master password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <StrengthMeter password={password} />
        <label>
          Repeat password
          <input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <p className="warning">
          ⚠ The master password cannot be recovered. If you forget it, the
          data is lost. Write it down and keep it safe.
        </p>
        {error && (
          <p className="error shake" key={shake}>
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
