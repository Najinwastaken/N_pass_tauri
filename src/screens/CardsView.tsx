import { useEffect, useState } from "react";
import { api, CardInput, CardMeta } from "../api";
import { digitsOnly, expiryWholeValue, smartCopy, useClearCellSelection } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";
import { Select } from "../lib/Select";
import { Cell } from "../lib/Cell";
import { SearchBox, useSearch } from "../lib/useSearch";
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
  const [editing, setEditing] = useState<CardMeta | "new" | null>(null);
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
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    await api.deleteCard(entry.id);
    await refresh();
  }

  if (editing !== null) {
    return (
      <CardForm
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
        <h2>Credit Cards</h2>
        <div className="view-header-actions">
          <SearchBox query={query} onChange={setQuery} />
          <button onClick={() => setEditing("new")}>
            <IconPlus size={15} />
            Add
          </button>
        </div>
      </div>
      {entries.length === 0 && (
        <div className="empty-state">
          <IconCard size={36} />
          <span>No cards yet.</span>
        </div>
      )}
      <ul className="entry-list">
        {filtered.map((e, index) => {
          const drag = searching ? { className: "" } : dragProps(index, e.id);
          return (
            <li key={e.id} {...drag} className={`entry ${drag.className}`}>
              {!searching && (
                <span className="drag-handle" title="Drag to reorder" {...handleProps(e.id)}>
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
                  title={revealed[e.id] !== undefined ? "Hide number" : "Show number"}
                  onClick={() => void toggleRevealNumber(e.id)}
                >
                  {revealed[e.id] !== undefined ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
                <button
                  className="icon"
                  title="Copy number (no dashes)"
                  onClick={() => void api.copySecret("card_number", e.id)}
                >
                  <IconCopy size={15} />
                </button>
                <button
                  className="icon"
                  title="Copy CVV"
                  onClick={() => void api.copySecret("card_cvv", e.id)}
                >
                  CVV
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
  const [form, setForm] = useState<CardInput>(EMPTY);
  const [showCvv, setShowCvv] = useState(false);
  const [shake, setShake] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(initial === null);

  const invalid = (field: string, empty: boolean) =>
    shake > 0 && missing.includes(field) && empty ? "shake invalid" : "";

  useEffect(() => {
    if (!initial) return;
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
        <h2>{initial ? "Edit card" : "New card"}</h2>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Title *
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
            Payment provider
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
            Cardholder
            <input value={form.cardholder} onChange={set("cardholder")} onKeyDown={smartCopy()} />
          </label>
        </div>
        <label>
          Card number *
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
            Expiry (MM/YY)
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
                title={showCvv ? "Hide" : "Show"}
                onClick={() => setShowCvv((v) => !v)}
              >
                {showCvv ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </label>
        </div>
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
    </div>
  );
}
