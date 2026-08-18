import { useEffect, useState } from "react";
import { api, CardInput, CardMeta } from "../api";
import { digitsOnly, expiryWholeValue, smartCopy, useClearCellSelection } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";
import { Select } from "../lib/Select";
import { Cell } from "../lib/Cell";
import { SearchBox, useSearch } from "../lib/useSearch";
import { t } from "../lib/i18n";
import { useListScroll } from "../lib/useListScroll";
import { clearDraft, getDraft, setDraft } from "../lib/drafts";

/** Key of the in-memory draft for this section (see lib/drafts.ts). */
const DRAFT_KEY = "cards";
type Draft = { initial: CardMeta | null; form: CardInput };
import {
  IconCard,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconGrip,
  IconPencil,
  IconPlus,
  IconTrash,
} from "../lib/icons";

const EMPTY: CardInput = {
  title: "",
  provider: "",
  cardholder: "",
  number: "",
  expiry: "",
  cvv: "",
  notes: "",
};

const PROVIDERS = ["Visa", "Mastercard", "American Express", "Мир", "UnionPay", "Maestro"];

/** "1234567890123456" -> "1234-5678-9012-3456" (display only). */
function formatCardNumber(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}

/** Best-effort payment network detection by BIN prefix. */
function detectProvider(digits: string): string {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "American Express";
  if (/^220[0-4]/.test(digits)) return "Мир";
  if (/^62/.test(digits)) return "UnionPay";
  if (/^(5[06-8]|6304|676[1-3])/.test(digits)) return "Maestro";
  return "";
}

