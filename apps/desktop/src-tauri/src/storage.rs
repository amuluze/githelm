//! SQLite persistence for server configs, audit logs, issues, projects and
//! deployments. The database lives at `~/.githelm/githelm.db` by default;
//! setting `GITHelm_HOME` redirects the whole data directory (useful for
//! tests). Every command in `commands/` goes through this module — the
//! renderer contract (camelCase JSON) is unchanged.

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};

use crate::error::{AppError, AppResult};
use crate::types::{Deployment, Issue, IssueKind, IssueStatus, LogEntry, Project, Server};

/// Schema version — bump and add a migration step when the DDL changes.
const SCHEMA_VERSION: i64 = 1;

pub fn data_dir() -> AppResult<PathBuf> {
    if let Ok(dir) = std::env::var("GITHelm_HOME") {
        if !dir.is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("cannot resolve the user home directory".into()))?;
    Ok(home.join(".githelm"))
}

pub fn db_path() -> AppResult<PathBuf> {
    Ok(data_dir()?.join("githelm.db"))
}

/// Opens (and if needed creates) the database at the default location,
/// applying pending migrations.
pub fn open() -> AppResult<Connection> {
    let path = db_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Internal(format!("create {}: {e}", parent.display())))?;
    }
    open_at(&path)
}

pub fn open_at(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)
        .map_err(|e| AppError::Internal(format!("open {}: {e}", path.display())))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| AppError::Internal(format!("set journal_mode: {e}")))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| AppError::Internal(format!("set foreign_keys: {e}")))?;
    conn.pragma_update(None, "busy_timeout", 5_000)
        .map_err(|e| AppError::Internal(format!("set busy_timeout: {e}")))?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> AppResult<()> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| AppError::Internal(format!("read user_version: {e}")))?;
    if version >= SCHEMA_VERSION {
        return Ok(());
    }
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id                   TEXT PRIMARY KEY,
            name                 TEXT NOT NULL,
            slug                 TEXT NOT NULL,
            repository           TEXT NOT NULL,
            branch               TEXT NOT NULL,
            status               TEXT NOT NULL,
            latest_deployment_id TEXT,
            created_at           TEXT NOT NULL,
            url                  TEXT,
            deployment_count     INTEGER NOT NULL DEFAULT 0,
            provider             TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deployments (
            id             TEXT PRIMARY KEY,
            project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            commit_sha     TEXT NOT NULL,
            commit_message TEXT NOT NULL,
            author         TEXT NOT NULL,
            status         TEXT NOT NULL,
            started_at     TEXT NOT NULL,
            finished_at    TEXT,
            duration_ms    INTEGER
        );

        CREATE TABLE IF NOT EXISTS servers (
            id             TEXT PRIMARY KEY,
            name           TEXT NOT NULL,
            kind           TEXT NOT NULL,
            host           TEXT NOT NULL,
            region         TEXT,
            status         TEXT NOT NULL,
            last_seen_at   TEXT NOT NULL,
            has_credential INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS logs (
            id        TEXT PRIMARY KEY,
            target_id TEXT NOT NULL,
            level     TEXT NOT NULL,
            message   TEXT NOT NULL,
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS issues (
            id          TEXT PRIMARY KEY,
            kind        TEXT NOT NULL,
            status      TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT NOT NULL,
            target_name TEXT NOT NULL,
            detected_at TEXT NOT NULL,
            resolved_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_logs_target ON logs(target_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status, detected_at DESC);
        "#,
    )
    .map_err(|e| AppError::Internal(format!("create schema: {e}")))?;
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|e| AppError::Internal(format!("set user_version: {e}")))?;
    Ok(())
}

fn sql_err(context: &str) -> impl FnOnce(rusqlite::Error) -> AppError + '_ {
    move |e| AppError::Internal(format!("{context}: {e}"))
}

/// Unit-variant enums are stored as their serde string form (kebab-case),
/// which is exactly what the renderer already speaks.
fn enum_to_str<T: Serialize>(value: &T) -> AppResult<String> {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .ok_or_else(|| AppError::Internal("enum serialization failed".into()))
}

/// Row-mapper helper: reads a TEXT column back into a unit-variant enum.
fn enum_col<T: DeserializeOwned>(row: &rusqlite::Row<'_>, idx: usize) -> rusqlite::Result<T> {
    let raw: String = row.get(idx)?;
    serde_json::from_value(serde_json::Value::String(raw)).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(idx, rusqlite::types::Type::Text, Box::new(e))
    })
}

// ── Projects ────────────────────────────────────────────────────────────

pub fn list_projects(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, slug, repository, branch, status, latest_deployment_id,
                    created_at, url, deployment_count, provider
             FROM projects ORDER BY created_at DESC, rowid DESC",
        )
        .map_err(sql_err("list projects"))?;
    let rows = stmt
        .query_map([], row_project)
        .map_err(sql_err("list projects"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_err("list projects"))?;
    Ok(rows)
}

