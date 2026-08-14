//! Profile management: one profile = one `.npass` file in the vaults dir.

use std::fs;

use tauri::State;

use crate::crypto::KdfParams;
use crate::models::VaultData;
use crate::state::{AppState, UnlockedVault};
use crate::vault;

use super::err_code;

/// Profile names become file names, so they are strictly validated —
/// this is what prevents path traversal like `../../evil`.
fn validate_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("empty_name".into());
    }
    if name.chars().count() > 40 {
        return Err("name_too_long".into());
    }
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_')
    {
        return Err("invalid_name".into());
    }
    Ok(())
}

#[tauri::command]
pub fn list_profiles(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let dir = state.vaults_dir();
    let mut profiles = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("error: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "npass") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                profiles.push(stem.to_string());
            }
        }
    }
    profiles.sort();
    Ok(profiles)
}

/// `async` so the slow Argon2 KDF runs on Tauri's thread pool instead of
/// the main thread — otherwise the UI would freeze for ~a second.
#[tauri::command]
pub async fn create_profile(
    state: State<'_, AppState>,
    name: String,
    password: String,
) -> Result<(), String> {
    validate_name(&name)?;
    let name = name.trim().to_string();
    if password.is_empty() {
        return Err("empty_password".into());
    }

    let path = state.vaults_dir().join(format!("{name}.npass"));
    if path.exists() {
        return Err("profile_exists".into());
    }

    let data = VaultData::default();
    let kdf_params = KdfParams::default();
    let key = vault::create(&path, &password, &data, kdf_params).map_err(err_code)?;

    // Creating a profile unlocks it right away — no point asking for the
    // password again on the next screen.
    let salt = vault::load_header(&path).map_err(err_code)?.salt;
    *state.vault.lock().expect("poisoned") = Some(UnlockedVault {
        profile: name,
        path,
        key,
        salt,
        kdf_params,
        data,
    });
    Ok(())
}

/// Deletes the vault file AND its backup. The UI must confirm this with
/// the user first — there is no undo.
#[tauri::command]
pub fn delete_profile(state: State<'_, AppState>, name: String) -> Result<(), String> {
    validate_name(&name)?;
    let path = state.vaults_dir().join(format!("{}.npass", name.trim()));
    if !path.exists() {
        return Err("no_such_profile".into());
    }

    // If this profile is currently unlocked, lock it first.
    let mut vault_slot = state.vault.lock().expect("poisoned");
    if vault_slot
        .as_ref()
        .is_some_and(|v| v.profile == name.trim())
    {
        *vault_slot = None;
    }
    drop(vault_slot);

    fs::remove_file(&path).map_err(|e| format!("error: {e}"))?;
    let bak = path.with_extension("npass.bak");
    if bak.exists() {
        let _ = fs::remove_file(&bak);
    }
    Ok(())
}
