import { useEffect, useState } from "react";
import { api } from "../api";
import { applyLang, currentLang, isLang, t } from "../lib/i18n";
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

const SECTIONS: { id: Section; labelKey: "navPasswords" | "navPasskeys" | "navCards" | "navNotes" | "navGenerator"; icon: React.ReactNode }[] = [
  { id: "passwords", labelKey: "navPasswords", icon: <IconShield size={16} /> },
  { id: "passkeys", labelKey: "navPasskeys", icon: <IconKey size={16} /> },
  { id: "cards", labelKey: "navCards", icon: <IconCard size={16} /> },
  { id: "notes", labelKey: "navNotes", icon: <IconNote size={16} /> },
  { id: "generator", labelKey: "navGenerator", icon: <IconSparkles size={16} /> },
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

  // Esc hint: visible only while an entry is being dragged.
  const [draggingActive, setDraggingActive] = useState(false);
  useEffect(() => {
    const on = () => setDraggingActive(true);
    const off = () => setDraggingActive(false);
    window.addEventListener("np-drag-active", on);
    window.addEventListener("np-drag-idle", off);
    return () => {
      window.removeEventListener("np-drag-active", on);
      window.removeEventListener("np-drag-idle", off);
    };
  }, []);

  // The vault's saved theme and language win once we are unlocked.
  useEffect(() => {
    void api.getSettings().then((s) => {
      const th: Theme = s.theme === "light" ? "light" : "dark";
      applyTheme(th);
      setTheme(th);
      if (isLang(s.language) && s.language !== currentLang()) {
        applyLang(s.language);
      }
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

  // Ctrl+L: instant lock (layout-independent via e.code).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "KeyL") {
        e.preventDefault();
        void handleLock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              {t(s.labelKey)}
            </button>
          ))}
        </nav>
        <div className={`drag-hint ${draggingActive ? "visible" : ""}`} aria-hidden={!draggingActive}>
          <span className="drag-hint-label">{t("hintPress")}</span>
          <span className="drag-hint-esc">
            <span className="drag-hint-esc-text">ESC</span>
          </span>
          <span className="drag-hint-label">{t("hintCancelDrag")}</span>
        </div>
        <div className="sidebar-footer">
          <ThemeSwitch theme={theme} onChange={(t) => void changeTheme(t)} />
          <button className="nav-item lock" onClick={() => void handleLock()}>
            <IconLock size={15} />
            {t("lock")}
          </button>
        </div>
      </aside>
      <main className="content fade-in" key={section}>
        {section === "passwords" && <PasswordsView profile={profile} />}
        {section === "passkeys" && <KeysView />}
        {section === "cards" && <CardsView />}
        {section === "notes" && <NotesView />}
        {section === "generator" && <GeneratorView />}
        {section === "settings" && <SettingsView theme={theme} onThemeChange={(t) => void changeTheme(t)} />}
      </main>
    </div>
  );
}
