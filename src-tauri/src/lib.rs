pub mod commands;
pub mod crypto;
pub mod models;
pub mod state;
pub mod vault;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            // Vaults live in the per-user app data dir:
            // %APPDATA%\com.najin.npass\vaults
            let dir = app.path().app_data_dir()?.join("vaults");
            std::fs::create_dir_all(&dir)?;
            *app.state::<AppState>().vaults_dir.lock().expect("poisoned") = dir;
            Ok(())
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
            commands::misc::generate_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
