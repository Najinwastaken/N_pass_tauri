import { useState } from "react";
import { api } from "../api";
import { IconPencil, IconX } from "../lib/icons";

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
    const ok = window.confirm(
      `Delete profile "${name}"?\nAll its data will be lost forever.`,
    );
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
      <p className="muted">Choose a profile</p>
      <div className="profile-grid">
        {profiles.map((name) => (
          <div
            key={name}
            className="profile-tile"
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
              title="Rename profile"
              onClick={(e) => {
                e.stopPropagation();
                startRename(name);
              }}
            >
              <IconPencil size={13} />
            </button>
            <button
              className="icon danger tile-delete"
              title="Delete profile"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(name);
              }}
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
        <div className="profile-tile new" onClick={onCreate}>
          <span className="profile-avatar">+</span>
          <span className="profile-name">New profile</span>
        </div>
      </div>
    </div>
  );
}
