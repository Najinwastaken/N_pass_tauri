import { useEffect, useState } from "react";
import { api, NoteInput, NoteMeta } from "../api";
import { smartCopy } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";
import { IconGrip, IconNote, IconPlus, IconTrash } from "../lib/icons";

export function NotesView() {
  const [entries, setEntries] = useState<NoteMeta[]>([]);
  const [editing, setEditing] = useState<NoteMeta | "new" | null>(null);
  const dragProps = useDragReorder("notes", entries, setEntries);

  async function refresh() {
    setEntries(await api.listNotes());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleDelete(entry: NoteMeta) {
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    await api.deleteNote(entry.id);
    await refresh();
  }

  if (editing !== null) {
    return (
      <NoteForm
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
        <h2>Secure Notes</h2>
        <button onClick={() => setEditing("new")}>
          <IconPlus size={15} />
          Add
        </button>
      </div>
      {entries.length === 0 && (
        <div className="empty-state">
          <IconNote size={36} />
          <span>No notes yet.</span>
        </div>
      )}
      <ul className="entry-list">
        {entries.map((e, index) => {
          const drag = dragProps(index, e.id);
          return (
            <li
              key={e.id}
              {...drag}
              className={`entry clickable ${drag.className}`}
              onClick={() => setEditing(e)}
            >
              <span className="drag-handle" title="Drag to reorder">
                <IconGrip size={14} />
              </span>
              <span className="entry-icon">
                <IconNote size={17} />
              </span>
              <div className="entry-main">
                <span className="entry-title">{e.title}</span>
              </div>
              <div className="entry-actions">
                <button
                  className="icon danger"
                  title="Delete"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void handleDelete(e);
                  }}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NoteForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: NoteMeta | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NoteInput>({ title: "", body: "" });
  const [shake, setShake] = useState(0);
  const [loaded, setLoaded] = useState(initial === null);

  // The body is a secret: fetched only when the note is opened.
  useEffect(() => {
    if (!initial) return;
    void (async () => {
      const body = await api.getNoteBody(initial.id);
      setForm({ title: initial.title, body });
      setLoaded(true);
    })();
  }, [initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setShake((n) => n + 1);
      return;
    }
    if (initial) await api.updateNote(initial.id, form);
    else await api.addNote(form);
    onDone();
  }

  if (!loaded) return null;

  return (
    <div className="view narrow">
      <div className="view-header">
        <h2>{initial ? "Edit note" : "New note"}</h2>
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
          Note
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={12}
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
