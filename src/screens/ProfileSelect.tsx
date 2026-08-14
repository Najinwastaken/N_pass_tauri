import { api } from "../api";

interface Props {
  profiles: string[];
  onOpen: (name: string) => void;
  onCreate: () => void;
  onChanged: () => void;
}

export function ProfileSelect({ profiles, onOpen, onCreate, onChanged }: Props) {
  async function handleDelete(name: string) {
    const ok = window.confirm(
      `Delete profile "${name}"?\nAll its data will be lost forever.`,
    );
    if (!ok) return;
    await api.deleteProfile(name);
    onChanged();
  }

  return (
    <div className="center-screen">
      <h1 className="app-title">N-Pass</h1>
      <p className="muted">Choose a profile</p>
      <div className="profile-grid">
        {profiles.map((name) => (
          <div key={name} className="profile-tile" onClick={() => onOpen(name)}>
            <span className="profile-avatar">{name[0]?.toUpperCase()}</span>
            <span className="profile-name">{name}</span>
            <button
              className="tile-delete"
              title="Delete profile"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(name);
              }}
            >
              ×
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
