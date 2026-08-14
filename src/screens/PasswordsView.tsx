import { useEffect, useState } from "react";
import { api, PasswordInput, PasswordMeta } from "../api";
import { smartCopy } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";
import { useContextMenu } from "../lib/ContextMenu";
import { StrengthMeter } from "../lib/strength";
import {
  IconCopy,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconGrip,
  IconPencil,
  IconPlus,
  IconShield,
  IconTrash,
} from "../lib/icons";

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
  const dragProps = useDragReorder("passwords", entries, setEntries);
  const { menu, openMenu } = useContextMenu();

  async function refresh() {
    setEntries(await api.listPasswords());
    setRevealed({});
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
        <button onClick={() => setEditing("new")}>
          <IconPlus size={15} />
          Add
        </button>
      </div>
      {entries.length === 0 && (
        <div className="empty-state">
          <IconShield size={36} />
          <span>No passwords yet — add your first one.</span>
        </div>
      )}
      <ul className="entry-list">
        {entries.map((e, index) => {
          const drag = dragProps(index, e.id);
          return (
            <li key={e.id} {...drag} className={`entry ${drag.className}`}>
              <span className="drag-handle" title="Drag to reorder">
                <IconGrip size={14} />
              </span>
              <span className="entry-icon">
                <IconShield size={17} />
              </span>
              <div className="entry-main">
                <span className="entry-title">{e.title}</span>
                <span className="entry-sub">{e.username}</span>
                {e.url && (
                  <span
                    className="entry-sub url"
                    onContextMenu={(ev) =>
                      openMenu(ev, [
                        { label: "Open URL", action: () => void api.openUrl(e.url) },
                        { label: "Copy URL", action: () => void api.copyText(e.url) },
                      ])
                    }
                  >
                    {e.url}
                  </span>
                )}
              </div>
              <div className="entry-secret">
                <code>{revealed[e.id] ?? "••••••••"}</code>
              </div>
              <div className="entry-actions">
                {e.url && (
                  <button className="icon" title="Open URL" onClick={() => void api.openUrl(e.url)}>
                    <IconExternal size={15} />
                  </button>
                )}
                <button
                  className="icon"
                  title={revealed[e.id] !== undefined ? "Hide" : "Show"}
                  onClick={() => void toggleReveal(e.id)}
                >
                  {revealed[e.id] !== undefined ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
                <button
                  className="icon"
                  title="Copy password"
                  onClick={() => void api.copySecret("password", e.id)}
                >
                  <IconCopy size={15} />
                </button>
                <button className="icon" title="Edit" onClick={() => setEditing(e)}>
                  <IconPencil size={15} />
                </button>
                <button className="icon danger" title="Delete" onClick={() => void handleDelete(e)}>
                  <IconTrash size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {menu}
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
  const { menu, openMenu } = useContextMenu();

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
    <div className="view narrow">
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
            onKeyDown={smartCopy()}
          />
        </label>
        <label>
          Username
          <input value={form.username} onChange={set("username")} onKeyDown={smartCopy()} />
        </label>
        <label>
          Password
          <div className="input-row">
            <input
              type={showPw ? "text" : "password"}
              value={form.password}
              onChange={set("password")}
              onKeyDown={smartCopy()}
            />
            <button
              type="button"
              className="icon"
              title={showPw ? "Hide" : "Show"}
              onClick={() => setShowPw((v) => !v)}
            >
              {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </button>
          </div>
          <StrengthMeter password={form.password} />
        </label>
        <label>
          URL
          <input
            value={form.url}
            onChange={set("url")}
            placeholder="https://"
            onKeyDown={smartCopy()}
            onContextMenu={(e) =>
              form.url &&
              openMenu(e, [
                { label: "Open URL", action: () => void api.openUrl(form.url) },
                { label: "Copy URL", action: () => void api.copyText(form.url) },
              ])
            }
          />
        </label>
        <label>
          Notes
          <textarea value={form.notes} onChange={set("notes")} rows={3} onKeyDown={smartCopy()} />
        </label>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
      </form>
      {menu}
    </div>
  );
}
