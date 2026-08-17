# Githelm

A Tauri 2 + React 19 desktop client for self-hosted application deployment.

This project is a focused, lightweight refactor of [openship](https://github.com/oblien/openship)'s
desktop experience. The full openship control plane (API, dashboard, edge, email, CLI) is
deliberately out of scope for this iteration — githelm currently renders the desktop shell
with mock data and a minimal Rust backend.

## Repository layout

```
githelm/
├── apps/
│   └── desktop/         Tauri 2 + React 19 desktop app
├── packages/
│   ├── ui/              Reusable UI primitives
│   └── core/            Shared types & helpers
├── scripts/             Version / changelog / release config tooling
├── .github/workflows/   CI + release pipelines
├── Taskfile.yml         taskfile.dev entry point
├── rust-toolchain.toml  Pinned Rust version for CI parity
├── package.json         pnpm workspace root + script surface
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Requirements

- Node.js ≥ 20
- pnpm ≥ 9
- Rust stable (pinned via `rust-toolchain.toml`)
- taskfile.dev ([`go-task`](https://taskfile.dev/installation/)) — optional but recommended

## Quick start

```bash
pnpm install
task dev            # or: pnpm dev
```

The first run downloads Rust crates and Tauri tooling; subsequent runs are fast.
For a pure browser preview (no Rust build), use `task dev:web`.

## Tasks

All common workflows are exposed through `Taskfile.yml` (delegates to `pnpm run`):

```bash
task --list                # show every task
task dev                   # Tauri dev mode
task dev:web               # browser-only preview
task build                 # production build
task check                 # typecheck + cargo check
task lint:rust             # cargo clippy -D warnings
task release:check         # full pre-release gate

# Versioning & release
task bump:version -- 0.1.1           # bump 5 manifest versions + CHANGELOG
task release:notes -- extract --tag v0.1.0
task release:tag -- 0.1.1            # validate + git tag + push → CI release
task release:local                    # local-only build + GH Release upload
```

## Status

| Area | State |
|---|---|
| Layout (Sidebar / TopBar / StatusBar) | ✅ |
| Theme system (light / dark) | ✅ |
| Overview / Projects / Deployments / Servers / Logs / Settings | ✅ mock data |
| Tauri Rust backend | ✅ commands + keyring + store |
| Version parity across 5 manifests + CHANGELOG | ✅ |
| CI quality gate (PR + main) | ✅ macos-15, typecheck, clippy, cross-target |
| Auto-release chain (tag → GH Release) | ✅ macOS arm64 DMG + SHA256SUMS |
| Local API service | ⏸ deferred |
| Code signing / notarization | ⏸ deferred (adhoc-signed builds) |

## Design language

The visual system is a stripped-down port of openship's `th-*` design tokens. All colors
are CSS custom properties so themes can be swapped at runtime without re-rendering React.

## License

Apache-2.0