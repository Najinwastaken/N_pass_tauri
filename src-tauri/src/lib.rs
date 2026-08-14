pub mod commands;
pub mod crypto;
pub mod models;
pub mod state;
pub mod vault;

use std::time::Duration;

use tauri::{Emitter, Manager};

use state::AppState;

/// How often the auto-lock thread checks idle time.
const AUTOLOCK_POLL_SECS: u64 = 10;

/// Lock the vault (if unlocked) and tell the frontend to show the lock
/// screen. Used by the auto-lock timer and the minimize handler.
fn force_lock(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let was_unlocked = {
        let mut guard = state.vault.lock().expect("poisoned");
        guard.take().is_some() // take() moves the vault out -> Drop -> zeroize
    };
    if was_unlocked {
        let _ = app.emit("vault-locked", ());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .setup(|app| {
            // Vaults live in the per-user app data dir:
            // %APPDATA%\com.najin.npass\vaults
            let dir = app.path().app_data_dir()?.join("vaults");
            std::fs::create_dir_all(&dir)?;
            *app.state::<AppState>().vaults_dir.lock().expect("poisoned") = dir;

            // Auto-lock by inactivity: a background thread compares idle
            // time against the unlocked vault's own settings.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(AUTOLOCK_POLL_SECS));
                let state = handle.state::<AppState>();
                let timed_out = {
                    let guard = state.vault.lock().expect("poisoned");
                    guard.as_ref().is_some_and(|v| {
                        let mins = v.data.settings.auto_lock_minutes as u64;
                        mins > 0 && state.idle_seconds() >= mins * 60
                    })
                };
                if timed_out {
                    force_lock(&handle);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // Lock when the window is minimized (if enabled in settings).
            if let tauri::WindowEvent::Resized(_) = event {
                if window.is_minimized().unwrap_or(false) {
                    let state = window.state::<AppState>();
                    let lock_on_minimize = state
                        .vault
                        .lock()
                        .expect("poisoned")
                        .as_ref()
                        .is_some_and(|v| v.data.settings.lock_on_minimize);
                    if lock_on_minimize {
                        force_lock(window.app_handle());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::profiles::list_profiles,
            commands::profiles::create_profile,
            commands::profiles::delete_profile,
            commands::session::unlock,
            commands::session::lock,
            commands::session::current_profile,
            commands::entries::list_passwords,
            commands::entries::add_password,
            commands::entries::update_password,
            commands::entries::delete_password,
            commands::entries::reveal_password,
            commands::entries::list_cards,
            commands::entries::add_card,
            commands::entries::update_card,
            commands::entries::delete_card,
            commands::entries::reveal_card_field,
            commands::entries::list_notes,
            commands::entries::add_note,
            commands::entries::update_note,
            commands::entries::delete_note,
            commands::entries::get_note_body,
            commands::entries::list_keys,
            commands::entries::add_key,
            commands::entries::update_key,
            commands::entries::delete_key,
            commands::entries::reveal_key,
            commands::entries::reorder_entries,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::misc::generate_password,
            commands::misc::copy_text,
            commands::misc::copy_secret,
            commands::misc::open_url,
            commands::misc::touch_activity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
