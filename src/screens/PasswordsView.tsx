import { useEffect, useState } from "react";
import { api, copyText, PasswordInput, PasswordMeta } from "../api";

const EMPTY: PasswordInput = {
  title: "",
  username: "",
  password: "",
  url: "",
  notes: "",
};

export function PasswordsView() {
  const [entries, setEntries] = useState<PasswordMeta[]>([]);
  const [editing, setEditing] = useState<PasswordMeta | "new" | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  async function refresh() {
    setEntries(await api.listPasswords());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggleReveal(id: string) {
    if (revealed[id] !== undefined) {
      // Hide: drop the plaintext from React state immediately.
      setRevealed(({ [id]: _, ...rest }) => rest);
    } else {
      const pw = await api.revealPassword(id);
      setRevealed((r) => ({ ...r, [id]: pw }));
    }
  }

  async function copyPassword(id: string) {
    await copyText(await api.revealPassword(id));
  }

  async function handleDelete(entry: PasswordMeta) {
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    await api.deletePassword(entry.id);
    await refresh();
  }

  if (editing !== null) {
    return (
      <EntryForm
        initial={editing === "new" ? null : editing}
        onDone={async () => {
          setEditing(null);
          await refresh();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Passwords</h2>
        <button onClick={() => setEditing("new")}>+ Add</button>
      </div>
      {entries.length === 0 && <p className="muted">No entries yet.</p>}
      <ul className="entry-list">
        {entries.map((e) => (
          <li key={e.id} className="entry">
            <div className="entry-main">
              <span className="entry-title">{e.title}</span>
              <span className="entry-sub">{e.username}</span>
              {e.url && <span className="entry-sub muted">{e.url}</span>}
            </div>
            <div className="entry-secret">
              <code>{revealed[e.id] ?? "••••••••"}</code>
            </div>
            <div className="entry-actions">
              <button
                className="icon"
                title={revealed[e.id] !== undefined ? "Hide" : "Show"}
                onClick={() => void toggleReveal(e.id)}
              >
                {revealed[e.id] !== undefined ? "🙈" : "👁"}
              </button>
              <button className="icon" title="Copy password" onClick={() => void copyPassword(e.id)}>
                ⧉
              </button>
              <button className="icon" title="Edit" onClick={() => setEditing(e)}>
                ✎
              </button>
              <button className="icon danger" title="Delete" onClick={() => void handleDelete(e)}>
                🗑
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: PasswordMeta | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PasswordInput>(EMPTY);
  const [showPw, setShowPw] = useState(false);
  const [shake, setShake] = useState(0);
  const [loaded, setLoaded] = useState(initial === null);

  // Editing an existing entry: fetch its password once so saving does not
  // silently blank it.
  useEffect(() => {
    if (!initial) return;
    void (async () => {
      const password = await api.revealPassword(initial.id);
      setForm({
        title: initial.title,
        username: initial.username,
        password,
        url: initial.url,
        notes: initial.notes,
      });
      setLoaded(true);
    })();
  }, [initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setShake((n) => n + 1);
      return;
    }
    if (initial) await api.updatePassword(initial.id, form);
    else await api.addPassword(form);
    onDone();
  }

  const set = (field: keyof PasswordInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  if (!loaded) return null;

  return (
    <div className="view">
      <div className="view-header">
        <h2>{initial ? "Edit entry" : "New entry"}</h2>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Title *
          <input
            autoFocus
            key={shake}
            className={shake > 0 && !form.title.trim() ? "shake invalid" : ""}
            value={form.title}
            onChange={set("title")}
          />
        </label>
        <label>
          Username
          <input value={form.username} onChange={set("username")} />
        </label>
        <label>
          Password
          <div className="input-row">
            <input
              type={showPw ? "text" : "password"}
              value={form.password}
              onChange={set("password")}
            />
            <button
              type="button"
              className="icon"
              title={showPw ? "Hide" : "Show"}
              onClick={() => setShowPw((v) => !v)}
            >
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
        </label>
        <label>
          URL
          <input value={form.url} onChange={set("url")} placeholder="https://" />
        </label>
        <label>
          Notes
          <textarea value={form.notes} onChange={set("notes")} rows={3} />
        </label>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
