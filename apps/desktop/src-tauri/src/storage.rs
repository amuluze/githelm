//! SQLite persistence for server configs, audit logs, issues, projects and
//! deployments. The database lives at `~/.githelm/githelm.db` by default;
//! setting `GITHelm_HOME` redirects the whole data directory (useful for
//! tests). Every command in `commands/` goes through this module — the
//! renderer contract (camelCase JSON) is unchanged.

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};

use crate::error::{AppError, AppResult};
use crate::types::{
    Deployment, Issue, IssueKind, IssueStatus, LogEntry, Project, ProjectStatus, Server,
    ServerStatus,
};

/// Schema version — bump and add a migration step when the DDL changes.
const SCHEMA_VERSION: i64 = 2;

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
    let conn = open_at(&path)?;
    // The pipeline writes one log row per output line; prune once per launch
    // so the table stays bounded without paying for a check on every insert.
    prune_logs(&conn, LOG_RETENTION_ROWS)?;
    Ok(conn)
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
    // v1: base tables. Kept verbatim so v0 databases migrate identically.
    if version < 1 {
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
    }
    // v2: deployment pipeline config on projects, SSH target details on servers.
    if version < 2 {
        conn.execute_batch(
            r#"
            ALTER TABLE projects ADD COLUMN local_path TEXT;
            ALTER TABLE projects ADD COLUMN server_id TEXT;
            ALTER TABLE projects ADD COLUMN deploy_dir TEXT;
            ALTER TABLE projects ADD COLUMN build_command TEXT;
            ALTER TABLE projects ADD COLUMN update_command TEXT;
            ALTER TABLE servers ADD COLUMN username TEXT;
            ALTER TABLE servers ADD COLUMN port INTEGER NOT NULL DEFAULT 22;
            "#,
        )
        .map_err(|e| AppError::Internal(format!("migrate to v2: {e}")))?;
    }
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

/// Column list shared by every project SELECT/INSERT — keep row_project in
/// sync (positional reads).
const PROJECT_COLS: &str = "id, name, slug, repository, branch, status, latest_deployment_id,
       created_at, url, deployment_count, provider,
       local_path, server_id, deploy_dir, build_command, update_command";

pub fn list_projects(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {PROJECT_COLS} FROM projects ORDER BY created_at DESC, rowid DESC"
        ))
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
        &format!("SELECT {PROJECT_COLS} FROM projects WHERE id = ?1"),
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
        &format!("SELECT {PROJECT_COLS} FROM projects WHERE repository = ?1"),
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
                              created_at, url, deployment_count, provider,
                              local_path, server_id, deploy_dir, build_command, update_command)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
            p.local_path,
            p.server_id,
            p.deploy_dir,
            p.build_command,
            p.update_command,
        ],
    )
    .map(|_| ())
    .map_err(sql_err("insert project"))
}

/// Persists the deploy pipeline config from the deploy dialog. Empty values
/// clear the field; `server_id` is validated against the servers table.
pub fn update_project_config(
    conn: &Connection,
    project_id: &str,
    local_path: Option<&str>,
    server_id: Option<&str>,
    deploy_dir: Option<&str>,
    build_command: Option<&str>,
    update_command: Option<&str>,
) -> AppResult<()> {
    let changed = conn
        .execute(
            "UPDATE projects
             SET local_path = ?2, server_id = ?3, deploy_dir = ?4,
                 build_command = ?5, update_command = ?6
             WHERE id = ?1",
            params![
                project_id,
                blank_to_null(local_path),
                blank_to_null(server_id),
                blank_to_null(deploy_dir),
                blank_to_null(build_command),
                blank_to_null(update_command),
            ],
        )
        .map_err(sql_err("update project config"))?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("project {project_id}")));
    }
    Ok(())
}

