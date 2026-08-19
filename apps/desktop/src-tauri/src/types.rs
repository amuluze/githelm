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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectStatus {
    Running,
    Stopped,
    Building,
    Error,
    Idle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ServerKind {
    Ssh,
    Cloud,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub id: String,
    pub kind: IssueKind,
    pub status: IssueStatus,
    pub title: String,
    pub description: String,
    pub target_name: String,
    pub detected_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum IssueStatus {
    Open,
    Resolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum IssueKind {
    Deployment,
    Certificate,
    Domain,
    Version,
    Port,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    /// `owner/name` — URL forms are normalized before this is persisted.
    pub repository: String,
    pub branch: String,
    pub provider: Provider,
    pub url: Option<String>,
}

/// Mirror of @githelm/core GitRepo — a repository surfaced by the GitHub import.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepo {
    pub id: String,
    pub owner: String,
    pub name: String,
    pub description: Option<String>,
    pub private: bool,
    pub language: Option<String>,
    pub language_color: Option<String>,
    pub updated_at: String,
    pub default_branch: String,
    pub url: Option<String>,
}

/// Mirror of @githelm/core RepoAccount — the user plus the orgs their token
/// can see, shown as filter chips in the library.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoAccount {
    pub id: String,
    pub login: String,
    pub connected: bool,
}

/// Where the GitHub credential came from. A keychain PAT wins over the host's
/// gh CLI login so an explicit user choice is always honored first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GithubTokenSource {
    Token,
    GhCli,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubStatus {
    pub connected: bool,
    pub login: Option<String>,
    pub source: Option<GithubTokenSource>,
}
