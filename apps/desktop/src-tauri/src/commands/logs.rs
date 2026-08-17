use tauri::State;

use crate::state::AppState;
use crate::types::LogEntry;

#[tauri::command]
pub fn list_logs(
    state: State<'_, AppState>,
    target_id: Option<String>,
    limit: Option<usize>,
) -> Vec<LogEntry> {
    let limit = limit.unwrap_or(100);
    let guard = state.inner.logs.lock().expect("logs mutex");
    let iter = guard
        .iter()
        .rev()
        .filter(|l| target_id.as_ref().map_or(true, |t| &l.target_id == t))
        .take(limit);
    iter.cloned().collect::<Vec<_>>().into_iter().rev().collect()
}