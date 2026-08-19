//! Deployment pipeline: run the project's local build & push command
//! (Taskfile-style, e.g. `task push`), then SSH to the target server and run
//! the update command inside the deploy dir (e.g. compose pull + up -d).
//!
//! `deploy_project` validates the config, records the deployment and hands
//! the actual work to a detached task; progress streams line-by-line into
//! the logs table (target = deployment id) so the UI can poll it.

use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::State;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage;
use crate::types::{
    Deployment, DeploymentStatus, LogEntry, LogLevel, Project, ProjectStatus, Server, ServerStatus,
};

#[tauri::command]
pub fn list_deployments(
    state: State<'_, AppState>,
    project_id: Option<String>,
) -> AppResult<Vec<Deployment>> {
    let conn = state.db.lock().expect("db mutex");
    storage::list_deployments(&conn, project_id.as_deref())
}

#[tauri::command]
pub fn get_deployment(state: State<'_, AppState>, id: String) -> AppResult<Deployment> {
    let conn = state.db.lock().expect("db mutex");
    storage::get_deployment(&conn, &id)?
        .ok_or_else(|| AppError::NotFound(format!("deployment {id}")))
}

/// Single source of truth for "is this project deployable" — the deploy
/// dialog mirrors the same list before enabling the button.
fn validate_config(project: &Project) -> AppResult<()> {
    if project.status == ProjectStatus::Building {
        return Err(AppError::Validation("该项目已有部署正在进行中".into()));
    }
    let required: [(&str, bool); 5] = [
        ("本地路径", project.local_path.is_some()),
        ("目标服务器", project.server_id.is_some()),
        ("部署目录", project.deploy_dir.is_some()),
        ("构建命令", project.build_command.is_some()),
        ("更新命令", project.update_command.is_some()),
    ];
    let missing: Vec<&str> = required
        .iter()
        .filter(|(_, ok)| !ok)
        .map(|(label, _)| *label)
        .collect();
    if !missing.is_empty() {
        return Err(AppError::Validation(format!(
            "缺少部署配置：{}。请先在部署设置中填写",
            missing.join("、")
        )));
    }
    Ok(())
}

/// Kicks off a deployment and returns immediately with the building record;
/// the pipeline runs in a detached task and reports through the logs table.
#[tauri::command]
pub async fn deploy_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Deployment> {
    // Read config + server up front, then drop the db lock before spawning.
    let (project, server) = {
        let conn = state.db.lock().expect("db mutex");
        let project = storage::get_project(&conn, &project_id)?
            .ok_or_else(|| AppError::NotFound(format!("project {project_id}")))?;
        validate_config(&project)?;
        let server_id = project.server_id.as_deref().unwrap_or_default();
        let server = storage::get_server(&conn, server_id)?
            .ok_or_else(|| AppError::Validation("目标服务器不存在，请重新选择".into()))?;
        (project, server)
    };

    let git = git_info(project.local_path.as_deref().unwrap_or_default()).await;
    let dep = Deployment {
        id: format!(
            "dep_{}",
            Uuid::new_v4()
                .simple()
                .to_string()
                .chars()
                .take(8)
                .collect::<String>()
        ),
        project_id: project.id.clone(),
        commit_sha: git.sha.unwrap_or_else(|| "unknown".into()),
        commit_message: git
            .message
            .unwrap_or_else(|| format!("deploy of {}", project.branch)),
        author: git.author.unwrap_or_else(|| "local".into()),
        status: DeploymentStatus::Building,
        started_at: chrono::Utc::now().to_rfc3339(),
        finished_at: None,
        duration_ms: None,
    };
    {
        let mut conn = state.db.lock().expect("db mutex");
        let tx = conn
            .transaction()
            .map_err(|e| AppError::Internal(format!("begin: {e}")))?;
        storage::insert_deployment(&tx, &dep)?;
        storage::apply_triggered_deployment(&tx, &project.id, &dep.id)?;
        tx.commit()
            .map_err(|e| AppError::Internal(format!("commit: {e}")))?;
    }

    let db = state.db.clone();
    let task_dep = dep.clone();
    let local_path = project.local_path.clone().unwrap_or_default();
    let build_command = project.build_command.clone().unwrap_or_default();
    let deploy_dir = project.deploy_dir.clone().unwrap_or_default();
    let update_command = project.update_command.clone().unwrap_or_default();
    tokio::spawn(async move {
        run_pipeline(
            db,
            task_dep,
            local_path,
            build_command,
            server,
            deploy_dir,
            update_command,
        )
        .await;
    });

    Ok(dep)
}

// ── Pipeline ─────────────────────────────────────────────────────────────

struct GitInfo {
    sha: Option<String>,
    message: Option<String>,
    author: Option<String>,
}