pub fn get_project(conn: &Connection, id: &str) -> AppResult<Option<Project>> {
    conn.query_row(
        "SELECT id, name, slug, repository, branch, status, latest_deployment_id,
                created_at, url, deployment_count, provider
         FROM projects WHERE id = ?1",
        params![id],
        row_project,
    )
    .optional()
    .map_err(sql_err("get project"))
}

pub fn find_project_by_repository(
    conn: &Connection,
    repository: &str,
) -> AppResult<Option<Project>> {
    conn.query_row(
        "SELECT id, name, slug, repository, branch, status, latest_deployment_id,
                created_at, url, deployment_count, provider
         FROM projects WHERE repository = ?1",
        params![repository],
        row_project,
    )
    .optional()
    .map_err(sql_err("find project by repository"))
}

/// Written by `create_project` — the importer path reserved for the real
/// control plane.
pub fn insert_project(conn: &Connection, p: &Project) -> AppResult<()> {
    conn.execute(
        "INSERT INTO projects (id, name, slug, repository, branch, status, latest_deployment_id,
                              created_at, url, deployment_count, provider)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            p.id,
            p.name,
            p.slug,
            p.repository,
            p.branch,
            enum_to_str(&p.status)?,
            p.latest_deployment_id,
            p.created_at,
            p.url,
            p.deployment_count,
            enum_to_str(&p.provider)?,
        ],
    )
    .map(|_| ())
    .map_err(sql_err("insert project"))
}

/// Bookkeeping when a deployment is triggered: bump the counter, point the
/// latest pointer at the new row and flip the project to building.
pub fn apply_triggered_deployment(
    conn: &Connection,
    project_id: &str,
    deployment_id: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE projects
         SET deployment_count = deployment_count + 1,
             latest_deployment_id = ?2,
             status = 'building'
         WHERE id = ?1",
        params![project_id, deployment_id],
    )
    .map(|_| ())
    .map_err(sql_err("apply triggered deployment"))
}

fn row_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        slug: row.get(2)?,
        repository: row.get(3)?,
        branch: row.get(4)?,
        status: enum_col(row, 5)?,
        latest_deployment_id: row.get(6)?,
        created_at: row.get(7)?,
        url: row.get(8)?,
        deployment_count: row.get::<_, i64>(9)? as u32,
        provider: enum_col(row, 10)?,
    })
}

// ── Deployments ─────────────────────────────────────────────────────────

pub fn list_deployments(conn: &Connection, project_id: Option<&str>) -> AppResult<Vec<Deployment>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, commit_sha, commit_message, author, status,
                    started_at, finished_at, duration_ms
             FROM deployments
             WHERE (?1 IS NULL OR project_id = ?1)
             ORDER BY started_at DESC, rowid DESC",
        )
        .map_err(sql_err("list deployments"))?;
    let rows = stmt
        .query_map(params![project_id], row_deployment)
        .map_err(sql_err("list deployments"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_err("list deployments"))?;
    Ok(rows)
}

pub fn get_deployment(conn: &Connection, id: &str) -> AppResult<Option<Deployment>> {
    conn.query_row(
        "SELECT id, project_id, commit_sha, commit_message, author, status,
                started_at, finished_at, duration_ms
         FROM deployments WHERE id = ?1",
        params![id],
        row_deployment,
    )
    .optional()
    .map_err(sql_err("get deployment"))
}

pub fn insert_deployment(conn: &Connection, d: &Deployment) -> AppResult<()> {
    conn.execute(
        "INSERT INTO deployments (id, project_id, commit_sha, commit_message, author, status,
                                  started_at, finished_at, duration_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            d.id,
            d.project_id,
            d.commit_sha,
            d.commit_message,
            d.author,
            enum_to_str(&d.status)?,
            d.started_at,
            d.finished_at,
            d.duration_ms.map(|v| v as i64),
        ],
    )
    .map(|_| ())
    .map_err(sql_err("insert deployment"))
}

fn row_deployment(row: &rusqlite::Row<'_>) -> rusqlite::Result<Deployment> {
    Ok(Deployment {
        id: row.get(0)?,
        project_id: row.get(1)?,
        commit_sha: row.get(2)?,
        commit_message: row.get(3)?,
        author: row.get(4)?,
        status: enum_col(row, 5)?,
        started_at: row.get(6)?,
        finished_at: row.get(7)?,
        duration_ms: row.get::<_, Option<i64>>(8)?.map(|v| v as u64),
    })
}

// ── Servers ─────────────────────────────────────────────────────────────

