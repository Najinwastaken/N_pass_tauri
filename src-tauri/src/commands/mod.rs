//! Tauri command handlers, grouped by concern.

pub mod entries;
pub mod misc;
pub mod profiles;
pub mod session;

use crate::vault::VaultError;

/// Convert internal errors into stable string codes for the frontend.
/// The UI switches on these (e.g. shake animation on "wrong_password"),
/// so they must not change casually.
pub fn err_code(e: VaultError) -> String {
    match e {
        VaultError::WrongPasswordOrCorrupted => "wrong_password".into(),
        VaultError::InvalidFormat => "invalid_format".into(),
        VaultError::UnsupportedVersion(_) => "unsupported_version".into(),
        other => format!("error: {other}"),
    }
}