/// Best-effort commit info from the local checkout; every field falls back
/// gracefully when the path isn't a git repo.
async fn git_info(path: &str) -> GitInfo {
    GitInfo {
        sha: git_query(path, &["rev-parse", "--short", "HEAD"]).await,
        message: git_query(path, &["log", "-1", "--pretty=%s"]).await,
        author: git_query(path, &["log", "-1", "--pretty=%an"]).await,
    }
}

async fn git_query(path: &str, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .await
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

#[allow(clippy::too_many_arguments)]
async fn run_pipeline(
    db: Arc<Mutex<rusqlite::Connection>>,
    mut dep: Deployment,
    local_path: String,
    build_command: String,
    server: Server,
    deploy_dir: String,
    update_command: String,
) {
    let start = Instant::now();
    log_line(
        &db,
        &dep.id,
        LogLevel::Info,
        &format!(
            "开始部署 {}（{} → {}）",
            dep.commit_sha, server.host, deploy_dir
        ),
    );

    // Step 1 — local build & push. A login shell (-lc) so the user's PATH
    // (homebrew task/docker) is available to GUI-launched apps.
    let mut build = Command::new("sh");
    build
        .arg("-lc")
        .arg(&build_command)
        .current_dir(&local_path);
    let build_title = format!("cd {local_path} && {build_command}");
    if let Err(err) = run_streamed(&db, &dep.id, &build_title, build).await {
        finish_failure(&db, &mut dep, start, err).await;
        return;
    }

    // Step 2 — remote update over SSH.
    dep.status = DeploymentStatus::Deploying;
    {
        let conn = db.lock().expect("db mutex");
        if let Err(err) = storage::update_deployment(&conn, &dep, ProjectStatus::Building) {
            eprintln!("[githelm] update deployment: {err}");
        }
    }
    let mut ssh = ssh_command(&server);
    ssh.arg(format!("cd {deploy_dir} && {update_command}"));
    let remote_title = format!("ssh {} 'cd {deploy_dir} && {update_command}'", server.host);
    let result = run_streamed(&db, &dep.id, &remote_title, ssh).await;

    match result {
        Ok(()) => {
            dep.status = DeploymentStatus::Live;
            dep.finished_at = Some(chrono::Utc::now().to_rfc3339());
            dep.duration_ms = Some(start.elapsed().as_millis() as u64);
            let duration = dep.duration_ms.unwrap_or_default();
            let conn = db.lock().expect("db mutex");
            if let Err(err) = storage::update_deployment(&conn, &dep, ProjectStatus::Running) {
                eprintln!("[githelm] update deployment: {err}");
            }
            if let Err(err) = storage::set_server_status(
                &conn,
                &server.id,
                &ServerStatus::Online,
                &chrono::Utc::now().to_rfc3339(),
            ) {
                eprintln!("[githelm] set server status: {err}");
            }
            drop(conn);
            log_line(
                &db,
                &dep.id,
                LogLevel::Info,
                &format!("部署完成，用时 {duration}ms"),
            );
        }
        Err(err) => finish_failure(&db, &mut dep, start, err).await,
    }
}

/// Streams a command's stdout+stderr into the logs table; Ok only when the
/// process exits successfully. kill_on_drop keeps a dropped task from
/// leaving an orphaned build behind.
async fn run_streamed(
    db: &Arc<Mutex<rusqlite::Connection>>,
    deployment_id: &str,
    title: &str,
    mut cmd: Command,
) -> AppResult<()> {
    log_line(db, deployment_id, LogLevel::Info, &format!("$ {title}"));
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Internal(format!("无法启动命令：{e}")))?;

    // docker push / buildx write progress to stderr, so both pipes log as
    // info; failures are signalled by the exit status, not the stream.
    let stdout = read_pipe(db, deployment_id, child.stdout.take());
    let stderr = read_pipe(db, deployment_id, child.stderr.take());
    let ((), ()) = tokio::join!(stdout, stderr);

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Internal(format!("等待命令退出失败：{e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::Internal(format!(
            "命令退出码 {}：{}",
            status
                .code()
                .map(|c| c.to_string())
                .unwrap_or_else(|| "信号中断".into()),
            title
        )))
    }
}

async fn read_pipe<R: tokio::io::AsyncRead + Unpin>(
    db: &Arc<Mutex<rusqlite::Connection>>,
    deployment_id: &str,
    pipe: Option<R>,
) {
    let Some(pipe) = pipe else { return };
    let mut lines = BufReader::new(pipe).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        log_line(db, deployment_id, LogLevel::Info, &line);
    }
}

/// Marks the deployment failed, the project errored and records the reason.
async fn finish_failure(
    db: &Arc<Mutex<rusqlite::Connection>>,
    dep: &mut Deployment,
    start: Instant,
    err: AppError,
) {
    log_line(db, &dep.id, LogLevel::Error, &format!("部署失败：{err}"));
    dep.status = DeploymentStatus::Failed;
    dep.finished_at = Some(chrono::Utc::now().to_rfc3339());
    dep.duration_ms = Some(start.elapsed().as_millis() as u64);
    let conn = db.lock().expect("db mutex");
    if let Err(log_err) = storage::update_deployment(&conn, dep, ProjectStatus::Error) {
        eprintln!("[githelm] update deployment: {log_err}");
    }
}

