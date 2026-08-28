# Changelog

All notable changes to Githelm are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 未发布

### Added

- Tauri 2 + React 19 desktop shell
- `th-*` design tokens (light / dark themes)
- macOS-style custom title bar with traffic lights / Win-Linux custom buttons
- pnpm workspace with `@githelm/ui` and `@githelm/core` packages
- SQLite persistence for projects / deployments / servers / logs / issues at
  `~/.githelm/githelm.db` (WAL, foreign keys, `user_version` migrations)
- Create-project flow with GitHub import (repositories, branches and accounts
  via the REST API; credential resolved from the keychain PAT or `gh` CLI)
- Server management: add / edit / remove SSH servers with OS keychain
  credentials, connection test and remote directory browsing for the
  deploy-dir picker
- Real deploy pipeline: local build & push command → SSH update command in
  the deploy dir, with line-by-line log streaming into the log viewer
- Deployment cancellation: kills the running command and records the
  deployment as `cancelled` (project returns to `idle`)
- Interactive SSH terminal page (PTY-backed `ssh` + xterm.js, resize-aware)
- Deploy progress is now pushed to the UI as events (`deploy-log` per output
  line, `deploy-status` per transition), replacing 1.5–2s polling in the
  deployments list, project page and log viewer
- OS notification when a deployment succeeds / fails / is cancelled while
  the window is hidden (permission-aware via the notification plugin)
- Native folder picker for the deploy dialog's local path
  (`tauri-plugin-dialog`, `dialog:allow-open` capability)
- The servers page probes every server's connection once per visit, so
  online/offline badges and last-seen times stay fresh (per-row test button
  unchanged)
- Project management: rename (slug follows), branch / URL editing and
  deletion (cascades deployments and their logs) from the project page
- Stored SSH private keys are now actually used: they are materialized to
  `~/.githelm/keys/<id>.key` (0600) and offered via `-i` to deploy, connection
  test and terminal; server credentials are optional (blank = host ssh config)
- Log retention: the logs table is pruned to the newest 5,000 entries at
  startup and after each deployment finishes
- OS keychain integration via `keyring` crate

### Changed

- Command errors now surface their real message in the UI (previously every
  toast showed "[object Object]"); messages no longer carry internal
  English prefixes

### Fixed

- The deployments page "已取消" filter tab now matches the real `cancelled`
  status instead of `rolled-back`
- SSH private keys pasted into the server form no longer lose their
  newlines (multiline textarea instead of a password input)

### Security