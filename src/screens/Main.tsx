import { useEffect, useState } from "react";
import { api } from "../api";
import { PasswordsView } from "./PasswordsView";
import { GeneratorView } from "./GeneratorView";
import { CardsView } from "./CardsView";
import { NotesView } from "./NotesView";
import { KeysView } from "./KeysView";

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
  { id: "passkeys", label: "Passkeys", ready: true },
  { id: "cards", label: "Credit Cards", ready: true },
  { id: "notes", label: "Secure Notes", ready: true },
  { id: "generator", label: "Pass. Generation", ready: true },
  { id: "settings", label: "Settings", ready: false },
];

/// Report user activity to the auto-lock timer, at most once per interval.
function useActivityReporting() {
  useEffect(() => {
    let last = 0;
    const report = () => {
      const now = Date.now();
      if (now - last < 10_000) return;
      last = now;
      void api.touchActivity();
    };
    window.addEventListener("mousemove", report);
    window.addEventListener("keydown", report);
    window.addEventListener("click", report);
    return () => {
      window.removeEventListener("mousemove", report);
      window.removeEventListener("keydown", report);
      window.removeEventListener("click", report);
    };
  }, []);
}

export function Main({ profile, onLocked }: Props) {
  const [section, setSection] = useState<Section>("passwords");
  useActivityReporting();

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
        {section === "passkeys" && <KeysView />}
        {section === "cards" && <CardsView />}
        {section === "notes" && <NotesView />}
        {section === "generator" && <GeneratorView />}
      </main>
    </div>
  );
}
