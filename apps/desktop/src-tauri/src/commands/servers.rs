use std::path::PathBuf;
use std::time::Instant;

use keyring::Entry;
use tauri::State;
use uuid::Uuid;

use crate::commands::deployments::ssh_command;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::storage;
use crate::types::{
    AddServerInput, ConnectionTestResult, Server, ServerDirEntry, ServerDirListing, ServerStatus,
    UpdateServerInput,
};

const SERVICE: &str = "io.githelm.desktop";

fn server_credential_key(id: &str) -> String {
    format!("server:{id}")
}

/// True when the credential looks like an SSH private key (PEM or OpenSSH
/// format) rather than a password / passphrase.
fn is_private_key(credential: &str) -> bool {
    credential.contains("PRIVATE KEY-----")
}

/// Where a server's materialized private key lives, if one was written.
pub(crate) fn stored_key_path(server_id: &str) -> Option<PathBuf> {
    let dir = storage::data_dir().ok()?.join("keys");
    let path = dir.join(format!("{server_id}.key"));
    path.is_file().then_some(path)
}

/// Writes a private-key credential to disk so the system ssh can offer it:
/// deploy/test pass `-i` + IdentitiesOnly, the interactive terminal passes
/// `-i` with the agent as fallback. The key already lives in the keychain;
/// this mirror file is what actually makes non-interactive auth work.
fn write_key_file(server_id: &str, credential: &str) -> AppResult<()> {
    let dir = storage::data_dir()?.join("keys");
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Internal(format!("create keys dir: {e}")))?;
    let path = dir.join(format!("{server_id}.key"));
    std::fs::write(&path, credential)
        .map_err(|e| AppError::Internal(format!("write key: {e}")))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| AppError::Internal(format!("chmod key: {e}")))?;
    }
    Ok(())
}

fn remove_key_file(server_id: &str) {
    if let Ok(dir) = storage::data_dir().map(|d| d.join("keys")) {
        let _ = std::fs::remove_file(dir.join(format!("{server_id}.key")));
    }
}

/// Keeps the keychain entry and the on-disk key mirror in sync with the
/// credential the user just saved.
fn persist_credential(server_id: &str, credential: &str) -> AppResult<()> {
    let entry = Entry::new(SERVICE, &server_credential_key(server_id))
        .map_err(|e| AppError::Internal(format!("keyring: {e}")))?;
    entry
        .set_password(credential)
        .map_err(|e| AppError::Internal(format!("keyring set: {e}")))?;
    if is_private_key(credential) {
        write_key_file(server_id, credential)
    } else {
        // Switching from a key to a password must not leave the old key
        // behind — ssh would keep offering it.
        remove_key_file(server_id);
        Ok(())
    }
}

#[tauri::command]
pub fn list_servers(state: State<'_, AppState>) -> AppResult<Vec<Server>> {
    let conn = state.db.lock().expect("db mutex");
    storage::list_servers(&conn)
}

#[tauri::command]
pub fn add_server(state: State<'_, AppState>, input: AddServerInput) -> AppResult<Server> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("名称不能为空".into()));
    }
    if input.host.trim().is_empty() {
        return Err(AppError::Validation("主机不能为空".into()));
    }

    let id = format!(
        "srv_{}",
        Uuid::new_v4()
            .simple()
            .to_string()
            .chars()
            .take(8)
            .collect::<String>()
    );
    let credential = input.credential.trim().to_string();
    let server = Server {
        id,
        name: input.name,
        host: input.host,
        kind: input.kind,
        region: input.region.filter(|r| !r.is_empty()),
        status: ServerStatus::Connecting,
        last_seen_at: chrono::Utc::now().to_rfc3339(),
        has_credential: !credential.is_empty(),
        username: Some(input.username),
        port: input.port,
    };

    // An empty credential is valid: the connection then relies on the host's
    // ssh config / agent. Anything else goes to the keychain (never SQLite,
    // never the renderer), plus the key mirror when it is a private key.
    if !credential.is_empty() {
        persist_credential(&server.id, &credential)?;
    }

    let conn = state.db.lock().expect("db mutex");
    storage::insert_server(&conn, &server)?;
    Ok(server)
}

#[tauri::command]
pub fn update_server(state: State<'_, AppState>, input: UpdateServerInput) -> AppResult<Server> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("名称不能为空".into()));
    }
    if input.host.trim().is_empty() {
        return Err(AppError::Validation("主机不能为空".into()));
    }
    if input.username.trim().is_empty() {
        return Err(AppError::Validation("用户名不能为空".into()));
    }

    {
        let conn = state.db.lock().expect("db mutex");
        if storage::get_server(&conn, &input.id)?.is_none() {
            return Err(AppError::NotFound(format!("server {}", input.id)));
        }
        let updated = Server {
            id: input.id.clone(),
            name: input.name,
            host: input.host,
            kind: input.kind,
            region: input.region.filter(|r| !r.is_empty()),
            status: ServerStatus::Connecting,
            last_seen_at: chrono::Utc::now().to_rfc3339(),
            has_credential: true,
            username: Some(input.username),
            port: input.port,
        };
        storage::update_server(&conn, &updated)?;
    }

    // Replace the keychain credential (and key mirror) when the user typed a
    // new one.
    if let Some(credential) = input.credential.filter(|c| !c.trim().is_empty()) {
        persist_credential(&input.id, credential.trim())?;
    }

    let conn = state.db.lock().expect("db mutex");
    storage::get_server(&conn, &input.id)?
        .ok_or_else(|| AppError::NotFound(format!("server {}", input.id)))
}

