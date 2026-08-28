use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage;
use crate::types::Issue;

#[tauri::command]
pub fn list_issues(state: State<'_, AppState>) -> AppResult<Vec<Issue>> {
    let conn = state.db.lock().expect("db mutex");
    storage::list_issues(&conn)
}

/// Manual resolve — for problems fixed outside an automatic deploy success.
#[tauri::command]
pub fn resolve_issue(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().expect("db mutex");
    ensure_exists(&conn, &id)?;
    storage::resolve_issue(&conn, &id, &chrono::Utc::now().to_rfc3339())
}

/// Puts a resolved issue back to `open` for further tracking.
#[tauri::command]
pub fn reopen_issue(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().expect("db mutex");
    ensure_exists(&conn, &id)?;
    storage::reopen_issue(&conn, &id)
}

/// Removes an issue from the tracker outright.
#[tauri::command]
pub fn delete_issue(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().expect("db mutex");
    ensure_exists(&conn, &id)?;
    storage::delete_issue(&conn, &id).map(|_| ())
}

fn ensure_exists(conn: &rusqlite::Connection, id: &str) -> AppResult<()> {
    storage::get_issue(conn, id)?.ok_or_else(|| AppError::NotFound(format!("issue {id}")))?;
    Ok(())
}
