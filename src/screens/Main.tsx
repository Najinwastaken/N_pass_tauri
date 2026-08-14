import { useState } from "react";
import { api } from "../api";
import { PasswordsView } from "./PasswordsView";
import { GeneratorView } from "./GeneratorView";

interface Props {
  profile: string;
  onLocked: () => void;
}

type Section =
  | "passwords"
  | "passkeys"
  | "cards"
  | "notes"
  | "generator"
  | "settings";

const SECTIONS: { id: Section; label: string; ready: boolean }[] = [
  { id: "passwords", label: "Passwords", ready: true },
  { id: "passkeys", label: "Passkeys", ready: false },
  { id: "cards", label: "Credit Cards", ready: false },
  { id: "notes", label: "Secure Notes", ready: false },
  { id: "generator", label: "Pass. Generation", ready: true },
  { id: "settings", label: "Settings", ready: false },
];

export function Main({ profile, onLocked }: Props) {
  const [section, setSection] = useState<Section>("passwords");

  async function handleLock() {
    await api.lock();
    onLocked();
  }

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <div className="sidebar-profile">{profile}</div>
        <nav>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`nav-item ${section === s.id ? "active" : ""}`}
              disabled={!s.ready}
              title={s.ready ? undefined : "Coming in M3"}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <button className="nav-item lock" onClick={() => void handleLock()}>
          🔒 Lock
        </button>
      </aside>
      <main className="content">
        {section === "passwords" && <PasswordsView />}
        {section === "generator" && <GeneratorView />}
      </main>
    </div>
  );
}
