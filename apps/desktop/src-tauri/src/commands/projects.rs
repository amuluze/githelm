use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::types::Project;

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Vec<Project> {
    state.inner.projects.clone()
}

#[tauri::command]
pub fn get_project(state: State<'_, AppState>, id: String) -> AppResult<Project> {
    state
        .inner
        .projects
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("project {id}")))
}