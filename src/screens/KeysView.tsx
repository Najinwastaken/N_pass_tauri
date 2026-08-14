import { useEffect, useState } from "react";
import { api, KeyInput, KeyMeta } from "../api";
import { smartCopy } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";

const EMPTY: KeyInput = { title: "", key: "", notes: "" };

export function KeysView() {
  const [entries, setEntries] = useState<KeyMeta[]>([]);
  const [editing, setEditing] = useState<KeyMeta | "new" | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const dragProps = useDragReorder("keys", entries, setEntries);

  async function refresh() {
    setEntries(await api.listKeys());
    setRevealed({});
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggleReveal(id: string) {
    if (revealed[id] !== undefined) {
      setRevealed(({ [id]: _, ...rest }) => rest);
    } else {
      const key = await api.revealKey(id);
      setRevealed((r) => ({ ...r, [id]: key }));
    }
  }

  async function handleDelete(entry: KeyMeta) {
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    await api.deleteKey(entry.id);
    await refresh();
  }

  if (editing !== null) {
    return (
      <KeyForm
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
        <h2>Passkeys</h2>
        <button onClick={() => setEditing("new")}>+ Add</button>
      </div>
      {entries.length === 0 && <p className="muted">No keys yet.</p>}
      <ul className="entry-list">
        {entries.map((e, index) => {
          const drag = dragProps(index, e.id);
          return (
            <li key={e.id} {...drag} className={`entry ${drag.className}`}>
              <span className="drag-handle" title="Drag to reorder">⋮⋮</span>
              <div className="entry-main">
                <span className="entry-title">{e.title}</span>
                {e.notes && <span className="entry-sub muted">{e.notes}</span>}
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
                <button
                  className="icon"
                  title="Copy key"
                  onClick={() => void api.copySecret("key", e.id)}
                >
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
          );
        })}
      </ul>
    </div>
  );
}

function KeyForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: KeyMeta | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<KeyInput>(EMPTY);
  const [showKey, setShowKey] = useState(false);
  const [shake, setShake] = useState(0);
  const [loaded, setLoaded] = useState(initial === null);

  useEffect(() => {
    if (!initial) return;
    void (async () => {
      const key = await api.revealKey(initial.id);
      setForm({ title: initial.title, key, notes: initial.notes });
      setLoaded(true);
    })();
  }, [initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setShake((n) => n + 1);
      return;
    }
    if (initial) await api.updateKey(initial.id, form);
    else await api.addKey(form);
    onDone();
  }

  if (!loaded) return null;

  return (
    <div className="view">
      <div className="view-header">
        <h2>{initial ? "Edit key" : "New key"}</h2>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Title *
          <input
            autoFocus
            key={shake}
            className={shake > 0 && !form.title.trim() ? "shake invalid" : ""}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onKeyDown={smartCopy()}
          />
        </label>
        <label>
          Key
          <div className="input-row">
            <input
              type={showKey ? "text" : "password"}
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              onKeyDown={smartCopy()}
            />
            <button
              type="button"
              className="icon"
              title={showKey ? "Hide" : "Show"}
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? "🙈" : "👁"}
            </button>
          </div>
        </label>
        <label>
          Notes
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            onKeyDown={smartCopy()}
          />
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
