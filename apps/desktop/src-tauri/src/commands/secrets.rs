use keyring::Entry;

use crate::error::{AppError, AppResult};

const SERVICE: &str = "io.githelm.desktop";

fn entry(key: &str) -> AppResult<Entry> {
    Entry::new(SERVICE, key).map_err(|e| AppError::Internal(format!("keyring: {e}")))
}

#[tauri::command]
pub fn save_secret(key: String, value: String) -> AppResult<()> {
    let e = entry(&key)?;
    e.set_password(&value)
        .map_err(|err| AppError::Internal(format!("keyring set: {err}")))
}

#[tauri::command]
pub fn delete_secret(key: String) -> AppResult<()> {
    let e = entry(&key)?;
    e.delete_credential()
        .map_err(|err| AppError::Internal(format!("keyring delete: {err}")))
}

/// Returns true if the keychain has a value for this key. We never return
/// the secret value to the renderer — the renderer just needs to know
/// whether the credential is "set".
#[tauri::command]
pub fn has_secret(key: String) -> AppResult<bool> {
    let e = entry(&key)?;
    match e.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(err) => Err(AppError::Internal(format!("keyring get: {err}"))),
    }
}
