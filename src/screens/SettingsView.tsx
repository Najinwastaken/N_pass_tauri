import { useEffect, useState } from "react";
import { api, Settings } from "../api";
import { applyTheme, Theme } from "../lib/theme";

interface Props {
  onThemeChange: (theme: Theme) => void;
}

export function SettingsView({ onThemeChange }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.getSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  async function save(next: Settings) {
    setSettings(next);
    await api.updateSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function setTheme(theme: Theme) {
    applyTheme(theme);
    onThemeChange(theme);
    void save({ ...settings!, theme });
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Settings</h2>
        {saved && <span className="muted fade-out">Saved ✓</span>}
      </div>
      <div className="settings">
        <label className="settings-row">
          <div>
            <div>Auto-lock after inactivity</div>
            <div className="muted small">0 = never lock automatically</div>
          </div>
          <div className="input-suffix">
            <input
              type="number"
              min={0}
              max={1440}
              value={settings.auto_lock_minutes}
              onChange={(e) =>
                void save({
                  ...settings,
                  auto_lock_minutes: Math.max(0, Math.min(1440, Number(e.target.value) || 0)),
                })
              }
            />
            <span className="muted">min</span>
          </div>
        </label>

        <label className="settings-row">
          <div>
            <div>Lock when window is minimized</div>
          </div>
          <input
            type="checkbox"
            checked={settings.lock_on_minimize}
            onChange={(e) => void save({ ...settings, lock_on_minimize: e.target.checked })}
          />
        </label>

        <label className="settings-row">
          <div>
            <div>Theme</div>
          </div>
          <div className="theme-switch">
            <button
              className={settings.theme === "dark" ? "active" : ""}
              onClick={() => setTheme("dark")}
              type="button"
            >
              🌙 Dark
            </button>
            <button
              className={settings.theme === "light" ? "active" : ""}
              onClick={() => setTheme("light")}
              type="button"
            >
              ☀️ Light
            </button>
          </div>
        </label>
      </div>
    </div>
  );
}
