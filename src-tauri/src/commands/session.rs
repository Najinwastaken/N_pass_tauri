//! Unlock / lock lifecycle.

use tauri::State;

use crate::state::{AppState, UnlockedVault};
use crate::vault;

use super::err_code;

/// Unlock a profile. Async: Argon2 takes ~a second by design.
/// Wrong password surfaces as the "wrong_password" code (AEAD tag mismatch).
#[tauri::command]
pub async fn unlock(
    state: State<'_, AppState>,
    name: String,
    password: String,
) -> Result<(), String> {
    let path = state.vaults_dir().join(format!("{}.npass", name.trim()));
    if !path.exists() {
        return Err("no_such_profile".into());
    }

    let (data, key, header) = vault::load(&path, &password).map_err(err_code)?;
    state.touch(); // fresh activity so auto-lock does not fire immediately
    *state.vault.lock().expect("poisoned") = Some(UnlockedVault {
        profile: name.trim().to_string(),
        path,
        key,
        salt: header.salt,
        kdf_params: header.kdf_params,
        data,
    });
    Ok(())
}

/// Lock: dropping `UnlockedVault` zeroizes the key and the decrypted data.
#[tauri::command]
pub fn lock(state: State<'_, AppState>) {
    *state.vault.lock().expect("poisoned") = None;
}

/// Which profile is unlocked right now (None = locked). Lets the frontend
/// restore its screen after a reload without keeping its own session state.
#[tauri::command]
pub fn current_profile(state: State<'_, AppState>) -> Option<String> {
    state
        .vault
        .lock()
        .expect("poisoned")
        .as_ref()
        .map(|v| v.profile.clone())
}