/// System ssh with non-interactive auth (agent / default keys / ssh_config).
pub(crate) fn ssh_command(server: &Server) -> Command {
    let user = server
        .username
        .clone()
        .unwrap_or_else(|| "root".to_string());
    let mut cmd = Command::new("ssh");
    cmd.args([
        "-p",
        &server.port.to_string(),
        // Never hang on a password prompt from a GUI app.
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "StrictHostKeyChecking=accept-new",
    ])
    .arg(format!("{user}@{}", server.host));
    cmd
}

fn log_line(
    db: &Arc<Mutex<rusqlite::Connection>>,
    deployment_id: &str,
    level: LogLevel,
    message: &str,
) {
    let entry = LogEntry {
        id: format!(
            "log_{}",
            Uuid::new_v4()
                .simple()
                .to_string()
                .chars()
                .take(12)
                .collect::<String>()
        ),
        target_id: deployment_id.to_string(),
        level,
        message: message.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    let conn = db.lock().expect("db mutex");
    if let Err(err) = storage::insert_log(&conn, &entry) {
        eprintln!("[githelm] insert log: {err}");
    }
}

/// End-to-end pipeline smoke: an `echo` build succeeds (stdout lands in the
/// logs table), then SSH to a refused port fails fast, which must flip the
/// deployment to failed and the project to error. No network or docker.
#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage as s;
    use crate::types::{DeploymentStatus, ProjectStatus, Provider, ServerKind, ServerStatus};

    #[tokio::test]
    #[ignore = "spawns real subprocesses (echo + ssh to a refused port)"]
    async fn pipeline_builds_then_fails_on_ssh() {
        let dir = std::env::temp_dir().join(format!("githelm-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn = s::open_at(&dir.join("githelm.db")).unwrap();
        let db = Arc::new(Mutex::new(conn));

        let project = Project {
            id: "prj_t".into(),
            name: "T".into(),
            slug: "t".into(),
            repository: "acme/t".into(),
            branch: "main".into(),
            status: ProjectStatus::Idle,
            latest_deployment_id: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            url: None,
            deployment_count: 0,
            provider: Provider::Github,
            local_path: None,
            server_id: None,
            deploy_dir: None,
            build_command: None,
            update_command: None,
        };
        {
            let conn = db.lock().unwrap();
            s::insert_project(&conn, &project).unwrap();
            s::insert_server(
                &conn,
                &Server {
                    id: "srv_t".into(),
                    name: "unreachable".into(),
                    kind: ServerKind::Ssh,
                    host: "127.0.0.1".into(),
                    region: None,
                    status: ServerStatus::Connecting,
                    last_seen_at: chrono::Utc::now().to_rfc3339(),
                    has_credential: true,
                    username: Some("root".into()),
                    // Nothing listens here — ssh fails immediately.
                    port: 1,
                },
            )
            .unwrap();
        }

        let dep = Deployment {
            id: "dep_t".into(),
            project_id: "prj_t".into(),
            commit_sha: "abc1234".into(),
            commit_message: "test".into(),
            author: "tester".into(),
            status: DeploymentStatus::Building,
            started_at: chrono::Utc::now().to_rfc3339(),
            finished_at: None,
            duration_ms: None,
        };
        {
            let conn = db.lock().unwrap();
            s::insert_deployment(&conn, &dep).unwrap();
            s::apply_triggered_deployment(&conn, "prj_t", &dep.id).unwrap();
        }

        let server = {
            let conn = db.lock().unwrap();
            s::get_server(&conn, "srv_t").unwrap().unwrap()
        };
        run_pipeline(
            db.clone(),
            dep.clone(),
            std::env::temp_dir().display().to_string(),
            "echo build-line-1 && echo build-line-2".into(),
            server,
            "/srv/t".into(),
            "echo update".into(),
        )
        .await;

        {
            let conn = db.lock().unwrap();
            let stored = s::get_deployment(&conn, "dep_t").unwrap().unwrap();
            assert_eq!(stored.status, DeploymentStatus::Failed);
            assert!(stored.finished_at.is_some() && stored.duration_ms.is_some());
            let project = s::get_project(&conn, "prj_t").unwrap().unwrap();
            assert_eq!(project.status, ProjectStatus::Error);

            let logs = s::list_logs(&conn, Some("dep_t"), 100).unwrap();
            let text: Vec<&str> = logs.iter().map(|l| l.message.as_str()).collect();
            assert!(text.iter().any(|m| m.contains("build-line-1")));
            assert!(text.iter().any(|m| m.contains("build-line-2")));
            assert!(text.iter().any(|m| m.contains("部署失败")));
        }
    }
}
