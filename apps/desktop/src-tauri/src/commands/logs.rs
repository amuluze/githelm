use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage;
use crate::types::LogEntry;

#[tauri::command]
pub fn list_logs(
    state: State<'_, AppState>,
    target_id: Option<String>,
    limit: Option<usize>,
) -> AppResult<Vec<LogEntry>> {
    let conn = state.db.lock().expect("db mutex");
    storage::list_logs(&conn, target_id.as_deref(), limit.unwrap_or(100))
}
