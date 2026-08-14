import { useEffect, useState } from "react";
import { api, CardInput, CardMeta } from "../api";
import { digitsOnly, expiryWholeValue, smartCopy } from "../lib/smartCopy";
import { useDragReorder } from "../lib/useDragReorder";

const EMPTY: CardInput = {
  title: "",
  cardholder: "",
  number: "",
  expiry: "",
  cvv: "",
  notes: "",
};

/** "1234567890123456" -> "1234-5678-9012-3456" (display only). */
function formatCardNumber(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}

export function CardsView() {
  const [entries, setEntries] = useState<CardMeta[]>([]);
  const [editing, setEditing] = useState<CardMeta | "new" | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const dragProps = useDragReorder("cards", entries, setEntries);

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
        <button onClick={() => setEditing("new")}>+ Add</button>
      </div>
      {entries.length === 0 && <p className="muted">No cards yet.</p>}
      <ul className="entry-list">
        {entries.map((e, index) => {
          const drag = dragProps(index, e.id);
          return (
            <li key={e.id} {...drag} className={`entry ${drag.className}`}>
              <span className="drag-handle" title="Drag to reorder">⋮⋮</span>
              <div className="entry-main">
                <span className="entry-title">{e.title}</span>
                <span className="entry-sub">{e.cardholder}</span>
                <span className="entry-sub muted">{e.expiry}</span>
              </div>
              <div className="entry-secret">
                <code>{revealed[e.id] ?? `•••• ${e.last4}`}</code>
              </div>
              <div className="entry-actions">
                <button
                  className="icon"
                  title={revealed[e.id] !== undefined ? "Hide number" : "Show number"}
                  onClick={() => void toggleRevealNumber(e.id)}
                >
                  {revealed[e.id] !== undefined ? "🙈" : "👁"}
                </button>
                <button
                  className="icon"
                  title="Copy number (no dashes)"
                  onClick={() => void api.copySecret("card_number", e.id)}
                >
                  ⧉
                </button>
                <button
                  className="icon"
                  title="Copy CVV"
                  onClick={() => void api.copySecret("card_cvv", e.id)}
                >
                  #
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
  const [loaded, setLoaded] = useState(initial === null);

  useEffect(() => {
    if (!initial) return;
    void (async () => {
      const [number, cvv] = await Promise.all([
        api.revealCardField(initial.id, "number"),
        api.revealCardField(initial.id, "cvv"),
      ]);
      setForm({
        title: initial.title,
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
    if (!form.title.trim()) {
      setShake((n) => n + 1);
      return;
    }
    if (initial) await api.updateCard(initial.id, form);
    else await api.addCard(form);
    onDone();
  }

  /** Keep digits in state, show dashes in the field. */
  function setNumber(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
    setForm((f) => ({ ...f, number: digits }));
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
    <div className="view">
      <div className="view-header">
        <h2>{initial ? "Edit card" : "New card"}</h2>
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
          Cardholder
          <input value={form.cardholder} onChange={set("cardholder")} onKeyDown={smartCopy()} />
        </label>
        <label>
          Card number
          {/* Smart Ctrl+C with no selection copies digits only, no dashes */}
          <input
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
                {showCvv ? "🙈" : "👁"}
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
