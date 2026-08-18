import { useEffect, useMemo, useState } from "react";
import { api, PasswordInput, PasswordMeta } from "../api";
import { smartCopy, useClearCellSelection } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";
import { useContextMenu } from "../lib/ContextMenu";
import { StrengthMeter } from "../lib/strength";
import {
  IconChevronDown,
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
import { ComboBox } from "../lib/ComboBox";
import { Select } from "../lib/Select";
import { shortUrl } from "../lib/url";
import { SearchBox, useSearch } from "../lib/useSearch";
import { t } from "../lib/i18n";
import { useListScroll } from "../lib/useListScroll";
import { clearDraft, getDraft, setDraft } from "../lib/drafts";

/** Key of the in-memory draft for this section (see lib/drafts.ts). */
const DRAFT_KEY = "passwords";
type Draft = { initial: PasswordMeta | null; form: PasswordInput };

/** Which category is selected and which groups are folded — kept for the
    session so switching tabs does not reset the view. */
const VIEW_KEY = "passwords-view";
type ViewState = { filter: string; collapsed: string[] };

const EMPTY: PasswordInput = {
  title: "",
  username: "",
  password: "",
  email: "",
  category: "",
  url: "",
  notes: "",
};

export function PasswordsView() {
  const [entries, setEntries] = useState<PasswordMeta[]>([]);
  // An unfinished form is reopened when the user comes back to this tab.
  const [editing, setEditing] = useState<PasswordMeta | "new" | null>(() => {
    const draft = getDraft<Draft>(DRAFT_KEY);
    return draft ? (draft.initial ?? "new") : null;
  });
  // Coming back from the form should land where the user was.
  const rememberScroll = useListScroll(editing !== null, entries);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const { dragProps, handleProps } = useDragReorder("passwords", entries, setEntries);
  const { menu, openMenu } = useContextMenu();
  useClearCellSelection();
  const { query, setQuery, filtered, searching } = useSearch(entries, (e) => [
    e.title,
    e.username,
    e.email,
    e.category,
    e.url,
    e.notes,
  ]);

  const savedView = getDraft<ViewState>(VIEW_KEY);
  const [filter, setFilter] = useState(savedView?.filter ?? "");
  const [collapsed, setCollapsed] = useState<string[]>(savedView?.collapsed ?? []);
  useEffect(() => {
    setDraft(VIEW_KEY, { filter, collapsed });
  }, [filter, collapsed]);

  /** Categories are just the values entries carry — nothing to manage. */
  const categories = useMemo(() => {
    const used = new Set(entries.map((e) => e.category.trim()).filter(Boolean));
    return [...used].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  // The last entry of a category can disappear; do not keep filtering by it.
  useEffect(() => {
    if (filter && !categories.includes(filter)) setFilter("");
  }, [categories, filter]);

  const visible = filter ? filtered.filter((e) => e.category.trim() === filter) : filtered;

  /** Reordering works on the full list, so rows carry their real index. */
  const indexById = useMemo(() => new Map(entries.map((e, i) => [e.id, i])), [entries]);

  /** Group only in the unfiltered, unsearched view — otherwise a flat list. */
  const grouped = !searching && !filter && categories.length > 0;
  const groups = useMemo(() => {
    if (!grouped) return [];
    const byCategory = new Map<string, PasswordMeta[]>();
    for (const entry of visible) {
      const key = entry.category.trim();
      const list = byCategory.get(key);
      if (list) list.push(entry);
      else byCategory.set(key, [entry]);
    }
    const named = [...byCategory.keys()]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, items: byCategory.get(name) ?? [] }));
    const rest = byCategory.get("");
    // Uncategorised entries come last, under a neutral heading.
    return rest?.length ? [...named, { name: "", items: rest }] : named;
  }, [grouped, visible]);

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

  function toggleGroup(name: string) {
    setCollapsed((list) =>
      list.includes(name) ? list.filter((n) => n !== name) : [...list, name],
    );
  }

  if (editing !== null) {
    return (
      <EntryForm
        initial={editing === "new" ? null : editing}
        categories={categories}
        onDone={async () => {
          clearDraft(DRAFT_KEY);
          setEditing(null);
          await refresh();
        }}
        onCancel={() => {
          clearDraft(DRAFT_KEY);
          setEditing(null);
        }}
      />
    );
  }

  function renderRow(entry: PasswordMeta) {
    const drag = searching
      ? { className: "" }
      : dragProps(indexById.get(entry.id) ?? 0, entry.id);
    return (
      <li key={entry.id} {...drag} className={`entry ${drag.className}`}>
        <span
          className={`drag-handle ${searching ? "invisible" : ""}`}
          title={t("dragToReorder")}
          {...(searching ? {} : handleProps(entry.id))}
        >
          <IconGrip size={14} />
        </span>
        <span className="entry-icon">
          <IconShield size={17} />
        </span>
        <Cell value={entry.title} kind="title" />
        <Cell value={entry.username} kind="user" />
        <Cell value={entry.email} kind="mail" />
        <Cell
          value={shortUrl(entry.url)}
          full={entry.url}
          kind="url"
          onContextMenu={(ev) =>
            entry.url &&
            openMenu(ev, [
              { label: t("openUrl"), action: () => void api.openUrl(entry.url) },
              { label: t("copyUrl"), action: () => void api.copyText(entry.url) },
            ])
          }
        />
        <div className="entry-secret">
          <code>{revealed[entry.id] ?? "••••••••"}</code>
        </div>
        <div className="entry-actions">
          {/* Kept in place when there is no URL so every row's action
              block is the same width and the columns stay aligned. */}
          <button
            className={`icon ${entry.url ? "" : "invisible"}`}
            title={t("openUrl")}
            onClick={() => entry.url && void api.openUrl(entry.url)}
          >
            <IconExternal size={15} />
          </button>
          <button
            className="icon"
            title={revealed[entry.id] !== undefined ? t("hide") : t("show")}
            onClick={() => void toggleReveal(entry.id)}
          >
            {revealed[entry.id] !== undefined ? <IconEyeOff size={15} /> : <IconEye size={15} />}
          </button>
          <button
            className="icon"
            title={t("copyPassword")}
            onClick={() => void api.copySecret("password", entry.id)}
          >
            <IconCopy size={15} />
          </button>
          <button
            className="icon"
            title={t("edit")}
            onClick={() => {
              rememberScroll();
              setEditing(entry);
            }}
          >
            <IconPencil size={15} />
          </button>
          <button className="icon danger" title={t("del")} onClick={() => void handleDelete(entry)}>
            <IconTrash size={15} />
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>{t("navPasswords")}</h2>
        <div className="view-header-actions">
          {/* Appears by itself once entries carry categories. The label is
              the current category so an active filter is never invisible. */}
          {categories.length > 0 && (
            <div className={`filter-select ${filter ? "active" : ""}`}>
              <Select
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "", label: t("filterAll") },
                  ...categories.map((name) => ({ value: name, label: name })),
                ]}
              />
            </div>
          )}
          <SearchBox query={query} onChange={setQuery} />
          <button
            onClick={() => {
              rememberScroll();
              setEditing("new");
            }}
          >
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
      {entries.length > 0 && visible.length === 0 && (
        <div className="empty-state">
          <IconSearch size={36} />
          <span>{t("nothingMatches", { q: query })}</span>
        </div>
      )}

      <ul className="entry-list">
        {grouped
          ? groups.map((group) => {
              const folded = collapsed.includes(group.name);
              return [
                <li
                  key={`group-${group.name}`}
                  className={`group-header ${folded ? "collapsed" : ""}`}
                  onClick={() => toggleGroup(group.name)}
                >
                  <IconChevronDown size={13} className="group-chevron" />
                  {group.name || t("categoryOther")}
                  <span className="group-count muted">{group.items.length}</span>
                </li>,
                ...(folded ? [] : group.items.map(renderRow)),
              ];
            })
          : visible.map(renderRow)}
      </ul>
      {menu}
    </div>
  );
}

