//! SSH terminal sessions. The system `ssh` runs with a pty as its stdio so
//! the whole login flow — passwords, passphrases, host-key prompts — is
//! interactive directly in the renderer's xterm.
//!
//! The pty is opened with libc::openpty and ssh is spawned via std Command
//! with stdio fds only — which takes the posix_spawn path. **Never** spawn
//! through a pre_exec/fork helper here: forking this multithreaded
//! WKWebView process aborts (SIGABRT) on macOS.
//!
//! Renderer contract:
//! - `terminal_open` / `terminal_write` / `terminal_resize` / `terminal_close`
//! - `terminal-output { serverId, data }` (base64 bytes)
//! - `terminal-exit  { serverId, code }`

use std::io::Read;
use std::os::fd::{FromRawFd, OwnedFd, RawFd};
use std::process::{Command, Stdio};

use base64::Engine as _;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Live pty handle. Reader/writer share the master fd (ptys are full-duplex);
/// dropping closes the pty, which hangs up on ssh.
pub struct TerminalSession {
    master_fd: RawFd,
    pid: i32,
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        unsafe {
            libc::kill(self.pid, libc::SIGHUP);
            libc::close(self.master_fd);
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputEvent<'a> {
    server_id: &'a str,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitEvent<'a> {
    server_id: &'a str,
    code: Option<i32>,
}

fn drop_session(state: &AppState, server_id: &str) {
    let mut terminals = state.terminals.lock().expect("terminals mutex");
    terminals.remove(server_id);
    // Drop closes the pty; the exit watcher reaps the child.
}

fn write_all(fd: RawFd, mut buf: &[u8]) -> std::io::Result<()> {
    while !buf.is_empty() {
        let n = unsafe { libc::write(fd, buf.as_ptr().cast(), buf.len()) };
        if n < 0 {
            return Err(std::io::Error::last_os_error());
        }
        buf = &buf[n as usize..];
    }
    Ok(())
}

/// Spawns an interactive `ssh` on a pty for the server, replacing any
/// session already open for it. Output and exit stream back as events.
#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
) -> AppResult<()> {
    let (host, user, port) = {
        let conn = state.db.lock().expect("db mutex");
        let server = crate::storage::get_server(&conn, &server_id)?
            .ok_or_else(|| AppError::NotFound(format!("server {server_id}")))?;
        (
            server.host,
            server.username.unwrap_or_else(|| "root".into()),
            server.port,
        )
    };

    drop_session(&state, &server_id);

    // pty: 80x24 to start; the renderer syncs the real size immediately.
    let mut win = libc::winsize {
        ws_row: 24,
        ws_col: 80,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let mut master: RawFd = -1;
    let mut slave: RawFd = -1;
    let rc = unsafe {
        libc::openpty(
            &mut master,
            &mut slave,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut win,
        )
    };
    if rc != 0 {
        return Err(AppError::Internal(format!(
            "openpty: {}",
            std::io::Error::last_os_error()
        )));
    }

    // ssh talks to the pty via dup'd slave fds on 0/1/2. OwnedFd stdio keeps
    // Command on the posix_spawn path (no pre_exec → no fork of this process).
    let spawn_ssh = || -> AppResult<std::process::Child> {
        let stdio = || -> AppResult<Stdio> {
            let dup = unsafe { libc::dup(slave) };
            if dup < 0 {
                return Err(AppError::Internal(format!(
                    "dup pty: {}",
                    std::io::Error::last_os_error()
                )));
            }
            Ok(Stdio::from(unsafe { OwnedFd::from_raw_fd(dup) }))
        };
        let mut base = Command::new("ssh");
        // A real TERM matters: ssh forwards it to the remote pty.
        base.env("TERM", "xterm-256color").args([
            "-p",
            &port.to_string(),
            &format!("{user}@{host}"),
        ]);
        // Offer the stored private key if one was saved; without
        // IdentitiesOnly the agent and default keys stay as fallbacks.
        if let Some(key) = crate::commands::servers::stored_key_path(&server_id) {
            base.arg("-i").arg(key);
        }
        let child = base
            .stdin(stdio()?)
            .stdout(stdio()?)
            .stderr(stdio()?)
            .spawn()
            .map_err(|e| AppError::Internal(format!("spawn ssh: {e}")))?;
        Ok(child)
    };
    let mut child = match spawn_ssh() {
        Ok(child) => child,
        Err(err) => {
            unsafe { libc::close(slave) };
            unsafe { libc::close(master) };
            return Err(err);
        }
    };
    unsafe { libc::close(slave) };
    let pid = child.id() as i32;

    // Stream pty output to the renderer as base64 — raw chunks can split
    // UTF-8 sequences, so they must not travel as strings.
    let reader_fd = unsafe { libc::dup(master) };
    if reader_fd < 0 {
        let _ = child.kill();
        unsafe { libc::close(master) };
        return Err(AppError::Internal(format!(
            "dup pty reader: {}",
            std::io::Error::last_os_error()
        )));
    }
    {
        let app = app.clone();
        let server_id = server_id.clone();
        std::thread::spawn(move || {
            let mut reader = unsafe { std::fs::File::from_raw_fd(reader_fd) };
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let event = OutputEvent {
                            server_id: &server_id,
                            data: base64::engine::general_purpose::STANDARD.encode(&buf[..n]),
                        };
                        // A failed emit (window gone) just ends the pump.
                        if app.emit("terminal-output", event).is_err() {
                            break;
                        }
                    }
                }
            }
        });
    }

    // Report process exit so the UI can offer a reconnect.
    {
        let app = app.clone();
        let server_id = server_id.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|s| s.code());
            let _ = app.emit(
                "terminal-exit",
                ExitEvent {
                    server_id: &server_id,
                    code,
                },
            );
        });
    }

    state.terminals.lock().expect("terminals mutex").insert(
        server_id,
        TerminalSession {
            master_fd: master,
            pid,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn terminal_write(
    state: State<'_, AppState>,
    server_id: String,
    data: String,
) -> AppResult<()> {
    let terminals = state.terminals.lock().expect("terminals mutex");
    let session = terminals
        .get(&server_id)
        .ok_or_else(|| AppError::NotFound(format!("no terminal session for {server_id}")))?;
    write_all(session.master_fd, data.as_bytes())
        .map_err(|e| AppError::Internal(format!("pty write: {e}")))
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, AppState>,
    server_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    let terminals = state.terminals.lock().expect("terminals mutex");
    let session = terminals
        .get(&server_id)
        .ok_or_else(|| AppError::NotFound(format!("no terminal session for {server_id}")))?;
    let win = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    if unsafe { libc::ioctl(session.master_fd, libc::TIOCSWINSZ, &win) } != 0 {
        return Err(AppError::Internal(format!(
            "pty resize: {}",
            std::io::Error::last_os_error()
        )));
    }
    Ok(())
}

#[tauri::command]
pub fn terminal_close(state: State<'_, AppState>, server_id: String) -> AppResult<()> {
    drop_session(&state, &server_id);
    Ok(())
}

/// Closes every live session (app shutdown path).
pub fn close_all(state: &AppState) {
    state.terminals.lock().expect("terminals mutex").clear();
}

/// Live smoke test for the pty plumbing: runs `printf` under a pty, reads
/// the echoed bytes back through the master fd. No ssh, no network.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pty_roundtrip_via_posix_spawn() {
        let mut win = libc::winsize {
            ws_row: 24,
            ws_col: 80,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        let mut master: RawFd = -1;
        let mut slave: RawFd = -1;
        let rc = unsafe {
            libc::openpty(
                &mut master,
                &mut slave,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut win,
            )
        };
        assert_eq!(rc, 0);

        let stdio = || {
            let dup = unsafe { libc::dup(slave) };
            Stdio::from(unsafe { OwnedFd::from_raw_fd(dup) })
        };
        let mut child = Command::new("printf")
            .arg("pty-ok")
            .stdin(stdio())
            .stdout(stdio())
            .stderr(stdio())
            .spawn()
            .expect("spawn printf");
        unsafe { libc::close(slave) };

        let mut reader = unsafe { std::fs::File::from_raw_fd(master) };
        let mut out = String::new();
        reader.read_to_string(&mut out).expect("read pty");
        assert!(out.contains("pty-ok"), "got: {out}");
        assert!(child.wait().unwrap().success());
    }
}
