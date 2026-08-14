//! CRUD for password entries.
//!
//! Security rule: the full list NEVER includes plaintext passwords — the
//! frontend gets metadata only. A single password crosses into the WebView
//! exclusively via `reveal_password` (explicit user action, one entry).

use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::models::PasswordEntry;
use crate::state::{AppState, UnlockedVault};

use super::err_code;

/// What the frontend sees in the list: everything except the password.
#[derive(Serialize)]
pub struct PasswordMeta {
    pub id: Uuid,
    pub title: String,
    pub username: String,
    pub url: String,
    pub notes: String,
}

impl From<&PasswordEntry> for PasswordMeta {
    fn from(e: &PasswordEntry) -> Self {
        Self {
            id: e.id,
            title: e.title.clone(),
            username: e.username.clone(),
            url: e.url.clone(),
            notes: e.notes.clone(),
        }
    }
}

/// Fields the frontend sends when creating/editing an entry.
#[derive(Deserialize)]
pub struct PasswordInput {
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub notes: String,
}

/// Run `f` with the unlocked vault, or fail with "locked".
///
/// Rust note: `FnOnce(&mut UnlockedVault) -> Result<T, String>` is a closure
/// type — this helper owns the lock/unlock boilerplate and every command
/// passes just its own logic.
fn with_vault<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&mut UnlockedVault) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state.vault.lock().expect("poisoned");
    let vault = guard.as_mut().ok_or_else(|| "locked".to_string())?;
    f(vault)
}

/// Mutate the vault data, then immediately persist to disk. If the save
/// fails the in-memory change is kept, but the caller gets the error.
fn mutate<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&mut UnlockedVault) -> Result<T, String>,
) -> Result<T, String> {
    with_vault(state, |vault| {
        let result = f(vault)?;
        vault.save().map_err(err_code)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn list_passwords(state: State<'_, AppState>) -> Result<Vec<PasswordMeta>, String> {
    with_vault(&state, |vault| {
        Ok(vault.data.passwords.iter().map(PasswordMeta::from).collect())
    })
}

#[tauri::command]
pub fn add_password(
    state: State<'_, AppState>,
    input: PasswordInput,
) -> Result<PasswordMeta, String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    mutate(&state, |vault| {
        let entry = PasswordEntry {
            id: Uuid::new_v4(),
            title: input.title.trim().to_string(),
            username: input.username,
            password: input.password,
            url: input.url,
            notes: input.notes,
        };
        let meta = PasswordMeta::from(&entry);
        vault.data.passwords.push(entry);
        Ok(meta)
    })
}

#[tauri::command]
pub fn update_password(
    state: State<'_, AppState>,
    id: Uuid,
    input: PasswordInput,
) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("empty_title".into());
    }
    mutate(&state, |vault| {
        let entry = vault
            .data
            .passwords
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| "not_found".to_string())?;
        entry.title = input.title.trim().to_string();
        entry.username = input.username;
        entry.password = input.password;
        entry.url = input.url;
        entry.notes = input.notes;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_password(state: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    mutate(&state, |vault| {
        let before = vault.data.passwords.len();
        vault.data.passwords.retain(|e| e.id != id);
        if vault.data.passwords.len() == before {
            return Err("not_found".to_string());
        }
        Ok(())
    })
}

/// Return the plaintext password of ONE entry — explicit user action only.
/// The returned String crosses into the WebView and lives by frontend
/// rules there: shown or copied, never stored.
#[tauri::command]
pub fn reveal_password(state: State<'_, AppState>, id: Uuid) -> Result<String, String> {
    with_vault(&state, |vault| {
        vault
            .data
            .passwords
            .iter()
            .find(|e| e.id == id)
            .map(|e| e.password.clone())
            .ok_or_else(|| "not_found".to_string())
    })
}
