//! SSH terminal sessions: the system `ssh` runs inside a PTY (portable-pty)
//! so the whole login flow — passwords, passphrases, host-key prompts — is
//! interactive directly in the renderer's xterm. The renderer talks to the
//! session through four commands and two events:
//!
//! - `terminal_open` / `terminal_write` / `terminal_resize` / `terminal_close`
//! - `terminal-output { serverId, data }` (base64 bytes)
//! - `terminal-exit  { serverId, code }`

use std::io::{Read, Write};

use base64::Engine as _;
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Handles needed to feed and steer one PTY. The child process itself lives
/// in the exit-watcher thread (it owns the wait); killing via `killer` makes
/// that wait return, and dropping master/writer closes the pty.
pub struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
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
    code: Option<u32>,
}

fn drop_session(state: &AppState, server_id: &str) {
    let mut terminals = state.terminals.lock().expect("terminals mutex");
    if let Some(mut session) = terminals.remove(server_id) {
        let _ = session.killer.kill();
        // watcher thread reaps the child; dropping master/writer closes the pty
        drop(session);
    }
}

/// Spawns an interactive `ssh` PTY for the server, replacing any session
/// already open for it. Output and exit stream back as events.
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

    let pty = portable_pty::native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Internal(format!("open pty: {e}")))?;

    let mut cmd = CommandBuilder::new("ssh");
    // No BatchMode here on purpose: password / host-key prompts must be
    // answerable from the terminal itself.
    cmd.args(["-p", &port.to_string(), &format!("{user}@{host}")]);

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::Internal(format!("spawn ssh: {e}")))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Internal(format!("pty reader: {e}")))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| AppError::Internal(format!("pty writer: {e}")))?;
    let killer = child.clone_killer();

    // Stream pty output to the renderer as base64 — raw chunks can split
    // UTF-8 sequences, so they must not travel as strings.
    {
        let app = app.clone();
        let server_id = server_id.clone();
        std::thread::spawn(move || {
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
            let code = child.wait().ok().map(|s| s.exit_code());
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
            master: pair.master,
            writer,
            killer,
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
    let mut terminals = state.terminals.lock().expect("terminals mutex");
    let session = terminals
        .get_mut(&server_id)
        .ok_or_else(|| AppError::NotFound(format!("no terminal session for {server_id}")))?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
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
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Internal(format!("pty resize: {e}")))
}

#[tauri::command]
pub fn terminal_close(state: State<'_, AppState>, server_id: String) -> AppResult<()> {
    drop_session(&state, &server_id);
    Ok(())
}

/// Closes every live session (app shutdown path).
pub fn close_all(state: &AppState) {
    let ids: Vec<String> = state
        .terminals
        .lock()
        .expect("terminals mutex")
        .keys()
        .cloned()
        .collect();
    for id in ids {
        drop_session(state, &id);
    }
}
