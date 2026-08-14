import { useState } from "react";
import { api } from "../api";

interface Props {
  onCreated: (name: string) => void;
  onBack: () => void;
}

/** Rough strength estimate: 0..4 based on length and character variety. */
function strength(pw: string): number {
  if (!pw) return 0;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (classes >= 2) score++;
  if (classes >= 3 && pw.length >= 10) score++;
  return score;
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

export function CreateProfile({ onCreated, onBack }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const score = strength(password);

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
      <form className="card form" onSubmit={handleSubmit}>
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
        {password && (
          <div className={`strength strength-${score}`}>
            <div className="strength-bar">
              <div style={{ width: `${(score / 4) * 100}%` }} />
            </div>
            <span>{STRENGTH_LABELS[score]}</span>
          </div>
        )}
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
