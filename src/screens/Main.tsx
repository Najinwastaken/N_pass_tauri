import { useEffect, useState } from "react";
import { api } from "../api";
import { applyTheme, cachedTheme, Theme } from "../lib/theme";
import { PasswordsView } from "./PasswordsView";
import { GeneratorView } from "./GeneratorView";
import { CardsView } from "./CardsView";
import { NotesView } from "./NotesView";
import { KeysView } from "./KeysView";
import { SettingsView } from "./SettingsView";

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

const SECTIONS: { id: Section; label: string }[] = [
  { id: "passwords", label: "Passwords" },
  { id: "passkeys", label: "Passkeys" },
  { id: "cards", label: "Credit Cards" },
  { id: "notes", label: "Secure Notes" },
  { id: "generator", label: "Pass. Generation" },
  { id: "settings", label: "Settings" },
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
  const [theme, setTheme] = useState<Theme>(cachedTheme());
  useActivityReporting();

  // The vault's saved theme wins once we are unlocked.
  useEffect(() => {
    void api.getSettings().then((s) => {
      const t: Theme = s.theme === "light" ? "light" : "dark";
      applyTheme(t);
      setTheme(t);
    });
  }, []);

  async function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
    const settings = await api.getSettings();
    await api.updateSettings({ ...settings, theme: next });
  }

  async function handleLock() {
    await api.lock();
    onLocked();
  }

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <div className="sidebar-profile">
          <span>{profile}</span>
          <button
            className="icon theme-toggle"
            title={theme === "dark" ? "Light theme" : "Dark theme"}
            onClick={() => void toggleTheme()}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        <nav>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`nav-item ${section === s.id ? "active" : ""}`}
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
      <main className="content fade-in" key={section}>
        {section === "passwords" && <PasswordsView />}
        {section === "passkeys" && <KeysView />}
        {section === "cards" && <CardsView />}
        {section === "notes" && <NotesView />}
        {section === "generator" && <GeneratorView />}
        {section === "settings" && <SettingsView onThemeChange={setTheme} />}
      </main>
    </div>
  );
}
