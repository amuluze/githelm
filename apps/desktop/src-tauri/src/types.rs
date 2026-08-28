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
    /// Deployment pipeline config — all optional until the user configures
    /// the project for deploys (local build → push → SSH update).
    pub local_path: Option<String>,
    pub server_id: Option<String>,
    pub deploy_dir: Option<String>,
    /// Local command that builds and pushes the image (e.g. `task push`).
    pub build_command: Option<String>,
    /// Remote command run inside `deploy_dir` (e.g. compose pull + up -d).
    pub update_command: Option<String>,
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
    Cancelled,
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
    /// SSH login user; null for servers created before v2.
    pub username: Option<String>,
    /// SSH port, 22 unless overridden.
    pub port: u16,
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
    /// Stable id of the target (project id for deployment issues) — the
    /// dedupe / auto-resolve anchor. `target_name` is display-only and
    /// changes on rename. Legacy rows predate this and carry NULL.
    pub target_id: Option<String>,
    /// The deployment that produced the issue (deployment kind only) — the
    /// trail from an issue row back to its pipeline log.
    pub deployment_id: Option<String>,
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
pub struct AddServerInput {
    pub name: String,
    pub host: String,
    pub kind: ServerKind,
    pub region: Option<String>,
    pub username: String,
    /// Optional. An SSH private key is stored in the keychain AND
    /// materialized to `~/.githelm/keys/<id>.key` (0600) so ssh can offer
    /// it; a password stays keychain-only (usable in the interactive
    /// terminal). Empty = rely on the host's ssh config / agent.
    #[serde(default)]
    pub credential: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
}

fn default_ssh_port() -> u16 {
    22
}

/// Updates an existing server's connection details. `credential` is
/// optional — when provided it replaces the keychain entry.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateServerInput {
    pub id: String,
    pub name: String,
    pub host: String,
    pub kind: ServerKind,
    pub region: Option<String>,
    pub username: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    pub credential: Option<String>,
}

/// Saves a project's deploy pipeline config (local path, target server,
/// deploy dir, build / update commands). Fields left empty are cleared.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectConfigInput {
    pub project_id: String,
    pub local_path: Option<String>,
    pub server_id: Option<String>,
    pub deploy_dir: Option<String>,
    pub build_command: Option<String>,
    pub update_command: Option<String>,
}

/// Rewrites a project's display fields. The repository binding is immutable —
/// it identifies what was imported.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectInput {
    pub project_id: String,
    pub name: String,
    pub branch: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub latency_ms: u64,
}

/// One entry of a remote directory listing (deploy-dir picker).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerDirEntry {
    pub name: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerDirListing {
    /// The path that was listed ("~" shorthand allowed — it survives `cd`).
    pub path: String,
    pub entries: Vec<ServerDirEntry>,
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
