//! Utility commands: password generation, clipboard with auto-clear,
//! opening URLs, activity tracking.

use std::time::Duration;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::crypto::{self, PasswordOptions};
use crate::state::AppState;

use super::err_code;

/// How long a copied secret stays in the clipboard.
const CLIPBOARD_CLEAR_SECS: u64 = 30;

/// Generate a random password with the OS CSPRNG. Works without an
/// unlocked vault — the generator page is available any time.
#[tauri::command]
pub fn generate_password(
    length: usize,
    lowercase: bool,
    uppercase: bool,
    digits: bool,
    symbols: bool,
) -> Result<String, String> {
    let opts = PasswordOptions {
        length: length.clamp(1, 128),
        lowercase,
        uppercase,
        digits,
        symbols,
    };
    crypto::generate_password(&opts)
        .map(|p| p.to_string())
        .map_err(err_code)
}

/// Put `text` into the clipboard and schedule a conditional clear:
/// after 30 s the clipboard is emptied, but ONLY if it still contains
/// exactly what we put there (the user may have copied something else).
fn copy_with_autoclear(app: &AppHandle, text: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    state.touch();
    app.clipboard()
        .write_text(text.clone())
        .map_err(|e| format!("error: {e}"))?;

    // Every copy bumps the generation; the sleeping thread below only acts
    // if its generation is still the latest when it wakes up.
    let generation = state.next_clipboard_gen();
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(CLIPBOARD_CLEAR_SECS));
        let state = app.state::<AppState>();
        if state.current_clipboard_gen() != generation {
            return; // a newer copy superseded this one
        }
        let still_ours = app
            .clipboard()
            .read_text()
            .map(|current| current == text)
            .unwrap_or(false);
        if still_ours {
            let _ = app.clipboard().clear();
        }
    });
    Ok(())
}

/// Copy arbitrary (non-secret or already-revealed) text with auto-clear.
#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    copy_with_autoclear(&app, text)
}

/// Copy a secret straight from the vault to the clipboard — the secret
/// never enters the WebView at all. `kind`: "password" | "card_number" |
/// "card_cvv" | "key".
#[tauri::command]
pub fn copy_secret(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
    id: Uuid,
) -> Result<(), String> {
    let secret = {
        let guard = state.vault.lock().expect("poisoned");
        let vault = guard.as_ref().ok_or_else(|| "locked".to_string())?;
        match kind.as_str() {
            "password" => vault
                .data
                .passwords
                .iter()
                .find(|e| e.id == id)
                .map(|e| e.password.clone()),
            "card_number" => vault
                .data
                .cards
                .iter()
                .find(|e| e.id == id)
                .map(|e| e.number.clone()),
            "card_cvv" => vault
                .data
                .cards
                .iter()
                .find(|e| e.id == id)
                .map(|e| e.cvv.clone()),
            "key" => vault.data.keys.iter().find(|e| e.id == id).map(|e| e.key.clone()),
            _ => return Err("unknown_kind".into()),
        }
        .ok_or_else(|| "not_found".to_string())?
    };
    copy_with_autoclear(&app, secret)
}

/// Open an http(s) URL in the default browser. Anything else is rejected —
/// this must never become a way to launch arbitrary programs.
#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    let url = url.trim().to_string();
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("invalid_url".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("error: {e}"))
}

/// Called by the frontend (throttled) on user input so the auto-lock
/// timer knows the user is around.
#[tauri::command]
pub fn touch_activity(state: State<'_, AppState>) {
    state.touch();
}
