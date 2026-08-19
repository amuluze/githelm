use tauri::AppHandle;

use crate::types::AppVersion;

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> AppVersion {
    let package_info = app.package_info();
    AppVersion {
        version: env!("CARGO_PKG_VERSION").to_string(),
        tauri: package_info.version.to_string(),
    }
}
