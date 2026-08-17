use chrono::{Duration, Utc};
use uuid::Uuid;

use crate::types::{
    Deployment, DeploymentStatus, LogEntry, LogLevel, Project, ProjectStatus, Provider, Server,
    ServerKind, ServerStatus,
};

/// Server ID and primary "now" anchor. Anything time-relative is computed from
/// `now()` so a re-build at any wall-clock time produces consistent data.
fn now() -> chrono::DateTime<Utc> {
    Utc::now()
}

fn min(n: i64) -> String {
    (now() - Duration::minutes(n)).to_rfc3339()
}

fn hr(n: i64) -> String {
    (now() - Duration::hours(n)).to_rfc3339()
}

fn day(n: i64) -> String {
    (now() - Duration::days(n)).to_rfc3339()
}

pub fn projects() -> Vec<Project> {
    vec![
        Project {
            id: "prj_atlas".into(),
            name: "Atlas Web".into(),
            slug: "atlas-web".into(),
            repository: "acme/atlas".into(),
            branch: "main".into(),
            status: ProjectStatus::Running,
            latest_deployment_id: Some("dep_0042".into()),
            created_at: day(120),
            url: Some("https://atlas.example.com".into()),
            deployment_count: 142,
            provider: Provider::Github,
        },
        Project {
            id: "prj_blog".into(),
            name: "Marketing Blog".into(),
            slug: "blog".into(),
            repository: "acme/blog".into(),
            branch: "main".into(),
            status: ProjectStatus::Building,
            latest_deployment_id: Some("dep_0041".into()),
            created_at: day(80),
            url: Some("https://blog.example.com".into()),
            deployment_count: 38,
            provider: Provider::Github,
        },
        Project {
            id: "prj_api".into(),
            name: "Internal API".into(),
            slug: "internal-api".into(),
            repository: "acme/api".into(),
            branch: "main".into(),
            status: ProjectStatus::Running,
            latest_deployment_id: Some("dep_0040".into()),
            created_at: day(60),
            url: Some("https://api.internal.example.com".into()),
            deployment_count: 87,
            provider: Provider::Github,
        },
        Project {
            id: "prj_docs".into(),
            name: "Documentation".into(),
            slug: "docs".into(),
            repository: "acme/docs".into(),
            branch: "main".into(),
            status: ProjectStatus::Stopped,
            latest_deployment_id: Some("dep_0038".into()),
            created_at: day(45),
            url: None,
            deployment_count: 12,
            provider: Provider::Gitlab,
        },
        Project {
            id: "prj_legacy".into(),
            name: "Legacy Admin".into(),
            slug: "legacy-admin".into(),
            repository: "acme/legacy-admin".into(),
            branch: "main".into(),
            status: ProjectStatus::Error,
            latest_deployment_id: Some("dep_0037".into()),
            created_at: day(200),
            url: Some("https://admin.legacy.example.com".into()),
            deployment_count: 4,
            provider: Provider::Github,
        },
        Project {
            id: "prj_convex".into(),
            name: "Convex Backend".into(),
            slug: "convex".into(),
            repository: "acme/convex".into(),
            branch: "main".into(),
            status: ProjectStatus::Running,
            latest_deployment_id: Some("dep_0043".into()),
            created_at: day(15),
            url: Some("https://convex.example.com".into()),
            deployment_count: 23,
            provider: Provider::Github,
        },
    ]
}

