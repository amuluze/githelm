//! Githelm desktop — Tauri 2 backend.
//!
//! Business data (projects, deployments, servers, audit logs, issues) is
//! persisted in SQLite at `~/.githelm/githelm.db` (see `storage.rs`); the
//! shape of every command is the contract the renderer consumes and must
//! keep once the real control plane lands.

mod commands;
mod error;
mod state;
mod storage;
mod types;

use state::AppState;

/// Window corner radius (githelm.pen $r16) applied to the borderless
/// macOS window. A transparent WKWebView would crash in WebKit's
/// scrolling tree on this macOS version, so the opaque window's layer
/// is rounded natively instead.
#[cfg(target_os = "macos")]
const WINDOW_CORNER_RADIUS: f64 = 16.0;

#[cfg(target_os = "macos")]
fn apply_window_corner_radius(window: &tauri::WebviewWindow, radius: f64) {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};

    let ns_window = match window.ns_window() {
        Ok(w) => w as *mut AnyObject,
        Err(_) => return,
    };
    unsafe {
        // Make only the NSWindow non-opaque so the desktop shows through at
        // the clipped corners. The WKWebView itself keeps drawing its
        // background — a fully transparent webview crashes in WebKit's
        // scrolling tree on this macOS version.
        let () = msg_send![ns_window, setOpaque: false];
        let nscolor = match AnyClass::get(c"NSColor") {
            Some(c) => c,
            None => return,
        };
        let clear_color: *mut AnyObject = msg_send![nscolor, clearColor];
        let () = msg_send![ns_window, setBackgroundColor: clear_color];

        // Round the content view's layer; it clips the webview to $r16.
        let content: *mut AnyObject = msg_send![ns_window, contentView];
        if content.is_null() {
            return;
        }
        let () = msg_send![content, setWantsLayer: true];
        let layer: *mut AnyObject = msg_send![content, layer];
        if layer.is_null() {
            return;
        }
        let () = msg_send![layer, setCornerRadius: radius];
        let () = msg_send![layer, setMasksToBounds: radius > 0.0];
    }
}

#[cfg(target_os = "macos")]
fn setup_window_chrome(app: &tauri::App) {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[githelm] main window missing; skipping corner radius");
        return;
    };
    apply_window_corner_radius(&window, WINDOW_CORNER_RADIUS);
    let event_window = window.clone();
    let last_maximized = std::cell::RefCell::new(None::<bool>);
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Resized(_)) {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let maximized = event_window.is_maximized().unwrap_or(false);
                let mut last = last_maximized.borrow_mut();
                if *last != Some(maximized) {
                    *last = Some(maximized);
                    drop(last);
                    // Full-bleed edges when maximized, $r16 otherwise.
                    let radius = if maximized { 0.0 } else { WINDOW_CORNER_RADIUS };
                    apply_window_corner_radius(&event_window, radius);
                }
            }));
            if let Err(panic) = result {
                let msg = panic
                    .downcast_ref::<&str>()
                    .map(|s| s.to_string())
                    .or_else(|| panic.downcast_ref::<String>().cloned())
                    .unwrap_or_else(|| "unknown panic".into());
                eprintln!("[githelm] resize corner update failed: {msg}");
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            // The setup callback runs inside an ObjC delegate; a panic there
            // aborts the process without printing. Catch and log instead.
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                setup_window_chrome(app);
            }));
            if let Err(panic) = result {
                let msg = panic
                    .downcast_ref::<&str>()
                    .map(|s| s.to_string())
                    .or_else(|| panic.downcast_ref::<String>().cloned())
                    .unwrap_or_else(|| "unknown panic".into());
                eprintln!("[githelm] window chrome setup failed: {msg}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::create_project,
            commands::projects::update_project_config,
            commands::github::github_status,
            commands::github::save_github_token,
            commands::github::clear_github_token,
            commands::github::list_repo_accounts,
            commands::github::list_github_repos,
            commands::github::list_github_branches,
            commands::deployments::list_deployments,
            commands::deployments::get_deployment,
            commands::deployments::deploy_project,
            commands::servers::list_servers,
            commands::servers::add_server,
            commands::servers::remove_server,
            commands::servers::test_server_connection,
            commands::servers::list_server_dir,
            commands::logs::list_logs,
            commands::terminal::terminal_open,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::issues::list_issues,
            commands::secrets::save_secret,
            commands::secrets::delete_secret,
            commands::secrets::has_secret,
            commands::app::get_app_version,
            commands::updater::check_for_update,
            commands::updater::install_update,
            commands::updater::restart_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building githelm desktop")
        .run(|app, event| {
            use tauri::Manager;
            if matches!(event, tauri::RunEvent::Exit) {
                // Kill live SSH sessions so no orphaned ssh outlives the app.
                commands::terminal::close_all(&app.state::<AppState>());
            }
        });
}