#[tauri::command]
pub fn remove_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    {
        let conn = state.db.lock().expect("db mutex");
        if !storage::delete_server(&conn, &id)? {
            return Err(AppError::NotFound(format!("server {id}")));
        }
        storage::clear_project_server(&conn, &id)?;
    }
    if let Ok(entry) = Entry::new(SERVICE, &server_credential_key(&id)) {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(AppError::Internal(format!("keychain delete: {e}"))),
        }
    }
    remove_key_file(&id);
    Ok(())
}

/// Probes the server over real SSH (agent / default keys / ssh_config auth)
/// and measures the round-trip of a trivial remote command.
#[tauri::command]
pub async fn test_server_connection(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ConnectionTestResult> {
    let server = {
        let conn = state.db.lock().expect("db mutex");
        storage::get_server(&conn, &id)?
            .ok_or_else(|| AppError::NotFound(format!("server {id}")))?
    };

    let start = Instant::now();
    let mut cmd = ssh_command(&server);
    cmd.arg("echo ok");
    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("无法执行 ssh（未安装或不在 PATH 中）：{e}")))?;
    let latency_ms = start.elapsed().as_millis() as u64;

    let conn = state.db.lock().expect("db mutex");
    if output.status.success() {
        storage::set_server_status(
            &conn,
            &id,
            &ServerStatus::Online,
            &chrono::Utc::now().to_rfc3339(),
        )?;
        Ok(ConnectionTestResult {
            ok: true,
            latency_ms,
        })
    } else {
        storage::set_server_status(
            &conn,
            &id,
            &ServerStatus::Error,
            &chrono::Utc::now().to_rfc3339(),
        )?;
        let reason = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::Validation(format!(
            "SSH 连接失败：{}",
            if reason.is_empty() {
                "未知原因".into()
            } else {
                reason
            }
        )))
    }
}

/// Single-quote a value for a remote shell command: 'it's' → 'it'\''s'.
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// Lists a directory on the server so the deploy dialog can browse for the
/// deploy dir instead of typing a path blind. Directories come first.
#[tauri::command]
pub async fn list_server_dir(
    state: State<'_, AppState>,
    id: String,
    path: Option<String>,
) -> AppResult<ServerDirListing> {
    let server = {
        let conn = state.db.lock().expect("db mutex");
        storage::get_server(&conn, &id)?
            .ok_or_else(|| AppError::NotFound(format!("server {id}")))?
    };
    let path = path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .unwrap_or("~")
        .to_string();

    let mut cmd = ssh_command(&server);
    cmd.arg(format!("ls -1p {}", shell_quote(&path)));
    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("无法执行 ssh：{e}")))?;
    if !output.status.success() {
        let reason = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Validation(format!(
            "无法列出目录 {path}：{}",
            if reason.is_empty() {
                "未知原因".into()
            } else {
                reason
            }
        )));
    }

    let mut dirs: Vec<ServerDirEntry> = Vec::new();
    let mut files: Vec<ServerDirEntry> = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        if let Some(name) = line.strip_suffix('/') {
            if !name.is_empty() {
                dirs.push(ServerDirEntry {
                    name: name.to_string(),
                    is_dir: true,
                });
            }
        } else {
            files.push(ServerDirEntry {
                name: line.to_string(),
                is_dir: false,
            });
        }
    }
    dirs.sort_by(|a, b| a.name.cmp(&b.name));
    files.sort_by(|a, b| a.name.cmp(&b.name));
    dirs.extend(files);
    Ok(ServerDirListing {
        path,
        entries: dirs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_paths_for_remote_shell() {
        assert_eq!(shell_quote("/srv/app"), "'/srv/app'");
        assert_eq!(shell_quote("~/a b"), "'~/a b'");
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
        assert_eq!(shell_quote(""), "''");
    }

    #[test]
    fn detects_private_keys() {
        assert!(is_private_key(
            "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----"
        ));
        assert!(is_private_key("-----BEGIN RSA PRIVATE KEY-----\nabc"));
        assert!(!is_private_key("hunter2"));
        assert!(!is_private_key(""));
    }

    /// write_key_file / stored_key_path / remove_key_file roundtrip against a
    /// redirected data dir. Restores the env var before returning; no other
    /// test in this suite reads GITHelm_HOME.
    #[test]
    fn key_file_roundtrip_and_removal() {
        let dir = std::env::temp_dir().join(format!("githelm-keys-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::env::set_var("GITHelm_HOME", &dir);

        let id = "srv_keytest";
        assert!(stored_key_path(id).is_none());

        write_key_file(id, "-----BEGIN OPENSSH PRIVATE KEY-----\nzzz").unwrap();
        let path = stored_key_path(id).expect("key file should exist");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "-----BEGIN OPENSSH PRIVATE KEY-----\nzzz");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }

        remove_key_file(id);
        assert!(stored_key_path(id).is_none());

        std::env::remove_var("GITHelm_HOME");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
