import { useEffect, useRef, useState } from "react";
import { api, NoteInput, NoteMeta } from "../api";
import { smartCopy } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";
import { IconGrip, IconNote, IconPlus, IconSearch, IconTrash } from "../lib/icons";
import { SearchBox } from "../lib/useSearch";
import { t } from "../lib/i18n";
import { useListScroll } from "../lib/useListScroll";

export function NotesView() {
  const [entries, setEntries] = useState<NoteMeta[]>([]);
  const [editing, setEditing] = useState<NoteMeta | "new" | null>(null);
  // Coming back from the form should land where the user was.
  const rememberScroll = useListScroll(editing !== null, entries);
  const { dragProps, handleProps } = useDragReorder("notes", entries, setEntries);

  // Full-text search runs in Rust (bodies never reach the WebView in
  // bulk). Debounced; a sequence counter discards out-of-order replies.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteMeta[] | null>(null);
  const searchSeq = useRef(0);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!searching) {
      setResults(null);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      void api.searchNotes(query).then((found) => {
        if (searchSeq.current === seq) setResults(found);
      });
    }, 150);
    return () => clearTimeout(timer);
    // entries in deps: re-run the search after add/edit/delete.
  }, [query, searching, entries]);

  const filtered = searching ? (results ?? []) : entries;

  async function refresh() {
    setEntries(await api.listNotes());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleDelete(entry: NoteMeta) {
    if (!window.confirm(t("deleteEntryConfirm", { name: entry.title }))) return;
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
        <h2>{t("navNotes")}</h2>
        <div className="view-header-actions">
          <SearchBox query={query} onChange={setQuery} />
          <button onClick={() => { rememberScroll(); setEditing("new"); }}>
            <IconPlus size={15} />
            {t("add")}
          </button>
        </div>
      </div>
      {entries.length === 0 && (
        <div className="empty-state">
          <IconNote size={36} />
          <span>{t("emptyNotes")}</span>
        </div>
      )}
      {entries.length > 0 && searching && results !== null && results.length === 0 && (
        <div className="empty-state">
          <IconSearch size={36} />
          <span>{t("nothingMatches", { q: query })}</span>
        </div>
      )}
      <ul className="entry-list">
        {filtered.map((e, index) => {
          const drag = searching ? { className: "" } : dragProps(index, e.id);
          return (
            <li
              key={e.id}
              {...drag}
              className={`entry clickable ${drag.className}`}
              onClick={() => { rememberScroll(); setEditing(e); }}
            >
              {!searching && (
                <span className="drag-handle" title={t("dragToReorder")} {...handleProps(e.id)}>
                  <IconGrip size={14} />
                </span>
              )}
              <span className="entry-icon">
                <IconNote size={17} />
              </span>
              <div className="entry-main">
                <span className="entry-title">{e.title}</span>
              </div>
              <div className="entry-actions">
                <button
                  className="icon danger"
                  title={t("del")}
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
  const [missing, setMissing] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(initial === null);

  const invalid = (field: string, empty: boolean) =>
    shake > 0 && missing.includes(field) && empty ? "shake invalid" : "";

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
    const miss: string[] = [];
    if (!form.title.trim()) miss.push("title");
    if (!form.body.trim()) miss.push("body");
    if (miss.length > 0) {
      setMissing(miss);
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
        <h2>{initial ? t("editNote") : t("newNote")}</h2>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          {t("fTitle")} *
          <input
            autoFocus
            key={`t${shake}`}
            className={invalid("title", !form.title.trim())}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onKeyDown={smartCopy()}
          />
        </label>
        <label>
          {t("fNote")} *
          <textarea
            key={`b${shake}`}
            className={invalid("body", !form.body.trim())}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={12}
            onKeyDown={smartCopy()}
          />
        </label>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button type="submit">{t("save")}</button>
        </div>
      </form>
    </div>
  );
}
