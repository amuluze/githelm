//! Githelm desktop — Tauri 2 backend.
//!
//! This binary currently serves mock data in response to the same commands
//! the openship API exposes, so the React frontend can be developed and
//! demoed end-to-end without bringing up the real control plane. The shape
//! of every command is the contract the future local API server must keep.

mod commands;
mod error;
mod mocks;
mod state;
mod types;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::deployments::list_deployments,
            commands::deployments::get_deployment,
            commands::deployments::trigger_deployment,
            commands::servers::list_servers,
            commands::servers::add_server,
            commands::servers::remove_server,
            commands::servers::test_server_connection,
            commands::logs::list_logs,
            commands::secrets::save_secret,
            commands::secrets::delete_secret,
            commands::secrets::has_secret,
            commands::app::get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running githelm desktop");
}