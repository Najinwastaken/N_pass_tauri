import { useEffect, useState } from "react";
import { useAppVersion } from "../lib/version";
import { api, Settings } from "../api";
import { Theme } from "../lib/theme";
import { applyLang, currentLang, isLang, t, LANGUAGES } from "../lib/i18n";
import { ThemeSwitch } from "../lib/ThemeSwitch";
import { Select } from "../lib/Select";
import { StrengthMeter } from "../lib/strength";

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

  function changeLanguage(lang: string) {
    if (!isLang(lang)) return;
    applyLang(lang);
    void save({ ...settings!, language: lang });
  }

  return (
    <div className="view narrow">
      <div className="view-header">
        <h2>{t("settings")}</h2>
        {saved > 0 && (
          <span className="muted small fade-out" key={saved}>
            {t("saved")}
          </span>
        )}
      </div>
      <div className="settings">
        <label className="settings-row">
          <div>
            <div>{t("autoLock")}</div>
            <div className="muted small">{t("autoLockHint")}</div>
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
            <span className="muted small">{t("min")}</span>
          </div>
        </label>

        <label className="settings-row">
          <div>{t("lockOnMinimize")}</div>
          <span className="switch">
            <input
              type="checkbox"
              checked={settings.lock_on_minimize}
              onChange={(e) => void save({ ...settings, lock_on_minimize: e.target.checked })}
            />
            <span className="switch-track" />
          </span>
        </label>

        <label className="settings-row">
          <div>
            <div>{t("clipboardClear")}</div>
            <div className="muted small">{t("clipboardClearHint")}</div>
          </div>
          <div className="input-suffix">
            <input
              type="number"
              min={0}
              max={3600}
              value={settings.clipboard_clear_seconds}
              onChange={(e) =>
                void save({
                  ...settings,
                  clipboard_clear_seconds: Math.max(0, Math.min(3600, Number(e.target.value) || 0)),
                })
              }
            />
            <span className="muted small">{t("sec")}</span>
          </div>
        </label>

        <div className="settings-row" style={{ cursor: "default" }}>
          <div>{t("theme")}</div>
          <div style={{ width: 180 }}>
            <ThemeSwitch theme={theme} onChange={onThemeChange} />
          </div>
        </div>

        <div className="settings-row" style={{ cursor: "default" }}>
          <div>{t("language")}</div>
          <div style={{ width: 180 }}>
            <Select
              value={currentLang()}
              onChange={changeLanguage}
              options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
            />
          </div>
        </div>

        <div className="settings-row" style={{ cursor: "default" }}>
          <div>
            <div>{t("resetWindow")}</div>
            <div className="muted small">{t("resetWindowHint")}</div>
          </div>
          <button type="button" className="secondary" onClick={() => void api.resetWindow()}>
            {t("resetBtn")}
          </button>
        </div>

        <BackupSection settings={settings} onSave={(s) => void save(s)} />

        <ChangePassword />

        <VersionRow />
      </div>
    </div>
  );
}

/** Which build this is — the same number as the release it came from. */
function VersionRow() {
  const version = useAppVersion();
  return (
    <div className="settings-row" style={{ cursor: "default" }}>
      <div>{t("version")}</div>
      <div className="muted">N-Pass {version}</div>
    </div>
  );
}

/** Backup copy of the encrypted vault into any folder — point it at a
    Google Drive / Dropbox synced folder to get cloud backup without any
    cloud API in the app. */
function BackupSection({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");
  const hasDir = settings.backup_dir.trim().length > 0;

  async function choose() {
    const dir = await api.pickBackupDir();
    if (dir) onSave({ ...settings, backup_dir: dir });
  }

  async function backupNow() {
    try {
      await api.backupNow();
      setStatus("done");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="settings-row settings-block" style={{ cursor: "default" }}>
      <div className="settings-block-head">
        <div style={{ minWidth: 0 }}>
          <div>{t("backupFolder")}</div>
          <div className="muted small backup-path" title={settings.backup_dir}>
            {hasDir ? settings.backup_dir : t("backupHint")}
          </div>
        </div>
        <div className="input-suffix">
          {hasDir && (
            <button type="button" onClick={() => void backupNow()}>
              {status === "done"
                ? t("backupDone")
                : status === "error"
                  ? t("backupFailedBtn")
                  : t("backupNow")}
            </button>
          )}
          <button type="button" className="secondary" onClick={() => void choose()}>
            {hasDir ? t("change") : t("choose")}
          </button>
          {hasDir && (
            <button
              type="button"
              className="secondary"
              onClick={() => onSave({ ...settings, backup_dir: "", backup_on_save: false })}
            >
              {t("clear")}
            </button>
          )}
        </div>
      </div>
      {hasDir && (
        <label className="settings-inline-row">
          <span>{t("copyOnSave")}</span>
          <span className="switch">
            <input
              type="checkbox"
              checked={settings.backup_on_save}
              onChange={(e) => onSave({ ...settings, backup_on_save: e.target.checked })}
            />
            <span className="switch-track" />
          </span>
        </label>
      )}
    </div>
  );
}

/** Master password change: verify current, derive fresh salt+key, re-save. */
function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  function fail(message: string) {
    setError(message);
    setShake((n) => n + 1);
  }

  function reset() {
    setCurrent("");
    setNext("");
    setRepeat("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return fail(t("errCurrentRequired"));
    if (!next) return fail(t("errNewRequired"));
    if (next !== repeat) return fail(t("errNewMismatch"));

    setBusy(true);
    setError("");
    try {
      await api.changeMasterPassword(current, next);
      reset();
      setOpen(false);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (err) {
      fail(String(err) === "wrong_password" ? t("errWrongCurrent") : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-row settings-block" style={{ cursor: "default" }}>
      <div className="settings-block-head">
        <div>
          <div>{t("masterPassword")}</div>
          <div className="muted small">
            {done ? t("passwordChanged") : t("masterPasswordHint")}
          </div>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setOpen((v) => !v);
            reset();
          }}
        >
          {open ? t("cancel") : t("change")}
        </button>
      </div>
      {open && (
        <form className="form change-password fade-in" onSubmit={handleSubmit}>
          <label>
            {t("currentPassword")}
            <input
              autoFocus
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            {t("newPassword")}
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            <StrengthMeter password={next} />
          </label>
          <label>
            {t("repeatNewPassword")}
            <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </label>
          <p className="warning">{t("changePwWarning")}</p>
          {error && (
            <p className="error shake" key={shake}>
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? t("reencrypting") : t("changePasswordBtn")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
