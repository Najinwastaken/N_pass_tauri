//! Unlock / lock lifecycle.

use tauri::State;

use crate::crypto::{self, KdfParams};
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

/// Change the master password of the unlocked vault.
///
/// The current password is verified by re-deriving its key with the stored
/// salt and comparing against the session key. On success the vault gets a
/// FRESH salt and current default KDF params (a free strengthening upgrade
/// for old files), is re-encrypted and atomically saved.
#[tauri::command]
pub async fn change_master_password(
    state: State<'_, AppState>,
    current: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.is_empty() {
        return Err("empty_password".into());
    }

    // Copy what the slow KDF needs, then release the lock — deriving takes
    // ~a second and must not freeze every other command.
    let (salt, kdf_params) = {
        let guard = state.vault.lock().expect("poisoned");
        let vault = guard.as_ref().ok_or_else(|| "locked".to_string())?;
        (vault.salt, vault.kdf_params)
    };

    let check_key = crypto::derive_key(current.as_bytes(), &salt, &kdf_params).map_err(err_code)?;
    {
        let guard = state.vault.lock().expect("poisoned");
        let vault = guard.as_ref().ok_or_else(|| "locked".to_string())?;
        if *check_key != *vault.key {
            return Err("wrong_password".into());
        }
    }

    let new_salt = crypto::generate_salt();
    let new_params = KdfParams::default();
    let new_key =
        crypto::derive_key(new_password.as_bytes(), &new_salt, &new_params).map_err(err_code)?;

    let mut guard = state.vault.lock().expect("poisoned");
    let vault = guard.as_mut().ok_or_else(|| "locked".to_string())?;
    vault.salt = new_salt;
    vault.kdf_params = new_params;
    vault.key = new_key;
    let backup_error = vault.save().map_err(err_code)?;
    drop(guard);
    state.report_backup_result(backup_error);
    state.touch();
    Ok(())
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
