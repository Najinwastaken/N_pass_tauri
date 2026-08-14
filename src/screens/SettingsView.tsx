import { useEffect, useState } from "react";
import { api, Settings } from "../api";
import { Theme } from "../lib/theme";
import { ThemeSwitch } from "../lib/ThemeSwitch";

interface Props {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export function SettingsView({ theme, onThemeChange }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    void api.getSettings().then(setSettings);
  }, []);

  // Keep the theme row in sync when it is changed from the sidebar.
  useEffect(() => {
    setSettings((s) => (s ? { ...s, theme } : s));
  }, [theme]);

  if (!settings) return null;

  async function save(next: Settings) {
    setSettings(next);
    await api.updateSettings(next);
    setSaved((n) => n + 1);
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Settings</h2>
        {saved > 0 && (
          <span className="muted small fade-out" key={saved}>
            Saved
          </span>
        )}
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
            <span className="muted small">min</span>
          </div>
        </label>

        <label className="settings-row">
          <div>Lock when window is minimized</div>
          <span className="switch">
            <input
              type="checkbox"
              checked={settings.lock_on_minimize}
              onChange={(e) => void save({ ...settings, lock_on_minimize: e.target.checked })}
            />
            <span className="switch-track" />
          </span>
        </label>

        <div className="settings-row" style={{ cursor: "default" }}>
          <div>Theme</div>
          <div style={{ width: 180 }}>
            <ThemeSwitch theme={theme} onChange={onThemeChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
