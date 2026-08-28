use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use tokio::sync::watch;

use crate::commands::terminal::TerminalSession;
use crate::storage;

/// Application state shared across commands: a single SQLite connection
/// guarded by a mutex (desktop-scale load — one user, short queries). The
/// database lives under `~/.githelm/` and is created on first launch.
/// `terminals` holds the live SSH PTY sessions, keyed by server id.
/// `deploys` holds a cancellation flag per running deploy pipeline, keyed by
/// deployment id; `cancel_deployment` flips it, the pipeline observes it.
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub terminals: Arc<Mutex<HashMap<String, TerminalSession>>>,
    pub deploys: Arc<Mutex<HashMap<String, watch::Sender<bool>>>>,
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
            terminals: Arc::new(Mutex::new(HashMap::new())),
            deploys: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
