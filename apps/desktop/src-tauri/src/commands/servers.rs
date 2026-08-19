use tauri::State;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage;
use crate::types::{AddServerInput, ConnectionTestResult, Server, ServerStatus};

#[tauri::command]
pub fn list_servers(state: State<'_, AppState>) -> AppResult<Vec<Server>> {
    let conn = state.db.lock().expect("db mutex");
    storage::list_servers(&conn)
}

#[tauri::command]
pub fn add_server(state: State<'_, AppState>, input: AddServerInput) -> AppResult<Server> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("name is required".into()));
    }
    if input.host.trim().is_empty() {
        return Err(AppError::Validation("host is required".into()));
    }
    if input.credential.is_empty() {
        return Err(AppError::Validation("credential is required".into()));
    }

    let id = format!(
        "srv_{}",
        Uuid::new_v4()
            .simple()
            .to_string()
            .chars()
            .take(8)
            .collect::<String>()
    );
    let server = Server {
        id,
        name: input.name,
        host: input.host,
        kind: input.kind,
        region: input.region.filter(|r| !r.is_empty()),
        status: ServerStatus::Connecting,
        last_seen_at: chrono::Utc::now().to_rfc3339(),
        // Real backend would store the credential via secrets::save_secret and
        // flip this flag based on whether the keychain write succeeded. We
        // mark it true here so the UI hides a stale "no credential" hint.
        has_credential: true,
    };

    let conn = state.db.lock().expect("db mutex");
    storage::insert_server(&conn, &server)?;
    Ok(server)
}

#[tauri::command]
pub fn remove_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().expect("db mutex");
    if storage::delete_server(&conn, &id)? {
        Ok(())
    } else {
        Err(AppError::NotFound(format!("server {id}")))
    }
}

#[tauri::command]
pub fn test_server_connection(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ConnectionTestResult> {
    let conn = state.db.lock().expect("db mutex");
    if storage::get_server(&conn, &id)?.is_none() {
        return Err(AppError::NotFound(format!("server {id}")));
    }
    // Mock latency: pretend a healthy probe took ~80ms. Real implementation
    // would actually open a TCP / SSH socket and measure round-trip time.
    Ok(ConnectionTestResult {
        ok: true,
        latency_ms: 80,
    })
}
