import { useEffect, useState } from "react";
import { api } from "../api";
import { applyTheme, cachedTheme, Theme } from "../lib/theme";
import { ThemeSwitch } from "../lib/ThemeSwitch";
import {
  IconCard,
  IconKey,
  IconLock,
  IconNote,
  IconShield,
  IconSparkles,
} from "../lib/icons";
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

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "passwords", label: "Passwords", icon: <IconShield size={16} /> },
  { id: "passkeys", label: "Passkeys", icon: <IconKey size={16} /> },
  { id: "cards", label: "Credit Cards", icon: <IconCard size={16} /> },
  { id: "notes", label: "Secure Notes", icon: <IconNote size={16} /> },
  { id: "generator", label: "Generator", icon: <IconSparkles size={16} /> },
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

  // Settings now lives in the titlebar (outside this component) — it
  // signals via a window event.
  useEffect(() => {
    const open = () => setSection("settings");
    window.addEventListener("np-open-settings", open);
    return () => window.removeEventListener("np-open-settings", open);
  }, []);

  // The vault's saved theme wins once we are unlocked.
  useEffect(() => {
    void api.getSettings().then((s) => {
      const t: Theme = s.theme === "light" ? "light" : "dark";
      applyTheme(t);
      setTheme(t);
    });
  }, []);

  async function changeTheme(next: Theme) {
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
          <span className="sidebar-avatar">{profile[0]?.toUpperCase()}</span>
          <span className="sidebar-profile-name">{profile}</span>
        </div>
        <nav>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`nav-item ${section === s.id ? "active" : ""}`}
              onClick={() => setSection(s.id)}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ThemeSwitch theme={theme} onChange={(t) => void changeTheme(t)} />
          <button className="nav-item lock" onClick={() => void handleLock()}>
            <IconLock size={15} />
            Lock
          </button>
        </div>
      </aside>
      <main className="content fade-in" key={section}>
        {section === "passwords" && <PasswordsView />}
        {section === "passkeys" && <KeysView />}
        {section === "cards" && <CardsView />}
        {section === "notes" && <NotesView />}
        {section === "generator" && <GeneratorView />}
        {section === "settings" && <SettingsView theme={theme} onThemeChange={(t) => void changeTheme(t)} />}
      </main>
    </div>
  );
}
