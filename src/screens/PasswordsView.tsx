import { useEffect, useMemo, useState } from "react";
import { api, PasswordInput, PasswordMeta } from "../api";
import { smartCopy, useClearCellSelection } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";
import { useContextMenu } from "../lib/ContextMenu";
import { StrengthMeter } from "../lib/strength";
import {
  IconChevronDown,
  IconCollapseAll,
  IconCopy,
  IconDots,
  IconExpandAll,
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
import { categoryKey, loadCollapsed, saveCollapsed } from "../lib/viewPrefs";

/** Key of the in-memory draft for this section (see lib/drafts.ts). */
const DRAFT_KEY = "passwords";
type Draft = { initial: PasswordMeta | null; form: PasswordInput };

/** Which category is selected — kept for the session so switching tabs
    does not reset the view. Folded groups outlive the session and live in
    viewPrefs instead. */
const VIEW_KEY = "passwords-view";
type ViewState = { filter: string };

const EMPTY: PasswordInput = {
  title: "",
  username: "",
  password: "",
  email: "",
  category: "",
  url: "",
  notes: "",
};

export function PasswordsView({ profile }: { profile: string }) {
  const [entries, setEntries] = useState<PasswordMeta[]>([]);
  // An unfinished form is reopened when the user comes back to this tab.
  const [editing, setEditing] = useState<PasswordMeta | "new" | null>(() => {
    const draft = getDraft<Draft>(DRAFT_KEY);
    return draft ? (draft.initial ?? "new") : null;
  });
  // Coming back from the form should land where the user was.
  const rememberScroll = useListScroll(editing !== null, entries);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const { dragProps, handleProps } = useDragReorder(
    "passwords",
    entries,
    setEntries,
    // A row may only be reordered inside its own category. Dropping it into
    // another group would look like a move, but the category is a field
    // rather than a position, so the row would spring straight back.
    (from, to) =>
      !grouped || entries[from]?.category.trim() === entries[to]?.category.trim(),
  );
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
  useEffect(() => {
    setDraft(VIEW_KEY, { filter });
  }, [filter]);

  // Folded groups are held as fingerprints, which is also what goes to disk.
  const [collapsed, setCollapsed] = useState<string[]>(() => loadCollapsed(profile));

  // The arranged category order lives in the vault settings, so it travels
  // with a copied vault instead of staying behind on this machine.
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    void api.getSettings().then((s) => setOrder(s.category_order ?? []));
  }, []);

  const [draggingCategory, setDraggingCategory] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  /** Categories are just the values entries carry — nothing to manage.
      Arranged ones lead in the order the user set, the rest follow
      alphabetically, so only what was deliberately placed has to be stored. */
  const categories = useMemo(() => {
    const used = new Set(entries.map((e) => e.category.trim()).filter(Boolean));
    const arranged = order.filter((name) => used.has(name));
    const rest = [...used]
      .filter((name) => !arranged.includes(name))
      .sort((a, b) => a.localeCompare(b));
    return [...arranged, ...rest];
  }, [entries, order]);

  // Persist the folded groups, dropping fingerprints of categories that no
  // longer exist. Guarded on categories being known: on the very first
  // render the entries have not loaded yet and everything would look stale.
  useEffect(() => {
    if (!categories.length) return;
    const known = new Set([...categories, ""].map(categoryKey));
    saveCollapsed(profile, collapsed.filter((key) => known.has(key)));
  }, [profile, collapsed, categories]);

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
    const named = categories
      .filter((name) => byCategory.has(name))
      .map((name) => ({ name, items: byCategory.get(name) ?? [] }));
    const rest = byCategory.get("");
    // Uncategorised entries come last, under a neutral heading.
    return rest?.length ? [...named, { name: "", items: rest }] : named;
  }, [grouped, visible, categories]);

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

  /** Categories reorder locally and persist into the vault settings — there
      is no list of category entities, hence no Rust list kind to pass. */
  const categoryItems = useMemo(() => categories.map((name) => ({ id: name })), [categories]);
  const catDrag = useDragReorder(null, categoryItems, (next) => {
    const names = next.map((i) => i.id);
    setOrder(names);
    void (async () => {
      const settings = await api.getSettings();
      await api.updateSettings({ ...settings, category_order: names });
    })();
  });

  /** The catch-all group is not a category: it cannot be dragged, but it is
      still a target so a category can be dropped at the very end. */
  function categoryHeaderProps(name: string, isOther: boolean) {
    const index = isOther ? categories.length : categories.indexOf(name);
    const props = catDrag.dragProps(index, name);
    return {
      ...props,
      draggable: isOther ? false : props.draggable,
      onDragStart: (e: React.DragEvent) => {
        setDraggingCategory(true);
        props.onDragStart(e);
      },
      onDragEnd: () => {
        setDraggingCategory(false);
        props.onDragEnd();
      },
    };
  }

  /** Renaming rewrites the field on every entry of the category. Rust does it
      in one pass and one save, so no passwords have to come out here. */
  async function commitRename(from: string) {
    const to = renameValue.trim();
    setRenaming(null);
    if (!to || to === from) return;
    const merges = categories.some((name) => name !== from && name === to);
    if (merges && !window.confirm(t("categoryMergeConfirm", { from, to }))) return;
    await api.renameCategory(from, to);
    // The fingerprint changes with the name; carry the folded state over.
    setCollapsed((list) =>
      list.map((key) => (key === categoryKey(from) ? categoryKey(to) : key)),
    );
    // Rust moved the arranged position onto the new name; pick it back up.
    const settings = await api.getSettings();
    setOrder(settings.category_order ?? []);
    await refresh();
  }

  const allCollapsed =
    groups.length > 0 && groups.every((g) => collapsed.includes(categoryKey(g.name)));

  function toggleGroup(name: string) {
    const key = categoryKey(name);
    setCollapsed((list) =>
      list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
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
          {grouped && (
            <button
              className="icon"
              title={allCollapsed ? t("expandAll") : t("collapseAll")}
              onClick={() =>
                setCollapsed(allCollapsed ? [] : groups.map((g) => categoryKey(g.name)))
              }
            >
              {allCollapsed ? <IconExpandAll size={16} /> : <IconCollapseAll size={16} />}
            </button>
          )}
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
              const folded = collapsed.includes(categoryKey(group.name));
              const isOther = group.name === "";
              const drag = categoryHeaderProps(group.name, isOther);
              return [
                <li
                  key={`group-${group.name}`}
                  {...drag}
                  className={`group-header ${folded ? "collapsed" : ""} ${drag.className}`}
                  onClick={() => toggleGroup(group.name)}
                >
                  <span
                    className={`drag-handle ${isOther ? "invisible" : ""}`}
                    title={t("dragToReorderCategory")}
                    onClick={(e) => e.stopPropagation()}
                    {...(isOther ? {} : catDrag.handleProps(group.name))}
                  >
                    <IconGrip size={13} />
                  </span>
                  <IconChevronDown size={13} className="group-chevron" />
                  {renaming === group.name ? (
                    <input
                      className="group-rename"
                      autoFocus
                      value={renameValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename(group.name);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      onBlur={() => setRenaming(null)}
                    />
                  ) : (
                    group.name || t("categoryOther")
                  )}
                  <span className="group-count muted">{group.items.length}</span>
                  {!isOther && (
                    <button
                      className="icon group-menu"
                      title={t("renameCategory")}
                      onClick={(e) =>
                        openMenu(e, [
                          {
                            label: t("renameCategory"),
                            action: () => {
                              setRenameValue(group.name);
                              setRenaming(group.name);
                            },
                          },
                        ])
                      }
                    >
                      <IconDots size={14} />
                    </button>
                  )}
                </li>,
                // While a category is on the move the list shows headers only:
                // you are arranging categories, not rows.
                ...(folded || draggingCategory ? [] : group.items.map(renderRow)),
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