function EntryForm({
  initial,
  categories,
  onDone,
  onCancel,
}: {
  initial: PasswordMeta | null;
  categories: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const draft = getDraft<Draft>(DRAFT_KEY);
  const [form, setForm] = useState<PasswordInput>(() => draft?.form ?? EMPTY);
  // A new entry starts with whatever the user last chose; an existing
  // one always starts masked.
  const [showPw, setShowPw] = useState(() => initial === null && loadNewEntryReveal());
  const [regenerated, setRegenerated] = useState(false);
  const [shake, setShake] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(initial === null || draft !== undefined);
  const { menu, openMenu } = useContextMenu();

  /** All empty required fields shake together. */
  const invalid = (field: string, empty: boolean) =>
    shake > 0 && missing.includes(field) && empty ? "shake invalid" : "";

  // Editing an existing entry: fetch its password once so saving does not
  // silently blank it.
  useEffect(() => {
    if (!initial || draft) return;
    void (async () => {
      const password = await api.revealPassword(initial.id);
      setForm({
        title: initial.title,
        username: initial.username,
        password,
        email: initial.email,
        category: initial.category,
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

  // Remember what is typed so switching sections does not lose it.
  useEffect(() => {
    setDraft(DRAFT_KEY, { initial, form });
  }, [initial, form]);

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
        <div className="field">
          <span>{t("fCategory")}</span>
          <ComboBox
            value={form.category}
            options={categories}
            onChange={(category) => setForm((f) => ({ ...f, category }))}
            placeholder={t("categoryPh")}
          />
        </div>
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
