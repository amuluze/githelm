use tauri::State;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage;
use crate::types::{Deployment, DeploymentStatus, TriggerDeploymentInput};

#[tauri::command]
pub fn list_deployments(
    state: State<'_, AppState>,
    project_id: Option<String>,
) -> AppResult<Vec<Deployment>> {
    let conn = state.db.lock().expect("db mutex");
    storage::list_deployments(&conn, project_id.as_deref())
}

#[tauri::command]
pub fn get_deployment(state: State<'_, AppState>, id: String) -> AppResult<Deployment> {
    let conn = state.db.lock().expect("db mutex");
    storage::get_deployment(&conn, &id)?
        .ok_or_else(|| AppError::NotFound(format!("deployment {id}")))
}

#[tauri::command]
pub fn trigger_deployment(
    state: State<'_, AppState>,
    input: TriggerDeploymentInput,
) -> AppResult<Deployment> {
    let mut conn = state.db.lock().expect("db mutex");

    // Verify the project exists. Without that gate a typo silently produces
    // a deployment row attached to a non-existent project, which is hard to
    // diagnose downstream.
    if storage::get_project(&conn, &input.project_id)?.is_none() {
        return Err(AppError::Validation(format!(
            "unknown project {}",
            input.project_id
        )));
    }

    let id = format!(
        "dep_{}",
        Uuid::new_v4()
            .simple()
            .to_string()
            .chars()
            .take(8)
            .collect::<String>()
    );
    let dep = Deployment {
        id,
        project_id: input.project_id.clone(),
        commit_sha: "deadbee".into(),
        commit_message: format!("manual deploy of {}", input.branch),
        author: "you".into(),
        status: DeploymentStatus::Queued,
        started_at: chrono::Utc::now().to_rfc3339(),
        finished_at: None,
        duration_ms: None,
    };

    let tx = conn
        .transaction()
        .map_err(|e| AppError::Internal(format!("begin: {e}")))?;
    storage::insert_deployment(&tx, &dep)?;
    storage::apply_triggered_deployment(&tx, &input.project_id, &dep.id)?;
    tx.commit()
        .map_err(|e| AppError::Internal(format!("commit: {e}")))?;

    Ok(dep)
}
