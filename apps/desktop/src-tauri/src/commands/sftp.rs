//! SFTP file transfers for the Files page: upload to the server, download
//! from it, create directories and delete entries. Everything runs through
//! the system `sftp` CLI in batch mode (`-b -`), reusing the deploy
//! pipeline's auth path (agent / default keys / ssh_config, plus the
//! materialized key file when present).
//!
//! Batch mode speaks the SFTP protocol directly, so remote paths are NOT
//! interpreted by a remote shell — spaces are safe with sftp's double-quote
//! syntax. Paths containing quotes / backslashes / newlines are rejected up
//! front (sftp's batch parser cannot represent them portably).

use std::process::Stdio;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use uuid::Uuid;

use crate::commands::servers::{apply_ssh_opts, remote_home};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage;
use crate::types::{LogEntry, LogLevel, Server};

/// Count of entries moved by one transfer command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpTransferResult {
    pub transferred: u32,
}

/// Rejects paths the sftp batch syntax cannot carry safely. Inside its
/// double-quoted arguments sftp offers no portable escape for quotes and
/// backslashes, and a newline would split the batch line.
fn assert_sftp_safe(kind: &str, path: &str) -> AppResult<()> {
    if path.is_empty() {
        return Err(AppError::Validation(format!("{kind}不能为空")));
    }
    if path.contains('"') || path.contains('\\') || path.contains('\n') || path.contains('\r') {
        return Err(AppError::Validation(format!(
            "{kind}包含暂不支持的字符（引号、反斜杠或换行）：{path}"
        )));
    }
    Ok(())
}

/// Translates a `~`-rooted path to an absolute one given the resolved
/// remote home; any other path passes through untouched.
fn join_home(path: &str, home: &str) -> String {
    if path == "~" {
        home.to_string()
    } else if let Some(rest) = path.strip_prefix("~/") {
        format!("{}/{}", home.trim_end_matches('/'), rest)
    } else {
        path.to_string()
    }
}

/// Resolves `~` / `~/...` to an absolute path via the login shell's $HOME —
/// the sftp batch has no remote shell to expand tildes. Extra ssh round
/// trip only for tilde-rooted paths.
async fn absolute_remote_path(server: &Server, path: &str) -> AppResult<String> {
    if path == "~" || path.starts_with("~/") {
        let home = remote_home(server).await?;
        Ok(join_home(path, &home))
    }
    else {
        Ok(path.to_string())
    }
}

/// Double-quotes a path for an sftp batch line. Only valid after
/// `assert_sftp_safe` cleared it.
fn batch_arg(path: &str) -> String {
    format!("\"{path}\"")
}

/// Joins a browsed directory (`~` shorthand allowed, sftp expands tildes)
/// with an entry name; a trailing slash is tolerated.
fn join_remote(dir: &str, name: &str) -> String {
    format!("{}/{}", dir.trim_end_matches('/'), name)
}

/// cd to the target dir, then `put` every entry (`-r` so directories land
/// recursively). Bare `put` keeps each entry's basename — no path assembly,
/// no quoting interactions between the two sides.
fn build_upload_batch(remote_dir: &str, local_paths: &[String]) -> String {
    let mut batch = format!("cd {}", batch_arg(remote_dir));
    for p in local_paths {
        batch.push_str("\nput -r ");
        batch.push_str(&batch_arg(p));
    }
    batch
}

/// lcd to the local target dir, then `get -r` with no local name so the
/// entry lands under its own basename.
fn build_download_batch(local_dir: &str, remote_path: &str) -> String {
    format!(
        "lcd {}\nget -r {}",
        batch_arg(local_dir),
        batch_arg(remote_path)
    )
}

fn build_mkdir_batch(remote_path: &str) -> String {
    format!("mkdir {}", batch_arg(remote_path))
}