pub fn list_servers(conn: &Connection) -> AppResult<Vec<Server>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, kind, host, region, status, last_seen_at, has_credential
             FROM servers ORDER BY rowid",
        )
        .map_err(sql_err("list servers"))?;
    let rows = stmt
        .query_map([], row_server)
        .map_err(sql_err("list servers"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_err("list servers"))?;
    Ok(rows)
}

pub fn get_server(conn: &Connection, id: &str) -> AppResult<Option<Server>> {
    conn.query_row(
        "SELECT id, name, kind, host, region, status, last_seen_at, has_credential
         FROM servers WHERE id = ?1",
        params![id],
        row_server,
    )
    .optional()
    .map_err(sql_err("get server"))
}

pub fn insert_server(conn: &Connection, s: &Server) -> AppResult<()> {
    conn.execute(
        "INSERT INTO servers (id, name, kind, host, region, status, last_seen_at, has_credential)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            s.id,
            s.name,
            enum_to_str(&s.kind)?,
            s.host,
            s.region,
            enum_to_str(&s.status)?,
            s.last_seen_at,
            s.has_credential as i64,
        ],
    )
    .map(|_| ())
    .map_err(sql_err("insert server"))
}

/// Returns false when no row matched, so callers can raise NotFound.
pub fn delete_server(conn: &Connection, id: &str) -> AppResult<bool> {
    let affected = conn
        .execute("DELETE FROM servers WHERE id = ?1", params![id])
        .map_err(sql_err("delete server"))?;
    Ok(affected > 0)
}

fn row_server(row: &rusqlite::Row<'_>) -> rusqlite::Result<Server> {
    Ok(Server {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: enum_col(row, 2)?,
        host: row.get(3)?,
        region: row.get(4)?,
        status: enum_col(row, 5)?,
        last_seen_at: row.get(6)?,
        has_credential: row.get::<_, i64>(7)? != 0,
    })
}

// ── Logs ────────────────────────────────────────────────────────────────

/// Newest `limit` entries for a target (or all targets), returned in
/// chronological order — same semantics the in-memory list had.
pub fn list_logs(
    conn: &Connection,
    target_id: Option<&str>,
    limit: usize,
) -> AppResult<Vec<LogEntry>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, target_id, level, message, timestamp
             FROM logs
             WHERE (?1 IS NULL OR target_id = ?1)
             ORDER BY timestamp DESC, rowid DESC
             LIMIT ?2",
        )
        .map_err(sql_err("list logs"))?;
    let rows = stmt
        .query_map(params![target_id, limit as i64], row_log)
        .map_err(sql_err("list logs"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_err("list logs"))?;
    let mut out = rows;
    out.reverse();
    Ok(out)
}

#[allow(dead_code)]
pub fn insert_log(conn: &Connection, l: &LogEntry) -> AppResult<()> {
    conn.execute(
        "INSERT INTO logs (id, target_id, level, message, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            l.id,
            l.target_id,
            enum_to_str(&l.level)?,
            l.message,
            l.timestamp,
        ],
    )
    .map(|_| ())
    .map_err(sql_err("insert log"))
}

fn row_log(row: &rusqlite::Row<'_>) -> rusqlite::Result<LogEntry> {
    Ok(LogEntry {
        id: row.get(0)?,
        target_id: row.get(1)?,
        level: enum_col(row, 2)?,
        message: row.get(3)?,
        timestamp: row.get(4)?,
    })
}

// ── Issues ──────────────────────────────────────────────────────────────

pub fn list_issues(conn: &Connection) -> AppResult<Vec<Issue>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, kind, status, title, description, target_name, detected_at, resolved_at
             FROM issues ORDER BY detected_at DESC, rowid DESC",
        )
        .map_err(sql_err("list issues"))?;
    let rows = stmt
        .query_map([], row_issue)
        .map_err(sql_err("list issues"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_err("list issues"))?;
    Ok(rows)
}

#[allow(dead_code)]
pub fn insert_issue(conn: &Connection, i: &Issue) -> AppResult<()> {
    conn.execute(
        "INSERT INTO issues (id, kind, status, title, description, target_name, detected_at, resolved_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            i.id,
            enum_to_str(&i.kind)?,
            enum_to_str(&i.status)?,
            i.title,
            i.description,
            i.target_name,
            i.detected_at,
            i.resolved_at,
        ],
    )
    .map(|_| ())
    .map_err(sql_err("insert issue"))
}

