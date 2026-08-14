//! Utility commands.

use crate::crypto::{self, PasswordOptions};

use super::err_code;

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
