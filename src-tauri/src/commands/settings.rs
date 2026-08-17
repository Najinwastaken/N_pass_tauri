//! Vault settings (stored encrypted inside the vault file).

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::models::Settings;
use crate::state::AppState;

use super::err_code;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    state.touch();
    let guard = state.vault.lock().expect("poisoned");
    let vault = guard.as_ref().ok_or_else(|| "locked".to_string())?;
    Ok(vault.data.settings.clone())
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    state.touch();
    let mut guard = state.vault.lock().expect("poisoned");
    let vault = guard.as_mut().ok_or_else(|| "locked".to_string())?;
    vault.data.settings = Settings {
        // 0 means "never" for both; clamp to sane upper bounds.
        auto_lock_minutes: settings.auto_lock_minutes.min(24 * 60),
        clipboard_clear_seconds: settings.clipboard_clear_seconds.min(3600),
        ..settings
    };
    vault.save().map_err(err_code)
}

/// Native folder picker for the backup destination. Runs on the async
/// pool, so the blocking dialog does not freeze the UI thread.
#[tauri::command]
pub async fn pick_backup_dir(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    Ok(picked
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().to_string()))
}

/// Copy the encrypted vault into the configured backup folder right now.
/// Unlike the on-save copy this one surfaces errors to the user.
#[tauri::command]
pub fn backup_now(state: State<'_, AppState>) -> Result<(), String> {
    state.touch();
    let guard = state.vault.lock().expect("poisoned");
    let vault = guard.as_ref().ok_or_else(|| "locked".to_string())?;
    let dir = vault.data.settings.backup_dir.trim().to_string();
    if dir.is_empty() {
        return Err("no_backup_dir".into());
    }
    vault.backup_to(&dir).map_err(|e| format!("error: {e}"))
}