export function CardsView() {
  const [entries, setEntries] = useState<CardMeta[]>([]);
  // An unfinished form is reopened when the user comes back to this tab.
  const [editing, setEditing] = useState<CardMeta | "new" | null>(() => {
    const draft = getDraft<Draft>(DRAFT_KEY);
    return draft ? (draft.initial ?? "new") : null;
  });
  // Coming back from the form should land where the user was.
  const rememberScroll = useListScroll(editing !== null, entries);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const { dragProps, handleProps } = useDragReorder("cards", entries, setEntries);
  useClearCellSelection();
  const { query, setQuery, filtered, searching } = useSearch(entries, (e) => [
    e.title,
    e.provider,
    e.cardholder,
  ]);

  async function refresh() {
    setEntries(await api.listCards());
    setRevealed({});
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggleRevealNumber(id: string) {
    if (revealed[id] !== undefined) {
      setRevealed(({ [id]: _, ...rest }) => rest);
    } else {
      const number = await api.revealCardField(id, "number");
      setRevealed((r) => ({ ...r, [id]: formatCardNumber(number) }));
    }
  }

  async function handleDelete(entry: CardMeta) {
    if (!window.confirm(t("deleteEntryConfirm", { name: entry.title }))) return;
    await api.deleteCard(entry.id);
    await refresh();
  }

  if (editing !== null) {
    return (
      <CardForm
        initial={editing === "new" ? null : editing}
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

  return (
    <div className="view">
      <div className="view-header">
        <h2>{t("navCards")}</h2>
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
          <IconCard size={36} />
          <span>{t("emptyCards")}</span>
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
                <IconCard size={17} />
              </span>
              <Cell value={e.title} kind="title" />
              <Cell value={e.provider} kind="provider" />
              <Cell value={e.cardholder} kind="holder" />
              {/* Cursor-position smart copy: before the slash = MM, after = YY */}
              <Cell value={e.expiry} kind="expiry" wholeValue={expiryWholeValue} />
              <div className="entry-secret">
                <code>{revealed[e.id] ?? `•••• ${e.last4}`}</code>
              </div>
              <div className="entry-actions">
                <button
                  className="icon"
                  title={revealed[e.id] !== undefined ? t("hideNumber") : t("showNumber")}
                  onClick={() => void toggleRevealNumber(e.id)}
                >
                  {revealed[e.id] !== undefined ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
                <button
                  className="icon"
                  title={t("copyNumber")}
                  onClick={() => void api.copySecret("card_number", e.id)}
                >
                  <IconCopy size={15} />
                </button>
                <button
                  className="icon"
                  title={t("copyCvv")}
                  onClick={() => void api.copySecret("card_cvv", e.id)}
                >
                  CVV
                </button>
                <button className="icon" title={t("edit")} onClick={() => { rememberScroll(); setEditing(e); }}>
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

function CardForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: CardMeta | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const draft = getDraft<Draft>(DRAFT_KEY);
  const [form, setForm] = useState<CardInput>(() => draft?.form ?? EMPTY);
  const [showCvv, setShowCvv] = useState(false);
  const [shake, setShake] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(initial === null || draft !== undefined);

  const invalid = (field: string, empty: boolean) =>
    shake > 0 && missing.includes(field) && empty ? "shake invalid" : "";

  useEffect(() => {
    if (!initial || draft) return;
    void (async () => {
      const [number, cvv] = await Promise.all([
        api.revealCardField(initial.id, "number"),
        api.revealCardField(initial.id, "cvv"),
      ]);
      setForm({
        title: initial.title,
        provider: initial.provider,
        cardholder: initial.cardholder,
        number,
        expiry: initial.expiry,
        cvv,
        notes: initial.notes,
      });
      setLoaded(true);
    })();
  }, [initial]);

  // Remember what is typed so switching sections does not lose it.
  useEffect(() => {
    setDraft(DRAFT_KEY, { initial, form });
  }, [initial, form]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const miss: string[] = [];
    if (!form.title.trim()) miss.push("title");
    if (!form.number) miss.push("number");
    if (miss.length > 0) {
      setMissing(miss);
      setShake((n) => n + 1);
      return;
    }
    if (initial) await api.updateCard(initial.id, form);
    else await api.addCard(form);
    onDone();
  }

  /** Keep digits in state, show dashes in the field. Auto-pick the
      provider while the user has not chosen one explicitly. */
  function setNumber(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
    setForm((f) => ({
      ...f,
      number: digits,
      provider: f.provider || detectProvider(digits),
    }));
  }

  /** Auto-insert the slash: "12" + "3" -> "12/3". */
  function setExpiry(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
    const value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    setForm((f) => ({ ...f, expiry: value }));
  }

  const set = (field: keyof CardInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  if (!loaded) return null;

  return (
    <div className="view narrow">
      <div className="view-header">
        <h2>{initial ? t("editCard") : t("newCard")}</h2>
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
        <div className="form-row">
          <label>
            {t("fProvider")}
            <Select
              value={form.provider}
              onChange={(provider) => setForm((f) => ({ ...f, provider }))}
              options={[
                { value: "", label: "—" },
                ...PROVIDERS.map((p) => ({ value: p, label: p })),
              ]}
            />
          </label>
          <label>
            {t("fCardholder")}
            <input value={form.cardholder} onChange={set("cardholder")} onKeyDown={smartCopy()} />
          </label>
        </div>
        <label>
          {t("fCardNumber")} *
          {/* Smart Ctrl+C with no selection copies digits only, no dashes */}
          <input
            key={`n${shake}`}
            className={invalid("number", !form.number)}
            inputMode="numeric"
            value={formatCardNumber(form.number)}
            onChange={setNumber}
            placeholder="1234-5678-9012-3456"
            onKeyDown={smartCopy(digitsOnly)}
          />
        </label>
        <div className="form-row">
          <label>
            {t("fExpiry")}
            {/* Ctrl+C copies month or year depending on cursor position */}
            <input
              inputMode="numeric"
              value={form.expiry}
              onChange={setExpiry}
              placeholder="MM/YY"
              onKeyDown={smartCopy(expiryWholeValue)}
            />
          </label>
          <label>
            CVV
            <div className="input-row">
              <input
                type={showCvv ? "text" : "password"}
                inputMode="numeric"
                maxLength={4}
                value={form.cvv}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cvv: e.target.value.replace(/\D/g, "") }))
                }
                onKeyDown={smartCopy()}
              />
              <button
                type="button"
                className="icon"
                title={showCvv ? t("hide") : t("show")}
                onClick={() => setShowCvv((v) => !v)}
              >
                {showCvv ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </label>
        </div>
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
    </div>
  );
}
