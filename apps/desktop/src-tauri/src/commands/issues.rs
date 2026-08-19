use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage;
use crate::types::Issue;

#[tauri::command]
pub fn list_issues(state: State<'_, AppState>) -> AppResult<Vec<Issue>> {
    let conn = state.db.lock().expect("db mutex");
    storage::list_issues(&conn)
}
