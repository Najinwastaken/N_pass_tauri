import { useEffect, useState } from "react";
import { api, KeyInput, KeyMeta } from "../api";
import { smartCopy, useClearCellSelection } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";
import { Cell } from "../lib/Cell";
import { SearchBox, useSearch } from "../lib/useSearch";
import { t } from "../lib/i18n";
import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconGrip,
  IconKey,
  IconPencil,
  IconPlus,
  IconSparkles,
  IconTrash,
} from "../lib/icons";
import { loadGenOptions } from "../lib/genPrefs";

const EMPTY: KeyInput = { title: "", key: "", notes: "" };

export function KeysView() {
  const [entries, setEntries] = useState<KeyMeta[]>([]);
  const [editing, setEditing] = useState<KeyMeta | "new" | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const { dragProps, handleProps } = useDragReorder("keys", entries, setEntries);
  useClearCellSelection();
  const { query, setQuery, filtered, searching } = useSearch(entries, (e) => [e.title, e.notes]);

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
    if (!window.confirm(t("deleteEntryConfirm", { name: entry.title }))) return;
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
        <h2>{t("navPasskeys")}</h2>
        <div className="view-header-actions">
          <SearchBox query={query} onChange={setQuery} />
          <button onClick={() => setEditing("new")}>
            <IconPlus size={15} />
            {t("add")}
          </button>
        </div>
      </div>
      {entries.length === 0 && (
        <div className="empty-state">
          <IconKey size={36} />
          <span>{t("emptyKeys")}</span>
        </div>
      )}
      <ul className="entry-list">
        {filtered.map((e, index) => {
          const drag = searching ? { className: "" } : dragProps(index, e.id);
          return (
            <li key={e.id} {...drag} className={`entry ${drag.className}`}>
              {!searching && (
                <span className="drag-handle" title={t("dragToReorder")} {...handleProps(e.id)}>
                  <IconGrip size={14} />
                </span>
              )}
              <span className="entry-icon">
                <IconKey size={17} />
              </span>
              <Cell value={e.title} kind="title" />
              <Cell value={e.notes} kind="notes" />
              <div className="entry-secret">
                <code>{revealed[e.id] ?? "••••••••"}</code>
              </div>
              <div className="entry-actions">
                <button
                  className="icon"
                  title={revealed[e.id] !== undefined ? t("hide") : t("show")}
                  onClick={() => void toggleReveal(e.id)}
                >
                  {revealed[e.id] !== undefined ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
                <button
                  className="icon"
                  title={t("copyKey")}
                  onClick={() => void api.copySecret("key", e.id)}
                >
                  <IconCopy size={15} />
                </button>
                <button className="icon" title={t("edit")} onClick={() => setEditing(e)}>
                  <IconPencil size={15} />
                </button>
                <button className="icon danger" title={t("del")} onClick={() => void handleDelete(e)}>
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
  const [missing, setMissing] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(initial === null);

  const invalid = (field: string, empty: boolean) =>
    shake > 0 && missing.includes(field) && empty ? "shake invalid" : "";

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
    const miss: string[] = [];
    if (!form.title.trim()) miss.push("title");
    if (!form.key) miss.push("key");
    if (miss.length > 0) {
      setMissing(miss);
      setShake((n) => n + 1);
      return;
    }
    if (initial) await api.updateKey(initial.id, form);
    else await api.addKey(form);
    onDone();
  }

  async function handleGenerate() {
    const key = await api.generatePassword(loadGenOptions());
    setForm((f) => ({ ...f, key }));
    setShowKey(true);
  }

  if (!loaded) return null;

  return (
    <div className="view narrow">
      <div className="view-header">
        <h2>{initial ? t("editKey") : t("newKey")}</h2>
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
          {t("fKey")} *
          <div className="input-row">
            <input
              key={`k${shake}`}
              className={invalid("key", !form.key)}
              type={showKey ? "text" : "password"}
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              onKeyDown={smartCopy()}
            />
            <button
              type="button"
              className="icon"
              title={t("generate")}
              onClick={() => void handleGenerate()}
            >
              <IconSparkles size={16} />
            </button>
            <button
              type="button"
              className="icon"
              title={showKey ? t("hide") : t("show")}
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </button>
          </div>
        </label>
        <label>
          {t("fNotes")}
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
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
