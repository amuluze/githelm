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
- Route-level code splitting: the initial bundle drops from 830 kB to
  364 kB (gzip 231 → 113 kB); xterm ships only with the terminal page
- Frontend test infrastructure: vitest in `@githelm/core` (17 tests over
  formatting helpers and Zod schemas), wired into `pnpm test` and CI
- ESLint via `@antfu/eslint-config` (React-aware, preserving the existing
  quote/semicolon style), wired into `pnpm lint` and CI
- SSH terminal reconnects keep scrollback history: the xterm instance is
  now scoped to the server, only the ssh session is re-spawned
- Project management: rename (slug follows), branch / URL editing and
  deletion (cascades deployments and their logs) from the project page
- Issues page now shows real data: a failed deployment opens one issue per
  project (never duplicated while unresolved, user cancellations excluded)
  and the next successful deploy resolves it; the page refreshes live via
  deploy-status events
- Stored SSH private keys are now actually used: they are materialized to
  `~/.githelm/keys/<id>.key` (0600) and offered via `-i` to deploy, connection
  test and terminal; server credentials are optional (blank = host ssh config)
- Log retention: the logs table is pruned to the newest 5,000 entries at
  startup and after each deployment finishes
- OS keychain integration via `keyring` crate
- Files page with SFTP transfers: browse remote directories, upload files /
  folders (native picker or drag-and-drop onto the window), download, create
  folders and delete entries — via the system `sftp` CLI in batch mode using
  the same non-interactive auth as deploys (agent / default keys / the
  materialized key file); transfers write start / outcome lines to the
  server's activity log
- Interrupted-deployment recovery: deployments stranded in a running state
  by a crash / force quit are marked `failed` at startup and their projects
  unstuck from `building` (previously the project rejected every future
  deploy with "该项目已有部署正在进行中")
- Issue tracking actions on the issues page: manually mark an issue
  resolved, reopen a resolved one, or delete the record (with confirmation);
  issues now anchor to a stable project id (schema v3) so renaming a
  project can no longer break automatic issue resolution — rows created
  before the migration keep matching by name
- Background availability checks for every project URL (plus a scan on
  launch, every 5 minutes, and on demand via the issues page "重新扫描"):
  DNS resolution (`domain`), service-port reachability (`port`) and TLS
  certificate expiry via a skip-verify handshake — expired or ≤14-day
  certificates open an issue (`certificate`); projects with a local
  checkout also get a `version` check that flags when the live deployment
  is behind local HEAD or has diverged. Failures open one issue per kind,
  passing checks auto-resolve them, and transitions reach the UI through an
  `issues-changed` event
- Issues from failed deployments now carry the deployment id: the issue row
  gains a "查看部署日志" action that opens that pipeline's log viewer

### Changed

- The settings page's 常规 / Git / 通知 / Email / 实例 tabs are now real,
  switchable panels — previously the side nav was decorative (only the
  instance panel existed): 常规 gains a theme picker wired to the app theme;
  Git shows the GitHub connection (login + keychain/gh-cli source) with an
  unlink action; 通知 adds a deploy-notification policy (总是 / 仅后台 /
  关闭) that the deploy event listener now respects; Email gets an honest
  "即将推出" placeholder; the instance panel drops its mock values
  (Docker 27.3, 2.4 GB, 运行正常) in favor of the real data directory via a
  new `get_data_dir` command plus the Tauri runtime version
- Server list status is now strictly binary — 在线 (green) or 离线 (gray).
  The backend keeps its finer states (connecting = not yet probed, error =
  last probe failed) but they all render as 离线; failure details remain on
  the per-row test button's toast
- The issues page: status-aware badges and icon colors (未解决 danger /
  已解决 success — previously every row showed 已解决), per-tab counts,
  click-to-expand long descriptions, and a proper error state with retry
  when loading fails; "重新扫描" now really rescans (see the availability
  checks above) instead of only refetching the list

- The icon button next to the sidebar's theme toggle (previously a
  decorative ⌘K command-palette glyph) now collapses the sidebar to a 64px
  icon rail and back; the choice persists across restarts
- Command errors now surface their real message in the UI (previously every
  toast showed "[object Object]"); messages no longer carry internal
  English prefixes
- All React lint warnings cleared: the ui package passes `ref` as a plain
  prop (React 19 style, no forwardRef), relative-time labels use a
  render-stable timestamp, list keys and ref names normalized

### Fixed

- Remote directory browsing broke for the home directory: `ls -1p '~'`
  single-quotes the tilde, so the shell never expanded it and reported
  `cannot access '~'` (the deploy-dir picker was affected too). Tilde paths
  are now translated to `"$HOME"` with double-quote metacharacters escaped
  (injection-proof), and every SFTP batch resolves `~`-rooted paths to the
  absolute home up front since the batch protocol has no shell to expand
  them
- SFTP transfers failed on some OpenSSH versions with the sftp usage text
  ("传输失败：usage: sftp …") — the port is now passed as `-o Port=` (the
  ssh_config directive every version accepts) instead of `-P`, whose
  meaning flipped from sftp-server path to port at OpenSSH 7.0
- Reopening a deployment's log dialog within 30s showed the stale seed and
  hid every line streamed in between (including the final success/failure
  line) — the log query now always refetches on mount
- The deployments page now distinguishes "no deployments yet" from "no
  matches for the current filter/search" (the latter shows a 清除筛选
  action instead of the first-deploy empty state), the 浏览模板 button
  navigates to the library, and the project page's 部署 button is disabled
  while a deploy runs (matching edit/delete)
- `list_deployments` caps at the newest 500 rows; the deployments table has
  no pruning, so lists and refetches previously grew with the install age
- The audit-log page's 清空 button was a silent no-op: it cleared the
  dedupe-id set (which only made the next poll re-admit all recent lines)
  and never touched the visible list. The live tail now genuinely
  accumulates across polls inside the query cache, 清空 clears the view
  instantly (audit rows in the DB are untouched), switching sources starts
  a fresh stream, the view follows the tail unless scrolled up, and the
  fetch window grew from 50 to 200 lines so bursts between 2s polls are
  not dropped
- The deployments page "已取消" filter tab now matches the real `cancelled`
  status instead of `rolled-back`
- SSH private keys pasted into the server form no longer lose their
  newlines (multiline textarea instead of a password input)
- Two rapid triggers of the same deploy can no longer both pass validation
  (the config is re-checked inside the insert transaction)
- Relative-time labels now tick every 30s instead of freezing at the mount
  time; the log viewer only auto-scrolls while pinned to the tail
- A failed `list_deployments` no longer renders as the "暂无部署" empty
  state — the deployments and project pages show an error with a retry

### Security