/// `rm` for files, `rmdir` for directories — rmdir only removes EMPTY
/// directories, which keeps a GUI click from recursively wiping a tree
/// (the terminal page remains the tool for that).
fn build_delete_batch(remote_path: &str, is_dir: bool) -> String {
    if is_dir {
        format!("rmdir {}", batch_arg(remote_path))
    } else {
        format!("rm {}", batch_arg(remote_path))
    }
}

/// System sftp with the same non-interactive options as the deploy pipeline
/// (see `apply_ssh_opts`). The port goes through `-o Port=`: `-P` meant the
/// sftp-server *path* before OpenSSH 7.0 and the port after — using the
/// ssh_config directive keeps every version behaving identically.
fn sftp_command(server: &Server) -> Command {
    let user = server
        .username
        .clone()
        .unwrap_or_else(|| "root".to_string());
    let mut cmd = Command::new("sftp");
    cmd.arg("-o").arg(format!("Port={}", server.port));
    apply_ssh_opts(&mut cmd, server);
    cmd.arg(format!("{user}@{}", server.host));
    cmd
}

/// Runs one sftp batch, writing start / outcome into the activity log under
/// the server id. Ok only when every batch command succeeded — `sftp -b`
/// aborts on the first failure.
async fn run_sftp_batch(
    db: &Arc<Mutex<Connection>>,
    server: &Server,
    batch: &str,
    summary: &str,
) -> AppResult<()> {
    log_sftp(
        db,
        &server.id,
        LogLevel::Info,
        &format!("SFTP 开始：{summary}"),
    );
    let mut cmd = sftp_command(server);
    cmd.args(["-b", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Internal(format!("无法执行 sftp（未安装或不在 PATH 中）：{e}")))?;
    // The batch is tiny (a handful of lines); write it up front, then close
    // stdin so sftp executes and exits instead of waiting for EOF.
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(batch.as_bytes())
            .await
            .map_err(|e| AppError::Internal(format!("写入 sftp 批处理失败：{e}")))?;
    }
    let output = child
        .wait_with_output()
        .await
        .map_err(|e| AppError::Internal(format!("等待 sftp 退出失败：{e}")))?;
    if output.status.success() {
        log_sftp(
            db,
            &server.id,
            LogLevel::Info,
            &format!("SFTP 完成：{summary}"),
        );
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let reason = last_reason(stderr.trim());
    log_sftp(
        db,
        &server.id,
        LogLevel::Error,
        &format!("SFTP 失败：{summary}：{reason}"),
    );
    Err(AppError::Validation(format!("传输失败：{reason}")))
}

/// Keeps the tail of sftp's stderr — early lines are banner noise, the
/// actionable error comes last.
fn last_reason(stderr: &str) -> String {
    const MAX: usize = 400;
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        return "未知原因".into();
    }
    if trimmed.len() <= MAX {
        return trimmed.to_string();
    }
    let cut = trimmed
        .char_indices()
        .rev()
        .nth(MAX.saturating_sub(1))
        .map(|(i, _)| i)
        .unwrap_or(0);
    trimmed[cut..].to_string()
}

fn log_sftp(db: &Arc<Mutex<Connection>>, server_id: &str, level: LogLevel, message: &str) {
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
        target_id: server_id.to_string(),
        level,
        message: message.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    let conn = db.lock().expect("db mutex");
    if let Err(err) = storage::insert_log(&conn, &entry) {
        eprintln!("[githelm] insert log: {err}");
    }
}

/// Loads the server once and clones the shared db handle before any await.
async fn load_server(
    state: &State<'_, AppState>,
    server_id: &str,
) -> AppResult<(Server, Arc<Mutex<Connection>>)> {
    let server = {
        let conn = state.db.lock().expect("db mutex");
        storage::get_server(&conn, server_id)?
            .ok_or_else(|| AppError::NotFound(format!("server {server_id}")))?
    };
    Ok((server, state.db.clone()))
}

