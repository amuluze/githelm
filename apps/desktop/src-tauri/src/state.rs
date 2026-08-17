use std::sync::{Arc, Mutex};

use crate::mocks;
use crate::types::{Deployment, LogEntry, Project, Server};

/// Application state shared across commands. In production this would hold
/// a connection pool to the local API; for now it owns the in-memory mock
/// datasets so commands can serve consistent data on every call.
#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<Inner>,
}

pub struct Inner {
    pub projects: Vec<Project>,
    pub deployments: Vec<Deployment>,
    pub servers: Mutex<Vec<Server>>,
    pub logs: Mutex<Vec<LogEntry>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                projects: mocks::projects(),
                deployments: mocks::deployments(),
                servers: Mutex::new(mocks::servers()),
                logs: Mutex::new(mocks::logs()),
            }),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}