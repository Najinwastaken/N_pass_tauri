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

/// Fallback when no vault is unlocked (e.g. nothing to read settings from).
const DEFAULT_CLIPBOARD_CLEAR_SECS: u64 = 30;

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

    // Delay comes from the unlocked vault's settings; 0 disables clearing.
    let secs = state
        .vault
        .lock()
        .expect("poisoned")
        .as_ref()
        .map(|v| v.data.settings.clipboard_clear_seconds as u64)
        .unwrap_or(DEFAULT_CLIPBOARD_CLEAR_SECS);
    if secs == 0 {
        return Ok(());
    }

    // Every copy bumps the generation; the sleeping thread below only acts
    // if its generation is still the latest when it wakes up.
    let generation = state.next_clipboard_gen();
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(secs));
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
            "key" => vault
                .data
                .keys
                .iter()
                .find(|e| e.id == id)
                .map(|e| e.key.clone()),
            _ => return Err("unknown_kind".into()),
        }
        .ok_or_else(|| "not_found".to_string())?
    };
    copy_with_autoclear(&app, secret)
}

/// Accept what people actually type — "discord.com", "www.discord.com",
/// a proper URL, or a doubled scheme left by a copy-paste slip
/// ("http://https://discord.com/") — and return a plain http(s) URL.
///
/// Everything else is rejected. This is the only place where the app
/// launches an external program, so it must never become a way to run
/// `javascript:`, `file://`, custom protocol handlers or local paths.
fn normalize_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains(char::is_whitespace) || trimmed.contains('\\') {
        return Err("invalid_url".into());
    }

    // Peel off repeated schemes; the innermost one wins. `to_ascii_lowercase`
    // keeps byte lengths identical, so slicing by the stripped length is safe.
    let mut rest = trimmed;
    let mut scheme = "https";
    loop {
        let lower = rest.to_ascii_lowercase();
        if let Some(stripped) = lower.strip_prefix("https://") {
            scheme = "https";
            rest = &rest[rest.len() - stripped.len()..];
        } else if let Some(stripped) = lower.strip_prefix("http://") {
            scheme = "http";
            rest = &rest[rest.len() - stripped.len()..];
        } else {
            break;
        }
    }

    // What remains must look like host[:port][/path] — no leftover scheme.
    let host = rest.split('/').next().unwrap_or("");
    if host.is_empty() || (!host.contains('.') && !host.starts_with("localhost")) {
        return Err("invalid_url".into());
    }
    if let Some((_, after_colon)) = host.split_once(':') {
        // A colon in the host is only legal as a port number.
        if after_colon.is_empty() || !after_colon.chars().all(|c| c.is_ascii_digit()) {
            return Err("invalid_url".into());
        }
    }

    Ok(format!("{scheme}://{rest}"))
}

/// Open a URL in the default browser (see `normalize_url` for what is
/// accepted).
#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    let url = normalize_url(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("error: {e}"))
}

#[cfg(test)]
mod tests {
    use super::normalize_url;

    #[test]
    fn accepts_common_ways_of_writing_a_link() {
        for (input, expected) in [
            ("https://discord.com", "https://discord.com"),
            ("http://discord.com", "http://discord.com"),
            ("www.discord.com", "https://www.discord.com"),
            ("discord.com", "https://discord.com"),
            (
                "  discord.com/invite/abc  ",
                "https://discord.com/invite/abc",
            ),
            ("HTTPS://Discord.com", "https://Discord.com"),
            ("localhost:1420", "https://localhost:1420"),
            // copy-paste slips with a doubled scheme
            ("http://https://discord.com/", "https://discord.com/"),
            ("https://https://discord.com/", "https://discord.com/"),
        ] {
            assert_eq!(normalize_url(input).unwrap(), expected, "input: {input}");
        }
    }

    #[test]
    fn rejects_anything_that_is_not_a_web_address() {
        for input in [
            "",
            "   ",
            "javascript:alert(1)",
            "javascript:fetch('x.com')",
            "file:///C:/Users/secret.txt",
            "ftp://example.com",
            "mailto:someone@example.com",
            "steam://run/570",
            r"C:\Windows\System32\calc.exe",
            r"\\evil-server\share",
            "not a url",
            "localhost:notaport",
        ] {
            assert!(normalize_url(input).is_err(), "should reject: {input}");
        }
    }
}

/// Called by the frontend (throttled) on user input so the auto-lock
/// timer knows the user is around.
#[tauri::command]
pub fn touch_activity(state: State<'_, AppState>) {
    state.touch();
}
