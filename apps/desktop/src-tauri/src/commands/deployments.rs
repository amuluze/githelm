use tauri::State;

use crate::error::{AppError, AppResult};
use crate::mocks;
use crate::state::AppState;
use crate::types::{Deployment, TriggerDeploymentInput};

#[tauri::command]
pub fn list_deployments(
    state: State<'_, AppState>,
    project_id: Option<String>,
) -> Vec<Deployment> {
    match project_id {
        Some(pid) => state
            .inner
            .deployments
            .iter()
            .filter(|d| d.project_id == pid)
            .cloned()
            .collect(),
        None => state.inner.deployments.clone(),
    }
}

#[tauri::command]
pub fn get_deployment(state: State<'_, AppState>, id: String) -> AppResult<Deployment> {
    state
        .inner
        .deployments
        .iter()
        .find(|d| d.id == id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("deployment {id}")))
}

#[tauri::command]
pub fn trigger_deployment(
    state: State<'_, AppState>,
    input: TriggerDeploymentInput,
) -> AppResult<Deployment> {
    // Verify the project exists. Without that gate a typo silently produces
    // a deployment row attached to a non-existent project, which is hard to
    // diagnose downstream.
    if !state.inner.projects.iter().any(|p| p.id == input.project_id) {
        return Err(AppError::Validation(format!(
            "unknown project {}",
            input.project_id
        )));
    }

    let dep = mocks::new_deployment(&input.project_id, &input.branch);
    // In a real backend this would push the row into the persistence layer.
    // For the mock we just return it; the renderer treats it as authoritative.
    Ok(dep)
}