pub fn deployments() -> Vec<Deployment> {
    vec![
        Deployment {
            id: "dep_0043".into(),
            project_id: "prj_convex".into(),
            commit_sha: "a8f3d21".into(),
            commit_message: "feat: add realtime sync endpoint".into(),
            author: "ada".into(),
            status: DeploymentStatus::Live,
            started_at: min(8),
            finished_at: Some(min(6)),
            duration_ms: Some(118_000),
        },
        Deployment {
            id: "dep_0042".into(),
            project_id: "prj_atlas".into(),
            commit_sha: "f12bc04".into(),
            commit_message: "fix: timezone bug in scheduler".into(),
            author: "linus".into(),
            status: DeploymentStatus::Live,
            started_at: min(35),
            finished_at: Some(min(33)),
            duration_ms: Some(92_000),
        },
        Deployment {
            id: "dep_0041".into(),
            project_id: "prj_blog".into(),
            commit_sha: "9d11c5e".into(),
            commit_message: "chore: upgrade dependencies".into(),
            author: "ada".into(),
            status: DeploymentStatus::Building,
            started_at: min(2),
            finished_at: None,
            duration_ms: None,
        },
        Deployment {
            id: "dep_0040".into(),
            project_id: "prj_api".into(),
            commit_sha: "7e5b889".into(),
            commit_message: "perf: cache invalidation v2".into(),
            author: "grace".into(),
            status: DeploymentStatus::Live,
            started_at: hr(2),
            finished_at: Some(hr(2)),
            duration_ms: Some(73_000),
        },
        Deployment {
            id: "dep_0039".into(),
            project_id: "prj_api".into(),
            commit_sha: "3c4a921".into(),
            commit_message: "feat: rate-limit headers".into(),
            author: "grace".into(),
            status: DeploymentStatus::Failed,
            started_at: hr(4),
            finished_at: Some(hr(4)),
            duration_ms: Some(41_000),
        },
        Deployment {
            id: "dep_0038".into(),
            project_id: "prj_docs".into(),
            commit_sha: "224ab10".into(),
            commit_message: "docs: rewrite auth guide".into(),
            author: "linus".into(),
            status: DeploymentStatus::Live,
            started_at: hr(8),
            finished_at: Some(hr(8)),
            duration_ms: Some(31_000),
        },
        Deployment {
            id: "dep_0037".into(),
            project_id: "prj_legacy".into(),
            commit_sha: "0018f33".into(),
            commit_message: "fix: rollback from v2 schema".into(),
            author: "ada".into(),
            status: DeploymentStatus::RolledBack,
            started_at: day(1),
            finished_at: Some(day(1)),
            duration_ms: Some(86_000),
        },
    ]
}

pub fn servers() -> Vec<Server> {
    vec![
        Server {
            id: "srv_local".into(),
            name: "Local Machine".into(),
            kind: ServerKind::Ssh,
            host: "127.0.0.1".into(),
            region: None,
            status: ServerStatus::Online,
            last_seen_at: min(1),
            has_credential: true,
        },
        Server {
            id: "srv_prod".into(),
            name: "prod-use1".into(),
            kind: ServerKind::Ssh,
            host: "prod.example.com".into(),
            region: None,
            status: ServerStatus::Online,
            last_seen_at: min(2),
            has_credential: true,
        },
        Server {
            id: "srv_stage".into(),
            name: "staging-eu".into(),
            kind: ServerKind::Ssh,
            host: "staging.example.com".into(),
            region: None,
            status: ServerStatus::Offline,
            last_seen_at: hr(3),
            has_credential: true,
        },
        Server {
            id: "srv_cloud".into(),
            name: "Cloud Sandbox".into(),
            kind: ServerKind::Cloud,
            host: "sandbox.openship.io".into(),
            region: Some("us-east-1".into()),
            status: ServerStatus::Online,
            last_seen_at: min(4),
            has_credential: false,
        },
    ]
}

pub fn logs() -> Vec<LogEntry> {
    let seeds = [
        ("srv_prod", LogLevel::Info, "Health check passed"),
        ("srv_prod", LogLevel::Info, "Pulling image acme/api@sha256:9d11"),
        ("srv_prod", LogLevel::Debug, "Starting container prism-api-0042"),
        ("srv_prod", LogLevel::Info, "Container started in 1.2s"),
        ("srv_prod", LogLevel::Warn, "Disk usage 78% on /var/lib/docker"),
        ("srv_prod", LogLevel::Info, "TLS certificate renewed"),
        ("srv_local", LogLevel::Info, "Local API responding"),
        ("srv_local", LogLevel::Error, "Failed to bind 127.0.0.1:7420 (in use)"),
        ("srv_local", LogLevel::Info, "Rebound to 127.0.0.1:7430"),
        ("srv_stage", LogLevel::Info, "Last seen 3 hours ago — assuming offline"),
    ];

    let mut out = Vec::with_capacity(60);
    for i in 0..60 {
        let (target, level, msg) = seeds[i % seeds.len()].clone();
        out.push(LogEntry {
            id: format!("log_{:04}", i),
            target_id: target.to_string(),
            level,
            message: msg.to_string(),
            timestamp: (now() - Duration::seconds((60 - i) as i64 * 5)).to_rfc3339(),
        });
    }
    out
}

/// Convenience for `trigger_deployment`: synthesize a fresh deployment row.
pub fn new_deployment(project_id: &str, branch: &str) -> Deployment {
    let id = format!("dep_{}", Uuid::new_v4().simple().to_string().chars().take(8).collect::<String>());
    Deployment {
        id,
        project_id: project_id.to_string(),
        commit_sha: "deadbee".into(),
        commit_message: format!("manual deploy of {}", branch),
        author: "you".into(),
        status: DeploymentStatus::Queued,
        started_at: Utc::now().to_rfc3339(),
        finished_at: None,
        duration_ms: None,
    }
}