fn blank_to_null(v: Option<&str>) -> Option<&str> {
    v.map(str::trim).filter(|s| !s.is_empty())
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
        local_path: row.get(11)?,
        server_id: row.get(12)?,
        deploy_dir: row.get(13)?,
        build_command: row.get(14)?,
        update_command: row.get(15)?,
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

/// Moves a deployment to a terminal/intermediate status, stamping
/// finished_at / duration_ms when it terminates. Project status flips to
/// `running` / `error` alongside so the UI stays in sync.
pub fn update_deployment(
    conn: &Connection,
    deployment: &Deployment,
    project_status: ProjectStatus,
) -> AppResult<()> {
    conn.execute(
        "UPDATE deployments
         SET status = ?2, finished_at = ?3, duration_ms = ?4
         WHERE id = ?1",
        params![
            deployment.id,
            enum_to_str(&deployment.status)?,
            deployment.finished_at,
            deployment.duration_ms.map(|v| v as i64),
        ],
    )
    .map_err(sql_err("update deployment"))?;
    conn.execute(
        "UPDATE projects SET status = ?2 WHERE id = ?1",
        params![deployment.project_id, enum_to_str(&project_status)?],
    )
    .map_err(sql_err("update project status"))?;
    Ok(())
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

/// Column list shared by every server SELECT/INSERT — keep row_server in
/// sync (positional reads).
const SERVER_COLS: &str = "id, name, kind, host, region, status, last_seen_at, has_credential,
       username, port";

pub fn list_servers(conn: &Connection) -> AppResult<Vec<Server>> {
    let mut stmt = conn
        .prepare(&format!("SELECT {SERVER_COLS} FROM servers ORDER BY rowid"))
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
        &format!("SELECT {SERVER_COLS} FROM servers WHERE id = ?1"),
        params![id],
        row_server,
    )
    .optional()
    .map_err(sql_err("get server"))
}

pub fn insert_server(conn: &Connection, s: &Server) -> AppResult<()> {
    conn.execute(
        "INSERT INTO servers (id, name, kind, host, region, status, last_seen_at, has_credential,
                              username, port)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            s.id,
            s.name,
            enum_to_str(&s.kind)?,
            s.host,
            s.region,
            enum_to_str(&s.status)?,
            s.last_seen_at,
            s.has_credential as i64,
            s.username,
            s.port,
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

pub fn update_server(conn: &Connection, s: &Server) -> AppResult<bool> {
    let affected = conn
        .execute(
            "UPDATE servers
             SET name = ?2, kind = ?3, host = ?4, region = ?5, username = ?9, port = ?10
             WHERE id = ?1",
            params![
                s.id,
                s.name,
                enum_to_str(&s.kind)?,
                s.host,
                s.region,
                s.username,
                s.port,
            ],
        )
        .map_err(sql_err("update server"))?;
    Ok(affected > 0)
}

/// Detaches projects that targeted this server so their next deploy prompts
/// for a new target instead of failing on a dangling id.
pub fn clear_project_server(conn: &Connection, server_id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE projects SET server_id = NULL WHERE server_id = ?1",
        params![server_id],
    )
    .map(|_| ())
    .map_err(sql_err("clear project server"))
}

pub fn set_server_status(
    conn: &Connection,
    id: &str,
    status: &ServerStatus,
    last_seen_at: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE servers SET status = ?2, last_seen_at = ?3 WHERE id = ?1",
        params![id, enum_to_str(status)?, last_seen_at],
    )
    .map(|_| ())
    .map_err(sql_err("set server status"))
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
        username: row.get(8)?,
        port: row
            .get::<_, Option<i64>>(9)?
            .map(|v| v as u16)
            .unwrap_or(22),
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

/// Written by the deployment pipeline (one row per output line).
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

/// Upper bound on rows kept in the logs table. Deployment output is written
/// line-by-line and mostly noise after a deploy ends; 5k lines is far more
/// than any single log dialog renders (the UI fetches 500).
pub const LOG_RETENTION_ROWS: i64 = 5_000;

/// Deletes every log entry except the newest `keep` ones. Called at startup
/// and after each deployment reaches a terminal state. Returns the number of
/// rows removed.
pub fn prune_logs(conn: &Connection, keep: i64) -> AppResult<u64> {
    let deleted = conn
        .execute(
            "DELETE FROM logs WHERE rowid NOT IN (
                 SELECT rowid FROM logs ORDER BY timestamp DESC, rowid DESC LIMIT ?1
             )",
            params![keep],
        )
        .map_err(sql_err("prune logs"))?;
    Ok(deleted as u64)
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
            username: Some("root".into()),
            port: 22,
        }
    }

    #[test]
    fn migrates_v1_database_in_place() {
        let dir = std::env::temp_dir().join(format!("githelm-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("githelm.db");

        // A v1 database: base tables, one project row, user_version = 1.
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE projects (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
                    repository TEXT NOT NULL, branch TEXT NOT NULL, status TEXT NOT NULL,
                    latest_deployment_id TEXT, created_at TEXT NOT NULL, url TEXT,
                    deployment_count INTEGER NOT NULL DEFAULT 0, provider TEXT NOT NULL
                );
                CREATE TABLE servers (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
                    host TEXT NOT NULL, region TEXT, status TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL, has_credential INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO projects VALUES
                    ('prj_old', 'Old', 'old', 'acme/old', 'main', 'running',
                     NULL, '2026-01-01T00:00:00Z', NULL, 3, 'github');
                INSERT INTO servers VALUES
                    ('srv_old', 'prod', 'ssh', 'prod.example.com', NULL, 'online',
                     '2026-01-01T00:00:00Z', 1);
                PRAGMA user_version = 1;
                "#,
            )
            .unwrap();
        }

        // Opening migrates to v2 and the v1 rows survive with new defaults.
        let conn = open_at(&path).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);

        let project = get_project(&conn, "prj_old").unwrap().unwrap();
        assert_eq!(project.name, "Old");
        assert_eq!(project.deployment_count, 3);
        assert!(project.local_path.is_none() && project.server_id.is_none());
        assert!(project.update_command.is_none());

        let server = list_servers(&conn).unwrap().remove(0);
        assert_eq!(server.id, "srv_old");
        assert_eq!(server.port, 22);

        // Config writes hit the migrated columns and survive a reopen.
        update_project_config(
            &conn,
            "prj_old",
            Some("/tmp/acme-old"),
            Some("srv_old"),
            Some("/srv/old"),
            Some("task push"),
            Some("docker compose pull && docker compose up -d"),
        )
        .unwrap();
        let project = get_project(&conn, "prj_old").unwrap().unwrap();
        assert_eq!(project.local_path.as_deref(), Some("/tmp/acme-old"));
        assert_eq!(project.server_id.as_deref(), Some("srv_old"));
        assert_eq!(
            project.update_command.as_deref(),
            Some("docker compose pull && docker compose up -d")
        );
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
            local_path: None,
            server_id: None,
            deploy_dir: None,
            build_command: None,
            update_command: None,
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
    fn prune_logs_keeps_newest() {
        let conn = test_conn();
        for i in 0..6 {
            insert_log(
                &conn,
                &LogEntry {
                    id: format!("log_{i}"),
                    target_id: "dep_1".into(),
                    level: LogLevel::Info,
                    message: format!("entry {i}"),
                    timestamp: format!("2026-08-19T04:00:{i:02}Z"),
                },
            )
            .unwrap();
        }
        // Under the cap: nothing is removed.
        assert_eq!(prune_logs(&conn, 10).unwrap(), 0);
        // Over the cap: the 3 oldest go, the newest 2 survive in order.
        assert_eq!(prune_logs(&conn, 2).unwrap(), 4);
        assert_eq!(
            list_logs(&conn, None, 100)
                .unwrap()
                .iter()
                .map(|l| l.id.as_str())
                .collect::<Vec<_>>(),
            vec!["log_4", "log_5"]
        );
        // Repeated prunes are idempotent.
        assert_eq!(prune_logs(&conn, 2).unwrap(), 0);
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