/// Uploads files / directories (recursive) into `remote_dir` on the server.
#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, AppState>,
    server_id: String,
    remote_dir: String,
    local_paths: Vec<String>,
) -> AppResult<SftpTransferResult> {
    if local_paths.is_empty() {
        return Err(AppError::Validation("没有要上传的文件".into()));
    }
    assert_sftp_safe("远程目录", &remote_dir)?;
    for p in &local_paths {
        assert_sftp_safe("本地路径", p)?;
    }
    for p in &local_paths {
        if !std::path::Path::new(p).exists() {
            return Err(AppError::Validation(format!("本地路径不存在：{p}")));
        }
    }
    let (server, db) = load_server(&state, &server_id).await?;
    let remote_dir = absolute_remote_path(&server, &remote_dir).await?;
    let count = local_paths.len() as u32;
    let summary = format!("上传 {count} 项 → {remote_dir}");
    run_sftp_batch(
        &db,
        &server,
        &build_upload_batch(&remote_dir, &local_paths),
        &summary,
    )
    .await?;
    Ok(SftpTransferResult { transferred: count })
}

/// Downloads a remote file / directory (recursive) into `local_dir`, keeping
/// its basename.
#[tauri::command]
pub async fn sftp_download(
    state: State<'_, AppState>,
    server_id: String,
    remote_path: String,
    local_dir: String,
) -> AppResult<SftpTransferResult> {
    assert_sftp_safe("远程路径", &remote_path)?;
    assert_sftp_safe("本地目录", &local_dir)?;
    if !std::path::Path::new(&local_dir).is_dir() {
        return Err(AppError::Validation(format!("本地目录不存在：{local_dir}")));
    }
    let (server, db) = load_server(&state, &server_id).await?;
    let remote_path = absolute_remote_path(&server, &remote_path).await?;
    let summary = format!("下载 {remote_path} → {local_dir}");
    run_sftp_batch(
        &db,
        &server,
        &build_download_batch(&local_dir, &remote_path),
        &summary,
    )
    .await?;
    Ok(SftpTransferResult { transferred: 1 })
}

/// Creates a directory inside `parent_dir`.
#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, AppState>,
    server_id: String,
    parent_dir: String,
    name: String,
) -> AppResult<()> {
    let name = name.trim().to_string();
    assert_sftp_safe("文件夹名称", &name)?;
    if name.contains('/') {
        return Err(AppError::Validation("文件夹名称不能包含 /".into()));
    }
    assert_sftp_safe("远程目录", &parent_dir)?;
    let path = join_remote(&parent_dir, &name);
    let (server, db) = load_server(&state, &server_id).await?;
    let path = absolute_remote_path(&server, &path).await?;
    run_sftp_batch(
        &db,
        &server,
        &build_mkdir_batch(&path),
        &format!("创建目录 {path}"),
    )
    .await
}

