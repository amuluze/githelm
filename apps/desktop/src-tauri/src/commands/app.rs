use tauri::AppHandle;

use crate::error::AppResult;
use crate::storage;
use crate::types::AppVersion;

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> AppVersion {
    let package_info = app.package_info();
    AppVersion {
        version: env!("CARGO_PKG_VERSION").to_string(),
        tauri: package_info.version.to_string(),
    }
}

/// Absolute path of the data directory (SQLite db, key mirrors) for the
/// instance panel.
#[tauri::command]
pub fn get_data_dir() -> AppResult<String> {
    storage::data_dir().map(|p| p.display().to_string())
}
