use serde::{Deserialize, Serialize};

/// Mirror of the @githelm/core TypeScript types. Keep the two in sync; the
/// serde renames map directly onto the camelCase keys the renderer expects.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub repository: String,
    pub branch: String,
    pub status: ProjectStatus,
    pub latest_deployment_id: Option<String>,
    pub created_at: String,
    pub url: Option<String>,
    pub deployment_count: u32,
    pub provider: Provider,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectStatus {
    Running,
    Stopped,
    Building,
    Error,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Provider {
    Github,
    Gitlab,
    Bitbucket,
    Local,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deployment {
    pub id: String,
    pub project_id: String,
    pub commit_sha: String,
    pub commit_message: String,
    pub author: String,
    pub status: DeploymentStatus,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DeploymentStatus {
    Queued,
    Building,
    Deploying,
    Live,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub name: String,
    pub kind: ServerKind,
    pub host: String,
    pub region: Option<String>,
    pub status: ServerStatus,
    pub last_seen_at: String,
    pub has_credential: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ServerKind {
    Ssh,
    Cloud,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ServerStatus {
    Online,
    Offline,
    Connecting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub target_id: String,
    pub level: LogLevel,
    pub message: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct AddServerInput {
    pub name: String,
    pub host: String,
    pub kind: ServerKind,
    pub region: Option<String>,
    pub username: String,
    pub credential: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerDeploymentInput {
    pub project_id: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersion {
    pub version: String,
    pub tauri: String,
}