/// Deletes a file, or an EMPTY directory (`rmdir` semantics — a recursive
/// GUI delete is deliberately not offered; use the terminal for that).
#[tauri::command]
pub async fn sftp_delete(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
    is_dir: bool,
) -> AppResult<()> {
    assert_sftp_safe("远程路径", &path)?;
    let (server, db) = load_server(&state, &server_id).await?;
    let path = absolute_remote_path(&server, &path).await?;
    run_sftp_batch(
        &db,
        &server,
        &build_delete_batch(&path, is_dir),
        &format!("删除 {path}"),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sftp_safe_rejects_batch_breakers() {
        assert!(assert_sftp_safe("路径", "/srv/app").is_ok());
        assert!(assert_sftp_safe("路径", "~/我的 文件.zip").is_ok());
        assert!(assert_sftp_safe("路径", "").is_err());
        assert!(assert_sftp_safe("路径", "a\"b").is_err());
        assert!(assert_sftp_safe("路径", "a\\b").is_err());
        assert!(assert_sftp_safe("路径", "a\nb").is_err());
    }

    #[test]
    fn join_home_translates_tilde_prefix() {
        let home = "/home/ada";
        assert_eq!(join_home("~", home), "/home/ada");
        assert_eq!(join_home("~/logs", home), "/home/ada/logs");
        assert_eq!(join_home("~//x", home), "/home/ada//x");
        assert_eq!(join_home("/srv/app", home), "/srv/app");
    }

    #[test]
    fn join_remote_handles_tilde_and_trailing_slash() {
        assert_eq!(join_remote("~", "logs"), "~/logs");
        assert_eq!(join_remote("/srv/app/", "dist"), "/srv/app/dist");
        assert_eq!(join_remote("/", "etc"), "/etc");
    }

    #[test]
    fn upload_batch_puts_every_entry_after_cd() {
        let batch = build_upload_batch("~/uploads", &["/tmp/a.zip".into(), "/tmp/my dir".into()]);
        assert_eq!(
            batch,
            "cd \"~/uploads\"\nput -r \"/tmp/a.zip\"\nput -r \"/tmp/my dir\""
        );
    }

    #[test]
    fn download_batch_lcds_then_gets() {
        assert_eq!(
            build_download_batch("/Users/me/Downloads", "/srv/app/backup.zip"),
            "lcd \"/Users/me/Downloads\"\nget -r \"/srv/app/backup.zip\""
        );
    }

    #[test]
    fn mkdir_and_delete_batches_quote_their_paths() {
        assert_eq!(build_mkdir_batch("~/logs/2026"), "mkdir \"~/logs/2026\"");
        assert_eq!(build_delete_batch("/srv/a.txt", false), "rm \"/srv/a.txt\"");
        assert_eq!(build_delete_batch("/srv/tmp", true), "rmdir \"/srv/tmp\"");
    }

    #[test]
    fn last_reason_keeps_the_tail() {
        assert_eq!(last_reason(""), "未知原因");
        assert_eq!(last_reason("Permission denied"), "Permission denied");
        let long = "x".repeat(1000);
        assert_eq!(last_reason(&long).chars().count(), 400);
    }

    /// Spawns a real sftp against a refused port — it must fail fast with a
    /// validation error carrying ssh's reason, and record the failure in the
    /// activity log. No network beyond localhost.
    #[tokio::test]
    #[ignore = "spawns a real sftp process against a refused port"]
    async fn upload_fails_fast_when_unreachable() {
        use crate::types::{ServerKind, ServerStatus};

        let dir = std::env::temp_dir().join(format!("githelm-sftp-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn = crate::storage::open_at(&dir.join("githelm.db")).unwrap();
        let db = Arc::new(Mutex::new(conn));
        let server = Server {
            id: "srv_s".into(),
            name: "unreachable".into(),
            kind: ServerKind::Ssh,
            host: "127.0.0.1".into(),
            region: None,
            status: ServerStatus::Connecting,
            last_seen_at: chrono::Utc::now().to_rfc3339(),
            has_credential: true,
            username: Some("root".into()),
            // Nothing listens here — connect fails immediately.
            port: 1,
        };

        let local = dir.join("hello.txt");
        std::fs::write(&local, "hi").unwrap();
        let batch = build_upload_batch("~/uploads", &[local.display().to_string()]);

        let started = std::time::Instant::now();
        let result = run_sftp_batch(&db, &server, &batch, "上传测试").await;
        let elapsed = started.elapsed();

        let err = result.expect_err("unreachable server must fail");
        assert!(err.to_string().contains("传输失败"), "{err}");
        assert!(
            elapsed < std::time::Duration::from_secs(30),
            "took {elapsed:?}"
        );

        let logs = crate::storage::list_logs(&db.lock().unwrap(), Some("srv_s"), 10).unwrap();
        assert!(logs.iter().any(|l| l.message.contains("SFTP 开始")));
        assert!(logs.iter().any(|l| l.message.contains("SFTP 失败")));
    }
}