fn row_issue(row: &rusqlite::Row<'_>) -> rusqlite::Result<Issue> {
    Ok(Issue {
        id: row.get(0)?,
        kind: enum_col::<IssueKind>(row, 1)?,
        status: enum_col::<IssueStatus>(row, 2)?,
        title: row.get(3)?,
        description: row.get(4)?,
        target_name: row.get(5)?,
        detected_at: row.get(6)?,
        resolved_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        DeploymentStatus, LogLevel, ProjectStatus, Provider, ServerKind, ServerStatus,
    };

    fn test_conn() -> Connection {
        let dir = std::env::temp_dir().join(format!("githelm-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        open_at(&dir.join("githelm.db")).expect("open test db")
    }

    fn sample_server(id: &str) -> Server {
        Server {
            id: id.into(),
            name: "prod-use1".into(),
            kind: ServerKind::Ssh,
            host: "prod.example.com".into(),
            region: None,
            status: ServerStatus::Connecting,
            last_seen_at: "2026-08-19T04:00:00Z".into(),
            has_credential: true,
        }
    }

    #[test]
    fn server_roundtrip() {
        let conn = test_conn();
        assert!(list_servers(&conn).unwrap().is_empty());

        insert_server(&conn, &sample_server("srv_a")).unwrap();
        insert_server(&conn, &sample_server("srv_b")).unwrap();
        let all = list_servers(&conn).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "srv_a"); // insertion order
        assert_eq!(all[0].kind, ServerKind::Ssh);
        assert!(all[0].has_credential);

        assert!(get_server(&conn, "srv_a").unwrap().is_some());
        assert!(delete_server(&conn, "srv_a").unwrap());
        assert!(!delete_server(&conn, "srv_a").unwrap()); // already gone
        assert_eq!(list_servers(&conn).unwrap().len(), 1);
    }

    #[test]
    fn project_and_deployment_roundtrip() {
        let conn = test_conn();
        let project = Project {
            id: "prj_1".into(),
            name: "Atlas".into(),
            slug: "atlas".into(),
            repository: "acme/atlas".into(),
            branch: "main".into(),
            status: ProjectStatus::Running,
            latest_deployment_id: None,
            created_at: "2026-08-01T00:00:00Z".into(),
            url: Some("https://atlas.example.com".into()),
            deployment_count: 0,
            provider: Provider::Github,
        };
        insert_project(&conn, &project).unwrap();

        let dep = Deployment {
            id: "dep_1".into(),
            project_id: "prj_1".into(),
            commit_sha: "a8f3d21".into(),
            commit_message: "feat: sync".into(),
            author: "ada".into(),
            status: DeploymentStatus::Queued,
            started_at: "2026-08-19T04:00:00Z".into(),
            finished_at: None,
            duration_ms: None,
        };
        insert_deployment(&conn, &dep).unwrap();
        apply_triggered_deployment(&conn, "prj_1", "dep_1").unwrap();

        let stored = get_project(&conn, "prj_1").unwrap().unwrap();
        assert_eq!(stored.deployment_count, 1);
        assert_eq!(stored.latest_deployment_id.as_deref(), Some("dep_1"));
        assert_eq!(stored.status, ProjectStatus::Building);

        let deps = list_deployments(&conn, Some("prj_1")).unwrap();
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].status, DeploymentStatus::Queued);
        assert!(list_deployments(&conn, Some("prj_missing"))
            .unwrap()
            .is_empty());

        // foreign key: a deployment for an unknown project is rejected
        let orphan = Deployment {
            id: "dep_x".into(),
            project_id: "nope".into(),
            ..dep.clone()
        };
        assert!(insert_deployment(&conn, &orphan).is_err());
    }

    #[test]
    fn logs_limit_semantics() {
        let conn = test_conn();
        for i in 0..5 {
            insert_log(
                &conn,
                &LogEntry {
                    id: format!("log_{i}"),
                    target_id: "srv_prod".into(),
                    level: if i % 2 == 0 {
                        LogLevel::Info
                    } else {
                        LogLevel::Warn
                    },
                    message: format!("entry {i}"),
                    timestamp: format!("2026-08-19T04:00:{i:02}Z"),
                },
            )
            .unwrap();
        }
        // newest 3, chronological order
        let tail = list_logs(&conn, Some("srv_prod"), 3).unwrap();
        assert_eq!(
            tail.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(),
            vec!["log_2", "log_3", "log_4"]
        );
        assert!(list_logs(&conn, Some("srv_other"), 10).unwrap().is_empty());
        let all = list_logs(&conn, None, 100).unwrap();
        assert_eq!(all.len(), 5);
    }

    #[test]
    fn issue_roundtrip() {
        let conn = test_conn();
        let issue = Issue {
            id: "iss_1".into(),
            kind: IssueKind::Certificate,
            status: IssueStatus::Resolved,
            title: "TLS 证书已过期".into(),
            description: "已自动续期".into(),
            target_name: "Atlas".into(),
            detected_at: "2026-08-13T00:00:00Z".into(),
            resolved_at: Some("2026-08-13T00:01:00Z".into()),
        };
        insert_issue(&conn, &issue).unwrap();
        let all = list_issues(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].kind, IssueKind::Certificate);
        assert!(all[0].resolved_at.is_some());
    }
}
