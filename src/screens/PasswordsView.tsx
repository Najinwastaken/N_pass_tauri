import { useEffect, useState } from "react";
import { api, PasswordInput, PasswordMeta } from "../api";
import { smartCopy, useClearCellSelection } from "../lib/smartCopy";
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
  IconRefresh,
  IconSearch,
  IconShield,
  IconSparkles,
  IconTrash,
} from "../lib/icons";
import { loadGenOptions, loadNewEntryReveal, saveNewEntryReveal } from "../lib/genPrefs";
import { Cell } from "../lib/Cell";
import { shortUrl } from "../lib/url";
import { SearchBox, useSearch } from "../lib/useSearch";
import { t } from "../lib/i18n";

const EMPTY: PasswordInput = {
  title: "",
  username: "",
  password: "",
  email: "",
  url: "",
  notes: "",
};

export function PasswordsView() {
  const [entries, setEntries] = useState<PasswordMeta[]>([]);
  const [editing, setEditing] = useState<PasswordMeta | "new" | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const { dragProps, handleProps } = useDragReorder("passwords", entries, setEntries);
  const { menu, openMenu } = useContextMenu();
  useClearCellSelection();
  const { query, setQuery, filtered, searching } = useSearch(entries, (e) => [
    e.title,
    e.username,
    e.email,
    e.url,
    e.notes,
  ]);

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
    if (!window.confirm(t("deleteEntryConfirm", { name: entry.title }))) return;
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
        <h2>{t("navPasswords")}</h2>
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
          <IconShield size={36} />
          <span>{t("emptyPasswords")}</span>
        </div>
      )}
      {entries.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <IconSearch size={36} />
          <span>{t("nothingMatches", { q: query })}</span>
        </div>
      )}
      <ul className="entry-list">
        {filtered.map((e, index) => {
          const drag = searching
            ? { className: "" }
            : dragProps(index, e.id);
          return (
            <li key={e.id} {...drag} className={`entry ${drag.className}`}>
              {!searching && (
                <span className="drag-handle" title={t("dragToReorder")} {...handleProps(e.id)}>
                  <IconGrip size={14} />
                </span>
              )}
              <span className="entry-icon">
                <IconShield size={17} />
              </span>
              <Cell value={e.title} kind="title" />
              <Cell value={e.username} kind="user" />
              <Cell value={e.email} kind="mail" />
              <Cell
                value={shortUrl(e.url)}
                full={e.url}
                kind="url"
                onContextMenu={(ev) =>
                  e.url &&
                  openMenu(ev, [
                    { label: t("openUrl"), action: () => void api.openUrl(e.url) },
                    { label: t("copyUrl"), action: () => void api.copyText(e.url) },
                  ])
                }
              />
              <div className="entry-secret">
                <code>{revealed[e.id] ?? "••••••••"}</code>
              </div>
              <div className="entry-actions">
                {e.url && (
                  <button className="icon" title={t("openUrl")} onClick={() => void api.openUrl(e.url)}>
                    <IconExternal size={15} />
                  </button>
                )}
                <button
                  className="icon"
                  title={revealed[e.id] !== undefined ? t("hide") : t("show")}
                  onClick={() => void toggleReveal(e.id)}
                >
                  {revealed[e.id] !== undefined ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
                <button
                  className="icon"
                  title={t("copyPassword")}
                  onClick={() => void api.copySecret("password", e.id)}
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
  // A new entry starts with whatever the user last chose; an existing
  // one always starts masked.
  const [showPw, setShowPw] = useState(() => initial === null && loadNewEntryReveal());
  const [regenerated, setRegenerated] = useState(false);
  const [shake, setShake] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(initial === null);
  const { menu, openMenu } = useContextMenu();

  /** All empty required fields shake together. */
  const invalid = (field: string, empty: boolean) =>
    shake > 0 && missing.includes(field) && empty ? "shake invalid" : "";

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
        email: initial.email,
        url: initial.url,
        notes: initial.notes,
      });
      setLoaded(true);
    })();
  }, [initial]);

  /** Only the new-entry form remembers the reveal choice. */
  function toggleShowPw() {
    setShowPw((visible) => {
      const next = !visible;
      if (initial === null) saveNewEntryReveal(next);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const miss: string[] = [];
    if (!form.title.trim()) miss.push("title");
    if (!form.password) miss.push("password");
    if (miss.length > 0) {
      setMissing(miss);
      setShake((n) => n + 1);
      return;
    }
    if (initial) await api.updatePassword(initial.id, form);
    else await api.addPassword(form);
    onDone();
  }

  const set = (field: keyof PasswordInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  /** One click: fill the field with a password generated using the
      last-used Generator settings. The value stays masked — secrets are
      only ever revealed by the eye button — so the icon flashes instead
      to confirm the field was refreshed. */
  async function handleGenerate() {
    const password = await api.generatePassword(loadGenOptions());
    setForm((f) => ({ ...f, password }));
    setRegenerated(true);
    setTimeout(() => setRegenerated(false), 1100);
  }

  if (!loaded) return null;

  return (
    <div className="view narrow">
      <div className="view-header">
        <h2>{initial ? t("editEntry") : t("newEntry")}</h2>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          {t("fTitle")} *
          <input
            autoFocus
            key={`t${shake}`}
            className={invalid("title", !form.title.trim())}
            value={form.title}
            onChange={set("title")}
            onKeyDown={smartCopy()}
          />
        </label>
        <label>
          {t("fUsername")}
          <input value={form.username} onChange={set("username")} onKeyDown={smartCopy()} />
        </label>
        <label>
          {t("fPassword")} *
          <div className="input-row">
            <input
              key={`p${shake}`}
              className={invalid("password", !form.password)}
              type={showPw ? "text" : "password"}
              value={form.password}
              onChange={set("password")}
              onKeyDown={smartCopy()}
            />
            <button
              type="button"
              className={`icon ${regenerated ? "flash-ok" : ""}`}
              title={t("generate")}
              onClick={() => void handleGenerate()}
            >
              {regenerated ? <IconRefresh size={16} /> : <IconSparkles size={16} />}
            </button>
            <button
              type="button"
              className="icon"
              title={showPw ? t("hide") : t("show")}
              onClick={toggleShowPw}
            >
              {showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </button>
          </div>
          <StrengthMeter password={form.password} />
        </label>
        <label>
          {t("fMail")}
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="name@example.com"
            onKeyDown={smartCopy()}
          />
        </label>
        <label>
          {t("fUrl")}
          <input
            value={form.url}
            onChange={set("url")}
            placeholder="https://"
            onKeyDown={smartCopy()}
            onContextMenu={(e) =>
              form.url &&
              openMenu(e, [
                { label: t("openUrl"), action: () => void api.openUrl(form.url) },
                { label: t("copyUrl"), action: () => void api.copyText(form.url) },
              ])
            }
          />
        </label>
        <label>
          {t("fNotes")}
          <textarea value={form.notes} onChange={set("notes")} rows={3} onKeyDown={smartCopy()} />
        </label>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button type="submit">{t("save")}</button>
        </div>
      </form>
      {menu}
    </div>
  );
}
