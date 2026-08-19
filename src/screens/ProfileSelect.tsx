import { useState } from "react";
import { api } from "../api";
import { t } from "../lib/i18n";
import { IconPencil, IconPlus, IconTrash } from "../lib/icons";

interface Props {
  profiles: string[];
  onOpen: (name: string) => void;
  onCreate: () => void;
  onChanged: () => void;
}

export function ProfileSelect({ profiles, onOpen, onCreate, onChanged }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [shake, setShake] = useState(0);

  async function handleDelete(name: string) {
    const ok = window.confirm(t("deleteProfileConfirm", { name }));
    if (!ok) return;
    await api.deleteProfile(name);
    onChanged();
  }

  function startRename(name: string) {
    setRenaming(name);
    setNewName(name);
  }

  async function commitRename() {
    if (renaming === null) return;
    const target = newName.trim();
    if (!target || target === renaming) {
      setRenaming(null);
      return;
    }
    try {
      await api.renameProfile(renaming, target);
      setRenaming(null);
      onChanged();
    } catch {
      setShake((n) => n + 1); // invalid name or already exists
    }
  }

  return (
    <div className="center-screen">
      <h1 className="app-title">N-Pass</h1>
      <p className="muted">{t("chooseProfile")}</p>
      <div className="profile-grid">
        {profiles.map((name, index) => (
          <div
            key={name}
            className="profile-tile"
            // Tiles fly in one after another rather than all at once.
            style={{ animationDelay: `${0.3 + index * 0.09}s` }}
            onClick={() => renaming !== name && onOpen(name)}
          >
            <span className="profile-avatar">{name[0]?.toUpperCase()}</span>
            {renaming === name ? (
              <input
                key={shake}
                className={`tile-rename ${shake > 0 ? "shake invalid" : ""}`}
                autoFocus
                value={newName}
                maxLength={40}
                onChange={(e) => setNewName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={() => void commitRename()}
              />
            ) : (
              <span className="profile-name">{name}</span>
            )}
            <button
              className="icon tile-edit"
              title={t("renameProfile")}
              onClick={(e) => {
                e.stopPropagation();
                startRename(name);
              }}
            >
              <IconPencil size={13} />
            </button>
            <button
              className="icon danger tile-delete"
              title={t("deleteProfile")}
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(name);
              }}
            >
              <IconTrash size={13} />
            </button>
          </div>
        ))}
      </div>
      {/* Creating a profile is a rare, secondary act — it sits out of the
          way in the corner so the profiles themselves stay centred, and it
          keeps its label so it still explains itself. */}
      <button className="secondary corner-action" onClick={onCreate}>
        <IconPlus size={15} />
        {t("newProfile")}
      </button>
    </div>
  );
}
