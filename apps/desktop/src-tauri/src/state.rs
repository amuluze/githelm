use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::storage;

/// Application state shared across commands: a single SQLite connection
/// guarded by a mutex (desktop-scale load — one user, short queries). The
/// database lives under `~/.githelm/` and is created on first launch.
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
}

impl AppState {
    pub fn new() -> Self {
        let db = storage::open().unwrap_or_else(|err| {
            panic!(
                "cannot open the Githelm database at {}: {err}",
                storage::db_path()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "?".into())
            );
        });
        Self {
            db: Arc::new(Mutex::new(db)),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
