//! Vault settings (stored encrypted inside the vault file).

use tauri::State;

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
